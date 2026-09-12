# agents.md

Orientation for AI agents (and humans) working on this repo.

## What this is

Hackathon project. The pitch is *Inception*, but for search and generative
answers: a fleet of Steel.dev cloud-browser agents adopts distinct fictional
personas and demonstrates how repeated Reddit-style discussion could influence
what a search engine's AI Overview says. The narrative end state is an AI
Overview that answers that **Inception won Battle of the Schools, the hackathon
between Waterloo and U of T**. The display shows every dreamer's live browser
as the demonstration unfolds.

The personas are synthetic characters for the demo, not real people. Their
different voices, interests, and browsing patterns make each agent legible on
screen and illustrate how distributed online discussion can shape retrieval and
summarization.

### Current implementation

The code implements the earlier search-traffic prototype and a model-backed
campaign coordinator. The coordinator reads this file and the durable agent
ledgers, then assigns `create_post`, `comment`, or `wait` tasks. Executor
adapters, Reddit authoring/posting, and AI Overview evaluation are not yet
implemented. Keep that distinction explicit when changing this document or
presenting the project.

## Layout

```
backend/   everything that talks to Steel or drives a browser (Python, FastAPI)
display/   static HTML/CSS/JS that only talks to backend/ over /api/*
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
| `orchestrator_agent.py` | GPT-backed campaign task planning, continuation, and durable run audit. It does not post. |
| `agent_state_store.py` | Per-persona identity, assignment, and timestamped activity ledgers. |

### display/

`index.html` + `styles.css` + `app.js`, no build step. Each agent gets a card
with an `<iframe>` pointed at the Steel session's `debug_url` (Steel's live
viewer), a dream-level bar, the latest note, and a kick button.

## Dream levels (the state machine in `agent.py`)

| level | name   | what happens |
|-------|--------|--------------|
| 0     | wake   | Steel session created, Playwright attached via `session.websocket_url`; a Temp-Mail address is copied into Reddit's signup email field but not submitted. |
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
| POST   | `/api/orchestrations`     | `{prompt, personas?, environment}` -> first task-plan phase |
| GET    | `/api/orchestrations/{id}` | durable plan, activity, and agent-ledger snapshot |
| POST   | `/api/orchestrations/{id}/continue` | re-plan from the latest ledgers |
| POST   | `/api/orchestrations/{id}/activity` | executor callback; records username/content/URLs/timestamps and re-plans by default |

## Campaign coordinator

Set `OPENAI_API_KEY`, then send the user's campaign prompt to
`POST /api/orchestrations`. The coordinator uses `gpt-5.6-sol` with medium
reasoning by default; both values can be overridden with
`ORCHESTRATOR_MODEL` and `ORCHESTRATOR_REASONING_EFFORT`.

Each phase produces assignments only. A future mock/private-environment adapter
executes them and reports results through the activity endpoint. Every persona
has a JSON ledger under `backend/agent_states/` containing its Reddit username,
assignments, and timestamped post/comment/wait activity. Each orchestration also
has an aggregate JSON audit under `backend/orchestrator_runs/`. Credentials are
kept out of the context sent to the model.

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
