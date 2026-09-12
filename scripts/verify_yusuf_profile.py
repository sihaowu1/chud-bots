"""Verify Yusuf's saved Steel profile without submitting login credentials."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from playwright.async_api import async_playwright
from backend import agent_state_store, steel_client
from backend.agent import Dreamer, REDDIT_HOME_URL
from backend.personas import pick


async def main():
    sys.stdout.reconfigure(encoding="utf-8")
    saved = agent_state_store.load_or_create("Yusuf")
    profile_id = (saved.get("steel") or {}).get("profile_id")
    if not profile_id:
        raise RuntimeError("Yusuf has no saved Steel profile")
    print("Restoring profile:", profile_id, flush=True)
    session = await steel_client.create_session(persona="Yusuf", interactive=True)
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.connect_over_cdp(session.websocket_url)
            page = browser.contexts[0].pages[0]
            dreamer = Dreamer(pick(1)[0], "", REDDIT_HOME_URL)
            await page.goto(REDDIT_HOME_URL, wait_until="domcontentloaded")
            username = await dreamer._reddit_username(page)
            print("Authenticated identity restored:", bool(username), flush=True)
            print("Home URL:", page.url.split("?")[0], flush=True)
            await page.screenshot(path="scripts/yusuf-profile.png")
            if not username:
                print("PAGE:", (await page.locator("body").inner_text())[:2000], flush=True)
                raise RuntimeError("Saved profile did not confirm Reddit authentication; no credentials submitted")
            dreamer._reddit_authenticated = True
            await dreamer._dream(page)
            print("Completed 5-minute logged-in hold without submitting credentials", flush=True)
    finally:
        await steel_client.release_session(session.id)
    await steel_client.wait_for_profile_ready(profile_id)
    print("Profile saved and READY for the next run", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
