import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from backend import config, reddit_runner


class RunnerTests(unittest.IsolatedAsyncioTestCase):
    async def test_private_check_prevents_submission_and_releases_session(self):
        page = MagicMock()
        browser = SimpleNamespace(contexts=[SimpleNamespace(pages=[page])])
        pw = SimpleNamespace(chromium=SimpleNamespace(connect_over_cdp=AsyncMock(return_value=browser)))
        playwright = MagicMock()
        playwright.__aenter__ = AsyncMock(return_value=pw)
        playwright.__aexit__ = AsyncMock(return_value=False)
        dreamer = MagicMock()
        dreamer._prepare_reddit_access = AsyncMock()
        author = MagicMock()
        author._json = AsyncMock(return_value={"data": {"subreddit_type": "public"}})
        author.create_post = AsyncMock()
        session = SimpleNamespace(id="session", websocket_url="wss://example.test")
        args = SimpleNamespace(persona="Cobb", dry_run=False, action="post", title="Demo", body="Test", request_id="task")
        with (
            patch.object(reddit_runner.agent_state_store, "load_or_create", return_value={"steel": {"profile_id": "saved"}}),
            patch.object(reddit_runner, "Dreamer", return_value=dreamer),
            patch.object(reddit_runner, "async_playwright", return_value=playwright),
            patch.object(reddit_runner, "RedditAuthor", return_value=author),
            patch.object(reddit_runner.steel_client, "create_session", AsyncMock(return_value=session)),
            patch.object(reddit_runner.steel_client, "session_summary", return_value={}),
            patch.object(reddit_runner.steel_client, "release_session", AsyncMock()) as release,
        ):
            with self.assertRaisesRegex(RuntimeError, "requires a private"):
                await reddit_runner._publish(args, require_private=True)
        author.create_post.assert_not_awaited()
        release.assert_awaited_once_with("session")

    async def test_persona_lock_rejects_overlapping_publishers_and_cleans_up(self):
        args = SimpleNamespace(persona="Cobb")
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(config, "AGENT_STATES_DIR", Path(tmp)):
                async def nested(*args, **kwargs):
                    with self.assertRaisesRegex(RuntimeError, "busy or interrupted"):
                        await reddit_runner.publish(SimpleNamespace(persona="Cobb"))
                    raise RuntimeError("test failure")
                with patch.object(reddit_runner, "_publish", side_effect=nested):
                    with self.assertRaisesRegex(RuntimeError, "test failure"):
                        await reddit_runner.publish(args)
                self.assertEqual(list((Path(tmp) / "publisher_locks").glob("*.lock")), [])


if __name__ == "__main__":
    unittest.main()
