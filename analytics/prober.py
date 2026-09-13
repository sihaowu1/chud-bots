"""Google probes: one throwaway Steel session per query takes two measurements.

  * Search presence - where the campaign's domain ranks organically for the query.
  * Reddit presence - whether Google's `site:reddit.com <query>` results name the campaign.

Reddit is measured through Google rather than Reddit itself: Reddit's keyless search is
IP-blocked and its official API needs registered credentials. So this measures the Reddit
discussion Google surfaces for the query - the material an AI Overview draws on - judged
from result titles and snippets only.

A probe is a measurement, not a visit - it navigates straight to results URLs and never
clicks through. Constraints that shape it:

  * Google stopped honouring `num` in Sept 2025: always 10 results per page, so depth
    costs page loads. Ranking parses page one always, deeper pages only while the target
    is still missing.
  * A blocked page measured nothing. It raises ProbeBlocked and must never be recorded
    as "not found" or "not mentioned" - that would invent a collapse in the trend.
"""

import asyncio
import random
from urllib.parse import quote_plus

from playwright.async_api import async_playwright

from backend import steel_client

from . import config
from .metrics import host_of, registrable

RESULTS_PER_PAGE = 10

# Own session budget, separate from backend's MAX_AGENTS, so a busy fleet can't starve
# measurement and a stuck probe can't wedge a dreamer launch.
_slot = asyncio.Semaphore(config.MAX_PROBES)
SLOT_TIMEOUT_S = 60

# Pre-setting consent is deterministic and saves a 2.5s timeout on every page load.
_CONSENT_COOKIE = {
    "name": "SOCS",
    "value": "CAESHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmRlIAEaBgiA_LyaBg",
    "domain": ".google.com",
    "path": "/",
}

# Shown instead of results when a site: search genuinely has no matches.
_NO_RESULTS_NOTICES = ("did not match any documents", "no results found for")

# One pass in the page beats a locator per result: fewer round trips, and it can express
# "skip a link whose result block already gave us one", which is what kills sitelinks.
_EXTRACT_JS = """
() => {
  const root = document.querySelector('#rso') || document.querySelector('#search');
  if (!root) return null;
  const out = [];
  const seen = new Set();
  const AD = '[data-text-ad], #tads, #tadsb, #bottomads, .uEierd, [aria-label="Ads"]';
  const BAD_HOST = /(^|\\.)google\\.[a-z.]+$|googleusercontent|googleadservices|gstatic\\.com/;
  // Best-effort featured-snippet markers. A false negative is harmless; a false
  // positive would misexplain a jump to the top, so keep this set narrow.
  const FEATURED = '.xpdopen, .kp-blk, .g-blk, block-component';

  for (const a of root.querySelectorAll('a[href]:has(h3)')) {
    if (a.closest(AD)) continue;
    if (a.closest('[data-subtree="aio"]')) continue;   // AI Overview citations

    // Claim the result block before validating the link. Document order puts the title
    // anchor first, so claiming early means a block yields its real result or nothing -
    // never a sitelink quietly promoted into the slot its parent failed to fill.
    const box = a.closest('div.MjjYud, div.g, [data-hveid]') || a;
    if (seen.has(box)) continue;
    seen.add(box);

    // a.href is resolved, so test the raw attribute for Google's /url?q= wrapper and
    // the resolved form for the absolute variant.
    const raw = a.getAttribute('href') || '';
    let href = a.href;
    if (raw.startsWith('/url?') || /^https?:\\/\\/(www\\.)?google\\.[^/]+\\/url\\?/.test(href)) {
      try {
        const sp = new URL(href, location.href).searchParams;
        const q = sp.get('q') || sp.get('url');
        if (q) href = q;
      } catch (e) { /* fall through to the validity check below */ }
    }
    if (!/^https?:/.test(href)) continue;

    let host;
    try { host = new URL(href).hostname; } catch (e) { continue; }
    if (BAD_HOST.test(host)) continue;

    const h3 = a.querySelector('h3');
    const title = h3 ? h3.innerText.trim() : '';
    // Snippet class names rotate; the result block's text minus its title is stable.
    const snippet = (box.innerText || '').replace(title, '').replace(/\\s+/g, ' ').trim().slice(0, 400);
    const featured = !!(a.closest(FEATURED) || (box.querySelector && box.querySelector(FEATURED)));
    out.push({ href, host, title, snippet, featured });
  }
  return out;
}
"""


