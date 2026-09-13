"""Launches and tracks many dreamers at once. Holds the only mutable registry."""

import asyncio
import itertools

from . import config, events, personas, steel_client
from .agent import Dreamer

_agents: dict[str, Dreamer] = {}


def live_count() -> int:
    return sum(1 for d in _agents.values() if d.state.status in ("queued", "running"))


def snapshot() -> list[dict]:
    return [d.state.snapshot() for d in _agents.values()]


def selected_personas(count: int, requested: list[str] | None = None) -> list:
    pool = {persona.name: persona for persona in personas.pick(len(personas.names()))}
    if requested is not None:
        if (len(requested) != count or len(set(requested)) != count
                or any(name not in pool for name in requested)):
            raise ValueError("personas must contain count distinct configured persona names")
        return [pool[name] for name in requested]
    return personas.pick(count)


def launch(target: str, queries: list[str], count: int, *, mode: str = "legacy",
           selected_persona_names: list[str] | None = None,
           profile_posts: dict[str, dict] | None = None) -> list[dict]:
    if mode not in ("legacy", "reddit_browse", "profile_post"):
        raise ValueError("unknown browsing mode")
    chosen = selected_personas(count, selected_persona_names)
    if mode == "profile_post":
        expected = {persona.name for persona in chosen}
        if profile_posts is None or set(profile_posts) != expected:
            raise ValueError("profile_post mode requires one post for every selected persona")
    elif profile_posts is not None:
        raise ValueError("profile posts are only valid in profile_post mode")
    room = config.MAX_AGENTS - live_count()
    if mode == "profile_post" and count > room:
        raise RuntimeError("not enough available agent slots for the profile-post batch")
    count = max(0, min(count, room))
    if count == 0:
        raise RuntimeError(f"at MAX_AGENTS={config.MAX_AGENTS}; stop some first")

    launched = []
    normalized_queries = [query.strip() for query in queries if query.strip()]
    # An empty query is an explicit login-only run. Keep one sentinel value so
    # the normal persona-cycling launch path still applies.
    query_cycle = itertools.cycle(normalized_queries or [""])
    for persona in chosen[:count]:
        d = Dreamer(
            persona, next(query_cycle), target, mode=mode,
            profile_post=profile_posts[persona.name] if profile_posts else None,
        )
        _agents[d.state.id] = d
        d.task = asyncio.create_task(d.run(), name=f"dreamer-{d.state.id}")
        launched.append(d.state.snapshot())
        events.publish("agent", agent=d.state.snapshot())
    description = (
        "posting to their profiles" if mode == "profile_post" else
        "browsing subreddits (read-only)" if mode == "reddit_browse" else
        f"toward {target}" if normalized_queries else "in login-only mode"
    )
    events.publish("log", msg=f"launched {count} dreamer(s) {description}")
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
