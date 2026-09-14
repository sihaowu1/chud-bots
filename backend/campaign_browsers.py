"""One real, visible browser per selected campaign persona."""

import asyncio

from playwright.async_api import async_playwright

from . import config, orchestrator, steel_client
from .agent import Dreamer, LOGIN_ONLY_DWELL_SECONDS, _Stopped
from .reddit_runner import persona_lock, publish_in_session


class CampaignBrowser:
    def __init__(self, persona):
        self.dreamer = Dreamer(persona, "", "https://www.reddit.com/")
        self.ready = asyncio.Event()
        self.finished = asyncio.Event()
        self.page = None
        self.error = None

    async def run(self):
        work = asyncio.create_task(self._serve())
        stop = asyncio.create_task(self.dreamer._stop.wait())
        try:
            done, _ = await asyncio.wait((work, stop), return_when=asyncio.FIRST_COMPLETED)
            if stop in done:
                work.cancel()
                await asyncio.gather(work, return_exceptions=True)
                self.dreamer.state.status = "failed" if self.error else "stopped"
                self.dreamer._emit(note=str(self.error) if self.error else "kicked by operator")
            else:
                await work
                self.dreamer.state.status = "done"
                self.dreamer._emit(note="campaign browser idle hold complete")
        except (asyncio.CancelledError, _Stopped):
            self.dreamer.state.status = "stopped"
            self.dreamer._emit(note="campaign browser stopped")
        except Exception as exc:
            self.error = exc
            self.dreamer.state.status = "failed"
            self.dreamer._emit(note=f"{type(exc).__name__}: {exc}"[:200])
        finally:
            work.cancel()
            stop.cancel()
            await asyncio.gather(work, stop, return_exceptions=True)
            self.ready.set()
            self.dreamer._emit()

    async def _serve(self):
        session = None
        with persona_lock(self.dreamer.persona.name):
            try:
                self.dreamer.state.status = "running"
                self.dreamer._emit(0, "waking up a campaign Steel session")
                async with async_playwright() as pw:
                    async with asyncio.timeout(180):
                        session = await steel_client.create_session(
                            persona=self.dreamer.persona.name, interactive=True,
                        )
                        self.dreamer.state.session = steel_client.session_summary(session)
                        self.dreamer._emit(note="campaign Steel session live")
                        browser = await pw.chromium.connect_over_cdp(session.websocket_url)
                        context = browser.contexts[0]
                        page = context.pages[0] if context.pages else await context.new_page()
                        self.page = await self.dreamer._prepare_reddit_access(page)
                        if not self.dreamer._reddit_authenticated:
                            await self.dreamer._wait_for_reddit_home(self.page)
                    self.dreamer._emit(note="signed in; ready to execute assigned work", url=self.page.url)
                    self.ready.set()
                    await self.finished.wait()
                    self.dreamer._emit(note="campaign execution ended; staying idle for 5 minutes")
                    await asyncio.sleep(LOGIN_ONLY_DWELL_SECONDS)
            finally:
                if session is not None:
                    await steel_client.release_session(session.id)
                    self.dreamer.state.session["status"] = "released"

    async def publish(self, args):
        await self.ready.wait()
        if self.error:
            raise RuntimeError(f"{args.persona} authentication failed: {self.error}")
        self.dreamer._check_stop()
        if self.page is None or not self.dreamer._reddit_authenticated:
            raise RuntimeError(f"{args.persona} has no authenticated campaign browser")
        try:
            self.dreamer._emit(note=f"executing campaign {args.action}")
            async with asyncio.timeout(180):
                result = await publish_in_session(args, self.dreamer, self.page)
            self.dreamer._emit(note="assignment complete; idle awaiting campaign task", url=result.get("url"))
            return result
        except Exception as exc:
            self.error = exc
            self.dreamer.stop()
            raise


class CampaignBrowsers:
    def __init__(self, selected):
        chosen = orchestrator.resolve_personas(len(selected), selected)
        if len(chosen) > config.MAX_AGENTS - orchestrator.live_count():
            raise RuntimeError("Not enough available agent slots for every selected persona")
        busy = {s["persona"] for s in orchestrator.snapshot() if s["status"] in {"queued", "running"}}
        if busy.intersection(selected):
            raise RuntimeError("Selected personas already have live sessions: " + ", ".join(sorted(busy.intersection(selected))))
        self.browsers = {p.name: CampaignBrowser(p) for p in chosen}

    def start(self):
        for browser in self.browsers.values():
            orchestrator.register(browser.dreamer)
            browser.dreamer.task = asyncio.create_task(browser.run())

    async def publish(self, args):
        return await self.browsers[args.persona].publish(args)

    async def wait_ready(self):
        await asyncio.gather(*(browser.ready.wait() for browser in self.browsers.values()))
        failures = [f"{name}: {browser.error}" for name, browser in self.browsers.items() if browser.error]
        stopped = [name for name, browser in self.browsers.items() if browser.dreamer._stop.is_set()]
        if failures or stopped:
            raise RuntimeError("Campaign browser failed or stopped: " + "; ".join(failures + stopped))

    def finish(self):
        for browser in self.browsers.values():
            browser.finished.set()

    async def stop(self):
        for browser in self.browsers.values():
            browser.dreamer.stop()
        await asyncio.gather(*(browser.dreamer.task for browser in self.browsers.values()), return_exceptions=True)
