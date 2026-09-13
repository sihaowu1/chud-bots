"""Shared CLI publisher: restore a dreamer, execute one command, release Steel."""

import asyncio
import json
import hashlib
from pathlib import Path

from playwright.async_api import async_playwright
from . import agent_state_store, steel_client, config
from .agent import Dreamer
from .personas import names, pick
from .reddit_author import RedditAuthor


async def publish(args):
    locks = config.AGENT_STATES_DIR / "publisher_locks"
    locks.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(args.persona.encode()).hexdigest()
    lock = locks / f"{key}.lock"
    try:
        handle = lock.open("x")
    except FileExistsError as exc:
        raise RuntimeError(f"Persona publisher busy or interrupted; inspect {lock}") from exc
    try:
        with handle:
            return await _publish(args)
    finally:
        lock.unlink()


async def _publish(args):
    persona = next(p for p in pick(len(names())) if p.name == args.persona)
    saved = agent_state_store.load_or_create(persona.name)
    if not (saved.get("steel") or {}).get("profile_id") and not (
        saved["email"].get("address") and saved["email"].get("password")
    ):
        raise RuntimeError("Persona needs a saved Reddit login or Steel profile")
    dreamer = Dreamer(persona, "", "https://www.reddit.com/")
    session = await steel_client.create_session(persona=persona.name)
    dreamer.state.session = steel_client.session_summary(session)
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.connect_over_cdp(session.websocket_url)
            context = browser.contexts[0]
            page = context.pages[0] if context.pages else await context.new_page()
            async with asyncio.timeout(180):
                await dreamer._prepare_reddit_access(page)
                author = RedditAuthor(dreamer, page, dry_run=args.dry_run)
                if args.action == "post":
                    result = await author.create_post(args.title, args.body, request_id=args.request_id)
                elif args.action == "comment":
                    result = await author.comment(args.post_url, args.body, request_id=args.request_id)
                elif args.action == "reconcile-post":
                    result = await author.reconcile_post(args.request_id, args.post_id)
                else:
                    result = await author.reconcile_comment(args.request_id, args.comment_id)
                print(json.dumps(result, indent=2), flush=True)
                output = Path(__file__).resolve().parents[1] / "scripts" / "reddit-check"
                output.mkdir(exist_ok=True)
                try:
                    if result.get("status") != "draft":
                        await page.goto(result["url"], wait_until="domcontentloaded")
                    await page.screenshot(path=str(output / f"{persona.name.lower()}-{args.action}.png"))
                except Exception:
                    pass  # Submission receipts remain authoritative if diagnostics fail.
                return result
    finally:
        await steel_client.release_session(session.id)
        print("Steel session release requested", flush=True)

