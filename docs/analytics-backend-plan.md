# Analytics backend — overview and implementation plan

Status: proposal. Frontend currently runs on mock data in `frontend/src/lib/mock/*`
and a client-side simulator; this plan describes the backend that replaces it.

## 1. What "analytics" means in this product

Every number the frontend shows is a projection of one thing: **the agent event
log**. Agents emit an event for every action (searched, discovered, classified,
scored, policy-checked, drafted, posted, engagement update). Analytics is
(a) persisting that log, (b) aggregating it, (c) serving aggregates in the
shapes the frontend already consumes.

The one exception is **visibility** (search / AI-answer / Reddit presence for a
query). That is not derivable from agent activity; it needs a scheduled probe
that samples the outside world and stores a time series.

### 1.1 Inventory — every metric the frontend renders

| Page | Widget | Frontend shape (mock file) | Derivation |
|---|---|---|---|
| Analytics | Pipeline strip (Understand→Learn) | `counters` in `store.ts`: `scanned, opportunities, inReview, posted, replies, mentions, strategyUpdates` | counts over events, per campaign, all-time or a window |
| Analytics | Opportunity volume (24 h, stacked) | `OPPORTUNITY_VOLUME[{label, scanned, relevant, rejected}]` (`analytics.ts`) | hourly buckets: `scanned` = discovery events; `relevant` = passed relevance; `rejected = scanned − relevant` |
| Analytics | Visibility trend (14 d) | `VISIBILITY_SERIES[{date, score, community, search, ai}]` (`discoverability.ts`) | daily rollup of `visibility_samples` |
| Analytics | Best-performing topics | `TOPIC_PERFORMANCE[{topic, opportunities, avgRelevance, posted}]` | group opportunities by matched query/topic |
| Analytics | Agent workload | `AGENT_WORKLOAD[{role, tasks, share}]` | count events by agent role; share = pct of total |
| Analytics | Rejection reasons | `REJECTION_SUMMARY[{reason, count}]` | count `rejected` events by `reason` |
| Discoverability | Score + breakdown | `DISCOVERABILITY_SCORE`, `SCORE_BREAKDOWN[{label, value, delta}]` | weighted blend of 5 components (see §4.3); delta vs 7 days ago |
| Discoverability | Query table | `QUERY_PRESENCE[{query, reddit, search, aiAnswer, mentions, trend, delta7d}]` | latest `visibility_samples` per query + mention counts |
| Agents | Per-agent stats | `Agent.stats{scanned, relevant, rejected, completed, quality}`, `Agent.rejections[{reason,count}]` | same counts, grouped by `agent_id` |
| Opportunities | Per-opportunity analysis | `Opportunity.analysis{entityRelevance, spamRisk, promoIntensity, communityRules}`, `engagement{replies, votes}` | stored on the opportunity row at analysis time; engagement updated by monitor events |
| Dashboard | Activity feed, plan, counters | `ActivityEvent`, `PlannedTask`, `counters` | raw event stream (SSE) + plan table |

Types are the source of truth: `frontend/src/lib/types.ts`. The backend should
return JSON that matches those interfaces field-for-field so the frontend swap
is a data-source change, not a UI change.

## 2. Architecture

```
agents ──publish()──▶ events.py (in-memory bus) ──▶ SSE /api/events   (exists today)
                            │
                            └─▶ analytics/ingest.py ──▶ SQLite (events, opportunities, …)
                                                              │
   scheduler ──▶ analytics/visibility.py (probes) ──▶ SQLite (visibility_samples)
                                                              │
                                     analytics/queries.py ◀───┘
                                              │
                                     analytics/router.py ──▶ GET /api/analytics/*
```

Decisions:

- **SQLite, single file, via `aiosqlite`.** Matches the repo's async-everywhere
  rule, zero infra for a hackathon, and the volumes (thousands of events/hour)
  are trivial. Schema lives in one `schema.sql`; migrations are "delete the file".
