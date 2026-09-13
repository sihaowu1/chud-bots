"""Browser-only email verification; keep codes out of events and durable state."""

import asyncio
import re
from urllib.parse import urlparse

from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from .reddit_security_key import dismiss_security_key_prompt
from .reddit_onboarding import handle_onboarding

TEMP_MAIL_URL = 'https://temp-mail.org/en/'
PROMPT_WAIT_SECONDS = 15
MAIL_WAIT_SECONDS = 120
CODE_INPUTS = (
    'input[autocomplete="one-time-code"], input[name="code" i], '
    'input[name*="verification" i], input[name*="otp" i], '
    'input[placeholder*="code" i], input[aria-label*="code" i], '
    'input[inputmode="numeric"][maxlength="1"]'
)


def extract_code(text):
    for pattern in (
        r'(?:verification|security|one[- ]time|confirmation|reddit)\s*code[^\d]{0,100}(\d{6})(?!\d)',
        r'(?<!\d)(\d{6})(?!\d)[^\d]{0,100}(?:is your|verification|reddit code)',
    ):
        match = re.search(pattern, text, re.I)
        if match:
            return match[1]
    return None


async def visible_code_fields(page):
    fields = page.locator(CODE_INPUTS)
    return [fields.nth(i) for i in range(await fields.count()) if await fields.nth(i).is_visible()]


async def mailbox_for(agent, page):
    mailbox = agent._temp_mail_page
    if mailbox is None or mailbox.is_closed():
        # A restored Steel profile may still have its original inbox tab/cookies.
        mailbox = next((tab for tab in page.context.pages
                        if not tab.is_closed() and urlparse(tab.url).hostname == 'temp-mail.org'), None)
        if mailbox is None:
            mailbox = await page.context.new_page()
            await mailbox.goto(TEMP_MAIL_URL, wait_until='domcontentloaded')
        agent._temp_mail_page = mailbox
    await mailbox.bring_to_front()
    field = mailbox.locator('#mail, input.emailbox-input').first
    for _ in range(30):
        agent._check_stop()
        if await field.count():
            address = (await field.input_value()).strip()
            if '@' in address:
                if address.casefold() != (agent.state.email or '').casefold():
                    raise RuntimeError('Temp-Mail inbox does not match the Reddit email; original mailbox is required')
                return mailbox
        await asyncio.sleep(1)
    raise TimeoutError('Temp-Mail inbox address did not load')


async def read_code(agent, mailbox):
    agent._emit(note='waiting for Reddit verification email in Temp-Mail', url=mailbox.url)
    inbox_url = mailbox.url
    deadline = asyncio.get_running_loop().time() + MAIL_WAIT_SECONDS
    while asyncio.get_running_loop().time() < deadline:
        agent._check_stop()
        # The inbox auto-refreshes. Match sender and subject together when they
        # occupy separate links, and ignore unrelated messages.
        rows = mailbox.locator('.inbox-dataList li').filter(has_text=re.compile('reddit', re.I)).filter(
            has_text=re.compile('code|verify|verification', re.I)
        )
        links = rows.locator('a.viewLink, a[href*="/view/"]')
        if not await links.count():
            links = mailbox.locator('a.viewLink, a[href*="/view/"]').filter(
                has_text=re.compile('reddit', re.I)
            ).filter(has_text=re.compile('code|verify|verification', re.I))
        for i in range(await links.count()):
            link = links.nth(i)
            if not await link.is_visible():
                continue
            subject = await link.inner_text()
            code = extract_code(subject)
            if code:
                return code
            await link.click(timeout=5_000)
            try:
                body = mailbox.locator('.inbox-data-content, .inbox-data-content-intro').first
                await body.wait_for(state='visible', timeout=5_000)
                code = extract_code(subject + '\n' + await body.inner_text())
                if code:
                    return code
                for frame in mailbox.frames:
                    if frame != mailbox.main_frame:
                        code = extract_code(subject + '\n' + await frame.locator('body').inner_text(timeout=2_000))
                        if code:
                            return code
            except PlaywrightTimeoutError:
                pass
            await mailbox.goto(inbox_url, wait_until='domcontentloaded')
            break  # Navigation invalidates the old listing; re-query next poll.
        await asyncio.sleep(2)
    raise TimeoutError('Reddit verification email did not arrive within 120 seconds')


async def verify_if_requested(agent, page, *, password_step=False):
    for _ in range(PROMPT_WAIT_SECONDS):
        agent._check_stop()
        await dismiss_security_key_prompt(agent, page)
        await handle_onboarding(agent, page)
        if await visible_code_fields(page):
            break
        if password_step and await page.locator('input[type="password"]').first.is_visible():
            return
        if not password_step and page.url.rstrip('/') == 'https://www.reddit.com':
            if await agent._reddit_username(page):
                return
        await asyncio.sleep(1)
    else:
        return

    try:
        mailbox = await mailbox_for(agent, page)
        code = await read_code(agent, mailbox)
    finally:
        await page.bring_to_front()
    agent._check_stop()
    fields = await visible_code_fields(page)
    if len(fields) == 1:
        await fields[0].fill(code)
    elif len(fields) == len(code):
        for field, digit in zip(fields, code):
            await field.fill(digit)
    else:
        raise RuntimeError('Reddit verification inputs changed unexpectedly')
    # Segmented inputs may auto-submit after the last digit.
    if await visible_code_fields(page):
        button = page.get_by_role('button', name=re.compile(
            r'^\s*(?:verify(?: email| code)?|continue|next|submit)\s*$', re.I
        )).first
        if await button.is_visible():
            await button.click()
    agent._emit(note='submitted Reddit email verification code', url=page.url)
    for _ in range(PROMPT_WAIT_SECONDS):
        agent._check_stop()
        await dismiss_security_key_prompt(agent, page)
        await handle_onboarding(agent, page)
        if not await visible_code_fields(page):
            return
        await asyncio.sleep(1)
    raise RuntimeError('Reddit did not accept the email verification code')
