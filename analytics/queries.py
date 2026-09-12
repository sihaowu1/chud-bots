"""Discoverability aggregations over visibility_samples, computed on read. Labels use
server-local time, matching how the dashboard labels days."""

import datetime

from . import db

_DAY_MS = 86_400_000

# Surface -> breakdown label and its weight in the design doc's discoverability blend.
_SURFACES = [
    ("reddit", "Community Presence", 0.30),
    ("search", "Search Presence", 0.20),
    ("ai", "AI Answer Presence", 0.15),
]


def _latest_presence(campaign_id: str, query: str, surface: str, before: int) -> float | None:
    r = db.connect().execute(
        "SELECT presence FROM visibility_samples WHERE campaign_id=? AND query=? AND surface=? AND ts<=? "
        "ORDER BY ts DESC LIMIT 1",
        (campaign_id, query, surface, before),
    ).fetchone()
    return r["presence"] if r else None


def _mean_latest(campaign_id: str, queries: list[str], surface: str, as_of: int) -> float | None:
    values = [p for q in queries if (p := _latest_presence(campaign_id, q, surface, as_of)) is not None]
    return 100.0 * sum(values) / len(values) if values else None


def surface_scores(campaign_id: str, queries: list[str]) -> list[dict]:
    """Each probe surface as 0-100 (mean of the latest sample per query) and its 7-day change."""
    now = db.now_ms()
    out = []
    for surface, label, _weight in _SURFACES:
        current = _mean_latest(campaign_id, queries, surface, now)
        week_ago = _mean_latest(campaign_id, queries, surface, now - 7 * _DAY_MS)
        out.append({
            "label": label,
            "value": round(current or 0),
            "delta": round((current or 0) - (week_ago or 0)),
            "measured": current is not None,
        })
    return out


def _bucket(p: float | None, thresholds: tuple, labels: tuple) -> str:
    if p is not None:
        for t, label in zip(thresholds, labels):
            if p >= t:
                return label
    return labels[-1]


def query_presence(campaign_id: str, queries: list[str]) -> list[dict]:
    now = db.now_ms()
    out = []
    for q in queries:
        search_now = _latest_presence(campaign_id, q, "search", now)
        search_7d = _latest_presence(campaign_id, q, "search", now - 7 * _DAY_MS)
        delta = round(100 * ((search_now or 0) - (search_7d or 0)))
        out.append({
            "query": q,
            "reddit": _bucket(_latest_presence(campaign_id, q, "reddit", now), (0.75, 0.25), ("detected", "partial", "none")),
            "search": _bucket(search_now, (0.5, 0.2, 0.0001), ("high", "medium", "low", "none")),
            "aiAnswer": _bucket(_latest_presence(campaign_id, q, "ai", now), (0.75, 0.25), ("detected", "partial", "none")),
            "trend": "up" if delta > 2 else "down" if delta < -2 else "flat",
            "delta7d": delta,
        })
    return out


def visibility_series(campaign_id: str, queries: list[str], days: int = 14) -> list[dict]:
    """One point per day, oldest first. A surface with no samples that day is None, and
    the day's score blends only the surfaces that were measured (renormalised by their
    weights), so an unrun probe can't drag the line down to zero."""
    conn = db.connect()
    now = db.now_ms()
    placeholders = ",".join("?" * len(queries))
    out = []
    for day in range(days, -1, -1):
        # day=0 is (now - 1 day, now], so samples written moments before the query count.
        day_end = now - day * _DAY_MS
        day_start = day_end - _DAY_MS

        values: dict[str, float | None] = {}
        for surface, _label, _weight in _SURFACES:
            p = None
            if queries:
                p = conn.execute(
                    f"SELECT AVG(presence) p FROM visibility_samples WHERE campaign_id=? AND surface=? "
                    f"AND query IN ({placeholders}) AND ts>? AND ts<=?",
                    (campaign_id, surface, *queries, day_start, day_end),
                ).fetchone()["p"]
            values[surface] = None if p is None else 100.0 * p

        measured = [(values[s], w) for s, _label, w in _SURFACES if values[s] is not None]
        score = round(sum(v * w for v, w in measured) / sum(w for _, w in measured)) if measured else None

        def rounded(v: float | None) -> int | None:
            return None if v is None else round(v)

        out.append({
            "date": datetime.datetime.fromtimestamp(day_end / 1000).strftime("%b %d"),
            "score": score,
            "community": rounded(values["reddit"]),
            "search": rounded(values["search"]),
            "ai": rounded(values["ai"]),
        })
    return out
