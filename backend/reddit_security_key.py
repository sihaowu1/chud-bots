"""Decline optional Reddit security-key authentication during password login."""

import re

from playwright.async_api import TimeoutError as PlaywrightTimeoutError


# Browser-native WebAuthn dialogs are outside the page DOM. Return the same
# failure category as user cancellation, before the native prompt can block
# browser automation. Only Reddit public-key requests are affected.
CANCEL_SECURITY_KEY_SCRIPT = """(() => {
    if (!(location.hostname === 'reddit.com' || location.hostname.endsWith('.reddit.com')))
        return;
    const credentials = navigator.credentials;
    if (!credentials || credentials.__redditCancelSecurityKey) return;
    for (const method of ['get', 'create']) {
        const original = credentials[method];
        if (typeof original !== 'function') continue;
        credentials[method] = function(options) {
            if (options && options.publicKey) {
                return Promise.reject(new DOMException('Security key request cancelled', 'NotAllowedError'));
            }
            return original.apply(this, arguments);
        };
    }
    Object.defineProperty(credentials, '__redditCancelSecurityKey', {value: true});
})();"""


async def install_security_key_cancellation(page):
    # Installed before navigating to Reddit, including the new signup tab.
    await page.add_init_script(CANCEL_SECURITY_KEY_SCRIPT)


async def dismiss_security_key_prompt(agent, page):
    agent._check_stop()
    prompts = page.get_by_text(re.compile(
        r'use a (?:secure|security) key with this (?:website|site)', re.I
    ))
    for i in range(await prompts.count()):
        prompt = prompts.nth(i)
        if not await prompt.is_visible():
            continue
        dialogs = page.get_by_role('dialog').filter(has=prompt)
        scope = dialogs.first if await dialogs.count() else page
        cancel = scope.get_by_role('button', name=re.compile(r'^\s*cancel\s*$', re.I)).first
        if not await cancel.is_visible():
            continue
        agent._check_stop()
        try:
            await cancel.click(timeout=2_000)
        except PlaywrightTimeoutError:
            # Focus Cancel explicitly; never send Enter to a submit/confirm button.
            if not await prompt.is_visible():
                return True
            await cancel.focus(timeout=2_000)
            await cancel.press('Enter', timeout=2_000)
        agent._emit(note='cancelled Reddit security-key prompt', url=page.url)
        return True
    return False
