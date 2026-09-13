import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from backend import agent_state_store
from backend.agent import (
    REDDIT_HOME_URL, REDDIT_LOGIN_URL, REDDIT_SIGNUP_URL, Dreamer, PlaywrightTimeoutError,
)
from backend.personas import Persona


class FakeField:
    def __init__(self, value="", *, pasted_value=""):
        self.value = value
        self.pasted_value = pasted_value
        self.presses = []
        self.fill_calls = []
        self.wait_calls = []

    @property
    def first(self):
        return self

    async def wait_for(self, **_kwargs):
        self.wait_calls.append(_kwargs)
        return None

    async def click(self):
        return None

    async def press(self, key):
        self.presses.append(key)
        if key == "Control+V":
            self.value = self.pasted_value

    async def input_value(self):
        return self.value

    async def fill(self, value):
        self.fill_calls.append(value)
        self.value = value


class FakeInputs:
    def __init__(self, fields):
        self.fields = fields

    async def count(self):
        return len(self.fields)

    def nth(self, index):
        return self.fields[index]


class FakeButton:
    def __init__(self, on_click=None):
        self.clicks = 0
        self.on_click = on_click

    @property
    def first(self):
        return self

    async def click(self):
        self.clicks += 1
        if self.on_click:
            self.on_click()

    async def wait_for(self, **kwargs):
        pass


class FakePage:
    def __init__(self, field, *, password_field=None):
        self.url = "https://temp-mail.org/en/"
        self.field = field
        self.password_field = password_field or FakeField()
        self.continue_button = FakeButton()
        self.submit_button = FakeButton(lambda: setattr(self, "url", "https://www.reddit.com/"))
        self.login_link = FakeButton(lambda: setattr(self, "url", REDDIT_LOGIN_URL))
        self.visits = []
        self.button_name_patterns = []

    def get_by_text(self, pattern):
        return FakeInputs([])

    async def evaluate(self, script):
        return "Test"

    def on(self, event, callback):
        pass

    def remove_listener(self, event, callback):
        pass

    async def goto(self, url, **_kwargs):
        self.url = url
        self.visits.append(url)

    def locator(self, selector):
        if "password" in selector:
            return self.password_field
        return self.field

    def get_by_role(self, role, *_args, **kwargs):
        if role == "link":
            return self.login_link
        if role == "button":
            pattern = kwargs["name"].pattern
            self.button_name_patterns.append(pattern)
            return self.continue_button if "next" in pattern else self.submit_button
        return self.field


def dreamer():
    persona = Persona("Test", False, (0, 0), 0, (0, 0), [])
    return Dreamer(persona, "query", "https://www.reddit.com")


