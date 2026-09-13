import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from backend.main import LaunchRequest, launch


class LaunchRequestTests(unittest.TestCase):
    def test_all_fifteen_personas_can_be_launched(self):
        request = LaunchRequest(target="https://www.reddit.com", count=15)

        self.assertEqual(request.count, 15)

    def test_more_than_fifteen_personas_are_rejected(self):
        with self.assertRaises(ValidationError):
            LaunchRequest(target="https://www.reddit.com", count=16)

    def test_profile_post_mode_allows_a_multi_agent_batch(self):
        request = LaunchRequest(
            target="https://www.reddit.com",
            queries=["profile topic"],
            count=3,
            mode="profile_post",
        )

        self.assertEqual(request.count, 3)
        self.assertEqual(request.mode, "profile_post")

    def test_unknown_mode_is_rejected(self):
        with self.assertRaises(ValidationError):
            LaunchRequest(target="https://www.reddit.com", mode="unknown")

    def test_queries_can_be_empty(self):
        request = LaunchRequest(target="https://www.reddit.com", queries=[], count=1)

        self.assertEqual(request.queries, [])

    def test_queries_default_to_empty(self):
        request = LaunchRequest(target="https://www.reddit.com", count=1)

        self.assertEqual(request.queries, [])


class ProfilePostLaunchTests(unittest.IsolatedAsyncioTestCase):
    async def test_plans_once_then_launches_every_agent_with_its_post(self):
        request = LaunchRequest(
            target="https://www.reddit.com",
            queries=["launch topic"],
            count=2,
            mode="profile_post",
        )
        posts = {
            "Cobb": {"title": "One", "body": "Body", "request_id": "one"},
            "Arthur": {"title": "Two", "body": "Body", "request_id": "two"},
        }
        with (
            patch("backend.main.orchestrator.live_count", return_value=0),
            patch(
                "backend.main.orchestrator.resolve_personas",
                return_value=[
                    SimpleNamespace(name="Cobb", browsing_mode="reddit_browse"),
                    SimpleNamespace(name="Arthur", browsing_mode="reddit_browse"),
                ],
            ),
            patch(
                "backend.main.profile_post_orchestrator.plan",
                new=AsyncMock(return_value=posts),
            ) as planner,
            patch("backend.main.orchestrator.launch", return_value=[{"id": "a"}, {"id": "b"}]) as start,
        ):
            result = await launch(request)

        planner.assert_awaited_once_with("launch topic", ["Cobb", "Arthur"])
        start.assert_called_once_with(
            "https://www.reddit.com", ["launch topic"], 2,
            mode="profile_post", selected_personas=None,
            subreddits=None, profile_posts=posts,
        )
        self.assertEqual(len(result["agents"]), 2)

    async def test_invalid_profile_query_never_calls_planner(self):
        planner = AsyncMock()
        with patch("backend.main.profile_post_orchestrator.plan", new=planner):
            with self.assertRaises(HTTPException) as raised:
                await launch(LaunchRequest(
                    target="https://www.reddit.com", queries=[], mode="profile_post",
                ))
        self.assertEqual(raised.exception.status_code, 422)
        planner.assert_not_awaited()

if __name__ == "__main__":
    unittest.main()
