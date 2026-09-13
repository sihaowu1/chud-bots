"""Bounded, serial execution of durable coordinator commands through the CLI publisher."""

import argparse
import json
from contextlib import contextmanager
from types import SimpleNamespace
from urllib.parse import urlsplit

from . import orchestrator_log
from .orchestrator_agent import CampaignOrchestrator
from .reddit_author import thread_url, validated_body
from .reddit_runner import publish


@contextmanager
def execution_lock(directory):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "execution.lock"
    try:
        handle = path.open("x")
    except FileExistsError as exc:
        raise RuntimeError(
            f"Campaign executor already running, or interrupted; inspect before removing {path}"
        ) from exc
    try:
        with handle:
            yield
    finally:
        path.unlink()


class CampaignExecutor:
    def __init__(self, coordinator, publisher=publish):
        self.coordinator = coordinator
        self.publisher = publisher

    async def execute(self, run_id, *, phases=1):
        if phases < 1:
            raise ValueError("phases must be positive")
        with execution_lock(self.coordinator.runs_dir):
            orchestrator_log.append(
                run_id, "cli", {"event": "executor_started", "phases": phases},
                logs_dir=self.coordinator.logs_dir,
            )
            run = self.coordinator.get(run_id)
            if run["environment"] not in {"mock", "private"}:
                raise ValueError("unsupported execution environment")
            previous = {e["task_id"]: e["status"] for e in run["events"]
                        if e["type"] == "agent_activity"}
            if any(status in {"started", "failed"} for status in previous.values()):
                raise RuntimeError("Inspect and reconcile started/failed tasks before resuming this run")
            for phase in range(phases):
                if phase:
                    run = await self.coordinator.continue_run(run_id)
                progressed = False
                tasks = [task for p in run["phases"] for task in p["assignments"]]
                for task in tasks:
                    run = self.coordinator.get(run_id)
                    activity = {
                        event["task_id"]: event for event in run["events"]
                        if event["type"] == "agent_activity"
                    }
                    # Started/failed tasks need inspection, never an automatic retry.
                    if task["id"] in activity:
                        continue
                    if any(activity.get(dep, {}).get("status") != "completed"
                           for dep in task["wait_for"]):
                        continue
                    kind = {
                        "create_post": "post",
                        "create_profile_post": "post",
                        "comment": "comment",
                        "wait": "wait",
                    }[task["action"]]
                    async def report(status, **fields):
                        return await self.coordinator.record_activity(
                            run_id, persona=task["persona"], task_id=task["id"],
                            kind=kind, status=status, continue_after=False, **fields,
                        )
                    if kind == "wait":
                        await report("completed", note=task["instructions"])
                        continue
                    await report("started")
                    try:
                        command = self._command(task, tasks, activity, run["environment"])
                        orchestrator_log.append(
                            run_id, "cli",
                            {"event": "command", "task_id": task["id"],
                             "command": vars(command)},
                            logs_dir=self.coordinator.logs_dir,
                        )
                        content = validated_body(
                            command.body, 40_000 if kind == "post" else 10_000
                        )
                        if run["environment"] == "mock":
                            path = "profile-posts" if task["action"] == "create_profile_post" else (
                                "posts" if kind == "post" else "comments"
                            )
                            result = {
                                "url": f"https://mock.local/{path}/{task['id']}",
                                "reddit_username": f"synthetic_{task['persona'].lower()}",
                            }
                        else:
                            result = await self.publisher(command)
                        await report(
                            "completed", content=content, url=result["url"],
                            reddit_username=result["reddit_username"],
                            parent_url=command.post_url,
                            note=json.dumps({"title": command.title, "result": result}),
                        )
                        orchestrator_log.append(
                            run_id, "output",
                            {"source": "publisher", "task_id": task["id"], "result": result},
                            logs_dir=self.coordinator.logs_dir,
                        )
                        progressed = True
                    except Exception as exc:
                        await report("failed", note=str(exc))
                        orchestrator_log.append(
                            run_id, "output",
                            {"source": "publisher", "task_id": task["id"],
                             "error": f"{type(exc).__name__}: {exc}"},
                            logs_dir=self.coordinator.logs_dir,
                        )
                        # Stop this batch so the planner cannot replace uncertain writes.
                        return self.coordinator.get(run_id)
                run = self.coordinator.get(run_id)
                latest = {e["task_id"]: e["status"] for e in run["events"]
                          if e["type"] == "agent_activity"}
                if not progressed or any(latest.get(t["id"]) != "completed" for t in tasks):
                    break
            return self.coordinator.get(run_id)

    @staticmethod
    def _command(task, tasks, activity, environment):
        body = task.get("body")
        title = task.get("title")
        if not isinstance(body, str) or not body.strip():
            raise ValueError("Assignment needs a concrete body; legacy prose plans must be replanned")
        if task["action"] in {"create_post", "create_profile_post"}:
            if not isinstance(title, str) or not 1 <= len(title.strip()) <= 300:
                raise ValueError("Post assignment needs a title of 1 to 300 characters")
            target = None
        else:
            target = task.get("target_url")
            if not target:
                posts = [t for t in tasks if t["id"] in task["wait_for"] and t["action"] == "create_post"]
                if len(posts) != 1:
                    raise ValueError("Comment needs a post URL or exactly one post dependency")
                target = activity[posts[0]["id"]].get("url")
            if environment == "private":
                target = thread_url(target)
            else:
                parsed = urlsplit(target or "")
                if parsed.scheme != "https" or parsed.netloc != "mock.local" or not parsed.path.startswith("/posts/"):
                    raise ValueError("Mock comments require a mock post URL")
        return SimpleNamespace(
            persona=task["persona"], request_id=task["id"], dry_run=False,
            action="profile-post" if task["action"] == "create_profile_post"
            else "post" if task["action"] == "create_post"
            else "comment",
            title=title, body=body, post_url=target,
        )


