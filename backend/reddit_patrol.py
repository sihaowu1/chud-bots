"""Fixed, read-only browsing choreography; no model or random decisions."""

import asyncio
from dataclasses import dataclass
import re
from urllib.parse import urljoin, urlsplit

from .reddit_browser import RedditBrowser


@dataclass(frozen=True)
class BrowsePlan:
    subreddits: tuple[str, ...] = (
        "hackathon", "hackathons", "programming", "technology", "learnprogramming",
    )
    posts_per_subreddit: int = 2
    feed_scrolls: tuple[int, ...] = (480, 640, 480)
    comment_scrolls: tuple[int, ...] = (420, 540, 540)
    scroll_pause: int = 2
    body_pause: int = 6
    comments_pause: int = 4


def browsing_plan(persona_name: str) -> BrowsePlan:
    """Every persona follows the same immutable route, independent of run state."""
    if not isinstance(persona_name, str) or not persona_name.strip():
        raise ValueError("persona name must not be empty")
    return BrowsePlan()


def post_urls(hrefs: list[str], subreddit: str) -> list[str]:
    """Canonicalize and deduplicate same-community posts in document order."""
    result = []
    for href in hrefs:
        url = urlsplit(urljoin("https://www.reddit.com/", href))
        match = re.fullmatch(
            r"/r/([^/]+)/comments/([a-z0-9]+)(?:/[^/]+)?/?", url.path, re.I,
        )
        if (url.scheme != "https" or url.hostname != "www.reddit.com"
                or not match or match[1].casefold() != subreddit.casefold()):
            continue
        canonical = f"https://www.reddit.com/r/{subreddit}/comments/{match[2]}/"
        if canonical not in result:
            result.append(canonical)
    return result


async def browse_reddit(dreamer, page) -> None:
    """Execute a bounded route in any Dreamer's session and emit live progress."""
    plan = browsing_plan(dreamer.persona.name)
    browser = RedditBrowser(dreamer, page)

    async def pause(seconds):
        for _ in range(seconds):
            dreamer._check_stop()
            await asyncio.sleep(1)
        dreamer._check_stop()

    async def scroll(distances):
        for distance in distances:
            dreamer._check_stop()
            await page.mouse.wheel(0, distance)
            await pause(plan.scroll_pause)

    for subreddit in plan.subreddits:
        listing = f"https://www.reddit.com/r/{subreddit}/new/"
        await browser._open(listing, f"browsing r/{subreddit}")
        await pause(plan.scroll_pause)
        dreamer._emit(2, f"scrolling posts in r/{subreddit}", page.url)
        await scroll(plan.feed_scrolls)
        hrefs = await page.locator('a[href*="/comments/"]').evaluate_all(
            "links => links.map(link => link.href)"
        )
        posts = post_urls(hrefs, subreddit)[:plan.posts_per_subreddit]
        if not posts:
            dreamer._emit(2, f"no readable post links in r/{subreddit}; continuing", page.url)
        for index, url in enumerate(posts, 1):
            await browser._open(url, f"opening post {index} in r/{subreddit}")
            dreamer._emit(3, f"reading post body in r/{subreddit}", page.url)
            await pause(plan.body_pause)
            comments = page.locator("shreddit-comment, .commentarea .comment").first
            if await comments.count():
                await comments.scroll_into_view_if_needed(timeout=8000)
                dreamer._emit(4, f"reading comments in r/{subreddit}", page.url)
                await scroll(plan.comment_scrolls)
                await pause(plan.comments_pause)
            else:
                dreamer._emit(4, "no comments visible; returning to posts", page.url)
            await browser._open(listing, f"leaving post; back to r/{subreddit}")
            await pause(plan.scroll_pause)
    dreamer._emit(2, "read-only subreddit browsing complete", page.url)
