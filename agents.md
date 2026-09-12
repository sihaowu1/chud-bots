# agents.md

Orientation for AI agents (and humans) working on this repo.

## What this is

Hackathon project. The pitch: *Inception*, but for search engines. A fleet of
Steel.dev cloud browsers ("dreamers") each search Google for a phrase, click the
target site from the results, and browse it the way a person would. The goal is
for those visits to look like organic traffic. The display shows every dreamer's
live browser as it happens.

Caveat worth knowing: Google treats this kind of traffic as manipulation and
filters for it. Treat this as a demo of Steel's multi-session tooling, not a
guaranteed ranking lever.

## Layout

```
backend/   everything that talks to Steel or drives a browser (Python, FastAPI)
display/   static HTML/CSS/JS that only talks to backend/ over /api/*
frontend/  Inception dashboard (Next.js). Mock data only; no backend calls yet.
agents.md  this file
.env       STEEL_API_KEY etc. (copy from .env.example, never commit)
```

The split is strict: `display/` never imports or calls Steel. `backend/steel_client.py`
is the only file that imports the Steel SDK.

### backend/

| file             | role |
|------------------|------|
| `main.py`        | FastAPI app. REST endpoints, SSE stream at `/api/events`, serves `display/`. |
| `orchestrator.py`| Registry of running dreamers. `launch`, `stop`, `stop_all`, `clear_finished`. Enforces `MAX_AGENTS`. |
| `agent.py`       | `Dreamer`: one Steel session driven through the dream levels with Playwright over CDP. |
| `personas.py`    | Behaviour profiles (typing speed, mobile/desktop, scroll habits, link depth). |
| `steel_client.py`| Thin wrapper over `steel-sdk`: create / release / list sessions. |
| `events.py`      | In-process pub/sub that feeds the SSE stream. |
| `config.py`      | `.env` loading and constants. |

### display/

`index.html` + `styles.css` + `app.js`, no build step. Each agent gets a card
with an `<iframe>` pointed at the Steel session's `debug_url` (Steel's live
viewer), a dream-level bar, the latest note, and a kick button.

### frontend/

The hackathon product UI for **Inception**, a multi-agent discoverability
platform. Entirely client-side with simulated agents — it does not talk to
`backend/` or Reddit. Next.js 16 (App Router), React 19, TypeScript, Tailwind v4,
shadcn/ui (radix), Lucide, Framer Motion, Recharts, zustand.

```
cd frontend && npm install && npm run dev      # http://localhost:3000
npm run build && npm run lint                   # both must be clean
```

| path | role |
|------|------|
| `src/app/(app)/*` | routes: dashboard `/`, campaign, activity, opportunities, agents (list + network), discoverability, analytics, settings |
| `src/app/globals.css` | design tokens. Single dark theme, neutral surfaces, one accent (`--signal`), semantic success/warning/danger. Keyframes for row entry/flash. |
| `src/lib/types.ts` | domain model: Campaign, Agent, ActivityEvent, PlannedTask, Opportunity… |
| `src/lib/mock/*` | seed data. `agents.ts` holds the deploy order + `allocationFor(n)`; `content.ts` the thread/query pools the simulator draws from. |
| `src/lib/sim/generator.ts` | event simulator. Multi-step chains (discover → intent → relevance → policy → draft → review → monitor) are scheduled as pending steps so several interleave. |
| `src/lib/store.ts` | zustand store. `hydrate()` seeds history on the client (never at module load — timestamps must not differ between SSR and client). `tick()` applies one emission. |
| `src/lib/sim/use-simulation.ts` | mounts the 2–5 s tick loop once, in `AppShell`. |
| `src/components/shell/*` | sidebar, top bar (campaign switcher, live state, pause-all with confirm), notifications, ⌘K palette. |
| `src/components/activity/*` | the live feed. `activity-feed.tsx` holds back new rows while the user is scrolled or inspecting and shows "N new events ↓" instead. |
| `src/components/shared/*` | primitives: status dots, animated numbers, score, inspector panel, toast with undo, section/panel/field. |

