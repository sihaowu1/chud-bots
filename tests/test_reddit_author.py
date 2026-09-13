import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, Mock, patch

from backend.reddit_author import (
    RedditAuthor,
    profile_post_url,
    thread_url,
    validated_body,
)


class RedditAuthorTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = patch("backend.reddit_author.config.AGENT_STATES_DIR", Path(self.directory.name))
        self.config.start()
        self.addCleanup(self.config.stop)
        self.dreamer = Mock()
        self.dreamer.persona.name = "Cobb"
        self.page = Mock(url="https://www.reddit.com/")
        self.author = RedditAuthor(self.dreamer, self.page)

    def test_external_or_wrong_community_urls_rejected(self):
        for url in ("http://www.reddit.com/r/HackathonsCanada/comments/abc/title/",
                    "https://www.reddit.com.evil/r/HackathonsCanada/comments/abc/title/",
                    "https://www.reddit.com/r/other/comments/abc/title/",
                    "https://www.reddit.com/r/HackathonsCanada/comments/abc/title/def/"):
            with self.assertRaises(ValueError):
                thread_url(url)

    def test_body_validation_and_limits(self):
        self.assertEqual(validated_body(" test ", 1000), "test")
        for body, limit in ((" ", 1000), ("x" * 101, 100)):
            with self.assertRaises(ValueError):
                validated_body(body, limit)

    def test_profile_post_url_only_accepts_the_expected_profile(self):
        self.assertEqual(
            profile_post_url(
                "https://www.reddit.com/user/test-user/comments/abc/title/", "test-user"
            ),
            "https://www.reddit.com/user/test-user/comments/abc/title/",
        )
        for url in (
            "https://evil.example/user/test-user/comments/abc/title/",
            "https://www.reddit.com/user/other/comments/abc/title/",
            "https://www.reddit.com/r/other/comments/abc/title/",
        ):
            with self.assertRaises(ValueError):
                profile_post_url(url, "test-user")

    async def test_invalid_title_never_touches_browser(self):
        for title in ("", "x" * 301, "two\nlines"):
            with self.assertRaises(ValueError):
                await self.author.create_post(title, "body", request_id="one")
        self.assertEqual(self.page.mock_calls, [])

    async def test_unknown_result_blocks_retry(self):
        payload = {"action": "create_post", "title": "test"}
        path, _ = self.author._receipt("one", payload)
        button = Mock(click=AsyncMock())
        verify = AsyncMock(side_effect=TimeoutError("lost confirmation"))
        with self.assertRaises(TimeoutError):
            await self.author._submit(path, payload, "test-user", button, verify)
        with self.assertRaisesRegex(RuntimeError, "uncertain"):
            self.author._receipt("one", payload)
        self.assertEqual(json.loads(path.read_text())["status"], "uncertain")

    async def test_success_returns_cached_receipt_and_conflicting_content_rejected(self):
        payload = {"action": "create_post", "title": "test"}
        path, _ = self.author._receipt("one", payload)
        result = {"url": "https://www.reddit.com/r/HackathonsCanada/comments/abc/test/", "reddit_id": "t3_abc"}
        with patch("backend.reddit_author.agent_state_store.append_activity") as activity:
            await self.author._submit(path, payload, "test-user", Mock(click=AsyncMock()), AsyncMock(return_value=result))
        self.assertEqual(self.author._receipt("one", payload)[1], result)
        activity.assert_called_once()
        with self.assertRaisesRegex(ValueError, "different content"):
            self.author._receipt("one", {**payload, "title": "changed"})

    async def test_claim_collision_prevents_second_click(self):
        payload = {"action": "comment"}
        path, _ = self.author._receipt("one", payload)
        path.parent.mkdir(parents=True)
        path.write_text("{}")
        button = Mock(click=AsyncMock())
        with self.assertRaises(FileExistsError):
            await self.author._submit(path, payload, "test-user", button, AsyncMock())
        button.click.assert_not_awaited()

    async def test_identity_mismatch_prevents_publication(self):
        self.dreamer._reddit_username = AsyncMock(return_value="wrong-account")
        with patch("backend.reddit_author.agent_state_store.load_or_create", return_value={"reddit": {"username": "expected"}}):
            with self.assertRaisesRegex(RuntimeError, "differs"):
                await self.author._identity()

    async def test_post_verifies_saved_content_without_permalink_redirect(self):
        self.author._identity = AsyncMock(return_value="test-user")
        self.author._open = AsyncMock()
        data = {"name": "t3_new", "author": "test-user", "title": "Question?",
                "selftext": validated_body("Body", 40_000), "subreddit": "HackathonsCanada",
                "permalink": "/r/HackathonsCanada/comments/new/question/", "removed_by_category": "reddit"}
        self.author._submitted = AsyncMock(side_effect=[[], [data]])
        control = Mock(fill=AsyncMock(), click=AsyncMock())
        self.page.get_by_role.return_value = control
        with patch("backend.reddit_author.agent_state_store.append_activity"):
            result = await self.author.create_post("Question?", "Body", request_id="post")
            cached = await self.author.create_post("Question?", "Body", request_id="post")
        self.assertEqual(result, cached)
        self.assertEqual(result["removed_by_category"], "reddit")
        control.click.assert_awaited_once()
        self.assertEqual(self.author._submitted.await_count, 2)

    async def test_profile_post_uses_authenticated_profile_and_verifies_content(self):
        self.author._identity = AsyncMock(return_value="test-user")
        self.author._open = AsyncMock()
        data = {
            "name": "t3_new",
            "author": "test-user",
            "title": "A profile thought",
            "selftext": "Body",
            "subreddit": "u_test-user",
            "permalink": "/user/test-user/comments/new/a_profile_thought/",
            "removed_by_category": None,
        }
        self.author._submitted = AsyncMock(side_effect=[[], [data]])
        control = Mock(fill=AsyncMock(), click=AsyncMock())
        self.page.get_by_role.return_value = control
        with patch("backend.reddit_author.agent_state_store.append_activity"):
            result = await self.author.create_profile_post(
                "A profile thought", "Body", request_id="profile-post",
            )

        self.author._open.assert_awaited_once_with(
            "https://www.reddit.com/user/test-user/submit/?type=TEXT"
        )
        self.assertEqual(
            result["url"],
            "https://www.reddit.com/user/test-user/comments/new/a_profile_thought/",
        )
        control.click.assert_awaited_once()

    async def test_comment_verifies_new_top_level_reply(self):
        self.author._identity = AsyncMock(return_value="test-user")
        self.author._open = AsyncMock()
        post = {"name": "t3_abc", "subreddit": "HackathonsCanada"}
        data = {"name": "t1_new", "parent_id": "t3_abc", "author": "test-user",
                "subreddit": "HackathonsCanada",
                "body": validated_body("Reply", 10_000),
                "permalink": "/r/HackathonsCanada/comments/abc/question/new/"}
        before = [{"data": {"children": [{"data": post}]}}, {"data": {"children": []}}]
        after = [before[0], {"data": {"children": [{"data": data}]}}]
        self.author._json = AsyncMock(side_effect=[before, after])
        editor = self.page.locator.return_value.filter.return_value.first
        editor.locator.return_value.fill = AsyncMock()
        editor.get_by_role.return_value.click = AsyncMock()
        self.page.locator.return_value.last.click = AsyncMock()
        with patch("backend.reddit_author.agent_state_store.append_activity"):
            result = await self.author.comment("https://www.reddit.com/r/HackathonsCanada/comments/abc/question/", "Reply", request_id="reply")
            cached = await self.author.comment("https://www.reddit.com/r/HackathonsCanada/comments/abc/question/", "Reply", request_id="reply")
        self.assertEqual(cached, result)
        self.assertEqual(result["reddit_id"], "t1_new")
        editor.get_by_role.return_value.click.assert_awaited_once()

    def _uncertain_comment(self):
        payload = {"action": "comment", "subreddit": "HackathonsCanada",
                   "post_url": "https://www.reddit.com/r/HackathonsCanada/comments/abc/question/",
                   "body": validated_body("Reply", 10_000), "request_id": "reply"}
        path = self.author._receipt_path("reply")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"status": "uncertain", "payload": payload,
                                    "reddit_username": "test-user"}), encoding="utf-8")
        data = {"name": "t1_new", "parent_id": "t3_abc", "author": "test-user",
                "subreddit": "HackathonsCanada", "body": payload["body"],
                "permalink": "/r/HackathonsCanada/comments/abc/question/new/"}
        self.author._identity = AsyncMock(return_value="test-user")
        self.author._json = AsyncMock(return_value={"data": {"children": [{"data": data}]}})
        return path, data

    async def test_comment_recovery_is_read_only_and_repeatable(self):
        path, _ = self._uncertain_comment()
        with patch("backend.reddit_author.agent_state_store.append_activity") as activity:
            result = await self.author.reconcile_comment("reply", "t1_new")
            cached = await self.author.reconcile_comment("reply", "t1_new")
        self.assertEqual(result, cached)
        self.assertEqual(json.loads(path.read_text())["status"], "confirmed")
        activity.assert_called_once()
        self.author._json.assert_awaited_once()
        self.assertEqual(self.page.mock_calls, [])

    async def test_comment_recovery_rejects_wrong_content_identity_or_target(self):
        for field, value in (("author", "someone-else"), ("body", "different reply"),
                             ("parent_id", "t3_other"), ("parent_id", "t1_reply"),
                             ("subreddit", "other"), ("name", "t1_other")):
            with self.subTest(field=field, value=value):
                path, data = self._uncertain_comment()
                data[field] = value
                with self.assertRaisesRegex(RuntimeError, "does not match"):
                    await self.author.reconcile_comment("reply", "t1_new")
                self.assertEqual(json.loads(path.read_text())["status"], "uncertain")
        self.assertEqual(self.page.mock_calls, [])

    async def test_comment_recovery_rejects_different_signed_in_account(self):
        self._uncertain_comment()
        self.author._identity.return_value = "different-user"
        with self.assertRaisesRegex(RuntimeError, "original submission"):
            await self.author.reconcile_comment("reply", "t1_new")
        self.author._json.assert_not_awaited()

    async def test_comment_recovery_does_not_replace_confirmed_id(self):
        self._uncertain_comment()
        with patch("backend.reddit_author.agent_state_store.append_activity"):
            await self.author.reconcile_comment("reply", "t1_new")
        with self.assertRaisesRegex(ValueError, "another comment ID"):
            await self.author.reconcile_comment("reply", "t1_other")

    async def test_uncertain_comment_blocks_resubmission(self):
        self._uncertain_comment()
        with self.assertRaisesRegex(RuntimeError, "uncertain"):
            await self.author.comment("https://www.reddit.com/r/HackathonsCanada/comments/abc/question/", "Reply", request_id="reply")
        self.author._identity.assert_not_awaited()
        self.assertEqual(self.page.mock_calls, [])

    async def test_locked_or_archived_post_blocks_comment_composer(self):
        self.author._identity = AsyncMock(return_value="test-user")
        self.author._open = AsyncMock()
        for field in ("locked", "archived"):
            post = {"name": "t3_abc", "subreddit": "HackathonsCanada", field: True}
            self.author._json = AsyncMock(return_value=[{"data": {"children": [{"data": post}]}}])
            with self.assertRaisesRegex(RuntimeError, "locked, or archived"):
                await self.author.comment("https://www.reddit.com/r/HackathonsCanada/comments/abc/question/", "Reply", request_id="reply")
        self.assertEqual(self.page.mock_calls, [])

    async def test_stop_prevents_claim_and_click(self):
        path, _ = self.author._receipt("one", {"action": "comment"})
        self.dreamer._check_stop.side_effect = RuntimeError("stopped")
        button = Mock(click=AsyncMock())
        with self.assertRaisesRegex(RuntimeError, "stopped"):
            await self.author._submit(path, {"action": "comment"}, "user", button, AsyncMock())
        self.assertFalse(path.exists())
        button.click.assert_not_awaited()

    async def test_dry_run_never_claims_or_clicks(self):
        self.author.dry_run = True
        path, _ = self.author._receipt("draft", {"action": "comment"})
        button = Mock(wait_for=AsyncMock(), is_enabled=AsyncMock(return_value=True), click=AsyncMock())
        result = await self.author._submit(path, {"action": "comment"}, "user", button, AsyncMock())
        self.assertEqual(result["status"], "draft")
        self.assertFalse(path.exists())
        button.click.assert_not_awaited()
