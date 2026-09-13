"""One dreamer. Drives a single Steel session through the dream levels:

  L0  wake      - Steel session created, Temp-Mail copied into Reddit signup
  L1  search    - type the query into Google
  L2  land      - find the target domain in the results and click it
  L3+ deepen    - scroll, dwell, follow internal links
  kick          - release the session
"""

import asyncio
import random
import re
import uuid
from dataclasses import dataclass, field
from urllib.parse import urlparse

from playwright.async_api import (
    Error as PlaywrightError,
    Page,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)

from . import agent_state_store, events, steel_client
from .personas import DWELL_DEEP, DWELL_LANDING, DWELL_SERP, Persona, dwell
from .reddit_security_key import install_security_key_cancellation, dismiss_security_key_prompt
from .reddit_onboarding import handle_onboarding

SEARCH_URL = "https://www.google.com/?hl=en"
TEMP_MAIL_URL = "https://temp-mail.org/en/"
REDDIT_SIGNUP_URL = "https://www.reddit.com/register/"
REDDIT_LOGIN_URL = "https://www.reddit.com/login/"
REDDIT_HOME_URL = "https://www.reddit.com/"
# Workaround: Steel's CAPTCHA status can remain stuck on solving even after
# Reddit has successfully logged in. Keep this timeout effectively out of the way.
CAPTCHA_SOLVE_TIMEOUT_SECONDS = 10_000_000
CAPTCHA_POLL_INTERVAL_SECONDS = 1
LOGIN_ONLY_DWELL_SECONDS = 5 * 60
YUSUF_COMPLETION_HOLD_SECONDS = 5 * 60
REDDIT_LOGIN_TIMEOUT_SECONDS = 60

_EMAIL_LOCKS: dict[str, asyncio.Lock] = {}


@dataclass
class AgentState:
    id: str
    persona: str
    query: str
    target: str
    level: int = 0
    status: str = "queued"  # queued | running | done | failed | stopped
    session: dict | None = None
    email: str | None = None
    url: str | None = None
    note: str = ""
    traits: list[str] = field(default_factory=list)
    mode: str = "legacy"

    def snapshot(self) -> dict:
        return {
            "id": self.id,
            "persona": self.persona,
            "query": self.query,
            "target": self.target,
            "level": self.level,
            "status": self.status,
            "session": self.session,
            "email": self.email,
            "url": self.url,
            "note": self.note,
            "traits": self.traits,
            "mode": self.mode,
        }


