"""Model-backed coordinator for assigning social-demo work to dreamers.

This module plans structured commands and records adapter callbacks. The CLI
executor runs them against a mock community or the configured Reddit community.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlsplit

import httpx

from . import agent_state_store, config, events, orchestrator_log, personas

ALLOWED_ACTIONS = {"create_post", "create_profile_post", "comment", "wait"}
ALLOWED_ACTIVITY_KINDS = {"post", "comment", "wait", "system"}
ALLOWED_ACTIVITY_STATUSES = {"started", "completed", "failed", "cancelled"}

_PLAN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "assignments"],
    "properties": {
        "summary": {"type": "string"},
        "assignments": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["persona", "action", "instructions", "target_url", "wait_for", "title", "body"],
                "properties": {
                    "persona": {"type": "string"},
                    "action": {"type": "string", "enum": sorted(ALLOWED_ACTIONS)},
                    "instructions": {"type": "string"},
                    "title": {"type": ["string", "null"]},
                    "body": {"type": ["string", "null"]},
                    "target_url": {"type": ["string", "null"]},
                    "wait_for": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
    },
}

_SYSTEM_INSTRUCTIONS = """You are the campaign coordinator for Reddit content.
Read and obey the supplied orchestrator instructions. Assign the smallest useful next step to
each selected persona. The only actions are create_post, create_profile_post, comment, and wait.

Use existing assignment IDs in wait_for when work depends on an earlier post/comment. Never
invent a completed URL, username, post, or comment: only activity ledger entries are facts.
Use existing_posts when a useful completed post from this or another run is available for a
comment. For those comments, set target_url to the existing post URL and leave wait_for empty
unless the comment also depends on a current-run task.
Do not assign duplicate work that is already completed or in progress. Keep persona voices
distinct. Supply final title and body for create_post and create_profile_post, body for
comment, and null title/body for wait. Instructions summarize the command. Comments are
top-level replies only. Use an observed post
URL as target_url, or null with exactly one create_post task ID in wait_for whose
completed URL the executor will use. Only r/HackathonsCanada is supported in private
runs for create_post and comments. create_profile_post publishes under the persona's own
profile and uses null target_url. Mock runs use https://mock.local/posts/<task-id> URLs
or https://mock.local/profile-posts/<task-id> URLs. Dependencies must reference tasks from
previous phases. Never issue shell commands.

When the user prompt starts with "promote ", treat the remaining text as the cause or idea
to promote. Prefer create_profile_post assignments for the selected personas so each post is
published under that persona's own profile.

Never plan platform-control evasion or spam. If the request conflicts with that boundary,
assign a wait task explaining the blocker.
"""


class Planner(Protocol):
    async def plan(self, context: dict[str, Any]) -> dict[str, Any]: ...


class OpenAIResponsesPlanner:
    """Small Responses API client with strict structured output."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        reasoning_effort: str | None = None,
        base_url: str | None = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else config.OPENAI_API_KEY
        self.model = model or config.ORCHESTRATOR_MODEL
        self.reasoning_effort = reasoning_effort or config.ORCHESTRATOR_REASONING_EFFORT
        self.base_url = (base_url or config.OPENAI_BASE_URL).rstrip("/")

    async def plan(self, context: dict[str, Any]) -> dict[str, Any]:
        if not self.api_key:
            raise OrchestratorConfigurationError("OPENAI_API_KEY is required for orchestration")

        payload = {
            "model": self.model,
            "reasoning": {"effort": self.reasoning_effort},
            "instructions": _SYSTEM_INSTRUCTIONS,
            "input": json.dumps(context, ensure_ascii=False),
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "dreamer_task_plan",
                    "strict": True,
                    "schema": _PLAN_SCHEMA,
                }
            },
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                response = await client.post(
                    f"{self.base_url}/responses", headers=headers, json=payload
                )
        except httpx.HTTPError as exc:
            raise OrchestratorModelError(f"could not reach Responses API: {exc}") from exc
        if response.is_error:
            detail = response.text[:500]
            raise OrchestratorModelError(f"Responses API returned {response.status_code}: {detail}")

        raw = response.json()
        output_text = _response_output_text(raw)
        try:
            return json.loads(output_text)
        except json.JSONDecodeError as exc:
            raise OrchestratorModelError("orchestrator returned invalid JSON") from exc


