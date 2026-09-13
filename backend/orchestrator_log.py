"""Append-only, cumulative human-readable audit logs for orchestrations."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from . import config


def append(run_id: str, kind: str, data: dict[str, Any], *, logs_dir: Path | None = None) -> Path:
    """Add an entry and write the next numbered cumulative snapshot."""
    if kind not in {"thinking", "action", "output", "cli"}:
        raise ValueError(f"unsupported orchestrator log kind: {kind}")
    if not run_id or any(ch not in "abcdefghijklmnopqrstuvwxyz0123456789-" for ch in run_id.lower()):
        raise ValueError("invalid run id")

    directory = (logs_dir or config.ORCHESTRATOR_LOGS_DIR) / run_id
    directory.mkdir(parents=True, exist_ok=True)
    numbered = sorted(
        (path for path in directory.glob("*.json") if path.stem.isdigit()),
        key=lambda path: int(path.stem),
    )
    entries: list[dict[str, Any]] = []
    if numbered:
        entries = json.loads(numbered[-1].read_text(encoding="utf-8"))["entries"]
    number = int(numbered[-1].stem) + 1 if numbered else 0
    entries.append({
        "number": number,
        "timestamp": datetime.now(UTC).isoformat(),
        "kind": kind,
        "data": data,
    })
    snapshot = {
        "schema_version": 1,
        "run_id": run_id,
        "snapshot": number,
        "previous": f"{number - 1}.json" if number else None,
        "entries": entries,
    }
    path = directory / f"{number}.json"
    temporary = directory / f"{number}.json.tmp"
    temporary.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)
    return path
