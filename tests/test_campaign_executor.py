import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock

from backend import config, agent_state_store
from backend.campaign_executor import CampaignExecutor, execution_lock, execution_summary
from backend.orchestrator_agent import CampaignOrchestrator


class Planner:
    async def plan(self, context):
        phases = context["previous_phases"]
        task = dict(persona="Cobb", instructions="Disclosed demo", target_url=None,
                    wait_for=[], title="Synthetic kickoff", body="Test discussion")
        task["action"] = "create_post"
        if phases:
            task.update(action="comment", title=None,
                        wait_for=[phases[0]["assignments"][0]["id"]])
        return {"summary": "Test plan", "assignments": [task]}


class ExecutorTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old = config.AGENT_STATES_DIR
        config.AGENT_STATES_DIR = Path(self.temp.name) / "states"
        self.coordinator = CampaignOrchestrator(
            Planner(), Path(self.temp.name) / "runs", Path(self.temp.name) / "logs"
        )
        self.publisher = AsyncMock(return_value={
            "url": "https://www.reddit.com/r/HackathonsCanada/comments/abc/test/",
            "reddit_username": "real_cobb",
        })
        self.executor = CampaignExecutor(self.coordinator, self.publisher)

    async def asyncTearDown(self):
        config.AGENT_STATES_DIR = self.old
        self.temp.cleanup()

    async def start(self, environment="mock"):
        return await self.coordinator.start("Demo", selected_personas=["Cobb"], environment=environment)

    async def test_mock_chain_and_resume_do_not_publish_or_change_identity(self):
        state = agent_state_store.load_or_create("Cobb")
        state["reddit"]["username"] = "saved_identity"
        agent_state_store.save("Cobb", state)
        run = await self.start()
        result = await self.executor.execute(run["id"], phases=2)
        completed = [e for e in result["events"] if e.get("status") == "completed"]
        self.assertEqual(len(completed), 2)
        self.assertEqual(completed[1]["parent_url"], completed[0]["url"])
        self.assertEqual(completed[0]["content"], "Test discussion")
        self.assertEqual(agent_state_store.load_or_create("Cobb")["reddit"]["username"], "saved_identity")
        resumed = await self.executor.execute(run["id"])
        self.assertEqual(len(resumed["events"]), len(result["events"]))
        self.publisher.assert_not_awaited()
        logs = sorted((Path(self.temp.name) / "logs" / run["id"]).glob("*.json"),
                      key=lambda path: int(path.stem))
        entries = json.loads(logs[-1].read_text())["entries"]
        self.assertIn("cli", {entry["kind"] for entry in entries})
        self.assertIn("output", {entry["kind"] for entry in entries})

    async def test_private_commands_use_task_id_and_report_identity(self):
        run = await self.start("private")
        result = await self.executor.execute(run["id"])
        command = self.publisher.call_args.args[0]
        self.assertEqual(command.request_id, run["phases"][0]["assignments"][0]["id"])
        self.assertEqual(command.action, "post")
        self.assertEqual(self.publisher.call_args.kwargs, {})
        self.assertEqual(result["events"][-1]["status"], "completed")
        await self.executor.execute(run["id"])
        self.publisher.assert_awaited_once()

    async def test_failure_stops_replanning_and_blocks_resume(self):
        self.publisher.side_effect = TimeoutError("Uncertain submission")
        run = await self.start("private")
        result = await self.executor.execute(run["id"], phases=3)
        self.assertEqual(len(result["phases"]), 1)
        self.assertEqual(result["events"][-1]["status"], "failed")
        with self.assertRaisesRegex(RuntimeError, "reconcile"):
            await self.executor.execute(run["id"])
        self.publisher.assert_awaited_once()

    async def test_interrupted_task_blocks_execution(self):
        run = await self.start()
        task = run["phases"][0]["assignments"][0]
        await self.coordinator.record_activity(run["id"], persona="Cobb", task_id=task["id"],
                                              kind="post", status="started", continue_after=False)
        with self.assertRaisesRegex(RuntimeError, "reconcile"):
            await self.executor.execute(run["id"])

    async def test_incomplete_dependency_does_not_execute(self):
        run = await self.start()
        await self.coordinator.continue_run(run["id"])
        task = run["phases"][0]["assignments"][0]
        await self.coordinator.record_activity(run["id"], persona="Cobb", task_id=task["id"],
                                              kind="post", status="cancelled", continue_after=False)
        result = await self.executor.execute(run["id"], phases=3)
        self.assertEqual(len(result["phases"]), 2)
        self.assertFalse(any(e.get("kind") == "comment" for e in result["events"]))

    async def test_wait_only_phase_stops_without_model_loop(self):
        run = await self.start()
        task = run["phases"][0]["assignments"][0]
        task.update(action="wait", title=None, body=None)
        self.coordinator._save(run)
        result = await self.executor.execute(run["id"], phases=5)
        self.assertEqual(len(result["phases"]), 1)
        self.assertEqual(result["events"][-1]["kind"], "wait")
        self.publisher.assert_not_awaited()

    async def test_executor_lock_rejects_overlap_and_releases(self):
        run = await self.start()
        with execution_lock(self.coordinator.runs_dir):
            with self.assertRaisesRegex(RuntimeError, "already running"):
                await self.executor.execute(run["id"])
        await self.executor.execute(run["id"])

    async def test_callback_cannot_use_another_personas_task(self):
        run = await self.coordinator.start("Demo", selected_personas=["Cobb", "Arthur"])
        with self.assertRaisesRegex(ValueError, "does not own"):
            await self.coordinator.record_activity(
                run["id"], persona="Arthur", task_id=run["phases"][0]["assignments"][0]["id"],
                kind="post", status="started", continue_after=False,
            )

    async def test_execution_summary_reports_actions_without_dumping_run(self):
        run = await self.start("private")
        result = await self.executor.execute(run["id"])

        output = execution_summary(result)

        self.assertIn(f"Orchestration {run['id']}", output)
        self.assertIn("Outcome: 1 completed, 0 failed, 0 pending", output)
        self.assertIn("[OK] Cobb created post", output)
        self.assertIn("https://www.reddit.com/r/HackathonsCanada/comments/abc/test/", output)
        self.assertNotIn('"schema_version"', output)


if __name__ == "__main__":
    unittest.main()