- **Aggregate on read, not on write.** SQL `GROUP BY` over an indexed events
  table is fast enough at this scale. No rollup tables until a query is
  measurably slow. (Exception: visibility is already a sampled series.)
- **The event log is append-only and canonical.** Opportunities and agent
  stats are *derived*; if they drift, rebuild them from events.
- **Ingest hooks the existing bus.** `events.publish()` already fans out to
  subscribers; the ingester is just another subscriber that writes rows. Agents
  don't change. This also keeps `display/` working untouched.
- **Timestamps are epoch milliseconds (int) in the API**, because the frontend
  types use `ts: number` and `Date.now()` semantics everywhere.

## 3. Event schema (what agents must emit)

Today `events.publish(kind, **data)` is free-form. Analytics needs a stable
envelope. Add `analytics/schema.py` with a pydantic model and have agents call a
thin helper (`emit_activity(...)`) that validates before publishing.

```json
{
  "kind": "activity",
  "id": "ev_01J…",              // ulid
  "ts": 1789233017861,          // epoch ms
  "campaign_id": "cmp_flowpilot",
  "agent_id": "scout-04",
  "role": "discovery",          // discovery|intent|relevance|writer|policy|monitor|visibility|strategy
  "category": "discovery",      // discovery|analysis|writing|policy|monitoring|visibility|strategy|error|system
  "action": "Thread discovered",
  "status": "new",              // searching|analyzing|new|complete|allowed|blocked|rejected|review|updated|detected|paused|error|info
  "context": "r/SaaS · \"How do you automate…\"",
  "platform": "reddit",
  "score": 94,                  // optional 0–100
  "opportunity_id": "opp_…",    // optional; links the event to a thread
  "reason": "Too old",          // optional; required when status=rejected
  "detail": { "task": "…", "summary": "…", "evidence": ["…"], "risk": "low", "metrics": [{"label":"Spam risk","value":"8%"}] },
  "metrics": { "replies": 4, "votes": 12 }   // optional numeric side-data (monitor/engagement)
}
```

Field names are `snake_case` in Python; the API layer converts to the
frontend's `camelCase` (`agentId`, `opportunityId`) in one place (`router.py`).

Rejection `reason` must be one of a fixed vocabulary so the breakdown chart is
stable: `Not relevant`, `Too old`, `Already engaged`, `Promotion restricted`,
`Low confidence`, `Tangential problem`, `Community blocks promotion`,
`No request in thread`, `Thread locked`.

## 4. Data model (`backend/analytics/schema.sql`)

