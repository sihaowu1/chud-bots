<div align="center">

# Inception

*Plant the idea. Let search dream it up.*

[![GitHub stars](https://img.shields.io/github/stars/sihaowu1/inception?style=social)](https://github.com/sihaowu1/inception)
[![GitHub forks](https://img.shields.io/github/forks/sihaowu1/inception?style=social)](https://github.com/sihaowu1/inception/network/members)

</div>

---

**A fleet of Steel.dev cloud-browser agents that adopts distinct personas and demonstrates how repeated Reddit-style discussion can shape what a search engine's AI Overview says.**

Each "dreamer" runs its own Steel session, searches, lands, and browses like an organic visitor, while a live display streams every session's browser feed in real time. A GPT-backed coordinator plans and executes each persona's posts, comments, and waits, keeping durable per-persona ledgers of everything that happened.

> Use the browsing flow only with fixtures, a mock community, or a private environment whose participants have consented. Do not use it to manufacture public engagement or evade platform controls. The personas are synthetic characters for the demo, not real people.

## Key Features

### Dreamer Fleet

- **Persona-driven browsing**: Each dreamer has its own voice, typing cadence, scroll habits, and link depth, driven through Playwright over Steel's CDP endpoint.
- **Dream-level state machine**: `wake` (login/signup) → `search` (Google query) → `land` (click into target) → `deepen` (scroll/click/dwell) → `kick` (session released).
- **Live display**: `display/` shows every dreamer's Steel debug iframe, dream level, and latest note, driven purely off an SSE event stream — no build step.

### Campaign Coordinator

- **Prompt to plan**: `POST /api/orchestrations` turns a campaign brief into `create_post` / `comment` / `wait` assignments.
- **Bounded execution**: A CLI executor runs assignments in dependency-ordered phases and only replans after a batch does productive work.
- **Durable ledgers**: Every persona's identity and activity, and every orchestration's plan/action/output trace, is persisted to JSON for audit, replay, and reconciliation.

### Reddit Authoring

- **Standalone publisher**: `scripts/reddit_publish.py` posts and comments through an authenticated Steel session, with idempotent request IDs and submission receipts.
- **Reconciliation**: An uncertain submission can be verified against Reddit and reconciled without resubmitting.

### Dashboard

- **Inception UI** (`frontend/`): A Next.js dashboard for campaigns, live activity, logs, agents, opportunities, and analytics. Runs on simulated data by default; the Activity page can also point at the live backend.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Cloud browser automation | Steel.dev SDK, Playwright (over CDP) |
| Backend framework | FastAPI, Uvicorn, Python 3.13, httpx |
| Live updates | Server-Sent Events (`/api/events`) |
| Campaign planning | OpenAI (`gpt-5.6-sol`), structured task planning |
| Live display | Static HTML/CSS/JS, no framework, no build step |
| Dashboard framework | Next.js 16 (App Router), React 19, TypeScript |
| Dashboard styling/UI | Tailwind CSS v4, shadcn/ui (Radix), Lucide icons, Framer Motion |
| Dashboard state | zustand, client-side event simulator |
| Dashboard charts | Recharts |
| Persistence | JSON ledgers (`backend/agent_states/`), run audits (`backend/orchestrator_runs/`) |
| Package management | uv (Python), npm (frontend) |

## How It Works

### Dreamer lifecycle

```
Launch (POST /api/runs)
  -> wake: Steel session created, Reddit login or signup
  -> search: query typed into Google, per-keystroke delay
  -> land: first result matching the target host is clicked
  -> deepen: scroll, dwell, click an internal link, repeat
  -> kick: session released, event emitted at every step
```

### Campaign coordinator

```
Campaign prompt
  -> Coordinator reads ORCHESTRATOR.md + persona ledgers
  -> Assigns post / comment / wait tasks per phase
  -> CLI executor runs assignments, records receipts
  -> Activity reported back via /activity, next phase replanned
```

## Quick Start

Prerequisites: Python 3.12+ (3.13 recommended), [uv](https://docs.astral.sh/uv/), and a [Steel.dev API key](https://app.steel.dev/settings/api-keys).

```powershell
# 1. Install dependencies
uv sync
```

```powershell
# 2. Create your local environment file and add your Steel API key
Copy-Item .env.example .env
```

```dotenv
STEEL_API_KEY=your_steel_api_key
MAX_AGENTS=1
STEEL_USE_PROXY=true
```

```powershell
# 3. Start the app
uv run uvicorn backend.main:app
```

Open <http://127.0.0.1:8000>, optionally enter a subreddit, add one or more search queries, set **Dreamers** to `1`, then click **Go under**. The target is fixed to Reddit; when a subreddit is supplied, the agent targets that community.

Optionally, run the dashboard separately:

```bash
cd frontend && npm install && npm run dev
```

- Backend + live display: http://127.0.0.1:8000
- Dashboard: http://localhost:3000

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `STEEL_API_KEY` | Steel.dev cloud browser sessions | Yes |
| `MAX_AGENTS` | Hard cap on concurrently live Steel sessions | No (default `7`) |
| `STEEL_USE_PROXY` | Route sessions through Steel residential proxies | No (default `true`) |
| `OPENAI_API_KEY` | Campaign coordinator planning | No — required only for `/api/orchestrations` |
| `ORCHESTRATOR_MODEL` | Planner model override | No (default `gpt-5.6-sol`) |
| `ORCHESTRATOR_REASONING_EFFORT` | Planner reasoning effort | No (default `medium`) |

## Repo Layout

```
.
├── backend/                 FastAPI app, Steel-driven dreamers, campaign coordinator
│   ├── agent.py             Dreamer state machine (wake -> search -> land -> deepen -> kick)
│   ├── orchestrator.py      Dreamer registry: launch, stop, MAX_AGENTS enforcement
│   ├── orchestrator_agent.py  GPT-backed task planning and run audit
│   ├── campaign_executor.py   Bounded CLI execution of post/comment/wait assignments
│   ├── reddit_author.py       Browser-driven Reddit posting/commenting + receipts
│   ├── personas.py          Persona behaviour profiles
│   └── steel_client.py      Thin wrapper over steel-sdk
├── display/                 Static live dashboard (iframe per dreamer, SSE-driven)
├── frontend/                 Inception dashboard (Next.js), mock data by default
├── scripts/                 Standalone Reddit publishing, login checks, state resets
├── tests/                   Unit tests (agent state, orchestrator, Reddit author, etc.)
├── agents.md                Full engineering reference for this repo
├── ORCHESTRATOR.md          Campaign coordinator system prompt
└── .env.example             Environment template
```

See [`agents.md`](agents.md) for the full API reference, dream-level state machine, and campaign coordinator internals.

## Team

Joshua Zhang, Sean Inoue, Sihao Wu, sylvia898

## License

No license file is currently included in this repository.
