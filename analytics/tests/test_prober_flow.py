"""prober.probe() end to end against a local fake Google: ranking pagination via &start=,
the running position counter across pages of 9/11/10 results, early exit once found,
blocked pages, and the site:reddit.com mention check in the same session. No live
Google, no Steel session."""

import http.server
import socketserver
import threading
import unittest
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, quote_plus, urlparse

from playwright.async_api import async_playwright

from analytics import prober
from backend import steel_client

BLOCK_HTML = ('<!doctype html><html><body><form id="captcha-form"></form>'
              '<div>unusual traffic</div></body></html>')

# Simulates Steel's background auto-captcha-solving: the wall is up when the page first
# loads, then something outside our control (the solver finishing) navigates the page on
# to the real result - reproducing what a live run showed happening around 15s in.
SELF_CLEARING_BLOCK_HTML = (
    '<!doctype html><html><body><form id="captcha-form"></form><div>unusual traffic</div>'
    "<script>setTimeout(() => { location.href = location.href + '&cleared=1'; }, 20);</script>"
    "</body></html>"
)
NO_RESULTS_HTML = ('<!doctype html><html><body><div id="search"><div id="rso"></div></div>'
                   '<p>Your search - site:reddit.com cold brew - did not match any documents.</p></body></html>')
REDDIT_Q = "site:reddit.com "


def _page_html(rows: list[tuple[str, str, str]]) -> str:
    blocks = "".join(
        f'<div class="MjjYud" data-hveid="h{i}"><div class="g">'
        f'<a href="https://{host}{path}"><h3>{title}</h3></a><span>snippet {i}</span></div></div>'
        for i, (host, path, title) in enumerate(rows)
    )
    return f'<!doctype html><html><body><div id="search"><div id="rso">{blocks}</div></div></body></html>'


def _hosts(hosts: list[str]) -> list[tuple[str, str, str]]:
    return [(h, "/p", h) for h in hosts]


REDDIT_PAGE = _page_html([
    ("www.reddit.com", "/r/automation/1", "Anyone switched to Example for this?"),
    ("www.reddit.com", "/r/automation/2", "Zapier vs Make"),
    ("www.quora.com", "/q/3", "Is Example any good?"),  # names it, but isn't Reddit
])


class _FakeGoogle(http.server.BaseHTTPRequestHandler):
    blocked = False
    reddit_mode = "results"   # results | blocked | empty
    requests: list[tuple[str, int]] = []

    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        q, start = qs.get("q", [""])[0], int(qs.get("start", ["0"])[0])
        _FakeGoogle.requests.append((q, start))
        if _FakeGoogle.blocked == "clears" and "cleared" not in qs:
            body = SELF_CLEARING_BLOCK_HTML
        elif _FakeGoogle.blocked is True:
            body = BLOCK_HTML
        elif q.startswith(REDDIT_Q):
            body = {"results": REDDIT_PAGE, "blocked": BLOCK_HTML, "empty": NO_RESULTS_HTML}[_FakeGoogle.reddit_mode]
        elif start == 0:
            body = _page_html(_hosts([f"a{i}.com" for i in range(9)]))
        elif start == 10:
            body = _page_html(_hosts([f"b{i}.com" for i in range(11)]))
        else:
            body = _page_html(_hosts([f"c{i}.com" for i in range(4)] + ["example.com"] + [f"d{i}.com" for i in range(5)]))
        raw = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, *args):
        pass


def _ranking_starts() -> list[int]:
    return [start for q, start in _FakeGoogle.requests if not q.startswith(REDDIT_Q)]


