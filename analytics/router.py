"""Discoverability endpoints, included into backend/main.py. The frontend reaches them
through its /backend proxy (frontend/next.config.ts)."""

from fastapi import APIRouter, Query

from . import db, queries
from .schema import QueryPresence, SurfaceScore, VisibilitySeriesPoint

router = APIRouter(prefix="/api/discoverability")


@router.get("/surfaces", response_model=list[SurfaceScore])
async def surfaces():
    c = db.get_campaign()
    return queries.surface_scores(c["id"], c["searchIntent"])


@router.get("/queries", response_model=list[QueryPresence])
async def query_presence():
    c = db.get_campaign()
    return queries.query_presence(c["id"], c["searchIntent"])


@router.get("/series", response_model=list[VisibilitySeriesPoint])
async def series(days: int = Query(14, ge=1, le=90)):
    c = db.get_campaign()
    return queries.visibility_series(c["id"], c["searchIntent"], days=days)
