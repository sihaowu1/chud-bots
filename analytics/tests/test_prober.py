"""The SERP parser is the least-derivable code here: real headless Chromium against a
Google-shaped DOM fixture (ads in the main column, sitelinks, People-Also-Ask, an AI
Overview, a /url?q= redirect). Needs `uv run playwright install chromium` once."""

import unittest
from pathlib import Path

from playwright.async_api import async_playwright

from analytics.metrics import host_of, registrable
from analytics.prober import _EXTRACT_JS, looks_blocked

FIXTURE = Path(__file__).parent / "serp_fixture.html"

BLOCK_HTML = """<!doctype html><html><body>
<div>Our systems have detected unusual traffic from your computer network.</div>
<form id="captcha-form"></form></body></html>"""

FEATURED_HTML = """<!doctype html><html><body><div id="search"><div id="rso">
  <div class="MjjYud xpdopen" data-hveid="f1"><div class="g">
     <a href="https://www.example.com/answer"><h3>Example - the answer</h3></a></div></div>
  <div class="MjjYud" data-hveid="n1"><div class="g">
     <a href="https://plain.com/x"><h3>Plain result</h3></a></div></div>
</div></div></body></html>"""


class ParserTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._pw = await async_playwright().start()
        try:
            self._browser = await self._pw.chromium.launch()
        except Exception as exc:  # noqa: BLE001
            await self._pw.stop()
            self.skipTest(f"Chromium unavailable ({exc}); run `uv run playwright install chromium`")
        self.page = await self._browser.new_page()

    async def asyncTearDown(self):
        await self._browser.close()
        await self._pw.stop()

    async def _rows(self):
        await self.page.goto(FIXTURE.as_uri())
        return await self.page.evaluate(_EXTRACT_JS)

    async def test_only_organic_results_in_dom_order(self):
        rows = await self._rows()
        self.assertEqual([r["host"] for r in rows], [
            "www.example.com", "roaster-b.com", "roaster-c.co.uk", "blog.example.com", "roaster-d.com",
        ])

    async def test_url_redirect_is_unwrapped_and_sitelinks_fold(self):
        rows = await self._rows()
        self.assertEqual(rows[0]["href"], "https://www.example.com/cold-brew")
        self.assertEqual([r["host"] for r in rows].count("www.example.com"), 1)

    async def test_target_matches_on_registrable_domain(self):
        rows = await self._rows()
        want = registrable(host_of("https://example.com"))
        positions = [i for i, r in enumerate(rows, 1) if registrable(r["host"]) == want]
        self.assertEqual(positions, [1, 4])

    async def test_featured_snippet_flag(self):
        await self.page.set_content(FEATURED_HTML)
        rows = await self.page.evaluate(_EXTRACT_JS)
        self.assertEqual([r["featured"] for r in rows], [True, False])

    async def test_block_wall_detected_but_normal_serp_is_not(self):
        await self.page.set_content(BLOCK_HTML)
        self.assertIsNotNone(await looks_blocked(self.page))
        await self.page.goto(FIXTURE.as_uri())
        self.assertIsNone(await looks_blocked(self.page))

    async def test_page_without_results_container_yields_none(self):
        await self.page.set_content("<html><body><p>nothing here</p></body></html>")
        self.assertIsNone(await self.page.evaluate(_EXTRACT_JS))


if __name__ == "__main__":
    unittest.main()
