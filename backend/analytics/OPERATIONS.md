# Reddit Discovery

This isolated service supplies only Opportunities and Analytics. It uses the
existing Steel wrapper, Playwright, and Responses API configuration. No login,
posting, voting, campaign orchestration, or other pages are changed.

From the repository root, with the existing Python dependencies installed:

```sh
python -m uvicorn backend.analytics.app:app --host 127.0.0.1 --port 8001
```

Run one worker. Start the frontend normally with `npm run dev` in `frontend/`.
The two pages use the dedicated Next route `/api/analytics`, which forwards to
port 8001. Set `ANALYTICS_BACKEND_URL` in the frontend server environment to
override that address. Keep the backend on loopback; this local demo has no
authentication and should not be publicly exposed.

Set `STEEL_API_KEY` and `OPENAI_API_KEY` in the root `.env`. Optional
`ANALYTICS_MODEL` defaults to the existing `ORCHESTRATOR_MODEL`. Steel provides
the cloud browser; the model plans up to three searches and assesses the rendered
thread text. This is bounded exploration, not an exhaustive Reddit crawl.

Each run reads up to 30 threads (12 by default), with an eight-minute total
deadline. It records at most 16,000 characters of rendered post text per thread.
Threads are deduplicated by canonical permalink within a run. Across runs, the
pages show the latest observation per URL; selecting a run shows its own evidence.
Relevance rate excludes pending assessments. Per-run chart counts can include
repeat observations across runs; headline metrics count unique URLs.

The ledger lives at `.dist/analytics.sqlite`, already ignored by Git. Override
with `ANALYTICS_DB`. Restarted in-flight runs become failed; collected findings
survive. Stop retains partial findings and releases the Steel session. Missing
credentials, blocked Reddit pages, and model failures are explicit errors;
there is no simulated-data fallback. Reddit login walls and changed page markup
can prevent scraping. This scraper never uses saved persona credentials.

Verification:

```sh
python -m unittest backend.analytics.test_discovery
```

The tests mock external services and do not submit content to Reddit. Live
verification requires valid API keys and Reddit access from the Steel session.

Integration references:
- https://docs.steel.dev/overview/sessions-api/quickstart
- https://developers.openai.com/api/docs/guides/structured-outputs
