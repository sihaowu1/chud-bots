import unittest
from unittest.mock import AsyncMock, patch

from backend import agent_state_store
from backend.agent import REDDIT_SIGNUP_URL, Dreamer
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
    def __init__(self):
        self.clicks = 0

    @property
    def first(self):
        return self

    async def click(self):
        self.clicks += 1


class FakePage:
    def __init__(self, field, *, password_field=None):
        self.url = "https://temp-mail.org/en/"
        self.field = field
        self.password_field = password_field or FakeField()
        self.continue_button = FakeButton()
        self.submit_button = FakeButton()
        self.visits = []

    async def goto(self, url, **_kwargs):
        self.url = url
        self.visits.append(url)

    def locator(self, selector):
        if "password" in selector:
            return self.password_field
        return self.field

    def get_by_role(self, role, *_args, **kwargs):
        if role == "button":
            pattern = kwargs["name"].pattern
            return self.continue_button if "next" in pattern else self.submit_button
        return self.field


def dreamer():
    persona = Persona("Test", False, (0, 0), 0, (0, 0), [])
    return Dreamer(persona, "query", "https://www.reddit.com")


class EmailHandoffTests(unittest.IsolatedAsyncioTestCase):
    async def test_blank_query_skips_search_flow(self):
        agent = dreamer()
        agent.state.query = "  "
        page = FakePage(FakeField())

        with (
            patch.object(agent, "_search", new=AsyncMock()) as search,
            patch.object(agent, "_land", new=AsyncMock()) as land,
            patch.object(agent, "_deepen", new=AsyncMock()) as deepen,
        ):
            await agent._dream(page)

        search.assert_not_awaited()
        land.assert_not_awaited()
        deepen.assert_not_awaited()
        self.assertEqual(agent.state.level, 0)
        self.assertEqual(agent.state.note, "login-only run complete")

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


if __name__ == "__main__":
    unittest.main()
