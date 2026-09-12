import unittest

from backend.agent import REDDIT_SIGNUP_URL, Dreamer
from backend.personas import Persona


class FakeField:
    def __init__(self, value="", *, pasted_value=""):
        self.value = value
        self.pasted_value = pasted_value
        self.presses = []
        self.fill_calls = []

    @property
    def first(self):
        return self

    async def wait_for(self, **_kwargs):
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


class FakePage:
    def __init__(self, field):
        self.url = "https://temp-mail.org/en/"
        self.field = field
        self.visits = []

    async def goto(self, url, **_kwargs):
        self.url = url
        self.visits.append(url)

    def locator(self, _selector):
        return self.field

    def get_by_role(self, *_args, **_kwargs):
        return self.field


def dreamer():
    persona = Persona("Test", False, (0, 0), 0, (0, 0), [])
    return Dreamer(persona, "query", "https://www.reddit.com")


class EmailHandoffTests(unittest.IsolatedAsyncioTestCase):
    async def test_copies_matching_temp_mail_input(self):
        agent = dreamer()
        matching = FakeField("person@example.com")
        page = FakePage(FakeInputs([FakeField("not an email"), matching]))

        await agent._copy_email(page, "person@example.com")

        self.assertTrue(agent._email_copied)
        self.assertEqual(matching.presses, ["Control+A", "Control+C"])

    async def test_pastes_copied_email_without_submitting(self):
        agent = dreamer()
        agent.state.email = "person@example.com"
        agent._email_copied = True
        field = FakeField(pasted_value=agent.state.email)
        page = FakePage(field)

        await agent._prepare_reddit_signup(page)

        self.assertEqual(page.visits, [REDDIT_SIGNUP_URL])
        self.assertEqual(field.presses, ["Control+V"])
        self.assertEqual(field.fill_calls, [])
        self.assertEqual(field.value, agent.state.email)

    async def test_fills_saved_email_when_clipboard_is_unavailable(self):
        agent = dreamer()
        agent.state.email = "saved@example.com"
        field = FakeField()
        page = FakePage(field)

        await agent._prepare_reddit_signup(page)

        self.assertEqual(field.presses, [])
        self.assertEqual(field.fill_calls, [agent.state.email])


if __name__ == "__main__":
    unittest.main()
