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

    async def test_dashboard_count_prefers_less_used_personas(self):
        plan = {"id": "dashboard-run", "phases": []}

        def ledger(name):
            used = {"Yusuf": 4, "Cobb": 3, "Arthur": 2}.get(name, 0)
            return {
                "persona": name,
                "reddit_username": None,
                "assignments": [{}] * used,
                "activity": [],
            }

        with patch.object(main.campaign_orchestrator, "start", new_callable=AsyncMock) as start, \
                patch.object(main.agent_state_store, "public_ledger", side_effect=ledger):
            start.return_value = plan
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=main.app), base_url="http://test"
            ) as client:
                response = await client.post("/api/orchestrations", json={
                    "prompt": "promote better public transit", "count": 3, "environment": "mock",
                })

            self.assertEqual(response.status_code, 200)
            start.assert_awaited_once_with(
                "promote better public transit",
                selected_personas=["Ariadne", "Eames", "Saito"],
                environment="mock",
            )

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
