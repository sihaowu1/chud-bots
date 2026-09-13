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

Browsing behavior is bound in `Persona.browsing_mode`: Cobb, Arthur,
Ariadne, and Generic 1–4 use the read-only subreddit tour. When a topic launch
includes Yusuf, `gpt-5.4-mini` assigns him a relevant warm-up subreddit and writes
a profile post framing the user's startup as a solution to the compute shortage.
Yusuf scrolls that subreddit and dwells for two seconds before publishing. Eames, Saito,
Mal, and Generic 5–8 retain the legacy flow. A launch-wide `mode` cannot override
these bindings except for Yusuf's automatic topic-post assignment. Pool order remains
seven named personas followed by eight generic personas.
After Yusuf completes his assigned browsing or posting task, his Steel session stays
open for five minutes so the final browser state remains visible; an operator kick
still ends the hold immediately.
The API counts the bound personas that can launch, then selects three subreddits
once when a topic is supplied and at least one selected persona is bound. It
shares that route only with bound browsers. Direct Dreamer
runs select from their query before opening Steel. With no topic, bound personas
use the default hackathon/technology tour. Standalone login/author adapter helpers
remain explicit operations outside the Dreamer browsing lifecycle.
For selected legacy personas that use Google, a topic launch also calls
`gpt-5.4-mini` once before opening Steel and assigns each persona a distinct,
topic-relevant search query. The assignment is keyed by persona so mixed launches
keep their predetermined queries. A failed or invalid assignment rejects the launch.

The Activity page launches a Reddit tour using `backend/reddit_patrol.py`, without
the campaign coordinator or signup/login flow. When Yusuf is selected for a topic
launch, he instead performs the automatic warm-up and profile-post flow described
above. The user enters a topic;
`backend/subreddit_selector.py` calls `gpt-5.4-mini` with low reasoning once per
launch to choose exactly three distinct subreddit names, shared by launched
bound personas. This requires `OPENAI_API_KEY` and uses `OPENAI_BASE_URL`. Invalid or
failed model responses reject the launch before opening Steel sessions.
Profile-post launches reuse those three communities as exclusions. The
`gpt-5.4-mini` profile-post orchestrator assigns each posting persona one additional,
mutually distinct warm-up subreddit, which the agent opens and browses for a random
2–5 seconds before it starts its profile post.
Only the destinations vary; the browsing choreography remains fixed.
`browsing_plan(persona_name)` still supplies the fixed behavior for any persona;
its default hackathon/technology route is used when no topic is supplied.
For each new-post feed, scroll 480/640/480 pixels, select the first two unique
same-community post links in document order, open each, pause six seconds on
the body, scroll visible comments 420/540/540 pixels, pause four seconds, then
return to the listing. Scroll pauses are two seconds. No votes or submissions.
The post-selection rules repeat; model-selected communities, live posts, load
times and availability can change. Model suggestions are not verified for existence
in advance. HTTP failures fail the session; missing posts/comments are reported.
Progress uses the existing SSE and Steel viewer; sessions release on completion.

Use `POST /api/runs` with `{"target":"https://www.reddit.com",
"mode":"reddit_browse","prompt":"Python tools","count":1,"personas":["Cobb"]}`
to choose a persona and topic. Topic selection accepts a nonblank prompt (at most
2000 characters); `queries` joined with newlines is also accepted when prompt is absent.
Omit `personas` to use pool order. Both the API and static display honor persona
bindings regardless of the launch-wide mode hint.
The separate model-backed publishing CLI remains available.

