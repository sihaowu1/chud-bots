"""Handle Reddit onboarding during login/signup."""

import re


async def handle_onboarding(agent, page):
    if await redirect_about_you(agent, page):
        return
    await choose_technology_interest(agent, page)


async def choose_technology_interest(agent, page):
    agent._check_stop()
    prompts = page.get_by_text(re.compile(r'^\s*choose your interests?\s*[.!?]?\s*$', re.I))
    for i in range(await prompts.count()):
        prompt = prompts.nth(i)
        if not await prompt.is_visible():
            continue
        dialogs = page.get_by_role('dialog').filter(has=prompt)
        scope = dialogs.first if await dialogs.count() else page
        name = re.compile(r'^\s*technology\s*$', re.I)
        technology = None
        for role in ('checkbox', 'button'):
            candidate = scope.get_by_role(role, name=name).first
            if await candidate.is_visible():
                technology = candidate
                break
        if technology is None:
            technology = scope.get_by_text(name).first
        await technology.wait_for(state='visible', timeout=5_000)
        agent._check_stop()
        # Avoid toggling an already-selected interest off.
        if await technology.get_attribute('role') == 'checkbox' or await technology.get_attribute('type') == 'checkbox':
            await technology.check(timeout=5_000)
        elif (await technology.get_attribute('aria-pressed') != 'true'
              and await technology.get_attribute('aria-checked') != 'true'):
            await technology.click(timeout=5_000)
        agent._emit(note='selected Technology interest', url=page.url)
        agent._check_stop()
        await scope.get_by_role('button', name=re.compile(r'^\s*continue\s*$', re.I)).first.click(timeout=5_000)
        await prompt.wait_for(state='hidden', timeout=10_000)
        agent._emit(note='continued past Reddit interests', url=page.url)
        return True
    return False


async def redirect_about_you(agent, page):
    agent._check_stop()
    if agent._about_you_redirected:
        return False
    prompts = page.get_by_text(re.compile(r'^\s*about you\s*$', re.I))
    for i in range(await prompts.count()):
        if not await prompts.nth(i).is_visible():
            continue
        agent._check_stop()
        await page.goto('https://www.reddit.com/', wait_until='domcontentloaded')
        agent._about_you_redirected = True
        agent._emit(note='opened Reddit home from About you', url=page.url)
        return True
    return False
