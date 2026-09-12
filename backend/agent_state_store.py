"""Persistent, local state for each dreamer persona."""

import json
import re
from pathlib import Path

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
        "persona": persona,
        "email": {
            "address": None,
            "login": None,
        },
    }


def _path_for(persona: str) -> Path:
    filename = re.sub(r"[^a-z0-9_-]+", "-", persona.lower()).strip("-") or "dreamer"
    return config.AGENT_STATES_DIR / f"{filename}.json"
