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
    async def test_topic_launch_makes_yusuf_the_automatic_profile_poster(self):
        request = LaunchRequest(
            target="https://www.reddit.com", prompt="Acme GPU marketplace", count=2,
            mode="reddit_browse",
        )
        post = {"Yusuf": {"title": "Compute", "body": "Body", "request_id": "one",
                           "warmup_subreddit": "technology"}}
        with (
            patch("backend.main.orchestrator.live_count", return_value=0),
            patch(
                "backend.main.orchestrator.resolve_personas",
                return_value=[
                    SimpleNamespace(name="Yusuf", browsing_mode="reddit_browse"),
                    SimpleNamespace(name="Cobb", browsing_mode="reddit_browse"),
                ],
            ),
            patch(
                "backend.main.profile_post_orchestrator.plan",
                new=AsyncMock(return_value=post),
            ) as planner,
            patch(
                "backend.main.select_subreddits",
                new=AsyncMock(return_value=("startups", "technology", "computing")),
            ) as route_planner,
            patch("backend.main.orchestrator.launch", return_value=[{"id": "a"}]) as start,
        ):
            await launch(request)

        planner_prompt = planner.await_args.args[0]
        self.assertIn("Acme GPU marketplace", planner_prompt)
        self.assertIn("compute shortage", planner_prompt)
        planner.assert_awaited_once_with(planner_prompt, ["Yusuf"])
        route_planner.assert_awaited_once_with("Acme GPU marketplace", browser_count=1)
        self.assertEqual(post["Yusuf"]["warmup_seconds"], 2.0)
        self.assertEqual(start.call_args.kwargs["profile_posts"], post)

    async def test_plans_once_then_launches_every_agent_with_its_post(self):
        request = LaunchRequest(
            target="https://www.reddit.com",
            queries=["launch topic"],
            count=2,
            mode="profile_post",
        )
        posts = {
            "Cobb": {"title": "One", "body": "Body", "request_id": "one",
                     "warmup_subreddit": "technology"},
            "Arthur": {"title": "Two", "body": "Body", "request_id": "two",
                       "warmup_subreddit": "programming"},
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
            patch(
                "backend.main.select_subreddits",
                new=AsyncMock(return_value=("python", "learnpython", "coding")),
            ) as route_planner,
            patch("backend.main.orchestrator.launch", return_value=[{"id": "a"}, {"id": "b"}]) as start,
        ):
            result = await launch(request)

        route_planner.assert_awaited_once_with("launch topic", browser_count=2)
        planner.assert_awaited_once_with(
            "launch topic", ["Cobb", "Arthur"],
            excluded_subreddits=("python", "learnpython", "coding"),
        )
        start.assert_called_once_with(
            "https://www.reddit.com", ["launch topic"], 2,
            mode="profile_post", selected_personas=None,
            subreddits=None, profile_posts=posts,
            search_prompts=None,
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
