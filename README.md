# Inception

## Quick start: run one agent

Prerequisites: Python 3.12+ (3.13 recommended), [uv](https://docs.astral.sh/uv/), and a [Steel.dev API key](https://app.steel.dev/settings/api-keys).

1. Install the dependencies:

   ```powershell
   uv sync
   ```

2. Create your local environment file and add your Steel API key:

   ```powershell
   Copy-Item .env.example .env
   ```

   ```dotenv
   STEEL_API_KEY=your_steel_api_key
   MAX_AGENTS=1
   STEEL_USE_PROXY=true
   ```

3. Start the app:

   ```powershell
   uv run uvicorn backend.main:app
   ```

4. Open <http://127.0.0.1:8000>, optionally enter a subreddit, add one or more search queries, set **Dreamers** to `1`, then click **Go under**. The target is fixed to Reddit; when a subreddit is supplied, the agent targets that community.

Use the browsing flow only with fixtures, a mock community, or a private environment whose participants have consented. Do not use it to manufacture public engagement or evade platform controls.

## Campaign coordinator

Set `OPENAI_API_KEY` and call `POST /api/orchestrations` with a prompt and an
`environment` of `mock` or `private`. The coordinator assigns post, comment, and
wait tasks and persists each persona's timestamped activity. It does not
implement Reddit posting; an executor must report results to the orchestration
activity endpoint. See `agents.md` for the API and state format.
