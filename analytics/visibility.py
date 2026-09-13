"""The presence probes behind the discoverability page, and the loop that runs them on a
timer inside the backend server.

Search and Reddit presence come from one Google probe per query (see prober.py); AI
answer presence is a separate, optional API call.

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


async def probe_search_and_reddit(query: str, campaign: dict) -> tuple[dict, dict]:
    """One Google probe, split into the search and Reddit surface results."""
    result = await prober.probe_guarded(
        query, campaign["url"], campaign["name"], depth_pages=config.PROBE_DEPTH_PAGES
    )
    if result["status"] != "done":
        missed = {"measured": False, "status": result["status"]}
        return {"surface": "search", **missed}, {"surface": "reddit", **missed}

    search = {
        "surface": "search", "measured": True,
        "presence": rank_metrics.visibility(result["position"]) / 100.0,
        "position": result["position"], "raw": {"pages_fetched": result["pages_fetched"]},
    }
    mentions = result["reddit"]
    if mentions["status"] != "done":
        reddit = {"surface": "reddit", "measured": False, "status": mentions["status"]}
    else:
        # Named in any Reddit result Google surfaces -> 1.0. The design doc's "0.5 if only
        # in comments" tier needs the thread itself and isn't implemented.
        reddit = {
            "surface": "reddit", "measured": True,
            "presence": 1.0 if mentions["hits"] else 0.0,
            "raw": {"checked": mentions["checked"], "hits": mentions["hits"][:5]},
        }
    return search, reddit


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
    (search, reddit), ai = await asyncio.gather(
        probe_search_and_reddit(query, campaign),
        probe_ai(query, campaign["name"]),
    )
    for result in (search, reddit, ai):
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
