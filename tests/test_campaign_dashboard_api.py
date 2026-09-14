import unittest
from unittest.mock import AsyncMock, patch

import httpx

from backend import main, personas


class CampaignDashboardApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_dashboard_query_selects_personas_and_returns_plan(self):
        plan = {"id": "dashboard-run", "phases": []}
        with patch.object(main.campaign_orchestrator, "start", new_callable=AsyncMock) as start:
            start.return_value = plan
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=main.app), base_url="http://test"
            ) as client:
                response = await client.post("/api/orchestrations", json={
                    "prompt": "  Plan a demo  ", "count": 3, "environment": "mock",
                })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), plan)
            start.assert_awaited_once_with(
                "Plan a demo", selected_personas=personas.names()[:3], environment="mock"
            )

    async def test_dashboard_count_uses_configured_persona_order(self):
        for count in range(1, len(personas.names()) + 1):
            self.assertEqual(main._ordered_personas(count), personas.names()[:count])
        self.assertEqual(main._ordered_personas(2), ["Yusuf", "Cobb"])
        self.assertEqual(main._ordered_personas(2, ["Arthur", "Cobb"]), ["Arthur", "Cobb"])

    async def test_invalid_dashboard_requests_do_not_call_planner(self):
        with patch.object(main.campaign_orchestrator, "start", new_callable=AsyncMock) as start:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=main.app), base_url="http://test"
            ) as client:
                for body in (
                    {"prompt": "   ", "count": 3},
                    {"prompt": "Demo", "count": 16},
                    {"prompt": "Demo", "count": 2, "personas": ["Cobb"]},
                ):
                    response = await client.post("/api/orchestrations", json=body)
                    self.assertEqual(response.status_code, 422)
            start.assert_not_awaited()

    async def test_library_returns_completed_post_links_from_ledgers(self):
        def ledger(name):
            if name == "Cobb":
                return {
                    "persona": name,
                    "reddit_username": "synthetic_cobb",
                    "assignments": [],
                    "activity": [
                        {
                            "task_id": "post-1",
                            "kind": "post",
                            "status": "completed",
                            "title": "Stored post",
                            "body": "Stored body",
                            "url": "https://mock.local/posts/post-1",
                            "reddit_username": "synthetic_cobb",
                            "timestamp": "2026-01-02T00:00:00+00:00",
                        },
                        {
                            "task_id": "comment-1",
                            "kind": "comment",
                            "status": "completed",
                            "url": "https://mock.local/comments/comment-1",
                        },
                    ],
                }
            return {
                "persona": name,
                "reddit_username": None,
                "assignments": [],
                "activity": [],
            }

        with patch.object(main.agent_state_store, "public_ledger", side_effect=ledger):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=main.app), base_url="http://test"
            ) as client:
                response = await client.get("/api/library")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["posts"], [{
            "id": "post-1",
            "persona": "Cobb",
            "url": "https://mock.local/posts/post-1",
            "title": "Stored post",
            "content": "Stored body",
            "reddit_username": "synthetic_cobb",
            "timestamp": "2026-01-02T00:00:00+00:00",
            "kind": "post",
        }])