def _reddit_requests() -> list[str]:
    return [q for q, _ in _FakeGoogle.requests if q.startswith(REDDIT_Q)]


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
        _FakeGoogle.reddit_mode = "results"
        _FakeGoogle.requests = []

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
            (prober, "_serp_url", lambda q, start: f"http://127.0.0.1:{port}/search?q={quote_plus(q)}&start={start}"),
            (prober, "_open_page", open_local_page),
            (prober, "_pause", AsyncMock()),
            # The fixture's "blocked" mode never clears; keep the retry-wait real but short
            # so those tests don't spend real seconds polling a wall that won't come down.
            (prober, "UNBLOCK_TIMEOUT_S", 0.05),
            (prober, "UNBLOCK_POLL_S", 0.01),
            (steel_client, "create_session", AsyncMock(return_value=type("S", (), {"id": "local"})())),
            (steel_client, "release_session", AsyncMock()),
        ]:
            patcher = patch.object(target, attr, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    async def test_position_counter_survives_variable_page_sizes(self):
        r = await prober.probe("cold brew", "https://example.com", "Example", depth_pages=3)
        self.assertEqual(_ranking_starts(), [0, 10, 20])
        # 9 + 11 rows, then the 5th row of page 3. page*10+i would say 21, not 25.
        self.assertEqual(r["position"], 25)
        self.assertEqual(len(r["results"]), 10)
        # One session for both measurements; no persona profile, region from STEEL_REGION.
        steel_client.create_session.assert_awaited_once_with(region=None)

    async def test_wall_that_clears_mid_poll_is_not_a_block(self):
        """Reproduces a real run: Google walled the very first request, then Steel's
        auto-captcha-solving cleared it about 15s in and the page moved on by itself."""
        with patch.object(prober, "UNBLOCK_TIMEOUT_S", 2.0), patch.object(prober, "UNBLOCK_POLL_S", 0.05):
            _FakeGoogle.blocked = "clears"
            r = await prober.probe("cold brew", "https://a3.com", "A3", depth_pages=1)
        self.assertEqual(r["position"], 4)

    async def test_early_exit_when_found_on_page_one(self):
        r = await prober.probe("cold brew", "https://a3.com", "A3", depth_pages=3)
        self.assertEqual(_ranking_starts(), [0])
        self.assertEqual(r["position"], 4)

    async def test_absent_target_is_not_found_not_a_rank(self):
        r = await prober.probe("cold brew", "https://nowhere-at-all.com", "Nowhere", depth_pages=3)
        self.assertIsNone(r["position"])
        self.assertFalse(r["found"])
        self.assertEqual(r["pages_fetched"], 3)

    async def test_reddit_mentions_count_only_reddit_results_naming_the_entity(self):
        r = await prober.probe("cold brew", "https://example.com", "Example", depth_pages=3)
        self.assertEqual(_reddit_requests(), ["site:reddit.com cold brew"])
        self.assertEqual(r["reddit"], {
            "status": "done", "checked": 2,
            "hits": ["https://www.reddit.com/r/automation/1"],
        })

    async def test_reddit_no_results_notice_is_a_measured_zero(self):
        _FakeGoogle.reddit_mode = "empty"
        r = await prober.probe("cold brew", "https://example.com", "Example", depth_pages=3)
        self.assertEqual(r["reddit"], {"status": "done", "checked": 0, "hits": []})

    async def test_blocked_reddit_page_keeps_the_ranking(self):
        _FakeGoogle.reddit_mode = "blocked"
        r = await prober.probe("cold brew", "https://example.com", "Example", depth_pages=3)
        self.assertEqual(r["position"], 25)
        self.assertEqual(r["reddit"]["status"], "blocked")

    async def test_blocked_ranking_is_missing_data(self):
        _FakeGoogle.blocked = True
        with self.assertRaises(prober.ProbeBlocked):
            await prober.probe("cold brew", "https://example.com", "Example", depth_pages=3)
        guarded = await prober.probe_guarded("cold brew", "https://example.com", "Example")
        self.assertEqual((guarded["status"], guarded["position"], guarded["blocked"]), ("blocked", None, True))
        steel_client.release_session.assert_awaited()


if __name__ == "__main__":
    unittest.main()
