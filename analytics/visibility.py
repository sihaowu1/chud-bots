"""The three presence probes behind the discoverability page, and the loop that runs
them on a timer inside the backend server.

Nothing here writes a sample for a probe that didn't measure anything. A blocked,
errored, skipped, or disabled probe is missing data, not a zero.
"""

import asyncio
import datetime
import logging

import httpx

from . import config, db, prober
from . import metrics as rank_metrics

log = logging.getLogger(__name__)

# `uvicorn --reload` restarts the server on every edit; probing immediately at startup
# would open a paid Steel session per save. Waiting lets a quick restart cancel it.
FIRST_CYCLE_DELAY_S = 60

_task: asyncio.Task | None = None

# Reset at UTC midnight - "50 AI calls a day" is how someone reasons about the cap.
_ai_calls_today = 0
_ai_calls_day: datetime.date | None = None


def _ai_budget_ok() -> bool:
    global _ai_calls_today, _ai_calls_day
    today = datetime.datetime.now(datetime.timezone.utc).date()
    if _ai_calls_day != today:
        _ai_calls_day, _ai_calls_today = today, 0
    return _ai_calls_today < config.AI_PROBE_MAX_CALLS_PER_DAY


async def probe_search(query: str, target: str) -> dict:
    result = await prober.probe_guarded(query, target, depth_pages=config.PROBE_DEPTH_PAGES)
    if result["status"] != "done":
        return {"surface": "search", "measured": False, "status": result["status"]}
    position = result["position"]
    return {
        "surface": "search", "measured": True,
        "presence": rank_metrics.visibility(position) / 100.0,
        "position": position, "raw": {"pages_fetched": result["pages_fetched"]},
    }


async def probe_reddit(query: str, entity_name: str) -> dict:
    """Keyless Reddit search: is the entity named in the top results' titles/selftext?
    Only detected (1.0) or not (0.0) - the design doc's "0.5 if only in comments" tier
    needs a second call per post and isn't implemented."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://www.reddit.com/search.json",
                params={"q": query, "limit": 25, "sort": "new"},
                headers={"User-Agent": "inception-discoverability-probe/1.0"},
            )
            resp.raise_for_status()
            posts = resp.json()["data"]["children"]
    except Exception as exc:  # noqa: BLE001 - a network failure is a skip, not a crash
        return {"surface": "reddit", "measured": False, "status": "error", "detail": str(exc)[:200]}

    name = entity_name.lower()
    hits = [
        p["data"]["permalink"] for p in posts
        if name in (p["data"].get("title", "") + " " + p["data"].get("selftext", "")).lower()
    ]
    return {
        "surface": "reddit", "measured": True,
        "presence": 1.0 if hits else 0.0,
        "raw": {"checked": len(posts), "hits": hits[:5]},
    }


_AI_PROMPT = (
    "Answer with only 'yes' or 'no', nothing else.\n"
    "If someone asked you \"{query}\", would you mention {entity} in your answer?"
)


async def probe_ai(query: str, entity_name: str) -> dict:
    """Off unless AI_PROBE_API_KEY is set, and capped per day even then."""
    global _ai_calls_today
    if not config.AI_PROBE_ENABLED:
        return {"surface": "ai", "measured": False, "status": "disabled"}
    if not _ai_budget_ok():
        return {"surface": "ai", "measured": False, "status": "budget_exceeded"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                config.AI_PROBE_API_URL,
                headers={
                    "x-api-key": config.AI_PROBE_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": config.AI_PROBE_MODEL,
                    "max_tokens": 5,
                    "messages": [{"role": "user", "content": _AI_PROMPT.format(query=query, entity=entity_name)}],
                },
            )
            _ai_calls_today += 1  # counts against the cap whether or not it succeeded
            resp.raise_for_status()
            text = resp.json()["content"][0]["text"].strip().lower()
    except Exception as exc:  # noqa: BLE001 - one bad call must not break the cycle
        return {"surface": "ai", "measured": False, "status": "error", "detail": str(exc)[:200]}

    return {"surface": "ai", "measured": True, "presence": 1.0 if text.startswith("y") else 0.0,
            "raw": {"raw_answer": text}}


async def probe_query(campaign: dict, query: str) -> None:
    results = await asyncio.gather(
        probe_search(query, campaign["url"]),
        probe_reddit(query, campaign["name"]),
        probe_ai(query, campaign["name"]),
    )
    for result in results:
        if not result["measured"]:
            log.info("visibility %s probe for %r did not measure: %s",
                     result["surface"], query, result.get("status"))
            continue
        db.insert_visibility_sample(
            campaign["id"], query, result["surface"], result["presence"],
            position=result.get("position"), raw=result.get("raw"),
        )


async def probe_cycle() -> None:
    campaign = db.get_campaign()
    for query in campaign["searchIntent"]:
        try:
            await probe_query(campaign, query)
        except Exception:  # noqa: BLE001 - one bad query must not end the cycle
            log.exception("visibility probe failed for %r", query)


async def _loop() -> None:
    await asyncio.sleep(min(FIRST_CYCLE_DELAY_S, config.VISIBILITY_INTERVAL_S))
    while True:
        await probe_cycle()
        await asyncio.sleep(config.VISIBILITY_INTERVAL_S)


def start() -> asyncio.Task | None:
    global _task
    if config.VISIBILITY_INTERVAL_S <= 0:
        return None
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop(), name="visibility-probe")
    return _task


async def stop() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        await asyncio.gather(_task, return_exceptions=True)
        _task = None