class ProbeBlocked(Exception):
    """Google served a captcha or a /sorry/ interstitial."""

    def __init__(self, marker: str = ""):
        super().__init__(f"blocked by Google ({marker})")
        self.marker = marker


async def looks_blocked(page) -> str | None:
    """A marker if Google is showing a block wall, else None. Without this a block
    surfaces as an opaque selector timeout, indistinguishable from a layout change."""
    try:
        if "/sorry/" in page.url:
            return "sorry-redirect"
        if await page.locator("#captcha-form, form#captcha-form, iframe[src*='recaptcha']").count():
            return "captcha-form"
        body = (await page.locator("body").inner_text(timeout=2000)).lower()
        for phrase in ("unusual traffic", "systems have detected", "not a robot"):
            if phrase in body:
                return phrase
    except Exception:  # noqa: BLE001 - detection must never be the thing that fails
        return None
    return None


# Steel's auto-captcha-solving resolves Google's /sorry/ wall in the background - measured
# around 15s for a plain reCAPTCHA - then Google redirects the page on to the real result.
# A single check right after domcontentloaded catches the wall mid-solve and calls a
# temporary state a permanent block, so poll instead of failing on the first look.
UNBLOCK_TIMEOUT_S = 40.0
UNBLOCK_POLL_S = 3.0


async def _wait_for_unblock(page) -> str | None:
    """The marker if the wall is still up after UNBLOCK_TIMEOUT_S, else None.

    Reads the module constants at call time rather than as default parameter values,
    which are frozen at def time - a test patching UNBLOCK_TIMEOUT_S after import
    would otherwise silently have no effect and wait out the real 40s default.
    """
    loop = asyncio.get_event_loop()
    deadline = loop.time() + UNBLOCK_TIMEOUT_S
    marker = await looks_blocked(page)
    while marker and loop.time() < deadline:
        await asyncio.sleep(UNBLOCK_POLL_S)
        marker = await looks_blocked(page)
    return marker


async def _open_page(pw, session):
    browser = await pw.chromium.connect_over_cdp(session.websocket_url)
    context = browser.contexts[0] if browser.contexts else await browser.new_context()
    try:
        await context.add_cookies([_CONSENT_COOKIE])
    except Exception:  # noqa: BLE001 - a consent wall just costs a slower page
        pass
    return context.pages[0] if context.pages else await context.new_page()


async def _pause() -> None:
    """Human-ish gap between page loads in one session."""
    await asyncio.sleep(random.uniform(2.0, 5.0))


def _serp_url(query: str, start: int) -> str:
    # filter=0 disables the "omitted results" dedupe so positions stay stable across probes.
    return (
        f"https://www.google.com/search?q={quote_plus(query)}"
        f"&hl={config.SERP_HL}&gl={config.SERP_GL}&num=10&start={start}&pws=0&filter=0"
    )


async def _fetch_page(page, query: str, start: int) -> list[dict]:
    await page.goto(_serp_url(query, start), wait_until="domcontentloaded")

    marker = await _wait_for_unblock(page)
    if marker:
        raise ProbeBlocked(marker)

    try:
        await page.wait_for_selector("#search, #rso", timeout=8000)
    except Exception as exc:  # noqa: BLE001 - a block can present as a missing selector
        marker = await _wait_for_unblock(page)
        if marker:
            raise ProbeBlocked(marker) from exc
        return []

    return await page.evaluate(_EXTRACT_JS) or []


