"""Publish Reddit content; use `orchestrate --help` for campaign commands."""

import argparse
import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.personas import names
from backend.reddit_runner import publish


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "orchestrate":
        from backend.campaign_executor import cli
        asyncio.run(cli(sys.argv[2:]))
        sys.exit(0)
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
