"""Shared CLI publisher: restore a dreamer, execute one command, release Steel."""

import asyncio
import json
import hashlib
from pathlib import Path
from contextlib import contextmanager

from playwright.async_api import async_playwright
from . import config, orchestrator, steel_client
from .agent import Dreamer
from .personas import names, pick
from .reddit_author import RedditAuthor


@contextmanager
def persona_lock(persona):
    locks = config.AGENT_STATES_DIR / "publisher_locks"
    locks.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(persona.encode()).hexdigest()
    lock = locks / f"{key}.lock"
    try:
        handle = lock.open("x")
    except FileExistsError as exc:
        raise RuntimeError(f"Persona publisher busy or interrupted; inspect {lock}") from exc
    try:
        with handle:
            yield
    finally:
        lock.unlink()


async def publish(args):
    with persona_lock(args.persona):
        return await _publish(args)

async def _publish(args):
    persona = next(p for p in pick(len(names())) if p.name == args.persona)
    dreamer = Dreamer(persona, "", "https://www.reddit.com/")
    dreamer.state.status = "running"
    dreamer._emit(0, "waking up a Steel session")
    orchestrator.register(dreamer)
    session = None
    try:
        session = await steel_client.create_session(persona=persona.name, interactive=True)
        dreamer.state.session = steel_client.session_summary(session)
        dreamer._emit(0, f"session {session.id[:8]} live")
        async with async_playwright() as pw:
            browser = await pw.chromium.connect_over_cdp(session.websocket_url)
            context = browser.contexts[0]
            page = context.pages[0] if context.pages else await context.new_page()
            async with asyncio.timeout(180):
                page = await dreamer._prepare_reddit_access(page)
                result = await publish_in_session(args, dreamer, page)
                dreamer.state.status = "done"
                dreamer._emit(note="campaign assignment complete", url=result.get("url"))
                return result
    except Exception as exc:
        dreamer.state.status = "failed"
        dreamer._emit(note=f"{type(exc).__name__}: {exc}"[:200])
        raise
    finally:
        if session is not None:
            await steel_client.release_session(session.id)
            if dreamer.state.session:
                dreamer.state.session["status"] = "released"
            dreamer._emit()
            print("Steel session release requested", flush=True)



async def publish_in_session(args, dreamer, page):
    """Execute one receipt-protected command in an authenticated browser."""
    author = RedditAuthor(dreamer, page, dry_run=args.dry_run)
    if args.action == "post":
        result = await author.create_post(args.title, args.body, request_id=args.request_id)
    elif args.action == "profile-post":
        result = await author.create_profile_post(args.title, args.body, request_id=args.request_id)
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
        await page.screenshot(path=str(output / f"{dreamer.persona.name.lower()}-{args.action}.png"))
    except Exception:
        pass  # Submission receipts remain authoritative if diagnostics fail.
    return result
