import unittest
from unittest.mock import AsyncMock, Mock, patch

from backend.agent import Dreamer, _Stopped
from backend.personas import pick
from backend.reddit_patrol import BrowsePlan, browse_reddit, browsing_plan, post_urls


class PatrolTests(unittest.IsolatedAsyncioTestCase):
    def test_plan_is_identical_for_every_persona_and_run(self):
        for persona in pick(7):
            self.assertEqual(browsing_plan(persona.name), BrowsePlan())
            self.assertEqual(browsing_plan(persona.name), browsing_plan(persona.name))

    def test_only_unique_same_community_post_links_in_document_order(self):
        self.assertEqual(post_urls([
            "/r/hackathon/comments/abc/title/?foo=1",
            "/r/hackathon/comments/abc/",
            "https://evil.example/r/hackathon/comments/def/title/",
            "/r/other/comments/def/title/",
            "/r/hackathon/comments/abc/title/commentid/",
            "/r/hackathon/comments/ghi/title/",
        ], "hackathon"), [
            "https://www.reddit.com/r/hackathon/comments/abc/",
            "https://www.reddit.com/r/hackathon/comments/ghi/",
        ])

    async def test_route_reads_comments_and_returns_without_clicking_controls(self):
        dreamer = Dreamer(pick(1)[0], "", "", mode="reddit_browse")
        page = Mock(url="https://www.reddit.com/")
        page.goto = AsyncMock(return_value=Mock(status=200))
        page.mouse.wheel = AsyncMock()
        links = Mock()
        links.evaluate_all = AsyncMock(return_value=[
            "/r/hackathon/comments/abc/title/", "/r/hackathon/comments/def/title/",
        ])
        comments = Mock()
        comments.first.count = AsyncMock(return_value=1)
        comments.first.scroll_into_view_if_needed = AsyncMock()
        page.locator.side_effect = lambda selector: links if selector.startswith("a[") else comments
        with patch(
            "backend.reddit_patrol.browsing_plan",
            return_value=BrowsePlan(subreddits=("hackathon",)),
        ), patch("asyncio.sleep", new_callable=AsyncMock):
            await browse_reddit(dreamer, page)
            first_route = page.goto.call_args_list.copy()
            first_scrolls = page.mouse.wheel.call_args_list.copy()
            page.goto.reset_mock()
            page.mouse.wheel.reset_mock()
            await dreamer._dream(page)
        self.assertEqual(page.goto.call_args_list, first_route)
        self.assertEqual(page.mouse.wheel.call_args_list, first_scrolls)
        listing = "https://www.reddit.com/r/hackathon/new/"
        self.assertEqual([call.args[0] for call in first_route], [
            listing, "https://www.reddit.com/r/hackathon/comments/abc/", listing,
            "https://www.reddit.com/r/hackathon/comments/def/", listing,
        ])
        self.assertEqual(comments.first.scroll_into_view_if_needed.await_count, 4)
        page.get_by_role.assert_not_called()
        page.click.assert_not_called()

    async def test_stop_prevents_navigation(self):
        dreamer = Dreamer(pick(1)[0], "", "", mode="reddit_browse")
        dreamer.stop()
        page = Mock(goto=AsyncMock())
        with self.assertRaises(_Stopped):
            await browse_reddit(dreamer, page)
        page.goto.assert_not_awaited()

    def test_browse_api_mode(self):
        from backend.main import LaunchRequest

        request = LaunchRequest(
            target="https://www.reddit.com", mode="reddit_browse", personas=["Cobb"],
        )
        self.assertEqual(request.mode, "reddit_browse")


if __name__ == "__main__":
    unittest.main()
