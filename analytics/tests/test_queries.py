"""Aggregation tests. A query mistake is silent everywhere except a test that knows the
exact expected number."""

import unittest

from analytics import db, queries

from ._support import TempDbTestCase

DAY_MS = 86_400_000


class SurfaceScoreTests(TempDbTestCase):
    def test_measured_surfaces_and_unmeasured_ones(self):
        cid = db.get_campaign()["id"]
        db.insert_visibility_sample(cid, "q1", "reddit", 0.8)
        db.insert_visibility_sample(cid, "q2", "reddit", 0.4)
        db.insert_visibility_sample(cid, "q1", "search", 0.5)

        self.assertEqual(queries.surface_scores(cid, ["q1", "q2"]), [
            {"label": "Community Presence", "value": 60, "delta": 60, "measured": True},
            {"label": "Search Presence", "value": 50, "delta": 50, "measured": True},
            {"label": "AI Answer Presence", "value": 0, "delta": 0, "measured": False},
        ])

    def test_delta_compares_against_a_week_ago(self):
        cid = db.get_campaign()["id"]
        now = db.now_ms()
        db.insert_visibility_sample(cid, "q1", "search", 0.2, ts=now - 8 * DAY_MS)
        db.insert_visibility_sample(cid, "q1", "search", 0.5, ts=now - 1000)
        search = queries.surface_scores(cid, ["q1"])[1]
        self.assertEqual((search["value"], search["delta"]), (50, 30))


class QueryPresenceTests(TempDbTestCase):
    def test_buckets_and_trend(self):
        cid = db.get_campaign()["id"]
        now = db.now_ms()
        db.insert_visibility_sample(cid, "q1", "search", 0.10, ts=now - 8 * DAY_MS)
        db.insert_visibility_sample(cid, "q1", "search", 0.55, ts=now - 1000)
        db.insert_visibility_sample(cid, "q1", "reddit", 0.30, ts=now - 1000)

        self.assertEqual(queries.query_presence(cid, ["q1"]), [{
            "query": "q1", "reddit": "partial", "search": "high", "aiAnswer": "none",
            "trend": "up", "delta7d": 45,
        }])


class VisibilitySeriesTests(TempDbTestCase):
    def test_unmeasured_days_are_gaps_and_score_uses_measured_surfaces_only(self):
        cid = db.get_campaign()["id"]
        now = db.now_ms()
        db.insert_visibility_sample(cid, "q1", "search", 0.5, ts=now - 1000)
        db.insert_visibility_sample(cid, "q1", "reddit", 0.8, ts=now - 1000)

        series = queries.visibility_series(cid, ["q1"], days=3)
        self.assertEqual(len(series), 4)
        self.assertEqual(
            {k: series[0][k] for k in ("score", "community", "search", "ai")},
            {"score": None, "community": None, "search": None, "ai": None},
        )
        today = series[-1]
        self.assertEqual((today["community"], today["search"], today["ai"]), (80, 50, None))
        # (0.30*80 + 0.20*50) / (0.30 + 0.20) = 68 - AI unmeasured, so not counted as zero
        self.assertEqual(today["score"], 68)


if __name__ == "__main__":
    unittest.main()