class Dreamer:
    def __init__(self, persona: Persona, query: str, target: str, *,
                 mode: str = "legacy", profile_post: dict | None = None):
        if mode not in ("legacy", "reddit_browse", "profile_post"):
            raise ValueError("unknown dreamer mode")
        if mode == "profile_post" and profile_post is None:
            raise ValueError("profile_post mode requires profile post content")
        # Profile posting is an explicit batch action. Otherwise behavior stays
        # bound to the persona, independent of the launch-wide browsing hint.
        self.mode = "profile_post" if profile_post is not None else persona.browsing_mode
        self.profile_post = profile_post
        self.browse_subreddits: tuple[str, ...] | None = None
        self.persona = persona
        self.state = AgentState(
            id=uuid.uuid4().hex[:8],
            persona=persona.name,
            query=query,
            target=target,
            traits=persona.traits,
            mode=self.mode,
        )
        self._stop = asyncio.Event()
        self.task: asyncio.Task | None = None
        self._email_copied = False
        self._about_you_redirected = False
        self._temp_mail_page: Page | None = None
        self._reddit_authenticated = False
        self._reddit_login_http_status: int | None = None

    # ---- lifecycle -------------------------------------------------------

    @property
    def has_task(self) -> bool:
        return bool(self.state.query.strip() or self.profile_post is not None or self.browse_subreddits)

    def stop(self) -> None:
        self._stop.set()

    def _emit(self, level: int | None = None, note: str = "", url: str | None = None) -> None:
        if level is not None:
            self.state.level = level
        if note:
            self.state.note = note
        if url:
            self.state.url = url
        events.publish("agent", agent=self.state.snapshot())

    async def run(self) -> None:
        self.state.status = "running"
        session = None
        try:
            self._check_stop()
            if self.mode == "reddit_browse" and self.browse_subreddits is None and self.state.query.strip():
                from .subreddit_selector import select_subreddits
                self._emit(0, "selecting three subreddits for the topic")
                self.browse_subreddits = await select_subreddits(self.state.query, browser_count=1)
                self._check_stop()
            self._emit(0, "waking up a Steel session")
            session = await steel_client.create_session(persona=self.persona.name, interactive=True)
            self.state.session = steel_client.session_summary(session)
            self._emit(0, f"session {session.id[:8]} live")

            async with async_playwright() as pw:
                browser = await pw.chromium.connect_over_cdp(session.websocket_url)
                context = browser.contexts[0]
                page = context.pages[0] if context.pages else await context.new_page()
                page = await self._prepare_reddit_access(page)
                await self._dream(page)
                if self.persona.name == "Yusuf" and self.has_task:
                    await self._hold_yusuf_session(page)

            self.state.status = "done"
            self._emit(note="kicked back to reality")
        except _Stopped:
            self.state.status = "stopped"
            self._emit(note="kicked early by operator")
        except Exception as exc:  # noqa: BLE001 - surface everything to the display
            self.state.status = "failed"
            self._emit(note=f"{type(exc).__name__}: {exc}"[:200])
        finally:
            if session is not None:
                await steel_client.release_session(session.id)
                if self.state.session:
                    self.state.session["status"] = "released"
                self._emit()

    # ---- the dream -------------------------------------------------------

    async def _hold_yusuf_session(self, page: Page) -> None:
        """Keep Yusuf's completed browser visible until timeout or operator kick."""
        self._emit(
            note="task complete; keeping Yusuf's browser open for 5 minutes",
            url=page.url,
        )
        for _ in range(YUSUF_COMPLETION_HOLD_SECONDS):
            self._check_stop()
            await asyncio.sleep(1)
        self._check_stop()

    async def _prepare_reddit_access(self, page: Page) -> Page:
        """Log in or sign up and return the Reddit tab for subsequent browsing."""
        saved = agent_state_store.load_or_create(self.persona.name)
        if (saved.get("steel") or {}).get("profile_id"):
            self._emit(note="checking Reddit login restored from Steel profile", url=REDDIT_HOME_URL)
            await page.goto(REDDIT_HOME_URL, wait_until="domcontentloaded")
            if await self._reddit_username(page):
                self._reddit_authenticated = True
                self._emit(0, "restored signed-in Reddit home page from Steel profile", page.url)
                return page
        email = saved.get("email")
        address = email.get("address") if isinstance(email, dict) else None
        password = email.get("password") if isinstance(email, dict) else None

        if isinstance(address, str) and address and isinstance(password, str) and password:
            self.state.email = address
            self._emit(note=f"using saved email {address}")
            await self._login_reddit(page, address, password)
            return page

        await self._ensure_email(page)
        if page is self._temp_mail_page:
            self._check_stop()
            page = await page.context.new_page()
        await self._prepare_reddit_signup(page)
        return page

    async def _ensure_email(self, page: Page) -> None:
        """Load this persona's saved email or obtain one from Temp-Mail."""
        lock = _EMAIL_LOCKS.setdefault(self.persona.name, asyncio.Lock())
        async with lock:
            saved = agent_state_store.load_or_create(self.persona.name)
            email = saved.get("email")
            if not isinstance(email, dict):
                email = {"address": None, "login": None, "password": None}
                saved["email"] = email

            address = email.get("address")
            if address:
                self.state.email = str(address)
                self._emit(note=f"using saved email {self.state.email}")
                return

            self._emit(note="opening Temp-Mail for an email address")
            hostname = urlparse(page.url).hostname or ""
            mailbox = page
            if hostname == "reddit.com" or hostname.endswith(".reddit.com"):
                mailbox = await page.context.new_page()
            self._temp_mail_page = mailbox
            await mailbox.goto(TEMP_MAIL_URL, wait_until="domcontentloaded")
            handle = await mailbox.wait_for_function(
                """
                () => {
                    const preferred = document.querySelector("#mail, input.emailbox-input");
                    const inputs = preferred ? [preferred] : [...document.querySelectorAll("input")];
                    return inputs
                        .map(input => input.value?.trim())
                        .find(value => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) || false;
                }
                """,
                timeout=30_000,
            )
            self.state.email = str(await handle.json_value())
            await self._copy_email(mailbox, self.state.email)
            email["address"] = self.state.email
            email.setdefault("login", None)
            agent_state_store.save(self.persona.name, saved)
            self._emit(note=f"saved email {self.state.email}", url=mailbox.url)

    async def _copy_email(self, page: Page, address: str) -> None:
        """Copy the generated address through the browser's real clipboard."""
        inputs = page.locator("#mail, input.emailbox-input, input")
        for index in range(await inputs.count()):
            candidate = inputs.nth(index)
            try:
                if (await candidate.input_value()).strip() != address:
                    continue
                await candidate.click()
                await candidate.press("Control+A")
                await candidate.press("Control+C")
                self._email_copied = True
                self._emit(note="copied Temp-Mail address", url=page.url)
                return
            except Exception:  # noqa: BLE001 - another matching input may work
                continue

    async def _prepare_reddit_signup(self, page: Page) -> None:
        """Enter the persona's locally stored credentials into Reddit signup."""
        if not self.state.email:
            raise RuntimeError("cannot prepare Reddit signup without an email address")

        self._check_stop()
        self._emit(note="opening Reddit signup", url=REDDIT_SIGNUP_URL)
        await install_security_key_cancellation(page)
        await page.bring_to_front()
        await page.goto(REDDIT_SIGNUP_URL, wait_until="domcontentloaded")

        field = page.locator(
            'input[name="email"], input[type="email"], input[autocomplete="email"]'
        ).first
        try:
            await field.wait_for(state="visible", timeout=15_000)
        except Exception:
            field = page.get_by_role("textbox", name="Email", exact=True).first
            await field.wait_for(state="visible", timeout=10_000)

        await field.click()
        if self._email_copied:
            await field.press("Control+V")

        # Clipboard support can vary by remote-browser image. Filling is a safe
        # fallback and also handles addresses loaded from persistent state.
        if (await field.input_value()).strip() != self.state.email:
            await field.fill(self.state.email)

        if (await field.input_value()).strip() != self.state.email:
            raise RuntimeError("Reddit email field did not retain the Temp-Mail address")
        self._emit(note="pasted email into Reddit signup", url=page.url)

        # The state-store hook creates the password when the email is saved. Give
        # that local write time to settle, then read the password back from disk
        # instead of deriving or retaining it in the browser agent.
        await asyncio.sleep(3)
        self._check_stop()
        saved = agent_state_store.load_or_create(self.persona.name)
        email = saved.get("email")
        password = email.get("password") if isinstance(email, dict) else None
        if not isinstance(password, str) or not password:
            raise RuntimeError("agent state did not contain a generated password")

        password_field = page.locator(
            'input[name="password"], input[type="password"], input[autocomplete="new-password"], '
            'input[autocomplete="current-password"]'
        ).first
        try:
            await password_field.wait_for(state="visible", timeout=2_000)
        except Exception:
            # Reddit can present email as a separate first step.
            continue_button = page.get_by_role(
                "button", name=re.compile(r"continue|next", re.IGNORECASE)
            ).first
            await continue_button.click()
            await self._verify_reddit_email(page, password_step=True)
            await password_field.wait_for(state="visible", timeout=15_000)

        await password_field.click()
        await password_field.fill(password)
        if await password_field.input_value() != password:
            raise RuntimeError("Reddit password field did not retain the generated password")
        self._emit(note="entered password from local agent state", url=page.url)

        await asyncio.sleep(2)
        self._check_stop()
        submit = page.get_by_role(
            "button", name=re.compile(r"log\s*in|sign\s*up|continue", re.IGNORECASE)
        ).first
        await submit.click()
        self._emit(note="submitted Reddit credentials", url=page.url)
        await self._verify_reddit_email(page)

    async def _verify_reddit_email(self, page: Page, *, password_step: bool = False) -> None:
        from .reddit_verification import verify_if_requested

        await verify_if_requested(self, page, password_step=password_step)

    async def _login_reddit(self, page: Page, address: str, password: str) -> None:
        """Submit a saved email and password through Reddit's login page."""
        self._check_stop()
        self._emit(note="opening Reddit home before login", url=REDDIT_HOME_URL)
        await install_security_key_cancellation(page)
        await page.goto(REDDIT_HOME_URL, wait_until="domcontentloaded")
        await self._solve_reddit_captcha(page)
        login_link = page.get_by_role(
            "link", name=re.compile(r"^\s*log\s*in\s*$", re.IGNORECASE)
        ).first
        try:
            await login_link.wait_for(state="visible", timeout=15_000)
        except PlaywrightTimeoutError:
            await self._solve_reddit_captcha(page)
            await login_link.wait_for(state="visible", timeout=15_000)
        await asyncio.sleep(2)
        self._check_stop()
        await login_link.click()
        self._emit(note="opened login from Reddit home page", url=page.url)

        identity_field = page.locator(
            'input[name="username"], input[name="email"], input[type="email"], '
            'input[autocomplete="username"]'
        ).first
        try:
            await identity_field.wait_for(state="visible", timeout=15_000)
        except Exception:
            # Reddit's challenge may appear after the initial status check.
            await self._solve_reddit_captcha(page)
            identity_field = page.get_by_role(
                "textbox", name=re.compile(r"username|email", re.IGNORECASE)
            ).first
            await identity_field.wait_for(state="visible", timeout=10_000)

        password_field = page.locator(
            'input[name="password"], input[type="password"], '
            'input[autocomplete="current-password"]'
        ).first
        await password_field.wait_for(state="visible", timeout=15_000)

        await identity_field.fill(address)
        await password_field.fill(password)
        if (
            await identity_field.input_value() != address
            or await password_field.input_value() != password
        ):
            raise RuntimeError("Reddit login fields changed before submission")
        submit = page.get_by_role(
            "button", name=re.compile(r"^\s*log\s*in\s*$", re.IGNORECASE)
        ).first

        def record_login_response(response):
            if urlparse(response.url).path == "/svc/shreddit/account/login":
                self._reddit_login_http_status = response.status

        self._reddit_login_http_status = None
        page.on("response", record_login_response)
        try:
            await submit.click()
            self._emit(note="submitted saved Reddit login", url=page.url)
            await self._verify_reddit_email(page)
            await self._wait_for_reddit_home(page)
        finally:
            page.remove_listener("response", record_login_response)

    async def _wait_for_reddit_home(self, page: Page) -> None:
        """Require the home page and a server-confirmed identity before success."""
        self._emit(note="waiting for signed-in Reddit home page")
        deadline = asyncio.get_running_loop().time() + REDDIT_LOGIN_TIMEOUT_SECONDS
        next_captcha_check = asyncio.get_running_loop().time() + 5
        errors = page.get_by_text(
            re.compile(
                r"invalid (?:email|username|password).*|incorrect (?:username|password).*|"
                r"too many (?:requests|attempts).*|.*try again (?:later|in a few).*|"
                r".*disable any extensions.*",
                re.IGNORECASE,
            )
        )
        while asyncio.get_running_loop().time() < deadline:
            self._check_stop()
            await dismiss_security_key_prompt(self, page)
            await handle_onboarding(self, page)
            if self._reddit_login_http_status and self._reddit_login_http_status >= 400:
                raise RuntimeError(
                    f"Reddit rejected the login request (HTTP {self._reddit_login_http_status}); "
                    "signed-in home page was not reached"
                )
            if asyncio.get_running_loop().time() >= next_captcha_check:
                await self._solve_reddit_captcha(page)
                next_captcha_check = asyncio.get_running_loop().time() + 5
            try:
                for index in range(await errors.count()):
                    if await errors.nth(index).is_visible():
                        raise RuntimeError(
                            "Reddit rejected the saved login or browser session; "
                            "signed-in home page was not reached"
                        )
                url = urlparse(page.url)
                if url.hostname == "www.reddit.com" and url.path in ("", "/"):
                    username = await self._reddit_username(page)
                    if isinstance(username, str) and username:
                        self._reddit_authenticated = True
                        self._emit(0, "confirmed signed-in Reddit home page", page.url)
                        return
            except PlaywrightError:
                # Navigation can replace the document while checking it.
                pass
            await asyncio.sleep(1)
        raise TimeoutError("Reddit did not reach a confirmed signed-in home page within 60 seconds")

    async def _reddit_username(self, page: Page) -> str | None:
        """Check the server identity without exposing cookies or auth tokens."""
        try:
            username = await page.evaluate("""async () => {
                try {
                    const response = await fetch('/api/me.json', {
                        credentials: 'same-origin', signal: AbortSignal.timeout(5000)
                    });
                    if (!response.ok) return null;
                    return (await response.json())?.data?.name || null;
                } catch { return null; }
            }""")
        except PlaywrightError:
            return None
        return username if isinstance(username, str) and username else None

    async def _solve_reddit_captcha(self, page: Page) -> None:
        """Detect a Reddit login CAPTCHA and let Steel solve it before typing."""
        session_id = (self.state.session or {}).get("id")
        if not session_id:
            # Direct unit-level calls do not have a live Steel session.
            return

        self._check_stop()
        states = await steel_client.captcha_status(session_id)
        captcha_states = [state for state in states if _captcha_has_challenge(state)]

        if not captcha_states:
            self._emit(note="Reddit login loaded; no CAPTCHA detected", url=page.url)
            return

        self._emit(note="CAPTCHA detected on Reddit login", url=page.url)
        initial_statuses = {
            _captcha_value(task, "status")
            for state in captcha_states
            for task in _captcha_tasks(state)
        }
        if initial_statuses and initial_statuses <= {"solved"}:
            self._emit(note="Steel solved the Reddit CAPTCHA", url=page.url)
            return
        if not any(_captcha_is_solving(state) for state in captcha_states):
            response = await steel_client.solve_captcha(session_id, url=page.url)
            if not response.success:
                raise RuntimeError(response.message or "Steel rejected the CAPTCHA solve request")
        self._emit(note="Steel is solving the Reddit CAPTCHA", url=page.url)

        solve_deadline = asyncio.get_running_loop().time() + CAPTCHA_SOLVE_TIMEOUT_SECONDS
        while asyncio.get_running_loop().time() < solve_deadline:
            self._check_stop()
            states = await steel_client.captcha_status(session_id)
            captcha_states = [state for state in states if _captcha_tasks(state)]
            statuses = {
                _captcha_value(task, "status")
                for state in captcha_states
                for task in _captcha_tasks(state)
            }
            failures = {"failed_to_solve", "validation_failed"}
            if statuses & failures:
                failed = ", ".join(sorted(statuses & failures))
                raise RuntimeError(f"Steel could not solve Reddit CAPTCHA: {failed}")
            if captcha_states and statuses and statuses <= {"solved"} and not any(
                _captcha_is_solving(state) for state in captcha_states
            ):
                self._emit(note="Steel solved the Reddit CAPTCHA", url=page.url)
                return
            await asyncio.sleep(CAPTCHA_POLL_INTERVAL_SECONDS)

        raise TimeoutError(
            f"Steel did not solve the Reddit CAPTCHA within {CAPTCHA_SOLVE_TIMEOUT_SECONDS} seconds"
        )

    async def _dream(self, page: Page) -> None:
        if not self.has_task:
            if not self._reddit_authenticated:
                await self._wait_for_reddit_home(page)
            self._emit(0, "no task assigned; staying idle for 5 minutes", page.url)
            for _ in range(LOGIN_ONLY_DWELL_SECONDS):
                self._check_stop()
                await asyncio.sleep(1)
            self._check_stop()
            self._emit(0, "login-only run complete", page.url)
            return
        if self.mode == "reddit_browse":
            from .reddit_patrol import browse_reddit

            await browse_reddit(self, page)
            return
        if self.mode == "profile_post":
            from .reddit_browser import RedditBrowser
            from .reddit_author import RedditAuthor

            post = self.profile_post
            assert post is not None
            subreddit = post["warmup_subreddit"]
            listing = f"{REDDIT_HOME_URL}r/{subreddit}/new/"
            await RedditBrowser(self, page)._open(
                listing, f"warming up in r/{subreddit} before posting",
            )
            await page.mouse.wheel(0, random.randint(240, 640))
            warmup_seconds = post.get("warmup_seconds")
            if warmup_seconds is None:
                warmup_seconds = random.uniform(2, 5)
            self._emit(2, f"browsing r/{subreddit} for {warmup_seconds:.1f} seconds", page.url)
            await asyncio.sleep(warmup_seconds)
            self._check_stop()
            self._emit(1, f'preparing profile post for "{self.state.query}"', page.url)
            result = await RedditAuthor(self, page).create_profile_post(
                post["title"], post["body"], request_id=post["request_id"],
            )
            self._emit(3, "profile post confirmed", result["url"])
            return
        await self._search(page)
        self._check_stop()
        await self._land(page)
        self._check_stop()
        await self._deepen(page)

    async def _search(self, page: Page) -> None:
        self._emit(1, "opening Google")
        await page.goto(SEARCH_URL, wait_until="domcontentloaded")
        await self._accept_consent(page)
        box = page.locator("textarea[name=q], input[name=q]").first
        await box.click()
        self._emit(1, f'typing "{self.state.query}"')
        lo, hi = self.persona.typing_delay_ms
        for ch in self.state.query:
            await page.keyboard.type(ch, delay=random.randint(lo, hi))
        await asyncio.sleep(random.uniform(0.3, 0.9))
        await page.keyboard.press("Enter")
        await page.wait_for_load_state("domcontentloaded")
        self._emit(1, "reading the results", page.url)
        await self._scroll(page, passes=random.randint(1, 2))
        await asyncio.sleep(dwell(DWELL_SERP))

    async def _land(self, page: Page) -> None:
        host = _host(self.state.target)
        links = page.locator(f'a[href*="{host}"]:visible')
        n = await links.count()
        if n == 0:
            self._emit(2, f"{host} not on page 1 - going direct (weak signal)")
            await page.goto(self.state.target, wait_until="domcontentloaded")
        else:
            self._emit(2, f"found {host} in results - clicking")
            link = links.first
            await link.scroll_into_view_if_needed()
            await asyncio.sleep(random.uniform(0.4, 1.2))
            await link.click()
            await page.wait_for_load_state("domcontentloaded")
        self._emit(2, "landed", page.url)
        await self._scroll(page, passes=random.randint(*self.persona.scroll_passes))
        await asyncio.sleep(dwell(DWELL_LANDING))

    async def _deepen(self, page: Page) -> None:
        host = _host(self.state.target)
        for depth in range(self.persona.max_depth):
            self._check_stop()
            level = 3 + depth
            internal = page.locator(f'a[href^="/"]:visible, a[href*="{host}"]:visible')
            n = await internal.count()
            if n == 0:
                self._emit(level, "no internal links left - surfacing")
                return
            link = internal.nth(random.randrange(min(n, 25)))
            text = ((await link.inner_text()) or "").strip()[:40] or "(no text)"
            self._emit(level, f"following '{text}'")
            try:
                await link.scroll_into_view_if_needed()
                await asyncio.sleep(random.uniform(0.3, 1.0))
                await link.click(timeout=8000)
                await page.wait_for_load_state("domcontentloaded")
            except Exception:  # noqa: BLE001 - dead link, try the next depth
                self._emit(level, "link went nowhere - trying another")
                continue
            self._emit(level, "reading", page.url)
            await self._scroll(page, passes=random.randint(*self.persona.scroll_passes))
            await asyncio.sleep(dwell(DWELL_DEEP))

    # ---- helpers ---------------------------------------------------------

    async def _scroll(self, page: Page, passes: int) -> None:
        for _ in range(passes):
            self._check_stop()
            await page.mouse.wheel(0, random.randint(250, 900))
            await asyncio.sleep(random.uniform(0.5, 1.8))
        if random.random() < 0.3:
            await page.mouse.wheel(0, -random.randint(150, 500))
            await asyncio.sleep(random.uniform(0.4, 1.0))

    async def _accept_consent(self, page: Page) -> None:
        # EU exit nodes get the consent wall; click through if present.
        btn = page.get_by_role("button", name="Accept all").first
        try:
            await btn.click(timeout=2500)
        except Exception:  # noqa: BLE001
            pass

    def _check_stop(self) -> None:
        if self._stop.is_set():
            raise _Stopped()


class _Stopped(Exception):
    pass


def _host(url: str) -> str:
    return urlparse(url if "://" in url else f"https://{url}").hostname or url


def _captcha_value(item, name: str):
    if isinstance(item, dict):
        return item.get(name)
    return getattr(item, name, None)


def _captcha_tasks(state) -> list:
    return _captcha_value(state, "tasks") or []


def _captcha_has_challenge(state) -> bool:
    non_challenge_statuses = {None, "undetected", "failed_to_detect"}
    return any(
        _captcha_value(task, "status") not in non_challenge_statuses
        for task in _captcha_tasks(state)
    )


def _captcha_is_solving(state) -> bool:
    return bool(
        _captcha_value(state, "is_solving_captcha")
        or _captcha_value(state, "isSolvingCaptcha")
    )
