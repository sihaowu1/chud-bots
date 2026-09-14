"""Check Yusuf's read-only Reddit browsing in one Steel session."""

import argparse
import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from playwright.async_api import async_playwright

from backend import agent_state_store, steel_client
from backend.agent import Dreamer
from backend.personas import pick
from backend.reddit_browser import RedditBrowser


async def check(query: str) -> None:
    saved = agent_state_store.load_or_create("Yusuf")
    email = saved.get("email") or {}
    if not email.get("address") or not email.get("password"):
        raise RuntimeError("Yusuf needs saved credentials before running this check")
    dreamer = Dreamer(pick(1)[0], "", "https://www.reddit.com/")
    session = await steel_client.create_session(persona="Yusuf")
    dreamer.state.session = steel_client.session_summary(session)
    output = Path(__file__).resolve().parent / "reddit-check"
    try:
        output.mkdir(exist_ok=True)
        async with async_playwright() as pw:
            browser = await pw.chromium.connect_over_cdp(session.websocket_url)
            context = browser.contexts[0]
            page = context.pages[0] if context.pages else await context.new_page()
            try:
                async with asyncio.timeout(150):
                    page = await dreamer._prepare_reddit_access(page)
                    if not dreamer._reddit_authenticated:
                        raise RuntimeError("Yusuf's Reddit login was not confirmed")
                    navigation = RedditBrowser(dreamer, page)
                    await navigation.home()
                    await navigation.scroll()
                    await page.screenshot(path=str(output / "home.png"))
                    print("Home navigation and scrolling completed", flush=True)
                    await navigation.search_subreddits(query)
                    await navigation.scroll(2)
                    await page.screenshot(path=str(output / "subreddits.png"))
                    print("Subreddit search navigation completed", flush=True)
            except Exception:
                await page.screenshot(
                    path=str(output / "failure.png"),
                    mask=[page.locator("input, faceplate-text-input")],
                    timeout=5_000,
                )
                raise
    finally:
        await steel_client.release_session(session.id)
        print("Steel session release requested", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", default="python")
    args = parser.parse_args()
    if not args.query.strip() or len(args.query.strip()) > 200:
        parser.error("--query must contain 1 to 200 characters")
    asyncio.run(check(args.query))
