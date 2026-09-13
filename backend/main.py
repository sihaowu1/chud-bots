"""HTTP surface. Serves the display and exposes the orchestrator over JSON + SSE.

Run from the repo root:  uv run uvicorn backend.main:app --reload
"""

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import agent_state_store, config, events, orchestrator, personas, steel_client
from .subreddit_selector import select_subreddits
from .search_prompt_selector import select_search_prompts
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


def _least_used_personas(count: int, selected_personas: list[str] | None = None) -> list[str]:
    if selected_personas is not None:
        return [persona.name for persona in orchestrator.resolve_personas(count, selected_personas)]
    order = {name: index for index, name in enumerate(personas.names())}

    def usage(name: str) -> tuple[int, int]:
        ledger = agent_state_store.public_ledger(name)
        return (
            len(ledger.get("assignments", [])) + len(ledger.get("activity", [])),
            order[name],
        )

    return sorted(personas.names(), key=usage)[:count]


def _library_posts() -> list[dict]:
    posts = []
    seen = set()
    for name in personas.names():
        ledger = agent_state_store.public_ledger(name)
        for activity in ledger.get("activity", []):
            url = activity.get("url")
            if (
                activity.get("kind") != "post"
                or activity.get("status") != "completed"
                or not isinstance(url, str)
                or url in seen
            ):
                continue
            seen.add(url)
            posts.append({
                "id": activity.get("task_id") or activity.get("request_id") or url,
                "persona": name,
                "url": url,
                "title": _activity_title(activity),
                "content": activity.get("content") or activity.get("body"),
                "reddit_username": activity.get("reddit_username"),
                "timestamp": activity.get("timestamp"),
                "kind": "profile_post" if _is_profile_post_url(url) else "post",
            })
    return sorted(posts, key=lambda item: item.get("timestamp") or "", reverse=True)


def _activity_title(activity: dict) -> str | None:
    title = activity.get("title")
    if isinstance(title, str) and title.strip():
        return title.strip()
    note = activity.get("note")
    if isinstance(note, str):
        try:
            parsed = json.loads(note)
        except json.JSONDecodeError:
            return None
        title = parsed.get("title") if isinstance(parsed, dict) else None
        if isinstance(title, str) and title.strip():
            return title.strip()
    return None


def _is_profile_post_url(url: str) -> bool:
    parsed = urlsplit(url)
    return (
        parsed.netloc == "mock.local" and parsed.path.startswith("/profile-posts/")
    ) or parsed.path.startswith("/user/") or parsed.path.startswith("/r/u_")


class LaunchRequest(BaseModel):
    prompt: str = Field("", max_length=2000)
    mode: Literal["legacy", "reddit_browse", "profile_post"] = "legacy"
    personas: list[str] | None = None
    target: str = Field(..., description="URL of the site to plant in search")
    queries: list[str] = Field(
        default_factory=list,
        description="Search phrases the dreamers will type; blank runs login only",
    )
    count: int = Field(1, ge=1, le=15)


class OrchestrationRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    personas: list[str] | None = None
    count: int | None = Field(None, ge=1, le=15)
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
        subreddits = None
        queries = req.queries
        chosen = orchestrator.resolve_personas(req.count, req.personas)
        launch_count = min(req.count, max(0, config.MAX_AGENTS - orchestrator.live_count()))
        bound_browser_count = sum(
            persona.browsing_mode == "reddit_browse" for persona in chosen[:launch_count]
        )
        prompt = req.prompt.strip() or "\n".join(req.queries).strip()
        profile_posts = None
        search_prompts = None
        if req.mode == "profile_post":
            if not prompt:
                raise ValueError("profile_post mode requires a non-empty query")
            if req.count > len(personas.names()):
                raise ValueError("profile_post count exceeds the configured persona pool")
            if req.count > config.MAX_AGENTS - orchestrator.live_count():
                raise RuntimeError("not enough available agent slots for the profile-post batch")
            shared_subreddits = await select_subreddits(
                prompt, browser_count=len(chosen),
            )
            profile_posts = await profile_post_orchestrator.plan(
                prompt, [persona.name for persona in chosen],
                excluded_subreddits=shared_subreddits,
            )
        else:
            automatic_posters = [
                persona.name for persona in chosen[:launch_count]
                if persona.name == "Yusuf"
            ] if prompt else []
            if automatic_posters:
                posting_prompt = (
                    f"Topic: {prompt}\n\n"
                    "Write about the user's startup as a solution to the compute shortage. "
                    "Use only startup details present in the topic."
                )
                profile_posts = await profile_post_orchestrator.plan(
                    posting_prompt, automatic_posters,
                )
                for post in profile_posts.values():
                    post["warmup_seconds"] = 2.0
                bound_browser_count -= len(automatic_posters)
            if prompt and bound_browser_count:
                subreddits = await select_subreddits(
                    prompt, browser_count=bound_browser_count,
                )
            google_personas = [
                persona.name for persona in chosen[:launch_count]
                if persona.browsing_mode != "reddit_browse"
            ]
            if prompt and google_personas:
                search_prompts = await select_search_prompts(prompt, google_personas)
        if req.prompt.strip():
            queries = [prompt]
        return {"agents": orchestrator.launch(
            req.target, queries, req.count,
            mode=req.mode, selected_personas=req.personas,
            subreddits=subreddits, profile_posts=profile_posts,
            search_prompts=search_prompts,
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
        prompt = req.prompt.strip()
        if not prompt:
            raise ValueError("campaign prompt cannot be blank")
        selected_personas = req.personas
        if req.count is not None:
            selected_personas = _least_used_personas(req.count, req.personas)
        return await campaign_orchestrator.start(
            prompt,
            selected_personas=selected_personas,
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


@app.get("/api/library")
async def library():
    return {"posts": _library_posts()}


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
