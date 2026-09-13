import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from backend.analytics import app as service, scraper
from backend.analytics.store import Store


class DiscoveryTests(unittest.IsolatedAsyncioTestCase):
    def test_canonical_urls(self):
        self.assertEqual(scraper.canonical_url("https://old.reddit.com/r/python/comments/abc/title/?x=1"),
                         "https://www.reddit.com/r/python/comments/abc/")
        for url in ["https://evil.com/r/python/comments/abc/title", "javascript:alert(1)",
                    "https://www.reddit.com/r/python/comments/abc/title/comment123/", "/r/python/"]:
            self.assertIsNone(scraper.canonical_url(url))

    def test_durable_results(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "runs.sqlite"
            store = Store(path)
            run = {"id": "one", "createdAt": 1, "findings": [{"url": "source"}]}
            store.save(run)
            store.db.close()
            restored = Store(path)
            self.assertEqual(restored.snapshot()["runs"][0]["findings"], run["findings"])
            restored.db.close()

    async def test_explore_deduplicates_classifies_and_releases(self):
        page = MagicMock()
        page.goto = AsyncMock(return_value=SimpleNamespace(status=200))
        page.wait_for_timeout = AsyncMock()
        page.mouse.wheel = AsyncMock()
        locator = MagicMock()
        locator.first = locator
        locator.count = AsyncMock(return_value=1)
        locator.inner_text = AsyncMock(return_value="A discussion about Canadian hackathons")
        locator.get_attribute = AsyncMock(side_effect=lambda key: {"post-title": "Hackathon advice", "author": "tester"}.get(key))
        locator.evaluate_all = AsyncMock(return_value=["/r/hackathons/comments/abc/title", "/r/hackathons/comments/abc/title/?q=1"])
        page.locator.return_value = locator
        context = SimpleNamespace(new_page=AsyncMock(return_value=page))
        browser = SimpleNamespace(contexts=[context])
        pw = SimpleNamespace(chromium=SimpleNamespace(connect_over_cdp=AsyncMock(return_value=browser)))
        manager = MagicMock()
        manager.__aenter__ = AsyncMock(return_value=pw)
        manager.__aexit__ = AsyncMock(return_value=False)
        session = SimpleNamespace(id="session", websocket_url="wss://example", session_viewer_url="https://example")
        run = {"id": "run", "prompt": "Canadian hackathons", "limit": 3, "events": [], "findings": []}
        with patch.object(scraper, "async_playwright", return_value=manager), \
             patch.object(scraper.steel_client, "create_session", AsyncMock(return_value=session)), \
             patch.object(scraper.steel_client, "release_session", AsyncMock()) as release, \
             patch.object(scraper, "model_output", AsyncMock(side_effect=[scraper.QueryPlan(queries=["hackathons"]), scraper.Assessment(relevant=True, score=91, reason="Discusses the topic")])):
            await scraper.explore(run, lambda value: None)
        self.assertEqual(run["status"], "completed")
        self.assertEqual(run["discovered"], 1)
        self.assertEqual(len(run["findings"]), 1)
        self.assertEqual(run["findings"][0]["score"], 91)
        self.assertIn("Canadian hackathons", run["findings"][0]["text"])
        release.assert_awaited_once_with("session")

    async def test_browser_failure_releases_session_and_redacts_url(self):
        session = SimpleNamespace(id="session", websocket_url="secret", session_viewer_url="https://example")
        run = {"id": "run", "prompt": "topic", "limit": 1, "events": [], "findings": []}
        with patch.object(scraper, "model_output", AsyncMock(return_value=scraper.QueryPlan(queries=["topic"]))), \
             patch.object(scraper.steel_client, "create_session", AsyncMock(return_value=session)), \
             patch.object(scraper.steel_client, "release_session", AsyncMock()) as release, \
             patch.object(scraper, "async_playwright", side_effect=ValueError("wss://secret")):
            await scraper.explore(run, lambda value: None)
        self.assertEqual(run["status"], "failed")
        self.assertNotIn("secret", run["error"])
        release.assert_awaited_once_with("session")

    async def test_cancellation_keeps_results(self):
        run = {"id": "run", "prompt": "topic", "events": [], "findings": [{"url": "existing"}]}
        with patch.object(scraper, "model_output", AsyncMock(side_effect=asyncio.CancelledError)):
            await scraper.explore(run, lambda value: None)
        self.assertEqual(run["status"], "stopped")
        self.assertEqual(len(run["findings"]), 1)

    async def test_api_configuration_validation_and_overlap(self):
        from fastapi import HTTPException
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            service.StartRun(prompt="   ")
        with self.assertRaises(ValidationError):
            service.StartRun(prompt="topic", limit=31)
        with patch.object(service.config, "STEEL_API_KEY", ""):
            with self.assertRaises(HTTPException) as raised:
                await service.start(service.StartRun(prompt="topic"))
            self.assertEqual(raised.exception.status_code, 503)
        task = asyncio.create_task(asyncio.sleep(10))
        with patch.dict(service.active, {"active": task}), \
             patch.object(service.config, "STEEL_API_KEY", "test"), \
             patch.object(service.config, "OPENAI_API_KEY", "test"):
            with self.assertRaises(HTTPException) as raised:
                await service.start(service.StartRun(prompt="topic"))
            self.assertEqual(raised.exception.status_code, 409)
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


if __name__ == "__main__":
    unittest.main()
