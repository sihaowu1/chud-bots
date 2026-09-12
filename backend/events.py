"""In-memory pub/sub. Agents publish, SSE subscribers consume."""

import asyncio
import json
import time
from typing import Any

_subscribers: set[asyncio.Queue] = set()
_history: list[dict[str, Any]] = []
HISTORY_LIMIT = 500


def publish(kind: str, **data: Any) -> None:
    event = {"kind": kind, "ts": time.time(), **data}
    _history.append(event)
    del _history[:-HISTORY_LIMIT]
    for q in list(_subscribers):
        q.put_nowait(event)


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


def history() -> list[dict[str, Any]]:
    return list(_history)


def sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event)}\n\n"
