"""Launches and tracks many dreamers at once. Holds the only mutable registry."""

import asyncio
import itertools

from . import config, events, personas, steel_client
from .agent import Dreamer

_agents: dict[str, Dreamer] = {}


def live_count() -> int:
    return sum(1 for d in _agents.values() if d.state.status == "running")


def snapshot() -> list[dict]:
    return [d.state.snapshot() for d in _agents.values()]


def launch(target: str, queries: list[str], count: int) -> list[dict]:
    room = config.MAX_AGENTS - live_count()
    count = max(0, min(count, room))
    if count == 0:
        raise RuntimeError(f"at MAX_AGENTS={config.MAX_AGENTS}; stop some first")

    launched = []
    query_cycle = itertools.cycle(queries)
    for persona in personas.pick(count):
        d = Dreamer(persona, next(query_cycle), target)
        _agents[d.state.id] = d
        d.task = asyncio.create_task(d.run(), name=f"dreamer-{d.state.id}")
        launched.append(d.state.snapshot())
        events.publish("agent", agent=d.state.snapshot())
    events.publish("log", msg=f"launched {count} dreamer(s) toward {target}")
    return launched


def stop(agent_id: str) -> bool:
    d = _agents.get(agent_id)
    if d is None:
        return False
    d.stop()
    return True


async def stop_all() -> None:
    for d in _agents.values():
        d.stop()
    tasks = [d.task for d in _agents.values() if d.task and not d.task.done()]
    if tasks:
        await asyncio.wait(tasks, timeout=15)
    # belt and braces: anything Steel still thinks is live gets released too
    try:
        await steel_client.release_all()
    except Exception:  # noqa: BLE001
        pass
    events.publish("log", msg="all dreamers kicked")


def clear_finished() -> int:
    gone = [k for k, d in _agents.items() if d.state.status in ("done", "failed", "stopped")]
    for k in gone:
        del _agents[k]
    return len(gone)
