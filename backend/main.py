"""HTTP surface. Serves the display and exposes the orchestrator over JSON + SSE.

Run from the repo root:  .venv/bin/uvicorn backend.main:app --reload
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, events, orchestrator, steel_client


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await orchestrator.stop_all()


app = FastAPI(title="Inception", lifespan=lifespan)


class LaunchRequest(BaseModel):
    target: str = Field(..., description="URL of the site to plant in search")
    queries: list[str] = Field(..., min_length=1, description="Search phrases the dreamers will type")
    count: int = Field(1, ge=1, le=50)


@app.post("/api/runs")
async def launch(req: LaunchRequest):
    try:
        return {"agents": orchestrator.launch(req.target, req.queries, req.count)}
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc


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
