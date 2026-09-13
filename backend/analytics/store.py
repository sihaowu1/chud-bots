"""Small durable discovery ledger. Transactions stay on the event-loop thread."""

import json
import sqlite3
import time
from pathlib import Path


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute("CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, data TEXT NOT NULL)")
        self.db.commit()

    def save(self, run: dict) -> None:
        run["updatedAt"] = int(time.time() * 1000)
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO runs VALUES (?, ?)", (run["id"], json.dumps(run)))

    def all(self) -> list[dict]:
        return sorted((json.loads(row[0]) for row in self.db.execute("SELECT data FROM runs")),
                      key=lambda run: run["createdAt"], reverse=True)

    def snapshot(self) -> dict:
        runs = self.all()
        return {"runs": runs}
