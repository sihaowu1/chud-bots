import unittest
from unittest.mock import AsyncMock, Mock
from urllib.parse import parse_qs, urlsplit

from backend.reddit_browser import RedditBrowser


class RedditBrowserTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.dreamer = Mock()
        self.dreamer._scroll = AsyncMock()
        self.page = Mock(url="https://www.reddit.com/")
        self.page.goto = AsyncMock(return_value=Mock(status=200))
        self.navigation = RedditBrowser(self.dreamer, self.page)

    async def test_search_encodes_query_as_communities_search(self):
        await self.navigation.search_subreddits(" python & science ")
        url = urlsplit(self.page.goto.call_args.args[0])
        self.assertEqual(url.hostname, "www.reddit.com")
        self.assertEqual(parse_qs(url.query), {"q": ["python & science"], "type": ["sr"]})

    async def test_http_failure_is_not_reported_as_loaded(self):
        self.page.goto.return_value.status = 403
        with self.assertRaisesRegex(RuntimeError, "HTTP 403"):
            await self.navigation.home()
        self.assertEqual(self.dreamer._emit.call_count, 1)

    async def test_stop_prevents_navigation(self):
        self.dreamer._check_stop.side_effect = RuntimeError("stopped")
        with self.assertRaisesRegex(RuntimeError, "stopped"):
            await self.navigation.home()
        self.page.goto.assert_not_awaited()

    async def test_invalid_inputs_do_not_touch_browser(self):
        for query in (" ", "x" * 201):
            with self.assertRaises(ValueError):
                await self.navigation.search_subreddits(query)
        for passes in (0, 11):
            with self.assertRaises(ValueError):
                await self.navigation.scroll(passes)
        self.page.goto.assert_not_awaited()
        self.dreamer._scroll.assert_not_awaited()

    async def test_scroll_reuses_dreamer_behavior(self):
        await self.navigation.scroll(2)
        self.dreamer._scroll.assert_awaited_once_with(self.page, passes=2)
