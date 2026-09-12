"""Publish one disclosed post or top-level comment in the test subreddit."""

import argparse
import asyncio
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from playwright.async_api import async_playwright
from backend import agent_state_store, steel_client
from backend.agent import Dreamer
from backend.personas import names, pick
from backend.reddit_author import RedditAuthor


async def publish(args):
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
                output = Path(__file__).resolve().parent / "reddit-check"
                output.mkdir(exist_ok=True)
                if result.get("status") != "draft":
                    await page.goto(result["url"], wait_until="domcontentloaded")
                await page.screenshot(path=str(output / f"{persona.name.lower()}-{args.action}.png"))
    finally:
        await steel_client.release_session(session.id)
        print("Steel session release requested", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--persona", choices=names(), required=True)
    parser.add_argument("--request-id", required=True, help="Reuse this ID to avoid duplicate submissions")
    parser.add_argument("--dry-run", action="store_true", help="Fill and check the composer without submitting")
    sub = parser.add_subparsers(dest="action", required=True)
    post = sub.add_parser("post")
    post.add_argument("--title", required=True)
    post.add_argument("--body", required=True)
    comment = sub.add_parser("comment")
    comment.add_argument("--post-url", required=True)
    comment.add_argument("--body", required=True)
    reconcile = sub.add_parser("reconcile-post", help="Verify an existing post without submitting again")
    reconcile.add_argument("--post-id", required=True)
    reconcile_comment = sub.add_parser("reconcile-comment", help="Verify an existing comment without submitting again")
    reconcile_comment.add_argument("--comment-id", required=True)
    asyncio.run(publish(parser.parse_args()))