Conventions that matter here:

- Everything time-dependent is created in `hydrate()`, not at import. Module-level
  `Date.now()` caused hydration mismatches.
- Colour is semantic only: `signal` for active/system, `success`/`warning`/`danger`
  for state. Agents and roles do not get their own colours.
- Only computational states (`searching`, `analyzing`, `writing`) pulse.
- Lint runs the React Compiler rules: no `setState` inside effects. Subscribe to the
  store (`useSim.subscribe`) or use `key=` remounts / adjust-state-during-render.
- Detail views show decision summaries and evidence, never fake chain-of-thought.

## Dream levels (the state machine in `agent.py`)

| level | name   | what happens |
|-------|--------|--------------|
| 0     | wake   | Steel session created, Playwright attached via `session.websocket_url` |
| 1     | search | Google opened, consent dismissed, query typed with per-keystroke delay, Enter |
| 2     | land   | First result whose href contains the target host is clicked. If absent, navigates directly and logs "weak signal". |
| 3+    | deepen | Scroll, dwell, click a random internal link; repeat up to `persona.max_depth` |
| —     | kick   | Session released (always, in `finally`) |

Every transition calls `Dreamer._emit`, which publishes an `agent` event with
the full state snapshot. The display is a pure function of those snapshots.

## Running

```
uv sync
cp .env.example .env   # fill in STEEL_API_KEY
uv run uvicorn backend.main:app --reload
```

Open http://127.0.0.1:8000. No local Chromium is needed: Playwright connects
to Steel's browser over CDP, so `playwright install` is not required.

## API

| method | path                      | body / notes |
|--------|---------------------------|--------------|
| POST   | `/api/runs`               | `{target, queries[], count}` -> launches `count` dreamers, queries cycled |
| GET    | `/api/agents`             | current snapshots |
| POST   | `/api/agents/{id}/stop`   | cooperative stop; session released |
| POST   | `/api/stop-all`           | stops everything, then `sessions.release_all()` on Steel |
| POST   | `/api/clear`              | drops finished/failed/stopped agents from the registry |
| GET    | `/api/steel/sessions`     | live sessions straight from Steel (sanity check) |
| GET    | `/api/events`             | SSE. First message is `{kind:"snapshot"}`, then `agent` / `log` events |

## Steel specifics that bit us

- Sessions are created with `use_proxy`, `solve_captcha`, `stealth_config.humanizeInteractions`
  and `debug_config.interactive=false`. See `steel_client.create_session`.
- `session.websocket_url` is the CDP endpoint; pass it straight to `connect_over_cdp`.
- `session.debug_url` is embeddable in an iframe. `session_viewer_url` is the
  dashboard page (opens in a new tab from the card).
- `api_timeout` on create is the hard session timeout in **milliseconds**.
- Plan limits cap concurrent sessions. `MAX_AGENTS` in `.env` should not exceed it
  or `sessions.create` will 4xx.
- Google's consent wall appears on EU exit nodes; `_accept_consent` handles it.
  Google captchas are left to Steel's `autoCaptchaSolving`.

## Conventions

- Python 3.13 (pinned in `.python-version`), async everywhere. No threads.
- No README by design; this file is the docs.
- Keep `display/` framework-free. It must stay a static folder FastAPI can mount.
- Add a new behaviour by adding a level to `Dreamer._dream`, not by branching on persona.
- Add a persona by appending to `personas._POOL`.

## Ideas not built

- Per-agent screenshots on kick (Steel has a screenshot endpoint) for a post-run reel.
- Persist run history (currently in-memory only; restarting the server forgets everything).
- Bing / DuckDuckGo as alternate `SEARCH_URL`s.
- Rank tracking: a separate Steel session that searches and records where the target appears.
