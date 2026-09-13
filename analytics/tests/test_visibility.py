"""probe_query turns one Google probe into search and Reddit samples, and writes nothing
for a surface that wasn't measured."""

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from analytics import config, db, visibility

from ._support import TempDbTestCase

AI_DISABLED = {"surface": "ai", "measured": False, "status": "disabled"}


def _done(position: int | None, reddit: dict) -> dict:
    return {"status": "done", "position": position, "pages_fetched": 1, "reddit": reddit}


class ProbeQueryTests(TempDbTestCase):
    def _run(self, probe_result: dict):
        campaign = db.get_campaign()
        guarded = AsyncMock(return_value=probe_result)
        with patch.object(visibility.prober, "probe_guarded", guarded), \
             patch.object(visibility, "probe_ai", AsyncMock(return_value=AI_DISABLED)):
            asyncio.run(visibility.probe_query(campaign, "q1"))
        rows = db.connect().execute(
            "SELECT surface, presence, position FROM visibility_samples ORDER BY surface"
        ).fetchall()
        return guarded, campaign, [(r["surface"], r["presence"], r["position"]) for r in rows]

    def test_one_probe_writes_search_and_reddit_samples(self):
        guarded, campaign, rows = self._run(
            _done(1, {"status": "done", "checked": 3, "hits": ["https://www.reddit.com/r/a/1"]})
        )
        guarded.assert_awaited_once_with(
            "q1", campaign["url"], campaign["name"], depth_pages=config.PROBE_DEPTH_PAGES
        )
        self.assertEqual(rows, [("reddit", 1.0, None), ("search", 1.0, 1)])

    def test_no_reddit_mentions_is_a_measured_zero(self):
        _, _, rows = self._run(_done(None, {"status": "done", "checked": 8, "hits": []}))
        self.assertEqual(rows, [("reddit", 0.0, None), ("search", 0.0, None)])

    def test_unmeasured_reddit_check_writes_search_only(self):
        _, _, rows = self._run(_done(4, {"status": "blocked", "marker": "captcha-form"}))
        self.assertEqual([r[0] for r in rows], ["search"])

    def test_blocked_probe_writes_nothing(self):
        _, _, rows = self._run({"status": "blocked", "position": None})
        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