The code implements the earlier search-traffic prototype and a model-backed
campaign coordinator. The coordinator reads `ORCHESTRATOR.md` and the durable agent
ledgers, then assigns `create_post`, `comment`, or `wait` tasks. A standalone
Reddit author adapter supports posts and top-level comments in
r/HackathonsCanada through a logged-in Steel browser. The CLI executor now connects structured
campaign assignments to this adapter for configured Reddit runs, with a local
mock executor for testing. AI Overview evaluation is not implemented.
Keep that distinction explicit when changing this document or
presenting the project.

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
| `personas.py`    | Behaviour profiles (typing speed, scroll habits, link depth). Steel sessions currently use desktop devices. |
| `steel_client.py`| Thin wrapper over `steel-sdk`: create / release / list sessions. |
| `events.py`      | In-process pub/sub that feeds the SSE stream. |
| `config.py`      | `.env` loading and constants. |
| `orchestrator_agent.py` | GPT-backed structured task planning, continuation, and durable run audit. |
| `campaign_executor.py` | Bounded CLI execution of post/comment/wait assignments, dependencies, and callbacks. |
| `reddit_runner.py` | Shared CLI publisher: persona locking, authenticated Steel session, author adapter, and cleanup. |
| `agent_state_store.py` | Per-persona identity, assignment, and timestamped activity ledgers. |
| `reddit_author.py` | Browser-driven test posts/comments, identity checks, verification, and durable submission receipts. |

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
| `src/app/(app)/*` | routes: **dashboard** `/` (live browser sessions), campaign, **logs** (agent event feed), opportunities, discoverability, analytics, settings |
| `src/app/globals.css` | design tokens. Single dark theme, neutral surfaces, one accent (`--signal`), semantic success/warning/danger. Keyframes for row entry/flash. |
| `src/lib/types.ts` | domain model: Campaign, Agent, ActivityEvent, PlannedTask, Opportunity… |
| `src/lib/mock/*` | seed data. `agents.ts` holds the deploy order + `allocationFor(n)`; `content.ts` the thread/query pools the simulator draws from. |
| `src/lib/sim/generator.ts` | event simulator. Multi-step chains (discover → intent → relevance → policy → draft → review → monitor) are scheduled as pending steps so several interleave. |
| `src/lib/store.ts` | zustand store. `hydrate()` seeds history on the client (never at module load — timestamps must not differ between SSR and client). `tick()` applies one emission. |
| `src/lib/sim/use-simulation.ts` | mounts the 2–5 s tick loop once, in `AppShell`. |
| `src/components/shell/*` | sidebar, top bar (campaign switcher, live state, pause-all with confirm), notifications, ⌘K palette. |
| `src/components/logs/*` | the event feed (Logs page + dashboard). `activity-feed.tsx` holds back new rows while the user is scrolled or inspecting and shows "N new events ↓" instead. |
| `src/lib/sessions/*` + `src/components/activity/*` | the Dashboard: a wall of the dreamers' cloud-browser sessions from the `agent-login` backend. `store.ts` polls `/backend/api/agents` (+ SSE `/backend/api/events`) and embeds each Steel `debug_url` in an iframe; if the backend is unreachable it runs `mock.ts`, which replays the same Temp-Mail → Reddit signup/login → CAPTCHA → Google → land → deepen script with a sketched viewer. `next.config.ts` rewrites `/backend/*` to `BACKEND_URL` (default `http://127.0.0.1:8000`) because the FastAPI app has no CORS. |
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
| 0     | wake   | Steel session created and Playwright attached via `session.websocket_url`. Complete saved email/password credentials go through Reddit login; otherwise a Temp-Mail address is copied into Reddit signup and the local ledger generates a persona password. |
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

Login debugging is temporarily limited to one dreamer, Yusuf, in both the UI
and launch API. Login uses the saved email address and password.
It opens Reddit's home page and clicks Log In before entering credentials.
Login succeeds only when Reddit's home page is loaded and `/api/me.json`
confirms a signed-in identity. The login-only 5-minute hold starts then;
rejected credentials or a 60-second confirmation timeout fail the run.
Run `uv run python scripts/check_yusuf_login.py` for one live login check with
a screenshot at `scripts/yusuf-login.png`; its session is released afterward.

## API

Read-only Reddit browsing can be checked separately with
`uv run python scripts/check_yusuf_reddit.py --query python`. This uses one
Yusuf Steel session and his saved credentials/profile, scrolls the home page,
then navigates to community search results and scrolls them. Screenshots go to
`scripts/reddit-check/` (gitignored); the session is released afterward.
`backend/reddit_browser.py` provides the navigation helpers. This check does
not vote, post, or comment, and does not alter the existing launch flow.

| method | path                      | body / notes |
|--------|---------------------------|--------------|
| POST   | `/api/runs`               | `{target, queries[], count}` -> launches `count` dreamers, queries cycled; an empty `queries` list runs only the Reddit login flow |
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

### Standalone Reddit authoring

Any named persona with a saved Reddit login/Steel profile can publish through
`scripts/reddit_publish.py`. This separate runner does not use the launch UI.
It restores the persona profile, checks the signed-in identity, fills Reddit's
browser composer, clicks once, verifies the saved content, and releases Steel.
All content targets r/HackathonsCanada.
Once the community is private, the account must have access granted by its owner.
Pass `--dry-run` before `post` or `comment` to fill the composer and check its
submit control without clicking or creating a submission receipt.

```powershell
uv run python scripts/reddit_publish.py --persona Cobb --request-id question-001 post --title "Anyone doing Battle of the Schools?" --body "What are you planning to build?"
uv run python scripts/reddit_publish.py --persona Arthur --request-id reply-001 comment --post-url "https://www.reddit.com/r/HackathonsCanada/comments/POST_ID/POST_SLUG/" --body "Testing the comment workflow."
```

Use the same `--request-id` when repeating a command. Confirmed requests return
their existing permalink; a reused ID with different content is rejected.
Receipts live in the gitignored `backend/agent_states/reddit_receipts/` directory.
A timeout after the submit attempt leaves an uncertain receipt and blocks repeat
submission. Inspect Reddit first. An observed post ID can be reconciled without
another write to Reddit:

```powershell
uv run python scripts/reddit_publish.py --persona Cobb --request-id question-001 reconcile-post --post-id t3_POST_ID
```

Confirmed submissions also enter the persona activity ledger. Screenshots are
saved to `scripts/reddit-check/`. Confirmation means Reddit saved the content;
moderation can still filter it, and results include `removed_by_category` for posts.
Comments currently support top-level replies to post permalinks only. Reuse the
same request ID, post URL, and body to retrieve the existing confirmed comment.
If a submission is uncertain, inspect Reddit for the comment first, then verify
its ID without submitting another reply:

```powershell
uv run python scripts/reddit_publish.py --persona Arthur --request-id reply-001 reconcile-comment --comment-id t1_COMMENT_ID
```

Reconciliation checks the original account, exact body, parent post, and community
before confirming the receipt. If the comment cannot be found or verified, the
receipt stays uncertain and blocks resubmission. There is no automatic retry of
the submit click. Comment verification/recovery is covered with mocked Reddit
responses (`uv run python -m unittest discover -s tests -p test_reddit_author.py`);
a live comment submission has not been tested.

Call `RedditAuthor(dreamer, page).create_post(...)` or `.comment(...)` to reuse
the adapter in an existing authenticated Steel session. Serialize publishing
operations for each persona/profile; different request IDs are independent.

### Planning

Set `OPENAI_API_KEY`, then send the user's campaign prompt to
`POST /api/orchestrations`. The coordinator uses `gpt-5.6-sol` with medium
reasoning by default; both values can be overridden with
`ORCHESTRATOR_MODEL` and `ORCHESTRATOR_REASONING_EFFORT`.

The HTTP planning endpoints produce assignments only. Execute them through the
existing CLI, or start and execute a campaign in one command (OPENAI_API_KEY is
needed for planning, including mock mode):

```powershell
uv run python scripts/reddit_publish.py orchestrate --prompt "Create a kickoff, then a reply" --personas Cobb Arthur --phases 2
uv run python scripts/reddit_publish.py orchestrate --run-id RUN_ID
uv run python scripts/reddit_publish.py orchestrate --prompt "Run our Reddit demo" --personas Cobb Arthur --environment private --phases 2
```

Mock is the default: it records synthetic URLs and activity without opening Steel
or changing saved Reddit identities. Commands contain final `title`/`body` fields.
Legacy prose-only assignments fail without posting.

Execution is serial and bounded by `--phases` (default 1). Each batch executes
pending assignments, reports results without per-task replanning, then replans
only if the batch completed productive work and another batch is allowed. Wait-only
or blocked batches stop. A comment can take its target from exactly one completed
post dependency in `wait_for`; dependencies must reference earlier phases.
Completed tasks are skipped on resume. To plan further work after a completed run,
call the existing `/continue` endpoint before executing its pending assignments.
The CLI ends with a concise summary of completed, failed, and pending assignments;
the full durable run remains available in the run audit and orchestration endpoint.

Task IDs are publishing request IDs. Failed or interrupted tasks block resumed
execution. Inspect/reconcile the existing Reddit receipt with the standalone CLI,
then report the verified result through `/activity` with the original task ID and
`continue_after: false`. Cancel an unsubmitted task through that endpoint if it
should be abandoned. Never mark an uncertain submission cancelled just to retry it.
The executor lock and per-persona publisher locks reject overlapping CLI runs; after
a process crash, inspect the process and receipts before removing the corresponding
`execution.lock` or `publisher_locks/*.lock`. Do not run HTTP planning/callback
mutations concurrently with the CLI executor, or run the launch/login flow against
the same persona while publishing. The executor does not register browser sessions
in the launch UI or implement AI Overview evaluation.

Execution and recovery tests use fake planners/publishers; no live campaign has
been submitted as part of this integration.

Every persona
has a JSON ledger under `backend/agent_states/` containing its Reddit username,
assignments, and timestamped post/comment/wait activity. Each orchestration also
has an aggregate JSON audit under `backend/orchestrator_runs/`. Credentials are
kept out of the context sent to the model.

Each orchestration also gets an append-only trace in `orchestrator_logs/<run-id>/`.
Files are numbered from `0.json`; every later file is a cumulative snapshot that
references and includes the prior entries. Entries distinguish the exposed model
plan summary/context (`thinking`), persisted assignments (`action`), activity and
publisher results (`output`), and executor invocations/generated commands (`cli`).
The API does not expose private model chain-of-thought, so it is never logged.

## Steel specifics that bit us

- Desktop sessions are created with `use_proxy`, `solve_captcha`, `stealth_config.humanizeInteractions`
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
