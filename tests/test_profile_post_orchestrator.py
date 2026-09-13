import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from backend import personas
from backend.agent import Dreamer
from backend.orchestrator_agent import OrchestratorModelError
from backend.profile_post_orchestrator import ProfilePostOrchestrator


class FakePlanner:
    def __init__(self, assignments=None):
        self.calls = []
        self.assignments = assignments

    async def plan(self, query, agents):
        self.calls.append((query, agents))
        warmups = ["technology", "programming", "computerscience"]
        assignments = self.assignments or [
            {
                "persona": agent["persona"],
                "title": f"{agent['persona']} on the topic",
                "body": f"A distinct take from {agent['persona']}.",
                "warmup_subreddit": warmups[index],
            }
            for index, agent in enumerate(agents)
        ]
        return {"assignments": assignments}


class ProfilePostOrchestratorTests(unittest.IsolatedAsyncioTestCase):
    async def test_one_query_creates_one_post_for_every_selected_persona(self):
        planner = FakePlanner()
        result = await ProfilePostOrchestrator(planner).plan(
            "  Inception won Battle of the Schools  ", ["Cobb", "Arthur"],
        )

        self.assertEqual(set(result), {"Cobb", "Arthur"})
        self.assertEqual(planner.calls[0][0], "Inception won Battle of the Schools")
        self.assertEqual(
            [agent["persona"] for agent in planner.calls[0][1]], ["Cobb", "Arthur"],
        )
        self.assertNotEqual(result["Cobb"]["request_id"], result["Arthur"]["request_id"])
        self.assertTrue(result["Cobb"]["request_id"].startswith("profile-"))
        self.assertEqual(result["Cobb"]["warmup_subreddit"], "technology")

    async def test_warmups_are_unique_and_exclude_shared_route(self):
        assignments = [
            {"persona": "Cobb", "title": "One", "body": "Body",
             "warmup_subreddit": "Python"},
            {"persona": "Arthur", "title": "Two", "body": "Body",
             "warmup_subreddit": "python"},
        ]
        with self.assertRaises(OrchestratorModelError):
            await ProfilePostOrchestrator(FakePlanner(assignments)).plan(
                "topic", ["Cobb", "Arthur"], excluded_subreddits=("learnpython",),
            )
        assignments[1]["warmup_subreddit"] = "learnpython"
        with self.assertRaises(OrchestratorModelError):
            await ProfilePostOrchestrator(FakePlanner(assignments)).plan(
                "topic", ["Cobb", "Arthur"], excluded_subreddits=("learnpython",),
            )

    async def test_missing_duplicate_or_unknown_personas_are_rejected(self):
        cases = [
            [{"persona": "Cobb", "title": "One", "body": "Body", "warmup_subreddit": "tech"}],
            [
                {"persona": "Cobb", "title": "One", "body": "Body", "warmup_subreddit": "tech"},
                {"persona": "Cobb", "title": "Two", "body": "Body", "warmup_subreddit": "coding"},
            ],
            [
                {"persona": "Cobb", "title": "One", "body": "Body", "warmup_subreddit": "tech"},
                {"persona": "Nobody", "title": "Two", "body": "Body", "warmup_subreddit": "coding"},
            ],
        ]
        for assignments in cases:
            with self.subTest(assignments=assignments):
                with self.assertRaises(OrchestratorModelError):
                    await ProfilePostOrchestrator(FakePlanner(assignments)).plan(
                        "topic", ["Cobb", "Arthur"],
                    )

    async def test_query_validation_happens_before_model_call(self):
        planner = FakePlanner()
        for query in (" ", "x" * 501):
            with self.assertRaisesRegex(ValueError, "query"):
                await ProfilePostOrchestrator(planner).plan(query, ["Cobb"])
        self.assertEqual(planner.calls, [])

    async def test_profile_poster_browses_assigned_subreddit_before_posting(self):
        dreamer = Dreamer(
            personas.pick(1)[0], "topic", "", mode="profile_post",
            profile_post={"title": "Title", "body": "Body", "request_id": "post-1",
                          "warmup_subreddit": "technology"},
        )
        page = SimpleNamespace(
            url="https://www.reddit.com/r/technology/new/",
            mouse=SimpleNamespace(wheel=AsyncMock()),
        )
        order = []
        async def opened(*_args):
            order.append("browse")
        async def posted(*_args, **_kwargs):
            order.append("post")
            return {"url": "https://www.reddit.com/user/test/comments/abc/post/"}
        with patch("backend.reddit_browser.RedditBrowser._open", side_effect=opened), patch(
            "backend.reddit_author.RedditAuthor.create_profile_post", side_effect=posted,
        ), patch("backend.agent.random.uniform", return_value=3.5), patch(
            "backend.agent.asyncio.sleep", new=AsyncMock(),
        ) as sleep:
            await dreamer._dream(page)
        self.assertEqual(order, ["browse", "post"])
        sleep.assert_awaited_once_with(3.5)
        page.mouse.wheel.assert_awaited_once()

    async def test_fixed_warmup_duration_is_honored(self):
        dreamer = Dreamer(
            personas.pick(1)[0], "topic", "", mode="reddit_browse",
            profile_post={"title": "Title", "body": "Body", "request_id": "post-1",
                          "warmup_subreddit": "technology", "warmup_seconds": 2.0},
        )
        page = SimpleNamespace(
            url="https://www.reddit.com/r/technology/new/",
            mouse=SimpleNamespace(wheel=AsyncMock()),
        )
        with patch(
            "backend.reddit_browser.RedditBrowser._open", new=AsyncMock(),
        ), patch(
            "backend.reddit_author.RedditAuthor.create_profile_post",
            new=AsyncMock(return_value={"url": "https://www.reddit.com/user/test/"}),
        ), patch("backend.agent.asyncio.sleep", new=AsyncMock()) as sleep:
            await dreamer._dream(page)
        self.assertEqual(dreamer.mode, "profile_post")
        sleep.assert_awaited_once_with(2.0)


if __name__ == "__main__":
    unittest.main()