```sql
CREATE TABLE events (
  id            TEXT PRIMARY KEY,
  ts            INTEGER NOT NULL,          -- epoch ms
  campaign_id   TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  role          TEXT NOT NULL,
  category      TEXT NOT NULL,
  action        TEXT NOT NULL,
  status        TEXT NOT NULL,
  context       TEXT,
  platform      TEXT,
  score         INTEGER,
  opportunity_id TEXT,
  reason        TEXT,
  detail_json   TEXT NOT NULL,             -- the `detail` object, verbatim
  metrics_json  TEXT                       -- optional numeric side-data
);
CREATE INDEX ix_events_campaign_ts ON events(campaign_id, ts);
CREATE INDEX ix_events_agent_ts    ON events(agent_id, ts);
CREATE INDEX ix_events_opp         ON events(opportunity_id);

CREATE TABLE opportunities (
  id             TEXT PRIMARY KEY,
  campaign_id    TEXT NOT NULL,
  platform       TEXT NOT NULL,
  community      TEXT NOT NULL,
  external_url   TEXT,
  title          TEXT NOT NULL,
  author         TEXT,
  excerpt        TEXT,
  intent         TEXT,
  matched_query  TEXT,                     -- which target query found it (topic performance)
  relevance      INTEGER,
  activity       TEXT,                     -- high|medium|low
  created_at     INTEGER NOT NULL,         -- thread creation, epoch ms
  discovered_at  INTEGER NOT NULL,
  status         TEXT NOT NULL,            -- new|review|approved|posted|skipped|monitoring
  analysis_json  TEXT,                     -- {whyMatch, entityRelevance, communityRules, spamRisk, promoIntensity}
  suggested_response TEXT,
  replies        INTEGER DEFAULT 0,
  votes          INTEGER DEFAULT 0,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX ix_opp_campaign_status ON opportunities(campaign_id, status);

CREATE TABLE visibility_samples (
  id           INTEGER PRIMARY KEY,
  ts           INTEGER NOT NULL,
  campaign_id  TEXT NOT NULL,
  query        TEXT NOT NULL,
  surface      TEXT NOT NULL,              -- reddit|search|ai
  presence     REAL NOT NULL,              -- 0..1 (see §4.3)
  position     INTEGER,                    -- search rank if applicable
  raw_json     TEXT                        -- what the probe saw (for debugging)
);
CREATE INDEX ix_vis_campaign_query_ts ON visibility_samples(campaign_id, query, ts);

CREATE TABLE mentions (                    -- organic mentions found by the visibility agent
  id           TEXT PRIMARY KEY,
  ts           INTEGER NOT NULL,
  campaign_id  TEXT NOT NULL,
  query        TEXT,                       -- nullable; attribute to a query when possible
  platform     TEXT NOT NULL,
  url          TEXT,
  organic      INTEGER NOT NULL DEFAULT 1  -- 0 if one of our own contributions
);

CREATE TABLE plan_tasks (                  -- the Agent Plan timeline
  id           TEXT PRIMARY KEY,
  campaign_id  TEXT NOT NULL,
  actor        TEXT NOT NULL,              -- agent_id or group label
  actor_is_group INTEGER NOT NULL DEFAULT 0,
  title        TEXT NOT NULL,
  detail_json  TEXT NOT NULL,              -- string or string[]
  due_at       INTEGER,                    -- null = "later"
  status       TEXT NOT NULL               -- scheduled|running|paused|awaiting-approval|cancelled|done
);
```

### 4.1 Derived: per-agent stats

```sql
SELECT agent_id,
  SUM(category='discovery' AND status IN ('new','rejected','complete'))          AS scanned,
  SUM(status IN ('new','allowed','complete') AND category IN ('discovery','analysis','policy')) AS relevant,
  SUM(status='rejected' OR status='blocked')                                       AS rejected,
  COUNT(*)                                                                         AS completed
FROM events WHERE campaign_id=? GROUP BY agent_id;
```

`quality` per role (0–100):
- discovery: `relevant / scanned` scaled so ~15% pass rate ≈ 80
- intent/relevance: share of its verdicts later confirmed (opportunity reached `approved`/`posted`)
- writer: drafts approved / drafts produced
- policy: 100 − (posted contributions later removed by moderators / posted)
- monitor/visibility/strategy: fixed 90–100 until there's a real signal

Keep quality in `queries.py` as pure Python over the raw counts; it is the one
number here that's a judgment call, so keep it in one function with a docstring.

### 4.2 Derived: counters (pipeline strip)

| counter | query |
|---|---|
| scanned | `COUNT(*) WHERE category='discovery' AND status IN ('new','rejected','complete')` |
| opportunities | `COUNT(*) FROM opportunities` |
| inReview | `COUNT(*) FROM opportunities WHERE status='review'` |
| posted | `COUNT(*) FROM opportunities WHERE status IN ('posted','monitoring')` |
| replies | `SUM(replies) FROM opportunities` |
| mentions | `COUNT(*) FROM mentions WHERE organic=1` |
| strategyUpdates | `COUNT(*) FROM events WHERE category='strategy'` |

### 4.3 Discoverability score

Five components, each 0–100, blended with fixed weights. Weights are a product
decision; start here and tune:

