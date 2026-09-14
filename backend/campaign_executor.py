"""Bounded campaign execution with concurrent dashboard browser tasks."""

import argparse
import asyncio
import json
from contextlib import contextmanager
from types import SimpleNamespace
from urllib.parse import urlsplit

from . import orchestrator_log
from .orchestrator_agent import CampaignOrchestrator
from .reddit_author import comment_target_url, validated_body
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
    def __init__(self, coordinator, publisher=publish, *, open_all_browsers=False):
        self.coordinator = coordinator
        self.publisher = publisher
        self.open_all_browsers = open_all_browsers

    async def execute(self, run_id, *, phases=1):
        if phases < 1:
            raise ValueError("phases must be positive")
        with execution_lock(self.coordinator.runs_dir):
            run = self.coordinator.get(run_id)
            previous = {e["task_id"]: e["status"] for e in run["events"]
                        if e["type"] == "agent_activity"}
            if any(status in {"started", "failed"} for status in previous.values()):
                raise RuntimeError("Inspect and reconcile started/failed tasks before resuming this run")
            if not self.open_all_browsers or run["environment"] != "private":
                return await self._execute_tasks(run_id, phases=phases)
            assigned = {
                task["persona"] for phase in run["phases"] for task in phase["assignments"]
                if task["action"] in {"create_post", "create_profile_post", "comment"}
            }
            missing = [name for name in run["personas"] if name not in assigned]
            if missing:
                raise RuntimeError(
                    "Create a new plan with a post or comment for every selected persona; missing: "
                    + ", ".join(missing)
                )
            from .campaign_browsers import CampaignBrowsers
            browsers = CampaignBrowsers(run["personas"])
            browsers.start()
            original_publisher = self.publisher
            self.publisher = browsers.publish
            try:
                # Each publish waits only for its own browser. Slow or failed
                # signups must not hold up authenticated peers.
                result = await self._execute_tasks(run_id, phases=phases)
                await browsers.wait_ready()
                return result
            except asyncio.CancelledError:
                await browsers.stop()
                raise
            finally:
                browsers.finish()
                self.publisher = original_publisher

    async def _execute_tasks(self, run_id, *, phases):
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
            while True:
                run = self.coordinator.get(run_id)
                activity = {e["task_id"]: e for e in run["events"] if e["type"] == "agent_activity"}
                ready = []
                owners = set()
                for task in tasks:
                    if task["id"] in activity or task["persona"] in owners:
                        continue
                    if any(activity.get(dep, {}).get("status") != "completed" for dep in task["wait_for"]):
                        continue
                    ready.append(task)
                    owners.add(task["persona"])
                    if not self.open_all_browsers:
                        break
                if not ready:
                    break
                # At most one command per persona/profile at a time. All peer
                # results settle before another wave or planning phase begins.
                async with asyncio.TaskGroup() as group:
                    executions = [group.create_task(self._execute_assignment(run_id, task, tasks)) for task in ready]
                results = [execution.result() for execution in executions]
                if any(result is False for result in results):
                    return self.coordinator.get(run_id)
                progressed = progressed or any(result is True for result in results)
            run = self.coordinator.get(run_id)
            latest = {e["task_id"]: e["status"] for e in run["events"]
                      if e["type"] == "agent_activity"}
            if not progressed or any(latest.get(t["id"]) != "completed" for t in tasks):
                break
        return self.coordinator.get(run_id)


    async def _execute_assignment(self, run_id, task, tasks):
        run = self.coordinator.get(run_id)
        activity = {e["task_id"]: e for e in run["events"] if e["type"] == "agent_activity"}
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
            return None
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
            return True
        except Exception as exc:
            await report("failed", note=str(exc))
            orchestrator_log.append(
                run_id, "output",
                {"source": "publisher", "task_id": task["id"],
                 "error": f"{type(exc).__name__}: {exc}"},
                logs_dir=self.coordinator.logs_dir,
            )
            # Finish already-running peers, but do not start another batch after failure.
            return False

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
                posts = [t for t in tasks if t["id"] in task["wait_for"] and t["action"] in {"create_post", "create_profile_post"}]
                if len(posts) != 1:
                    raise ValueError("Comment needs a post URL or exactly one post dependency")
                target = activity[posts[0]["id"]].get("url")
            if environment == "private":
                target = comment_target_url(target)
            else:
                parsed = urlsplit(target or "")
                if (
                    parsed.scheme != "https"
                    or parsed.netloc != "mock.local"
                    or not parsed.path.startswith(("/posts/", "/comments/"))
                ):
                    raise ValueError("Mock comments require a mock post or comment URL")
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
