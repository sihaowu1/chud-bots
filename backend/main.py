"""HTTP surface. Serves the display and exposes the orchestrator over JSON + SSE.

Run from the repo root:  uv run uvicorn backend.main:app --reload
"""

import asyncio
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, events, orchestrator, personas, steel_client
from .orchestrator_agent import (
    CampaignOrchestrator,
    OrchestratorConfigurationError,
    OrchestratorModelError,
)
from .profile_post_orchestrator import ProfilePostOrchestrator


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await orchestrator.stop_all()


app = FastAPI(title="Inception", lifespan=lifespan)
campaign_orchestrator = CampaignOrchestrator()
profile_post_orchestrator = ProfilePostOrchestrator()


class LaunchRequest(BaseModel):
    mode: Literal["legacy", "reddit_browse", "profile_post"] = "legacy"
    personas: list[str] | None = None
    target: str = Field(..., description="URL of the site to plant in search")
    queries: list[str] = Field(
        default_factory=list,
        description="Search phrases the dreamers will type; blank runs login only",
    )
    count: int = Field(1, ge=1, le=8)


class OrchestrationRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    personas: list[str] | None = None
    environment: str = Field("mock", pattern="^(mock|private)$")


class ActivityRequest(BaseModel):
    persona: str
    task_id: str
    kind: str = Field(..., pattern="^(post|comment|wait|system)$")
    status: str = Field(..., pattern="^(started|completed|failed|cancelled)$")
    content: str | None = None
    url: str | None = None
    parent_url: str | None = None
    reddit_username: str | None = None
    note: str | None = None
    continue_after: bool = True


@app.post("/api/runs")
async def launch(req: LaunchRequest):
    try:
        profile_posts = None
        if req.mode == "profile_post":
            if len(req.queries) != 1 or not req.queries[0].strip():
                raise ValueError("profile_post mode requires exactly one non-empty query")
            if req.count > len(personas.names()):
                raise ValueError("profile_post count exceeds the configured persona pool")
            if req.count > config.MAX_AGENTS - orchestrator.live_count():
                raise RuntimeError("not enough available agent slots for the profile-post batch")
            chosen = orchestrator.selected_personas(req.count, req.personas)
            profile_posts = await profile_post_orchestrator.plan(
                req.queries[0], [persona.name for persona in chosen],
            )
        return {"agents": orchestrator.launch(
            req.target, req.queries, req.count, mode=req.mode,
            selected_persona_names=req.personas, profile_posts=profile_posts,
        )}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except OrchestratorConfigurationError as exc:
        raise HTTPException(503, str(exc)) from exc
    except OrchestratorModelError as exc:
        raise HTTPException(502, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc


@app.post("/api/orchestrations")
async def create_orchestration(req: OrchestrationRequest):
    """Ask the model coordinator to create the first phase of assignments."""
    try:
        return await campaign_orchestrator.start(
            req.prompt,
            selected_personas=req.personas,
            environment=req.environment,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except OrchestratorConfigurationError as exc:
        raise HTTPException(503, str(exc)) from exc
    except OrchestratorModelError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.get("/api/orchestrations/{run_id}")
async def get_orchestration(run_id: str):
    try:
        return campaign_orchestrator.get(run_id)
    except KeyError as exc:
        raise HTTPException(404, "no such orchestration") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/orchestrations/{run_id}/continue")
async def continue_orchestration(run_id: str):
    try:
        return await campaign_orchestrator.continue_run(run_id)
    except KeyError as exc:
        raise HTTPException(404, "no such orchestration") from exc
    except OrchestratorConfigurationError as exc:
        raise HTTPException(503, str(exc)) from exc
    except OrchestratorModelError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.post("/api/orchestrations/{run_id}/activity")
async def record_orchestration_activity(run_id: str, req: ActivityRequest):
    """Record executor output and, by default, ask the coordinator what comes next."""
    try:
        return await campaign_orchestrator.record_activity(
            run_id,
            persona=req.persona,
            task_id=req.task_id,
            kind=req.kind,
            status=req.status,
            content=req.content,
            url=req.url,
            parent_url=req.parent_url,
            reddit_username=req.reddit_username,
            note=req.note,
            continue_after=req.continue_after,
        )
    except KeyError as exc:
        raise HTTPException(404, "no such orchestration") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except OrchestratorConfigurationError as exc:
        raise HTTPException(503, str(exc)) from exc
    except OrchestratorModelError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.get("/api/agents")
async def agents():
    return {"agents": orchestrator.snapshot(), "max": config.MAX_AGENTS}


@app.post("/api/agents/{agent_id}/stop")
async def stop_agent(agent_id: str):
    if not orchestrator.stop(agent_id):
        raise HTTPException(404, "no such agent")
    return {"ok": True}


@app.post("/api/stop-all")
async def stop_all():
    await orchestrator.stop_all()
    return {"ok": True}


@app.post("/api/clear")
async def clear():
    return {"removed": orchestrator.clear_finished()}


@app.get("/api/steel/sessions")
async def steel_sessions():
    try:
        return {"sessions": await steel_client.list_live_sessions()}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"steel: {exc}") from exc


@app.get("/api/events")
async def event_stream():
    async def gen():
        q = events.subscribe()
        try:
            yield events.sse({"kind": "snapshot", "agents": orchestrator.snapshot(), "max": config.MAX_AGENTS})
            while True:
                try:
                    yield events.sse(await asyncio.wait_for(q.get(), timeout=15))
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            events.unsubscribe(q)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/")
async def index():
    return FileResponse(config.DISPLAY_DIR / "index.html")


app.mount("/", StaticFiles(directory=config.DISPLAY_DIR), name="display")