async def _rank(page, query: str, target: str, depth_pages: int) -> dict:
    want = registrable(host_of(target))
    results: list[dict] = []
    position: int | None = None
    target_row: dict | None = None
    pages_fetched = 0
    pos = 0  # running counter: Google returns 9-11 organic rows per page, so page*10+i drifts

    for page_index in range(depth_pages):
        if page_index:
            await _pause()
        rows = await _fetch_page(page, query, page_index * RESULTS_PER_PAGE)
        pages_fetched += 1
        if not rows:
            break
        for row in rows:
            pos += 1
            row["position"] = pos
            results.append(row)
            if position is None and registrable(row["host"]) == want:
                position = pos
                target_row = row
        if position is not None:
            break

    return {
        "query": query,
        "target": target,
        "position": position,
        "found": position is not None,
        "blocked": False,
        "is_featured": bool(target_row and target_row.get("featured")),
        "pages_fetched": pages_fetched,
        "depth": pos,
        "results": results[:RESULTS_PER_PAGE],
    }


async def _reddit_mentions(page, query: str, terms: list[str]) -> dict:
    """First page of `site:reddit.com <query>`: which reddit.com results name any term."""
    rows = await _fetch_page(page, f"site:reddit.com {query}", 0)
    if not rows:
        body = (await page.locator("body").inner_text(timeout=2000)).lower()
        if not any(notice in body for notice in _NO_RESULTS_NOTICES):
            # An empty page without Google's no-results notice is a broken load, not
            # evidence that nobody on Reddit talks about this.
            return {"status": "error", "detail": "empty results page without a no-results notice"}

    needles = [t.lower() for t in terms if t]
    reddit_rows = [r for r in rows if registrable(r["host"]) == "reddit.com"]
    hits = [
        r["href"] for r in reddit_rows
        if any(n in f"{r['title']} {r.get('snippet', '')}".lower() for n in needles)
    ]
    return {"status": "done", "checked": len(reddit_rows), "hits": hits}


async def probe(query: str, target: str, entity_name: str, depth_pages: int | None = None) -> dict:
    """Rank `target` for `query`, then check Reddit mentions of `entity_name`, in one
    session. Raises ProbeBlocked if the ranking page is walled. If only the Reddit page
    fails, the ranking is kept and `reddit.status` says why."""
    depth_pages = depth_pages or config.PROBE_DEPTH_PAGES
    session = None
    try:
        # No persona: a logged-in, history-carrying dreamer profile is exactly the
        # personalisation a measurement must avoid. STEEL_REGION pins the exit node so
        # positions stay comparable; unset, positions carry some geo noise.
        session = await steel_client.create_session(region=config.STEEL_REGION)
        async with async_playwright() as pw:
            page = await _open_page(pw, session)
            ranking = await _rank(page, query, target, depth_pages)
            await _pause()
            try:
                reddit = await _reddit_mentions(page, query, [entity_name, registrable(host_of(target))])
            except ProbeBlocked as exc:
                reddit = {"status": "blocked", "marker": exc.marker}
            except Exception as exc:  # noqa: BLE001 - a failed Reddit check keeps the ranking
                reddit = {"status": "error", "detail": f"{type(exc).__name__}: {exc}"[:300]}
    finally:
        if session is not None:
            await steel_client.release_session(session.id)

    return {**ranking, "reddit": reddit}


async def probe_guarded(query: str, target: str, entity_name: str, depth_pages: int | None = None) -> dict:
    """probe() inside the probe budget, never raising. A slot not free within
    SLOT_TIMEOUT_S returns "skipped": a skipped cycle is recoverable, a wedged one isn't."""
    try:
        await asyncio.wait_for(_slot.acquire(), timeout=SLOT_TIMEOUT_S)
    except asyncio.TimeoutError:
        return {"query": query, "target": target, "status": "skipped", "position": None,
                "found": False, "blocked": False, "results": []}
    try:
        out = await probe(query, target, entity_name, depth_pages)
        out["status"] = "done"
        return out
    except ProbeBlocked as exc:
        return {"query": query, "target": target, "status": "blocked", "position": None,
                "found": False, "blocked": True, "marker": exc.marker, "results": []}
    except Exception as exc:  # noqa: BLE001 - one bad probe must not kill the loop
        return {"query": query, "target": target, "status": "error", "position": None,
                "found": False, "blocked": False, "results": [],
                "detail": f"{type(exc).__name__}: {exc}"[:300]}
    finally:
        _slot.release()