class EmailHandoffTests(unittest.IsolatedAsyncioTestCase):
    async def test_delayed_home_challenge_is_checked_before_clicking_login(self):
        agent = dreamer()
        page = FakePage(FakeField())
        page.login_link.wait_for = AsyncMock(
            side_effect=[PlaywrightTimeoutError("challenge"), None]
        )
        with (
            patch.object(agent, "_solve_reddit_captcha", new=AsyncMock()) as solve,
            patch("backend.agent.asyncio.sleep", new=AsyncMock()),
        ):
            await agent._login_reddit(page, "saved@example.com", "saved-password")
        self.assertEqual(solve.await_count, 2)
        self.assertEqual(page.login_link.clicks, 1)

    async def test_complete_saved_credentials_go_directly_to_login(self):
        agent = dreamer()
        page = FakePage(FakeField())

        with (
            patch.object(
                agent_state_store,
                "load_or_create",
                return_value={
                    "email": {
                        "address": "saved@example.com",
                        "password": "saved-password",
                    }
                },
            ),
            patch.object(agent, "_login_reddit", new=AsyncMock()) as login,
            patch.object(agent, "_ensure_email", new=AsyncMock()) as ensure_email,
            patch.object(agent, "_prepare_reddit_signup", new=AsyncMock()) as signup,
        ):
            await agent._prepare_reddit_access(page)

        login.assert_awaited_once_with(page, "saved@example.com", "saved-password")
        ensure_email.assert_not_awaited()
        signup.assert_not_awaited()
        self.assertEqual(agent.state.email, "saved@example.com")

    async def test_saved_credentials_are_submitted_on_reddit_login(self):
        agent = dreamer()
        identity_field = FakeField()
        password_field = FakeField()
        page = FakePage(identity_field, password_field=password_field)

        with patch("backend.agent.asyncio.sleep", new=AsyncMock()) as sleep:
            await agent._login_reddit(page, "saved@example.com", "saved-password")

        self.assertEqual(page.visits, [REDDIT_HOME_URL])
        self.assertEqual(page.login_link.clicks, 1)
        self.assertEqual(identity_field.fill_calls, ["saved@example.com"])
        self.assertEqual(password_field.fill_calls, ["saved-password"])
        self.assertEqual(page.submit_button.clicks, 1)
        self.assertEqual(page.button_name_patterns, [r"^\s*log\s*in\s*$"])
        self.assertEqual(agent.state.note, "confirmed signed-in Reddit home page")
        sleep.assert_awaited_once_with(2)

    async def test_detected_login_captcha_is_solved_before_credentials_are_entered(self):
        agent = dreamer()
        agent.state.session = {"id": "session-123"}
        identity_field = FakeField()
        password_field = FakeField()
        page = FakePage(identity_field, password_field=password_field)
        detected = [
            {
                "isSolvingCaptcha": False,
                "tasks": [{"status": "detected"}],
                "url": REDDIT_LOGIN_URL,
            }
        ]
        solved = [
            {
                "isSolvingCaptcha": False,
                "tasks": [{"status": "solved"}],
                "url": REDDIT_LOGIN_URL,
            }
        ]

        with (
            patch(
                "backend.agent.steel_client.captcha_status",
                new=AsyncMock(side_effect=[detected, solved]),
            ) as status,
            patch(
                "backend.agent.steel_client.solve_captcha",
                new=AsyncMock(return_value=SimpleNamespace(success=True, message=None)),
            ) as solve,
            patch("backend.agent.asyncio.sleep", new=AsyncMock()),
        ):
            await agent._login_reddit(page, "saved@example.com", "saved-password")

        self.assertEqual(status.await_count, 2)
        solve.assert_awaited_once_with("session-123", url=REDDIT_HOME_URL)
        self.assertEqual(identity_field.fill_calls, ["saved@example.com"])
        self.assertEqual(password_field.fill_calls, ["saved-password"])

    async def test_undetected_captcha_status_does_not_block_login_fields(self):
        agent = dreamer()
        agent.state.session = {"id": "session-123"}
        identity_field = FakeField()
        password_field = FakeField()
        page = FakePage(identity_field, password_field=password_field)
        no_captcha = [
            {
                "isSolvingCaptcha": False,
                "tasks": [{"status": "undetected"}],
                "url": REDDIT_LOGIN_URL,
            }
        ]

        with (
            patch(
                "backend.agent.steel_client.captcha_status",
                new=AsyncMock(return_value=no_captcha),
            ) as status,
            patch(
                "backend.agent.steel_client.solve_captcha", new=AsyncMock()
            ) as solve,
            patch("backend.agent.asyncio.sleep", new=AsyncMock()),
        ):
            await agent._login_reddit(page, "saved@example.com", "saved-password")

        status.assert_awaited_once_with("session-123")
        solve.assert_not_awaited()
        self.assertEqual(identity_field.fill_calls, ["saved@example.com"])
        self.assertEqual(password_field.fill_calls, ["saved-password"])

    async def test_auto_solving_login_captcha_is_waited_on(self):
        agent = dreamer()
        agent.state.session = {"id": "session-123"}
        page = FakePage(FakeField())
        solving = [
            {
                "isSolvingCaptcha": True,
                "tasks": [{"status": "solving"}],
                "url": REDDIT_LOGIN_URL,
            }
        ]
        solved = [
            {
                "isSolvingCaptcha": False,
                "tasks": [{"status": "solved"}],
                "url": REDDIT_LOGIN_URL,
            }
        ]

        with (
            patch(
                "backend.agent.steel_client.captcha_status",
                new=AsyncMock(side_effect=[solving, solved]),
            ),
            patch(
                "backend.agent.steel_client.solve_captcha", new=AsyncMock()
            ) as solve,
            patch("backend.agent.asyncio.sleep", new=AsyncMock()),
        ):
            await agent._solve_reddit_captcha(page)

        solve.assert_not_awaited()
        self.assertEqual(agent.state.note, "Steel solved the Reddit CAPTCHA")

    async def test_already_solved_login_captcha_does_not_request_second_solve(self):
        agent = dreamer()
        agent.state.session = {"id": "session-123"}
        page = FakePage(FakeField())
        solved = [
            {
                "isSolvingCaptcha": False,
                "tasks": [{"status": "solved"}],
                "url": REDDIT_LOGIN_URL,
            }
        ]

        with (
            patch(
                "backend.agent.steel_client.captcha_status",
                new=AsyncMock(return_value=solved),
            ),
            patch(
                "backend.agent.steel_client.solve_captcha", new=AsyncMock()
            ) as solve,
        ):
            await agent._solve_reddit_captcha(page)

        solve.assert_not_awaited()
        self.assertEqual(agent.state.note, "Steel solved the Reddit CAPTCHA")

    async def test_incomplete_credentials_keep_signup_flow(self):
        agent = dreamer()
        page = FakePage(FakeField())

        with (
            patch.object(
                agent_state_store,
                "load_or_create",
                return_value={"email": {"address": None, "password": None}},
            ),
            patch.object(agent, "_login_reddit", new=AsyncMock()) as login,
            patch.object(agent, "_ensure_email", new=AsyncMock()) as ensure_email,
            patch.object(agent, "_prepare_reddit_signup", new=AsyncMock()) as signup,
        ):
            await agent._prepare_reddit_access(page)

        login.assert_not_awaited()
        ensure_email.assert_awaited_once_with(page)
        signup.assert_awaited_once_with(page)

    async def test_blank_query_skips_search_flow(self):
        agent = dreamer()
        agent.state.query = "  "
        page = FakePage(FakeField())
        page.url = "https://www.reddit.com/"

        with (
            patch.object(agent, "_search", new=AsyncMock()) as search,
            patch.object(agent, "_land", new=AsyncMock()) as land,
            patch.object(agent, "_deepen", new=AsyncMock()) as deepen,
            patch("backend.agent.asyncio.sleep", new=AsyncMock()) as sleep,
        ):
            await agent._dream(page)

        search.assert_not_awaited()
        land.assert_not_awaited()
        deepen.assert_not_awaited()
        self.assertEqual(sleep.await_count, 300)
        self.assertTrue(all(call.args == (1,) for call in sleep.await_args_list))
        self.assertEqual(agent.state.level, 0)
        self.assertEqual(agent.state.note, "login-only run complete")

    async def test_rejected_credentials_never_start_hold(self):
        agent = dreamer()
        agent.state.query = ""
        page = FakePage(FakeField())
        error = SimpleNamespace(is_visible=AsyncMock(return_value=True))
        page.get_by_text = lambda pattern: FakeInputs([error])
        with patch("backend.agent.asyncio.sleep", new=AsyncMock()) as sleep:
            with self.assertRaisesRegex(RuntimeError, "rejected the saved login"):
                await agent._dream(page)
        sleep.assert_not_awaited()
        self.assertFalse(agent._reddit_authenticated)

    async def test_anonymous_home_does_not_count_as_login(self):
        agent = dreamer()
        page = FakePage(FakeField())
        page.url = "https://www.reddit.com/"
        page.evaluate = AsyncMock(side_effect=[None, "Test"])
        with patch("backend.agent.asyncio.sleep", new=AsyncMock()) as sleep:
            await agent._wait_for_reddit_home(page)
        self.assertEqual(page.evaluate.await_count, 2)
        sleep.assert_awaited_once_with(1)
        self.assertTrue(agent._reddit_authenticated)

    async def test_http_rejection_never_starts_hold(self):
        agent = dreamer()
        agent.state.query = ""
        agent._reddit_login_http_status = 400
        with patch("backend.agent.asyncio.sleep", new=AsyncMock()) as sleep:
            with self.assertRaisesRegex(RuntimeError, "HTTP 400"):
                await agent._dream(FakePage(FakeField()))
        sleep.assert_not_awaited()

    async def test_confirmation_timeout_never_starts_hold(self):
        agent = dreamer()
        agent.state.query = ""
        with (
            patch("backend.agent.REDDIT_LOGIN_TIMEOUT_SECONDS", 0),
            patch("backend.agent.asyncio.sleep", new=AsyncMock()) as sleep,
        ):
            with self.assertRaises(TimeoutError):
                await agent._dream(FakePage(FakeField()))
        sleep.assert_not_awaited()

    async def test_delayed_home_navigation_precedes_identity_check(self):
        agent = dreamer()
        page = FakePage(FakeField())
        page.url = REDDIT_LOGIN_URL
        page.evaluate = AsyncMock(return_value="Test")

        async def navigate(_delay):
            page.evaluate.assert_not_awaited()
            page.url = "https://www.reddit.com/"

        with patch("backend.agent.asyncio.sleep", side_effect=navigate):
            await agent._wait_for_reddit_home(page)
        page.evaluate.assert_awaited_once()
        self.assertTrue(agent._reddit_authenticated)

    async def test_copies_matching_temp_mail_input(self):
        agent = dreamer()
        matching = FakeField("person@example.com")
        page = FakePage(FakeInputs([FakeField("not an email"), matching]))

        await agent._copy_email(page, "person@example.com")

        self.assertTrue(agent._email_copied)
        self.assertEqual(matching.presses, ["Control+A", "Control+C"])

    async def test_pastes_email_then_fills_password_and_submits(self):
        agent = dreamer()
        agent.state.email = "person@example.com"
        agent._email_copied = True
        field = FakeField(pasted_value=agent.state.email)
        password_field = FakeField()
        page = FakePage(field, password_field=password_field)

        with (
            patch.object(
                agent_state_store,
                "load_or_create",
                return_value={"email": {"password": "123ABC#Test"}},
            ),
            patch("backend.agent.asyncio.sleep", new=AsyncMock()) as sleep,
        ):
            await agent._prepare_reddit_signup(page)

        self.assertEqual(page.visits, [REDDIT_SIGNUP_URL])
        self.assertEqual(field.presses, ["Control+V"])
        self.assertEqual(field.fill_calls, [])
        self.assertEqual(field.value, agent.state.email)
        self.assertEqual(password_field.fill_calls, ["123ABC#Test"])
        self.assertEqual(page.submit_button.clicks, 1)
        self.assertEqual([call.args[0] for call in sleep.await_args_list], [3, 2])

    async def test_fills_saved_email_when_clipboard_is_unavailable(self):
        agent = dreamer()
        agent.state.email = "saved@example.com"
        field = FakeField()
        page = FakePage(field)

        with (
            patch.object(
                agent_state_store,
                "load_or_create",
                return_value={"email": {"password": "123ABC#Test"}},
            ),
            patch("backend.agent.asyncio.sleep", new=AsyncMock()),
        ):
            await agent._prepare_reddit_signup(page)

        self.assertEqual(field.presses, [])
        self.assertEqual(field.fill_calls, [agent.state.email])

    async def test_yusuf_completion_hold_keeps_session_alive_for_configured_duration(self):
        persona = Persona(
            name="Yusuf", traits=[], typing_delay_ms=(1, 1),
            scroll_passes=(1, 1), max_depth=1, mobile=False,
            browsing_mode="reddit_browse",
        )
        agent = Dreamer(persona, "topic", "")
        page = SimpleNamespace(url="https://www.reddit.com/r/technology/")

        with patch("backend.agent.YUSUF_COMPLETION_HOLD_SECONDS", 2), patch(
            "backend.agent.asyncio.sleep", new=AsyncMock(),
        ) as sleep:
            await agent._hold_yusuf_session(page)

        self.assertEqual(sleep.await_count, 2)
        self.assertIn("keeping Yusuf's browser open", agent.state.note)


if __name__ == "__main__":
    unittest.main()
