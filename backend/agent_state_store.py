"""Persistent, local state for each dreamer persona."""

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from . import config


def load_or_create(persona: str) -> dict:
    """Load a persona state file, creating an empty one when needed."""
    path = _path_for(persona)
    if not path.exists():
        state = _blank_state(persona)
        save(persona, state)
        return state

    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise RuntimeError(f"could not read agent state {path.name}: {exc}") from exc

    if not isinstance(state, dict):
        raise RuntimeError(f"agent state {path.name} must contain a JSON object")

    state.setdefault("persona", persona)
    state.setdefault("email", {"address": None, "login": None})
    state.setdefault("reddit", {"username": None})
    state.setdefault("assignments", [])
    state.setdefault("activity", [])
    return state


def save(persona: str, state: dict) -> None:
    """Write a persona state file atomically."""
    path = _path_for(persona)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def _blank_state(persona: str) -> dict:
    return {
        "schema_version": 1,
        "persona": persona,
        "email": {
            "address": None,
            "login": None,
        },
        "reddit": {"username": None},
        "assignments": [],
        "activity": [],
    }


def append_assignment(persona: str, assignment: dict[str, Any]) -> dict:
    """Persist an orchestrator assignment in this persona's durable ledger."""
    state = load_or_create(persona)
    item = dict(assignment)
    item.setdefault("assigned_at", _timestamp())
    state["assignments"].append(item)
    save(persona, state)
    return item


def append_activity(
    persona: str,
    activity: dict[str, Any],
    *,
    reddit_username: str | None = None,
) -> dict:
    """Persist an adapter callback (post, comment, wait, or system event)."""
    state = load_or_create(persona)
    if reddit_username:
        state["reddit"]["username"] = reddit_username
    item = dict(activity)
    item.setdefault("timestamp", _timestamp())
    state["activity"].append(item)
    save(persona, state)
    return item


def public_ledger(persona: str) -> dict:
    """Return planning context without leaking email/login credentials to the model."""
    state = load_or_create(persona)
    return {
        "persona": state["persona"],
        "reddit_username": state["reddit"].get("username"),
        "assignments": state["assignments"],
        "activity": state["activity"],
    }


def _timestamp() -> str:
    return datetime.now(UTC).isoformat()


def _path_for(persona: str) -> Path:
    filename = re.sub(r"[^a-z0-9_-]+", "-", persona.lower()).strip("-") or "dreamer"
    return config.AGENT_STATES_DIR / f"{filename}.json"
