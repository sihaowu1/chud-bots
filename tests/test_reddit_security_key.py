import json
import shutil
import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from backend.reddit_security_key import CANCEL_SECURITY_KEY_SCRIPT, dismiss_security_key_prompt


class SecurityKeyTests(unittest.IsolatedAsyncioTestCase):
    def setup_prompt(self, visible=True):
        prompt = SimpleNamespace(is_visible=AsyncMock(return_value=visible))
        prompts = SimpleNamespace(count=AsyncMock(return_value=1), nth=lambda i: prompt)
        cancel = SimpleNamespace(is_visible=AsyncMock(return_value=True), click=AsyncMock(),
                                 focus=AsyncMock(), press=AsyncMock())
        dialog = Mock()
        dialog.get_by_role.return_value = SimpleNamespace(first=cancel)
        dialogs = Mock()
        dialogs.filter.return_value = SimpleNamespace(count=AsyncMock(return_value=1), first=dialog)
        page = SimpleNamespace(url='https://www.reddit.com/login/',
                               get_by_text=Mock(return_value=prompts), get_by_role=Mock(return_value=dialogs))
        agent = SimpleNamespace(_check_stop=Mock(), _emit=Mock())
        return agent, page, cancel

    async def test_clicks_cancel_for_matching_prompt(self):
        agent, page, cancel = self.setup_prompt()
        self.assertTrue(await dismiss_security_key_prompt(agent, page))
        cancel.click.assert_awaited_once()
        cancel.press.assert_not_awaited()
        pattern = page.get_by_text.call_args.args[0]
        self.assertTrue(pattern.search('Use a secure key with this website'))
        self.assertTrue(pattern.search('Use a security key with this website'))
        self.assertFalse(pattern.search('Enter your verification code'))

    async def test_enter_fallback_focuses_cancel(self):
        agent, page, cancel = self.setup_prompt()
        cancel.click.side_effect = PlaywrightTimeoutError('click timeout')
        self.assertTrue(await dismiss_security_key_prompt(agent, page))
        cancel.focus.assert_awaited_once()
        cancel.press.assert_awaited_once_with('Enter', timeout=2_000)

    async def test_hidden_prompt_does_not_press_anything(self):
        agent, page, cancel = self.setup_prompt(visible=False)
        self.assertFalse(await dismiss_security_key_prompt(agent, page))
        cancel.click.assert_not_awaited()
        cancel.press.assert_not_awaited()

    @unittest.skipUnless(shutil.which('node'), 'Node is needed to execute the browser script in isolation')
    def test_native_key_cancellation_preserves_other_credentials_and_domains(self):
        script = '''
const vm = require('node:vm');
const assert = require('node:assert/strict');
const hook = HOOK;
(async () => {
    for (const hostname of ['www.reddit.com', 'reddit.com', 'temp-mail.org', 'evilreddit.com']) {
        let calls = 0;
        const credentials = {
            get(options) { calls++; return Promise.resolve(options); },
            create(options) { calls++; return Promise.resolve(options); }
        };
        const context = vm.createContext({location: {hostname}, navigator: {credentials}, DOMException});
        vm.runInContext(hook, context);
        vm.runInContext(hook, context);
        const reddit = hostname === 'reddit.com' || hostname === 'www.reddit.com';
        for (const method of ['get', 'create']) {
            if (reddit) {
                await assert.rejects(credentials[method]({publicKey: {}}), {name: 'NotAllowedError'});
            } else {
                await credentials[method]({publicKey: {}});
            }
            const options = {password: true};
            assert.equal(await credentials[method](options), options);
        }
        assert.equal(calls, reddit ? 2 : 4);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
'''.replace('HOOK', json.dumps(CANCEL_SECURITY_KEY_SCRIPT))
        result = subprocess.run([shutil.which('node'), '-e', script], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