def execution_summary(run):
    """Render a concise account of executor activity, not the full durable run."""
    tasks = [task for phase in run["phases"] for task in phase["assignments"]]
    latest = {}
    for event in run["events"]:
        if event["type"] == "agent_activity":
            latest[event["task_id"]] = event

    completed = sum(event["status"] == "completed" for event in latest.values())
    failed = sum(event["status"] == "failed" for event in latest.values())
    pending = sum(task["id"] not in latest for task in tasks)
    lines = [
        f"Orchestration {run['id']}",
        f"Environment: {run['environment']}",
        f"Outcome: {completed} completed, {failed} failed, {pending} pending",
        "Actions performed:",
    ]

    performed = False
    verbs = {"post": "created post", "comment": "added comment", "wait": "waited"}
    for task in tasks:
        event = latest.get(task["id"])
        if not event:
            continue
        performed = True
        marker = "OK" if event["status"] == "completed" else event["status"].upper()
        detail = event.get("url") or event.get("note")
        action = verbs.get(event["kind"], event["kind"])
        line = f"  [{marker}] {task['persona']} {action} ({task['id']})"
        lines.append(f"{line}: {detail}" if detail else line)
    if not performed:
        lines.append("  None")

    pending_tasks = [task for task in tasks if task["id"] not in latest]
    if pending_tasks:
        lines.append("Pending assignments:")
        for task in pending_tasks:
            lines.append(
                f"  [PENDING] {task['persona']} {task['action']} ({task['id']})"
            )
    return "\n".join(lines)


async def cli(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--prompt")
    source.add_argument("--run-id", help="Execute pending commands in an existing run")
    parser.add_argument("--personas", nargs="+")
    parser.add_argument("--environment", choices=["mock", "private"], default="mock")
    parser.add_argument("--phases", type=int, default=1, help="Maximum execution batches (default: 1)")
    args = parser.parse_args(argv)
    if args.phases < 1:
        parser.error("--phases must be positive")
    coordinator = CampaignOrchestrator()
    if args.prompt:
        run = await coordinator.start(
            args.prompt,
            selected_personas=args.personas,
            environment=args.environment,
        )
        run_id = run["id"]
    else:
        run_id = args.run_id
    orchestrator_log.append(
        run_id, "cli", {"event": "invocation", "argv": list(argv)},
        logs_dir=coordinator.logs_dir,
    )
    result = await CampaignExecutor(coordinator).execute(run_id, phases=args.phases)
    print(execution_summary(result), flush=True)
    latest = {e["task_id"]: e["status"] for e in result["events"]
              if e["type"] == "agent_activity"}
    if any(status == "failed" for status in latest.values()):
        raise SystemExit(1)
