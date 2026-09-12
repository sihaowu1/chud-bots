"""One dreamer. Drives a single Steel session through the dream levels:

  L0  wake      - Steel session created, Playwright attached over CDP
  L1  search    - type the query into Google
  L2  land      - find the target domain in the results and click it
  L3+ deepen    - scroll, dwell, follow internal links
  kick          - release the session
"""

import asyncio
import random
import uuid
from dataclasses import dataclass, field
from urllib.parse import urlparse

from playwright.async_api import Page, async_playwright

from . import events, steel_client
from .personas import DWELL_DEEP, DWELL_LANDING, DWELL_SERP, Persona, dwell

SEARCH_URL = "https://www.google.com/?hl=en"


@dataclass
class AgentState:
    id: str
    persona: str
    query: str
    target: str
    level: int = 0
    status: str = "queued"  # queued | running | done | failed | stopped
    session: dict | None = None
    url: str | None = None
    note: str = ""
    traits: list[str] = field(default_factory=list)

    def snapshot(self) -> dict:
        return {
            "id": self.id,
            "persona": self.persona,
            "query": self.query,
            "target": self.target,
            "level": self.level,
            "status": self.status,
            "session": self.session,
            "url": self.url,
            "note": self.note,
            "traits": self.traits,
        }


class Dreamer:
    def __init__(self, persona: Persona, query: str, target: str):
        self.persona = persona
        self.state = AgentState(
            id=uuid.uuid4().hex[:8],
            persona=persona.name,
            query=query,
            target=target,
            traits=persona.traits,
        )
        self._stop = asyncio.Event()
        self.task: asyncio.Task | None = None

    # ---- lifecycle -------------------------------------------------------

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
            self._emit(0, "waking up a Steel session")
            session = await steel_client.create_session(mobile=self.persona.mobile)
            self.state.session = steel_client.session_summary(session)
            self._emit(0, f"session {session.id[:8]} live")

            async with async_playwright() as pw:
                browser = await pw.chromium.connect_over_cdp(session.websocket_url)
                context = browser.contexts[0]
                page = context.pages[0] if context.pages else await context.new_page()
                await self._dream(page)

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

    async def _dream(self, page: Page) -> None:
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
