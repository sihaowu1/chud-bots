import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from backend import agent_state_store, reddit_verification as verification
from backend.agent import Dreamer, _Stopped
from backend.personas import pick


class VerificationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.agent = Dreamer(pick(1)[0], '', '')
        self.agent.state.email = 'demo@example.com'
        self.page = SimpleNamespace(url='https://www.reddit.com/register/', bring_to_front=AsyncMock())
        self.page.get_by_text = Mock(return_value=SimpleNamespace(count=AsyncMock(return_value=0)))

    def test_code_requires_context_and_preserves_leading_zero(self):
        self.assertEqual(verification.extract_code('Reddit verification code: 012345'), '012345')
        self.assertEqual(verification.extract_code('012345 is your Reddit code'), '012345')
        self.assertIsNone(verification.extract_code('Invoice 123456'))
        self.assertIsNone(verification.extract_code('Reddit code 1234567'))

    async def test_signup_retains_original_inbox_and_returns_new_reddit_tab(self):
        mailbox = SimpleNamespace(
            url=verification.TEMP_MAIL_URL, goto=AsyncMock(),
            context=SimpleNamespace(new_page=AsyncMock(return_value=self.page)),
            wait_for_function=AsyncMock(return_value=SimpleNamespace(json_value=AsyncMock(return_value='demo@example.com'))),
        )
        with (
            patch.object(agent_state_store, 'load_or_create', return_value={'email': {}}),
            patch.object(agent_state_store, 'save'),
            patch.object(self.agent, '_copy_email', new=AsyncMock()),
            patch.object(self.agent, '_prepare_reddit_signup', new=AsyncMock()) as signup,
        ):
            result = await self.agent._prepare_reddit_access(mailbox)
        self.assertIs(result, self.page)
        self.assertIs(self.agent._temp_mail_page, mailbox)
        mailbox.goto.assert_awaited_once_with(verification.TEMP_MAIL_URL, wait_until='domcontentloaded')
        signup.assert_awaited_once_with(self.page)

    async def test_no_prompt_leaves_inbox_alone(self):
        with (
            patch.object(verification, 'PROMPT_WAIT_SECONDS', 1),
            patch.object(verification, 'visible_code_fields', new=AsyncMock(return_value=[])),
            patch.object(verification, 'mailbox_for', new=AsyncMock()) as mailbox,
            patch.object(verification.asyncio, 'sleep', new=AsyncMock()),
        ):
            await verification.verify_if_requested(self.agent, self.page)
        mailbox.assert_not_awaited()

    async def test_single_and_split_code_inputs(self):
        for count in (1, 6):
            fields = [SimpleNamespace(fill=AsyncMock()) for _ in range(count)]
            button = SimpleNamespace(is_visible=AsyncMock(return_value=True), click=AsyncMock())
            self.page.get_by_role = Mock(return_value=SimpleNamespace(first=button))
            with (
                patch.object(verification, 'visible_code_fields', new=AsyncMock(side_effect=[fields, fields, fields, []])),
                patch.object(verification, 'mailbox_for', new=AsyncMock()),
                patch.object(verification, 'read_code', new=AsyncMock(return_value='012345')),
            ):
                await verification.verify_if_requested(self.agent, self.page)
            for field, value in zip(fields, ['012345'] if count == 1 else list('012345')):
                field.fill.assert_awaited_once_with(value)
            button.click.assert_awaited_once()
        self.assertEqual(self.page.bring_to_front.await_count, 2)
        self.assertNotIn('012345', self.agent.state.note)

    async def test_restores_matching_mailbox_for_saved_login(self):
        address = SimpleNamespace(count=AsyncMock(return_value=1), input_value=AsyncMock(return_value='demo@example.com'))
        mailbox = SimpleNamespace(url=verification.TEMP_MAIL_URL, is_closed=lambda: False,
                                  bring_to_front=AsyncMock(), locator=Mock(return_value=SimpleNamespace(first=address)))
        self.page.context = SimpleNamespace(pages=[mailbox], new_page=AsyncMock())
        self.assertIs(await verification.mailbox_for(self.agent, self.page), mailbox)
        self.page.context.new_page.assert_not_awaited()
        address.input_value.return_value = 'other@example.com'
        with self.assertRaisesRegex(RuntimeError, 'does not match'):
            await verification.mailbox_for(self.agent, self.page)

    async def test_delayed_email_opens_message_body(self):
        link = SimpleNamespace(is_visible=AsyncMock(return_value=True),
                               inner_text=AsyncMock(return_value='Reddit verification code'), click=AsyncMock())
        links = Mock()
        links.filter.return_value = links
        links.locator.return_value = links
        links.count = AsyncMock(side_effect=[0, 0, 1, 1])
        links.nth.return_value = link
        body = SimpleNamespace(first=SimpleNamespace(wait_for=AsyncMock(), inner_text=AsyncMock(return_value='012345')))
        mailbox = SimpleNamespace(url=verification.TEMP_MAIL_URL,
                                  locator=Mock(side_effect=lambda selector: body if '.inbox-data-content' in selector else links))
        with patch.object(verification.asyncio, 'sleep', new=AsyncMock()) as sleep:
            self.assertEqual(await verification.read_code(self.agent, mailbox), '012345')
        link.click.assert_awaited_once()
        sleep.assert_awaited_once_with(2)

    async def test_missing_mail_times_out_and_returns_to_reddit(self):
        with (
            patch.object(verification, 'visible_code_fields', new=AsyncMock(return_value=[object()])),
            patch.object(verification, 'mailbox_for', new=AsyncMock(return_value=SimpleNamespace(url=verification.TEMP_MAIL_URL))),
            patch.object(verification, 'MAIL_WAIT_SECONDS', 0),
        ):
            with self.assertRaises(TimeoutError):
                await verification.verify_if_requested(self.agent, self.page)
        self.page.bring_to_front.assert_awaited_once()

    async def test_rejected_code_fails(self):
        fields = [SimpleNamespace(fill=AsyncMock())]
        self.page.get_by_role = Mock(return_value=SimpleNamespace(first=SimpleNamespace(is_visible=AsyncMock(return_value=True), click=AsyncMock())))
        with (
            patch.object(verification, 'PROMPT_WAIT_SECONDS', 1),
            patch.object(verification, 'visible_code_fields', new=AsyncMock(return_value=fields)),
            patch.object(verification, 'mailbox_for', new=AsyncMock()),
            patch.object(verification, 'read_code', new=AsyncMock(return_value='012345')),
            patch.object(verification.asyncio, 'sleep', new=AsyncMock()),
        ):
            with self.assertRaisesRegex(RuntimeError, 'did not accept'):
                await verification.verify_if_requested(self.agent, self.page)

    async def test_stop_interrupts_verification(self):
        self.agent.stop()
        with self.assertRaises(_Stopped):
            await verification.verify_if_requested(self.agent, self.page)


if __name__ == '__main__':
    unittest.main()
