"""prober.probe() end to end against a local fake Google: pagination via &start=, the
running position counter across pages of 9/11/10 results, early exit once found, and
the blocked path. No live Google, no Steel session."""

import http.server
import socketserver
import threading
import unittest
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

from playwright.async_api import async_playwright

from analytics import prober
from backend import steel_client

BLOCK_HTML = ('<!doctype html><html><body><form id="captcha-form"></form>'
              '<div>unusual traffic</div></body></html>')


def _page_html(hosts: list[str]) -> str:
    blocks = "".join(
        f'<div class="MjjYud" data-hveid="h{i}"><div class="g">'
        f'<a href="https://{h}/p"><h3>{h}</h3></a></div></div>'
        for i, h in enumerate(hosts)
    )
    return f'<!doctype html><html><body><div id="search"><div id="rso">{blocks}</div></div></body></html>'


class _FakeGoogle(http.server.BaseHTTPRequestHandler):
    blocked = False
    starts: list[int] = []

    def do_GET(self):
        start = int(parse_qs(urlparse(self.path).query).get("start", ["0"])[0])
        _FakeGoogle.starts.append(start)
        if _FakeGoogle.blocked:
            body = BLOCK_HTML
        elif start == 0:
            body = _page_html([f"a{i}.com" for i in range(9)])
        elif start == 10:
            body = _page_html([f"b{i}.com" for i in range(11)])
        else:
            body = _page_html([f"c{i}.com" for i in range(4)] + ["example.com"] + [f"d{i}.com" for i in range(5)])
        raw = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, *args):
        pass


class ProbeFlowTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = socketserver.TCPServer(("127.0.0.1", 0), _FakeGoogle)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    async def asyncSetUp(self):
        _FakeGoogle.blocked = False
        _FakeGoogle.starts = []

        self._pw = await async_playwright().start()
        try:
            browser = await self._pw.chromium.launch()
        except Exception as exc:  # noqa: BLE001
            await self._pw.stop()
            self.skipTest(f"Chromium unavailable ({exc}); run `uv run playwright install chromium`")
        self.addAsyncCleanup(self._pw.stop)
        self.addAsyncCleanup(browser.close)

        async def open_local_page(_pw, _session):
            return await browser.new_page()

        port = self.port
        for target, attr, value in [
            (prober, "_serp_url", lambda q, start: f"http://127.0.0.1:{port}/search?q={q}&start={start}"),
            (prober, "_open_page", open_local_page),
            (steel_client, "create_session", AsyncMock(return_value=type("S", (), {"id": "local"})())),
            (steel_client, "release_session", AsyncMock()),
        ]:
            patcher = patch.object(target, attr, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    async def test_position_counter_survives_variable_page_sizes(self):
        r = await prober.probe("cold brew", "https://example.com", depth_pages=3)
        self.assertEqual(_FakeGoogle.starts, [0, 10, 20])
        # 9 + 11 rows, then the 5th row of page 3. page*10+i would say 25 -> 21.
        self.assertEqual(r["position"], 25)
        self.assertEqual(len(r["results"]), 10)
        # No persona profile; region comes from STEEL_REGION (unset in tests).
        steel_client.create_session.assert_awaited_once_with(region=None)

    async def test_early_exit_when_found_on_page_one(self):
        r = await prober.probe("cold brew", "https://a3.com", depth_pages=3)
        self.assertEqual(_FakeGoogle.starts, [0])
        self.assertEqual(r["position"], 4)

    async def test_absent_target_is_not_found_not_a_rank(self):
        r = await prober.probe("cold brew", "https://nowhere-at-all.com", depth_pages=3)
        self.assertIsNone(r["position"])
        self.assertFalse(r["found"])
        self.assertEqual(r["pages_fetched"], 3)

    async def test_blocked_probe_is_missing_data(self):
        _FakeGoogle.blocked = True
        with self.assertRaises(prober.ProbeBlocked):
            await prober.probe("cold brew", "https://example.com", depth_pages=3)
        guarded = await prober.probe_guarded("cold brew", "https://example.com")
        self.assertEqual((guarded["status"], guarded["position"], guarded["blocked"]), ("blocked", None, True))
        steel_client.release_session.assert_awaited()


if __name__ == "__main__":
    unittest.main()
