"""Response models, aliased to camelCase to match frontend/src/lib/analytics/store.ts."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SurfaceScore(CamelModel):
    label: str
    value: int
    delta: int
    # False until a probe for this surface has ever written a sample - the frontend
    # shows "not measured" instead of a zero and leaves it out of the headline score.
    measured: bool


class QueryPresence(CamelModel):
    query: str
    reddit: Literal["detected", "partial", "none"]
    search: Literal["high", "medium", "low", "none"]
    ai_answer: Literal["detected", "partial", "none"]
    trend: Literal["up", "flat", "down"]
    # to_camel turns "delta7d" into "delta7D"; types.ts wants it verbatim.
    delta7d: int = Field(alias="delta7d")


class VisibilitySeriesPoint(CamelModel):
    """None means no probe measured that surface that day - a gap, not a zero."""
    date: str
    score: int | None
    community: int | None
    search: int | None
    ai: int | None