| component | source | weight |
|---|---|---|
| Community Presence | mean over target queries of latest `reddit` presence × 100 | 0.30 |
| Topic Association | share of target queries with ≥1 opportunity in 7 d | 0.20 |
| Search Presence | mean over queries of `search` presence (rank → 1/rank, capped) | 0.20 |
| AI Answer Presence | mean over queries of `ai` presence | 0.15 |
| Organic Mentions | `min(100, organic mentions in 7 d × 5)` | 0.15 |

`score = Σ weight × component`, rounded. `delta` = score now − score 7 days ago
(recompute from samples as of that timestamp). Store nothing; compute on read.
The frontend already carries the disclaimer that this is an internal metric.

Presence values per surface, produced by the probes:
- `reddit`: 1.0 if the entity is named in top-N results for the query on Reddit search, 0.5 if only in comments, 0 otherwise
- `search`: `1/position` for the entity's own domain in the top 20, else 0
- `ai`: fraction of assistants (of those probed) that named the entity

The query table maps these to labels: `presence ≥ 0.75 → detected`, `≥ 0.25 → partial`, else `none`; search: `≥ 0.5 high`, `≥ 0.2 medium`, `> 0 low`, else `none`.

## 5. API contract (`/api/analytics/*`)

All endpoints take `campaign_id` (query param; default = the only campaign for
now) and return JSON that matches `frontend/src/lib/types.ts`.

| method | path | returns |
|---|---|---|
| GET | `/api/analytics/counters` | `{scanned, opportunities, inReview, posted, replies, mentions, strategyUpdates}` |
| GET | `/api/analytics/volume?hours=24` | `[{label:"14:00", scanned, relevant, rejected}]` one per hour, oldest first |
| GET | `/api/analytics/topics` | `[{topic, opportunities, avgRelevance, posted}]` sorted by opportunities desc |
| GET | `/api/analytics/workload` | `[{role, tasks, share}]` |
| GET | `/api/analytics/rejections?agent_id=` | `[{reason, count}]` (whole campaign, or one agent) |
| GET | `/api/analytics/agents` | `[{id, name, role, stats:{scanned, relevant, rejected, completed, quality}, rejections:[…]}]` |
| GET | `/api/discoverability/score` | `{score, breakdown:[{label, value, delta}]}` |
| GET | `/api/discoverability/queries` | `[{query, reddit, search, aiAnswer, mentions, trend, delta7d}]` |
| GET | `/api/discoverability/series?days=14` | `[{date:"Sep 12", score, community, search, ai}]` |
| GET | `/api/events?since=<ms>&limit=300&category=&agent_id=` | `ActivityEvent[]`, newest first (history for the feed) |
| GET | `/api/opportunities?status=` | `Opportunity[]` |
| PATCH | `/api/opportunities/{id}` | `{status}` → approve / skip / edit `suggestedResponse` |
| GET | `/api/plan` | `PlannedTask[]` |
| PATCH | `/api/plan/{id}` | `{status}` or `{delay_minutes}` |

Live updates keep using the existing SSE at `/api/events` (rename the history
endpoint above to `/api/events/history` to avoid the clash, or move SSE to
`/api/stream`). Each SSE `activity` message is exactly an `ActivityEvent`, so
the frontend can push it straight into its store.

Error convention: 404 for unknown ids, 422 from pydantic for bad bodies,
`{detail: str}` bodies (FastAPI default).

## 6. Implementation steps

Ordered so each step is demoable on its own.

1. **`backend/analytics/` package skeleton** — `schema.sql`, `db.py`
   (open/init `aiosqlite` connection on lifespan, path from `config.ANALYTICS_DB`
   default `./inception.db`), `schema.py` (pydantic `ActivityEvent`,
   `Opportunity`, `PlanTask`). Add `aiosqlite` to `pyproject.toml`. *Done when
   the app boots and creates the file.*

2. **Ingest** — `ingest.py` subscribes to `events.subscribe()` at startup and
   inserts every `kind="activity"` event; `kind="opportunity"` upserts
   `opportunities`; `kind="engagement"` updates `replies/votes`. Add
   `events.emit_activity(...)` helper that validates against `schema.ActivityEvent`
   and calls `publish`. *Done when a manual `emit_activity` call shows up in the
   table.*

