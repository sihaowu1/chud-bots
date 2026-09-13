"""Run separately: python -m uvicorn backend.analytics.app:app --port 8001."""

import asyncio
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from backend import config
from .scraper import explore
from .store import Store

store: Store | None = None
active: dict[str, asyncio.Task] = {}


@asynccontextmanager
async def lifespan(app):
    global store
    store = Store(Path(os.getenv("ANALYTICS_DB", str(config.ROOT / ".dist/analytics.sqlite"))))
    for run in store.all():
        if run["status"] in {"queued", "running"}:
            run.update(status="failed", error="Service restarted during exploration", finishedAt=int(time.time() * 1000))
            store.save(run)
    yield
    tasks = list(active.values())
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    store.db.close()


app = FastAPI(title="Reddit discovery analytics", lifespan=lifespan)


class StartRun(BaseModel):
    prompt: str = Field(min_length=3, max_length=2000)
    limit: int = Field(default=12, ge=1, le=30)

    @field_validator("prompt", mode="before")
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value


@app.get("/api/analytics")
async def snapshot():
    return store.snapshot()


@app.post("/api/analytics", status_code=202)
async def start(body: StartRun):
    if not config.STEEL_API_KEY or not config.OPENAI_API_KEY:
        raise HTTPException(503, "Set STEEL_API_KEY and OPENAI_API_KEY in the repository .env")
    if any(not task.done() for task in active.values()):
        raise HTTPException(409, "An exploration is already running")
    run = {"id": uuid4().hex, "prompt": body.prompt, "limit": body.limit,
           "status": "queued", "createdAt": int(time.time() * 1000), "queries": [],
           "findings": [], "events": [], "discovered": 0, "viewerUrl": None, "error": None}
    store.save(run)
    task = asyncio.create_task(explore(run, store.save))
    active[run["id"]] = task
    task.add_done_callback(lambda _: active.pop(run["id"], None))
    return run


@app.delete("/api/analytics/{run_id}")
async def stop(run_id: str):
    task = active.get(run_id)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            # A queued task can be cancelled before explore enters its try/finally.
            for run in store.all():
                if run["id"] == run_id:
                    run.update(status="stopped", finishedAt=int(time.time() * 1000))
                    store.save(run)
    return {"stopped": run_id}
