import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from backend.reddit_onboarding import redirect_about_you


class OnboardingTests(unittest.IsolatedAsyncioTestCase):
    def setup_page(self, screens):
        remaining = [screens]
        prompt = SimpleNamespace(is_visible=AsyncMock(side_effect=lambda: remaining[0] > 0))
        prompts = SimpleNamespace(count=AsyncMock(return_value=1), nth=lambda i: prompt)

        async def click(**kwargs):
            remaining[0] -= 1

        skip = SimpleNamespace(is_visible=AsyncMock(return_value=True),
                               is_enabled=AsyncMock(return_value=True), click=AsyncMock(side_effect=click))
        dialog = SimpleNamespace(get_by_role=Mock(return_value=SimpleNamespace(first=skip)))
        dialogs = Mock()
        dialogs.filter.return_value = SimpleNamespace(count=AsyncMock(return_value=1), first=dialog)
        page = SimpleNamespace(url='https://www.reddit.com/',
                               goto=AsyncMock(),
                               get_by_text=Mock(return_value=prompts), get_by_role=Mock(return_value=dialogs))
        return SimpleNamespace(_check_stop=Mock(), _emit=Mock(), _about_you_redirected=False), page, skip

    async def test_first_about_you_navigates_home(self):
        agent, page, skip = self.setup_page(3)
        self.assertTrue(await redirect_about_you(agent, page))
        page.goto.assert_awaited_once_with('https://www.reddit.com/', wait_until='domcontentloaded')
        skip.click.assert_not_awaited()

    async def test_no_about_you_does_not_click(self):
        agent, page, skip = self.setup_page(0)
        self.assertFalse(await redirect_about_you(agent, page))
        page.goto.assert_not_awaited()
        skip.click.assert_not_awaited()

    async def test_persistent_screen_does_not_repeat_navigation(self):
        agent, page, skip = self.setup_page(20)
        await redirect_about_you(agent, page)
        self.assertFalse(await redirect_about_you(agent, page))
        self.assertEqual(page.goto.await_count, 1)
