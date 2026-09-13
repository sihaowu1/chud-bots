# analytics/

Discoverability measurements: presence probes across Google search, Reddit, and AI
answers, and the endpoints that feed the dashboard. Runs inside the backend server
(`backend/main.py` includes the router and starts/stops the probe loop). Design
reference: `docs/analytics-backend-plan.md`.

## Running

```
uv run uvicorn backend.main:app --reload      # API + probe loop (port 8000)
cd frontend && npm run dev                     # dashboard reaches it via /backend
.venv/bin/python -m unittest discover -s analytics/tests -t .
```

The parser tests drive a real headless Chromium: `uv run playwright install chromium` once.
The database is `analytics/data/analytics.db` (gitignored; override with `ANALYTICS_DB_PATH`).

## What the frontend reads from here

`frontend/src/lib/analytics/store.ts` polls these every 30s through the `/backend`
proxy. There is no mock fallback: unreachable → "Backend unreachable", nothing
measured yet → "No presence measurements yet".

| path | used by |
|------|---------|
| `GET /api/discoverability/surfaces` | score breakdown rows Community / Search / AI Answer Presence, and the headline score |
| `GET /api/discoverability/queries` | target queries table (Reddit, search, AI, 7d trend) |
| `GET /api/discoverability/series?days=14` | visibility chart (Discoverability) and visibility trend (Analytics) |

Still static in the frontend, because nothing in the backend produces the data yet:
opportunity volume, topics, workload and rejection reasons (Analytics), and the Topic
Association / Organic Mentions score rows plus per-query mention counts (Discoverability).
The headline score blends real and static rows with the design-doc weights.

Missing data is never zero: a surface with no samples is `measured: false`, a day with no
samples is `null` in the series, and the day's score uses only the measured surfaces.

## Files

| file | role |
|------|------|
| `router.py` | the three endpoints |
| `queries.py` | aggregation over `visibility_samples`, on read |
| `db.py` / `schema.sql` | sqlite: `campaigns` singleton (entity + tracked queries, seeded from `seed/campaign.json`) and `visibility_samples` |
| `schema.py` | response models, camelCase aliases |
| `visibility.py` | the probe loop: search / Reddit / AI on `VISIBILITY_INTERVAL_S` |
| `prober.py` | one Steel session per query: the campaign's organic Google rank, then Reddit mentions via `site:reddit.com` |
| `metrics.py` | rank → presence (CTR curve) and domain matching |

## Settings (repo `.env`, listed in `.env.example`)

`VISIBILITY_INTERVAL_S` (900; 0 disables), `PROBE_DEPTH_PAGES` (3), `MAX_PROBES` (1 — keep
`MAX_AGENTS + MAX_PROBES` within the Steel plan cap), `SERP_GL`/`SERP_HL`, `STEEL_REGION`
(pins the probe's exit node), `AI_PROBE_API_KEY` (unset = off), `AI_PROBE_MODEL`,
`AI_PROBE_MAX_CALLS_PER_DAY` (50), `ANALYTICS_DB_PATH`.

## Know before you build on it

- **Probes cost Steel sessions.** Whenever the backend runs with `STEEL_API_KEY` set, each
  cycle opens one session per query. The first cycle waits 60s so `--reload` restarts don't
  spend a session per save. Set `VISIBILITY_INTERVAL_S=0` to turn probing off.
- **A probe that didn't measure writes nothing.** Blocked, skipped, errored and disabled
  probes are missing data.
- **A block wall can take up to 40s to clear before it's real.** Steel's auto-captcha-
  solving handles Google's `/sorry/` interstitial in the background - confirmed live at
  ~15s for a plain reCAPTCHA - and Google then redirects the page on by itself. Checking
  once right after `domcontentloaded` (the original approach) caught the wall mid-solve
  and called a temporary state a permanent block; `_wait_for_unblock` polls for up to
  `UNBLOCK_TIMEOUT_S` (40s) before giving up for real. Repeated rapid probing from the
  same session escalates how often Google walls it at all - don't loop probes tightly
  while developing against live Google.
- **Reddit presence is measured through Google, not Reddit.** After ranking the query, the
  same Steel session loads `site:reddit.com <query>` and checks reddit.com results' titles
  and snippets for the campaign name or domain. Reddit's keyless search is IP-blocked and
  its API needs credentials, so this measures the Reddit discussion Google surfaces — what
  an AI Overview draws on — not every thread, and nothing beyond the snippet. A walled
  Reddit page keeps the ranking and leaves Reddit unmeasured; Google's no-results notice
  counts as a measured zero.
- **The AI probe is untested against a live key.** The disabled path and daily cap are
  covered; the Messages API call itself is not.
