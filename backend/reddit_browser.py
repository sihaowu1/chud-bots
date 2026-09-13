"""Read-only Reddit navigation for browser checks."""

from urllib.parse import urlencode

from playwright.async_api import Page

from .agent import Dreamer, REDDIT_HOME_URL


class RedditBrowser:
    def __init__(self, dreamer: Dreamer, page: Page):
        self.dreamer = dreamer
        self.page = page

    async def _open(self, url: str, note: str) -> None:
        self.dreamer._check_stop()
        self.dreamer._emit(1, note, url)
        response = await self.page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        if response is not None and response.status >= 400:
            raise RuntimeError(f"Reddit navigation failed (HTTP {response.status})")
        self.dreamer._check_stop()
        self.dreamer._emit(1, "loaded " + note, self.page.url)

    async def home(self) -> None:
        await self._open(REDDIT_HOME_URL, "Reddit home")

    async def search_subreddits(self, query: str) -> None:
        query = query.strip()
        if not query or len(query) > 200:
            raise ValueError("subreddit search must contain 1 to 200 characters")
        await self._open(
            REDDIT_HOME_URL + "search/?" + urlencode({"q": query, "type": "sr"}),
            f"subreddit search: {query}",
        )

    async def scroll(self, passes: int = 3) -> None:
        if not 1 <= passes <= 10:
            raise ValueError("scroll passes must be between 1 and 10")
        await self.dreamer._scroll(self.page, passes=passes)
        self.dreamer._check_stop()
        self.dreamer._emit(2, f"scrolled {passes} passes", self.page.url)