class CampaignOrchestrator:
    """Creates runs, advances phases, and owns the durable coordination audit."""

    def __init__(
        self,
        planner: Planner | None = None,
        runs_dir: Path | None = None,
        logs_dir: Path | None = None,
    ) -> None:
        self.planner = planner or OpenAIResponsesPlanner()
        self.runs_dir = runs_dir or config.ORCHESTRATOR_RUNS_DIR
        self.logs_dir = logs_dir or config.ORCHESTRATOR_LOGS_DIR
        self._lock = asyncio.Lock()

    async def start(
        self,
        prompt: str,
        *,
        selected_personas: list[str] | None = None,
        environment: str = "mock",
    ) -> dict[str, Any]:
        names = self._validate_personas(selected_personas or personas.names())
        if environment not in {"mock", "private"}:
            raise ValueError("environment must be 'mock' or 'private'")
        now = _timestamp()
        run = {
            "schema_version": 1,
            "id": uuid.uuid4().hex[:12],
            "prompt": prompt,
            "environment": environment,
            "status": "planning",
            "model": config.ORCHESTRATOR_MODEL,
            "reasoning_effort": config.ORCHESTRATOR_REASONING_EFFORT,
            "personas": names,
            "created_at": now,
            "updated_at": now,
            "phases": [],
            "events": [],
            "agent_ledgers": {},
        }
        async with self._lock:
            self._save(run)
        return await self._advance(run)

    async def continue_run(self, run_id: str) -> dict[str, Any]:
        async with self._lock:
            run = self._load(run_id)
            run["status"] = "planning"
            self._save(run)
        return await self._advance(run)

    async def record_activity(
        self,
        run_id: str,
        *,
        persona: str,
        task_id: str,
        kind: str,
        status: str,
        content: str | None = None,
        url: str | None = None,
        parent_url: str | None = None,
        reddit_username: str | None = None,
        note: str | None = None,
        continue_after: bool = True,
    ) -> dict[str, Any]:
        if kind not in ALLOWED_ACTIVITY_KINDS:
            raise ValueError(f"kind must be one of {sorted(ALLOWED_ACTIVITY_KINDS)}")
        if status not in ALLOWED_ACTIVITY_STATUSES:
            raise ValueError(f"status must be one of {sorted(ALLOWED_ACTIVITY_STATUSES)}")
        if kind in {"post", "comment"} and status == "completed":
            if not content or not url or not reddit_username:
                raise ValueError(
                    "completed post/comment activity requires content, url, and reddit_username"
                )

        async with self._lock:
            run = self._load(run_id)
            if persona not in run["personas"]:
                raise ValueError(f"persona {persona!r} is not part of run {run_id}")
            known_tasks = {task["id"]: task for phase in run["phases"] for task in phase["assignments"]}
            if task_id not in known_tasks:
                raise ValueError(f"unknown task_id {task_id!r}")
            task = known_tasks[task_id]
            if task["persona"] != persona:
                raise ValueError("activity persona does not own the task")
            action_kind = {
                "create_post": "post",
                "create_profile_post": "post",
                "comment": "comment",
                "wait": "wait",
            }[task["action"]]
            if kind != action_kind and kind != "system":
                raise ValueError("activity kind does not match the task")
            activity = {
                "id": uuid.uuid4().hex[:12],
                "run_id": run_id,
                "task_id": task_id,
                "kind": kind,
                "status": status,
                "content": content,
                "url": url,
                "parent_url": parent_url,
                "note": note,
                "reddit_username": reddit_username,
                "timestamp": _timestamp(),
            }
            agent_state_store.append_activity(
                persona, activity,
                reddit_username=reddit_username if run["environment"] == "private" else None,
            )
            run["events"].append({"type": "agent_activity", "persona": persona, **activity})
            run["updated_at"] = _timestamp()
            run["status"] = "planning" if continue_after else "active"
            self._save(run)
            events.publish("log", msg=f"{persona} reported {kind} {status} for {task_id}")
            orchestrator_log.append(
                run_id,
                "output",
                {"source": "activity_callback", "activity": activity},
                logs_dir=self.logs_dir,
            )

        return await self._advance(run) if continue_after else run

    def get(self, run_id: str) -> dict[str, Any]:
        return self._load(run_id)

    async def _advance(self, run: dict[str, Any]) -> dict[str, Any]:
        context = self._context(run)
        try:
            proposal = await self.planner.plan(context)
            assignments = self._validate_plan(proposal, run)
        except Exception as exc:
            async with self._lock:
                latest = self._load(run["id"])
                latest["status"] = "failed"
                latest["updated_at"] = _timestamp()
                self._save(latest)
                orchestrator_log.append(
                    run["id"],
                    "output",
                    {"source": "planner", "error": f"{type(exc).__name__}: {exc}"},
                    logs_dir=self.logs_dir,
                )
            raise

        orchestrator_log.append(
            run["id"],
            "thinking",
            {
                "phase": len(run["phases"]) + 1,
                "summary": proposal["summary"],
                "model": run["model"],
                "reasoning_effort": run["reasoning_effort"],
                "context": context,
                "note": "The Responses API exposes the plan summary, not private chain-of-thought.",
            },
            logs_dir=self.logs_dir,
        )

        async with self._lock:
            latest = self._load(run["id"])
            phase_number = len(latest["phases"]) + 1
            timestamp = _timestamp()
            persisted = []
            for index, assignment in enumerate(assignments, start=1):
                task = {
                    "id": f"{latest['id']}-p{phase_number}-t{index}",
                    "run_id": latest["id"],
                    "phase": phase_number,
                    "assigned_at": timestamp,
                    **assignment,
                }
                agent_state_store.append_assignment(task["persona"], task)
                persisted.append(task)
            latest["phases"].append(
                {
                    "number": phase_number,
                    "created_at": timestamp,
                    "summary": proposal["summary"],
                    "assignments": persisted,
                }
            )
            latest["events"].append(
                {"type": "plan_created", "phase": phase_number, "timestamp": timestamp}
            )
            latest["status"] = "active"
            latest["updated_at"] = timestamp
            self._save(latest)
            for task in persisted:
                events.publish("orchestrator", run_id=latest["id"], assignment=task)
            orchestrator_log.append(
                latest["id"],
                "action",
                {"phase": phase_number, "assignments": persisted},
                logs_dir=self.logs_dir,
            )
            return latest

    def _context(self, run: dict[str, Any]) -> dict[str, Any]:
        try:
            orchestrator_instructions = config.ORCHESTRATOR_INSTRUCTIONS_PATH.read_text(
                encoding="utf-8"
            )
        except OSError as exc:
            raise OrchestratorConfigurationError(
                f"could not read ORCHESTRATOR.md: {exc}"
            ) from exc
        ledgers = [agent_state_store.public_ledger(name) for name in run["personas"]]
        return {
            "orchestrator_instructions": orchestrator_instructions,
            "user_prompt": run["prompt"],
            "promotion_target": _promotion_target(run["prompt"]),
            "environment": run["environment"],
            "run_id": run["id"],
            "previous_phases": run["phases"],
            "existing_posts": _existing_posts(ledgers),
            "agents": ledgers,
        }

    def _validate_plan(self, plan: dict[str, Any], run: dict[str, Any]) -> list[dict[str, Any]]:
        if not isinstance(plan, dict) or not isinstance(plan.get("summary"), str):
            raise OrchestratorModelError("plan must contain a summary")
        raw_assignments = plan.get("assignments")
        if not isinstance(raw_assignments, list) or not raw_assignments:
            raise OrchestratorModelError("plan must contain at least one assignment")
        assignments = []
        for item in raw_assignments:
            if not isinstance(item, dict) or item.get("persona") not in run["personas"]:
                raise OrchestratorModelError("plan referenced an unknown persona")
            if item.get("action") not in ALLOWED_ACTIONS:
                raise OrchestratorModelError("plan returned an unsupported action")
            if not isinstance(item.get("instructions"), str) or not item["instructions"].strip():
                raise OrchestratorModelError("assignment instructions cannot be empty")
            wait_for = item.get("wait_for")
            if not isinstance(wait_for, list) or not all(isinstance(value, str) for value in wait_for):
                raise OrchestratorModelError("wait_for must be a list of task IDs")
            known_ids = {task["id"] for phase in run["phases"] for task in phase["assignments"]}
            if any(task_id not in known_ids for task_id in wait_for):
                raise OrchestratorModelError("wait_for references an unknown task")
            for field in ("title", "body", "target_url"):
                if item.get(field) is not None and not isinstance(item[field], str):
                    raise OrchestratorModelError(f"{field} must be a string or null")
            assignments.append(
                {
                    "persona": item["persona"],
                    "action": item["action"],
                    "instructions": item["instructions"].strip(),
                    "target_url": item.get("target_url"),
                    "wait_for": wait_for,
                    "title": item.get("title"),
                    "body": item.get("body"),
                }
            )
        return assignments

    def _validate_personas(self, requested: list[str]) -> list[str]:
        available = set(personas.names())
        names = list(dict.fromkeys(requested))
        unknown = [name for name in names if name not in available]
        if unknown:
            raise ValueError(f"unknown personas: {', '.join(unknown)}")
        if not names:
            raise ValueError("at least one persona is required")
        return names

    def _path(self, run_id: str) -> Path:
        if not run_id or any(ch not in "abcdefghijklmnopqrstuvwxyz0123456789-" for ch in run_id.lower()):
            raise ValueError("invalid run id")
        return self.runs_dir / f"{run_id}.json"

    def _load(self, run_id: str) -> dict[str, Any]:
        path = self._path(run_id)
        if not path.exists():
            raise KeyError(run_id)
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            raise RuntimeError(f"could not read orchestrator run {run_id}: {exc}") from exc
        return value

    def _save(self, run: dict[str, Any]) -> None:
        run["agent_ledgers"] = {
            name: agent_state_store.public_ledger(name) for name in run["personas"]
        }
        path = self._path(run["id"])
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(run, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        temporary.replace(path)


class OrchestratorConfigurationError(RuntimeError):
    pass


class OrchestratorModelError(RuntimeError):
    pass


def _response_output_text(response: dict[str, Any]) -> str:
    for item in response.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                return content["text"]
    raise OrchestratorModelError("orchestrator response did not contain output text")


def _timestamp() -> str:
    return datetime.now(UTC).isoformat()


def _promotion_target(prompt: str) -> str | None:
    prefix = "promote "
    value = prompt.strip()
    if not value.lower().startswith(prefix):
        return None
    target = value[len(prefix):].strip()
    return target or None


def _existing_posts(ledgers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    posts = []
    seen = set()
    for ledger in ledgers:
        for activity in ledger.get("activity", []):
            if (
                activity.get("kind") != "post"
                or activity.get("status") != "completed"
                or not isinstance(activity.get("url"), str)
                or not _commentable_post_url(activity["url"])
            ):
                continue
            url = activity["url"]
            if url in seen:
                continue
            seen.add(url)
            posts.append({
                "persona": ledger.get("persona"),
                "task_id": activity.get("task_id"),
                "run_id": activity.get("run_id"),
                "url": url,
                "content": activity.get("content"),
                "reddit_username": activity.get("reddit_username"),
                "timestamp": activity.get("timestamp"),
            })
    return posts


def _commentable_post_url(value: str) -> bool:
    parsed = urlsplit(value)
    if parsed.scheme != "https":
        return False
    if parsed.netloc == "mock.local":
        return parsed.path.startswith("/posts/")
    return (
        parsed.netloc == "www.reddit.com"
        and parsed.path.lower().startswith("/r/hackathonscanada/comments/")
    )