3. **Seed script** — `backend/analytics/seed.py`: port the frontend's generator
   (`frontend/src/lib/sim/generator.ts`) to Python and write ~3 hours of
   synthetic history. This unblocks every endpoint before real agents exist and
   gives the demo a full chart on first load. *Done when `uv run -m
   backend.analytics.seed` fills the DB.*

4. **Queries + router** — `queries.py` (one async function per endpoint, pure
   SQL + small Python), `router.py` (`APIRouter(prefix="/api")`), mounted in
   `main.py`. Implement in this order: `counters`, `volume`, `rejections`,
   `workload`, `agents`, `topics`, `events/history`, `opportunities`, `plan`.
   *Done when each endpoint returns the mock file's shape against seeded data.*

5. **Frontend data source** — in `frontend/src/lib/`, add `api.ts` (fetch
   wrappers typed with `types.ts`) and a `dataSource` flag (`"mock" | "api"`,
   env `NEXT_PUBLIC_API_URL`). Store `hydrate()` loads from the API when set;
   the SSE stream replaces the tick loop in `use-simulation.ts`. Keep the mock
   path working — it is the offline demo. Analytics/Discoverability pages read
   from React Query or a small `useApi(path)` hook instead of the mock files.
   Add CORS middleware in `main.py` for `localhost:3000`.

6. **Visibility probes** — `visibility.py`: an `asyncio` task started in
   lifespan that every 15 min, per target query, runs the three probes and
   writes `visibility_samples`. Reddit probe: Reddit search JSON
   (`/search.json?q=`). Search probe: reuse the existing Steel session +
   Playwright (`agent.py._search`) to read result ranks — this is the one place
   the current "dreamer" code and the new product overlap. AI probe: call one
   or two assistant APIs with the query and check for the entity name;
   cap cost with a daily budget in config. Each probe is independently
   optional via config flags so the demo works without keys.

7. **Discoverability endpoints** — `score`, `queries`, `series` over
   `visibility_samples` + `mentions`, using §4.3. Seed script should also write
   14 days of samples with a gentle upward trend so the chart isn't empty.

8. **Hardening** — retention (`DELETE FROM events WHERE ts < now − 30 d` nightly),
   `PRAGMA journal_mode=WAL`, an index check, and a `GET /api/analytics/health`
   that reports row counts and last-ingest timestamp (the frontend's
   connection indicator can use this).

## 7. Testing

- `tests/test_queries.py`: build an in-memory DB with a handful of hand-written
  events and assert each endpoint's numbers exactly. These are the tests that
  matter — aggregation bugs are silent.
- `tests/test_ingest.py`: publish → row exists; malformed event → rejected and
  logged, bus unaffected.
- Contract check: a script that fetches every endpoint and validates the JSON
  against the TypeScript types via a generated JSON schema (`typescript-json-schema`
  from `types.ts`, checked with `jsonschema` in Python). Cheap, catches
  camelCase/snake_case slips.
- Seed determinism: the seed script takes a `--seed` so charts are reproducible
  in screenshots.

## 8. Open questions (decide before step 6)

- **Campaigns**: one for the hackathon, but every table already has
  `campaign_id`. Is there a campaigns table and CRUD, or is it config?
- **Reddit posting**: the frontend has Approve → post. Is posting in scope for
  the backend, or does "approved" just mark the row and a human posts? This
  decides whether `posted`/`monitoring` statuses come from us or are manual.
- **AI-answer probing cost**: which assistants, how often, and what budget.
- **Existing dreamer agents**: they emit `agent`/`log` events in a different
  shape. Either map them to `activity` events (role = `visibility`, category =
  `visibility`, action = "Search presence") or leave them out of analytics.
  Mapping them is a nice bridge: the Steel search runs *are* search-presence probes.
