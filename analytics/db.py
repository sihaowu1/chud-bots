"""The only module in analytics that imports sqlite3.

Synchronous, called straight from the event loop. That stays honest only while every
query is O(ms): scope reads to a campaign and a time window. `check_same_thread=False`
because FastAPI runs sync endpoints on a threadpool.
"""

import json
import sqlite3
import time
from pathlib import Path

from . import config

_SCHEMA_PATH = Path(__file__).parent / "schema.sql"
_SEED_CAMPAIGN_PATH = Path(__file__).parent / "seed" / "campaign.json"

_conn: sqlite3.Connection | None = None


def now_ms() -> int:
    return int(time.time() * 1000)


def connect(path: Path | str | None = None) -> sqlite3.Connection:
    global _conn
    if _conn is None:
        db_path = Path(path or config.DB_PATH)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(db_path, isolation_level=None, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA synchronous=NORMAL")
        _conn.executescript(_SCHEMA_PATH.read_text())
        _seed_campaign_if_empty(_conn)
    return _conn


def close() -> None:
    global _conn
    if _conn is not None:
        _conn.close()
        _conn = None


def _seed_campaign_if_empty(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT 1 FROM campaigns LIMIT 1").fetchone():
        return
    data = json.loads(_SEED_CAMPAIGN_PATH.read_text())
    conn.execute(
        """INSERT INTO campaigns
           (id, name, type, type_label, url, description, audience_json, why_care,
            problems_json, search_intent_json, topics_json, related_json, avoid_json,
            status, started_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            data["id"], data["name"], data["type"], data["typeLabel"], data["url"],
            data["description"], json.dumps(data["audience"]), data["whyCare"],
            json.dumps(data["problems"]), json.dumps(data["searchIntent"]),
            json.dumps(data["topics"]), json.dumps(data["related"]), json.dumps(data["avoid"]),
            data.get("status", "running"), data.get("startedAt") or now_ms(),
        ),
    )


def get_campaign() -> dict:
    r = connect().execute("SELECT * FROM campaigns LIMIT 1").fetchone()
    return {
        "id": r["id"], "name": r["name"], "url": r["url"],
        "searchIntent": json.loads(r["search_intent_json"]),
    }


def insert_visibility_sample(
    campaign_id: str, query: str, surface: str, presence: float,
    position: int | None = None, raw: dict | None = None, ts: int | None = None,
) -> None:
    connect().execute(
        """INSERT INTO visibility_samples (ts, campaign_id, query, surface, presence, position, raw_json)
           VALUES (?,?,?,?,?,?,?)""",
        (ts or now_ms(), campaign_id, query, surface, presence, position,
         json.dumps(raw) if raw else None),
    )
