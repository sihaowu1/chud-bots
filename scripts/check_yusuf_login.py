"""Run one Yusuf login and report page structure without credential values."""
import asyncio
import argparse
import sys
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from playwright.async_api import async_playwright
from backend import agent as agent_module, agent_state_store, config, steel_client
from backend.agent import Dreamer
from backend.personas import names, pick


async def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-proxy", action="store_true")
    parser.add_argument("--plain-browser", action="store_true")
    parser.add_argument("--inspect-legacy", action="store_true")
    parser.add_argument("--local-browser", action="store_true")
    parser.add_argument("--manual-comparison", action="store_true")
    args = parser.parse_args()
    if args.no_proxy:
        config.STEEL_USE_PROXY = False
    if args.plain_browser or args.manual_comparison:
        original_create = steel_client.client().sessions.create

        async def create_plain(**kwargs):
            if args.plain_browser:
                kwargs["stealth_config"]["humanize_interactions"] = False
                kwargs["stealth_config"]["auto_captcha_solving"] = False
                kwargs["solve_captcha"] = False
            if args.manual_comparison:
                kwargs["debug_config"]["interactive"] = True
            return await original_create(**kwargs)

        steel_client.client().sessions.create = create_plain
    persona = next(p for p in pick(len(names())) if p.name == "Yusuf")
    dreamer = Dreamer(persona, "", "https://www.reddit.com")
    original_emit = dreamer._emit

    def emit(level=None, note="", url=None):
        original_emit(level, note, url)
        if note and "email" not in note:
            print(note, flush=True)

    dreamer._emit = emit
    print("STEEL PROXY:", config.STEEL_USE_PROXY, flush=True)
    session = None if args.local_browser else await steel_client.create_session(persona="Yusuf")
    if session:
        dreamer.state.session = steel_client.session_summary(session)
    try:
        async with async_playwright() as pw:
            if session:
                browser = await pw.chromium.connect_over_cdp(session.websocket_url)
                page = browser.contexts[0].pages[0]
            else:
                browser = await pw.chromium.launch(channel="chrome", headless=True)
                context = await browser.new_context()
                page = await context.new_page()
            if args.inspect_legacy:
                await page.goto("https://old.reddit.com/login", wait_until="domcontentloaded")
                await asyncio.sleep(5)
                print("LEGACY PATH:", urlsplit(page.url).path, flush=True)
                print("LEGACY PAGE:", (await page.locator("body").inner_text())[:2500], flush=True)
                await page.screenshot(path="scripts/yusuf-login.png")
                return
            saved = agent_state_store.load_or_create("Yusuf")
            secrets = [saved["email"]["address"], saved["email"]["password"]]

            async def inspect_response(response):
                if urlsplit(response.url).path == "/svc/shreddit/account/login":
                    print("LOGIN HTTP:", response.status, flush=True)
                    try:
                        payload = response.request.post_data_json
                        print("SUBMITTED FIELDS:", {
                            key: (value == secrets[1] if "password" in key.lower()
                                  else value == secrets[0] if key in ("username", "email")
                                  else "present") for key, value in payload.items()
                        }, flush=True)
                    except Exception:
                        print("Submission format unavailable", flush=True)
                    if response.status >= 400:
                        try:
                            body = await response.text()
                        except Exception:
                            print("LOGIN ERROR: response body unavailable after navigation", flush=True)
                            return
                        for secret in secrets:
                            body = body.replace(secret, "[redacted]")
                        print("LOGIN ERROR:", body[:1200], flush=True)

            page.on("response", inspect_response)
            try:
                if args.manual_comparison:
                    await page.goto(agent_module.REDDIT_LOGIN_URL, wait_until="domcontentloaded")
                    await dreamer._solve_reddit_captcha(page)
                    await page.locator('input[name="username"]').fill(secrets[0])
                    await page.locator('input[type="password"]').fill(secrets[1])
                    print("MANUAL VIEWER:", session.debug_url, flush=True)
                    agent_module.REDDIT_LOGIN_TIMEOUT_SECONDS = 300
                    await dreamer._wait_for_reddit_home(page)
                else:
                    page = await dreamer._prepare_reddit_access(page)
                if not dreamer._reddit_authenticated:
                    raise RuntimeError("Live check did not confirm a signed-in Reddit identity")
                print("LOGIN SUCCESS: confirmed signed-in Reddit identity", flush=True)
            finally:
                await page.screenshot(
                    path="scripts/yusuf-login.png",
                    mask=[page.locator('faceplate-text-input, input')],
                )
                print("PATH:", urlsplit(page.url).path, flush=True)
    finally:
        if session:
            await steel_client.release_session(session.id)


if __name__ == "__main__":
    asyncio.run(main())
