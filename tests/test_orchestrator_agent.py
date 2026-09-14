import json
import tempfile
import unittest
from pathlib import Path

from backend import agent_state_store, config
from backend.orchestrator_agent import CampaignOrchestrator, _response_output_text


class FakePlanner:
    def __init__(self):
        self.contexts = []

    async def plan(self, context):
        self.contexts.append(context)
        if len(self.contexts) == 1:
            return {
                "summary": "Seed the synthetic discussion.",
                "assignments": [
                    {
                        "persona": "Cobb",
                        "action": "create_post",
                        "instructions": "Create the kickoff post.",
                        "title": "Synthetic kickoff",
                        "body": "Test discussion",
                        "target_url": None,
                        "wait_for": [],
                    }
                ],
            }
        first_task = context["previous_phases"][0]["assignments"][0]["id"]
        return {
            "summary": "Wait for the next safe dependency.",
            "assignments": [
                {
                    "persona": "Cobb",
                    "action": "wait",
                    "instructions": "Wait until the kickoff post has been processed.",
                    "title": None,
                    "body": None,
                    "target_url": None,
                    "wait_for": [first_task],
                }
            ],
        }


class CampaignOrchestratorTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        root = Path(self.temp_dir.name)
        self.old_states_dir = config.AGENT_STATES_DIR
        config.AGENT_STATES_DIR = root / "states"
        self.planner = FakePlanner()
        self.orchestrator = CampaignOrchestrator(
            planner=self.planner,
            runs_dir=root / "runs",
            logs_dir=root / "logs",
        )

    async def asyncTearDown(self):
        config.AGENT_STATES_DIR = self.old_states_dir
        self.temp_dir.cleanup()

    async def test_start_records_assignment_without_exposing_credentials(self):
        run = await self.orchestrator.start(
            "Coordinate a staged launch", selected_personas=["Cobb"]
        )

        task = run["phases"][0]["assignments"][0]
        self.assertEqual(task["action"], "create_post")
        self.assertEqual(run["model"], "gpt-5.6-sol")
        state = json.loads((config.AGENT_STATES_DIR / "cobb.json").read_text())
        self.assertEqual(state["assignments"][0]["id"], task["id"])
        self.assertIn("activity", state)
        self.assertNotIn("email", self.planner.contexts[0]["agents"][0])
        orchestrator_instructions = self.planner.contexts[0]["orchestrator_instructions"]
        self.assertTrue(orchestrator_instructions.startswith("# Inception orchestrator prompt"))
        self.assertIn("## Objective", orchestrator_instructions)
        snapshots = sorted((Path(self.temp_dir.name) / "logs" / run["id"]).glob("*.json"))
        self.assertEqual([path.name for path in snapshots], ["0.json", "1.json"])
        latest = json.loads(snapshots[-1].read_text(encoding="utf-8"))
        self.assertEqual([entry["kind"] for entry in latest["entries"]], ["thinking", "action"])
        self.assertEqual(latest["previous"], "0.json")

    async def test_activity_is_timestamped_and_triggers_next_phase(self):
        run = await self.orchestrator.start("Staged demo", selected_personas=["Cobb"])
        task_id = run["phases"][0]["assignments"][0]["id"]

        updated = await self.orchestrator.record_activity(
            run["id"],
            persona="Cobb",
            task_id=task_id,
            kind="post",
            status="completed",
            content="[Synthetic demo] kickoff",
            url="https://mock.local/posts/1",
            reddit_username="synthetic_cobb",
        )

        self.assertEqual(len(updated["phases"]), 2)
        ledger = updated["agent_ledgers"]["Cobb"]
        self.assertIsNone(ledger["reddit_username"])
        self.assertEqual(ledger["activity"][0]["url"], "https://mock.local/posts/1")
        self.assertEqual(ledger["activity"][0]["reddit_username"], "synthetic_cobb")
        self.assertIn("timestamp", ledger["activity"][0])
        self.assertEqual(updated["phases"][1]["assignments"][0]["wait_for"], [task_id])

    async def test_completed_post_requires_audit_fields(self):
        run = await self.orchestrator.start("Staged demo", selected_personas=["Cobb"])
        task_id = run["phases"][0]["assignments"][0]["id"]
        with self.assertRaisesRegex(ValueError, "requires content"):
            await self.orchestrator.record_activity(
                run["id"],
                persona="Cobb",
                task_id=task_id,
                kind="post",
                status="completed",
            )

    async def test_private_environment_is_sent_to_planner(self):
        run = await self.orchestrator.start(
            "Private demo",
            selected_personas=["Cobb"],
            environment="private",
        )

        self.assertEqual(run["environment"], "private")
        self.assertEqual(self.planner.contexts[-1]["environment"], "private")

    async def test_promote_prompt_exposes_promotion_target(self):
        await self.orchestrator.start(
            "promote better public transit", selected_personas=["Cobb"]
        )

        self.assertEqual(
            self.planner.contexts[-1]["promotion_target"],
            "better public transit",
        )

    async def test_context_exposes_completed_post_links_from_ledgers(self):
        agent_state_store.append_activity(
            "Cobb",
            {
                "run_id": "older-run",
                "task_id": "older-run-p1-t1",
                "kind": "post",
                "status": "completed",
                "content": "A previous kickoff post.",
                "url": "https://mock.local/posts/older-run-p1-t1",
                "reddit_username": "synthetic_cobb",
            },
        )
        agent_state_store.append_activity(
            "Cobb",
            {
                "run_id": "profile-run",
                "task_id": "profile-run-p1-t1",
                "kind": "post",
                "status": "completed",
                "content": "A profile post should not be a comment target.",
                "url": "https://mock.local/profile-posts/profile-run-p1-t1",
                "reddit_username": "synthetic_cobb",
            },
        )
        agent_state_store.append_activity(
            "Cobb",
            {
                "run_id": "reply-run",
                "task_id": "reply-run-p1-t1",
                "kind": "comment",
                "status": "completed",
                "content": "A previous reply.",
                "url": "https://mock.local/comments/reply-run-p1-t1",
                "reddit_username": "synthetic_cobb",
            },
        )

        await self.orchestrator.start("Add a reply", selected_personas=["Cobb"])

        self.assertEqual(
            self.planner.contexts[-1]["existing_posts"],
            [{
                "persona": "Cobb",
                "task_id": "older-run-p1-t1",
                "run_id": "older-run",
                "url": "https://mock.local/posts/older-run-p1-t1",
                "content": "A previous kickoff post.",
                "reddit_username": "synthetic_cobb",
                "timestamp": self.planner.contexts[-1]["existing_posts"][0]["timestamp"],
            }],
        )
        self.assertEqual(
            self.planner.contexts[-1]["existing_comments"],
            [{
                "persona": "Cobb",
                "task_id": "reply-run-p1-t1",
                "run_id": "reply-run",
                "url": "https://mock.local/comments/reply-run-p1-t1",
                "content": "A previous reply.",
                "reddit_username": "synthetic_cobb",
                "timestamp": self.planner.contexts[-1]["existing_comments"][0]["timestamp"],
            }],
        )

    async def test_comment_target_must_be_stored_agent_link_from_another_persona(self):
        agent_state_store.append_activity(
            "Cobb",
            {
                "run_id": "older-run",
                "task_id": "older-run-p1-t1",
                "kind": "post",
                "status": "completed",
                "content": "A previous kickoff post.",
                "url": "https://mock.local/posts/older-run-p1-t1",
                "reddit_username": "synthetic_cobb",
            },
        )

        class StoredTargetPlanner:
            async def plan(self, _context):
                return {
                    "summary": "Reply internally.",
                    "assignments": [{
                        "persona": "Arthur",
                        "action": "comment",
                        "instructions": "Reply to Cobb's stored post.",
                        "title": None,
                        "body": "Adding a reply.",
                        "target_url": "https://mock.local/posts/older-run-p1-t1",
                        "wait_for": [],
                    }],
                }

        orchestrator = CampaignOrchestrator(
            planner=StoredTargetPlanner(),
            runs_dir=Path(self.temp_dir.name) / "stored-runs",
            logs_dir=Path(self.temp_dir.name) / "stored-logs",
        )
        run = await orchestrator.start("Add a reply", selected_personas=["Cobb", "Arthur"])

        self.assertEqual(run["phases"][0]["assignments"][0]["persona"], "Arthur")

    async def test_comment_target_rejects_outside_or_own_links(self):
        agent_state_store.append_activity(
            "Cobb",
            {
                "run_id": "older-run",
                "task_id": "older-run-p1-t1",
                "kind": "post",
                "status": "completed",
                "content": "A previous kickoff post.",
                "url": "https://mock.local/posts/older-run-p1-t1",
                "reddit_username": "synthetic_cobb",
            },
        )

        class OutsidePlanner:
            async def plan(self, _context):
                return {
                    "summary": "Bad target.",
                    "assignments": [{
                        "persona": "Arthur",
                        "action": "comment",
                        "instructions": "Reply outside the agent graph.",
                        "title": None,
                        "body": "Adding a reply.",
                        "target_url": "https://mock.local/posts/not-in-ledger",
                        "wait_for": [],
                    }],
                }

        outside = CampaignOrchestrator(
            planner=OutsidePlanner(),
            runs_dir=Path(self.temp_dir.name) / "outside-runs",
            logs_dir=Path(self.temp_dir.name) / "outside-logs",
        )
        with self.assertRaisesRegex(Exception, "stored agent post"):
            await outside.start("Add a reply", selected_personas=["Cobb", "Arthur"])

        class OwnPlanner:
            async def plan(self, _context):
                return {
                    "summary": "Own target.",
                    "assignments": [{
                        "persona": "Cobb",
                        "action": "comment",
                        "instructions": "Reply to own post.",
                        "title": None,
                        "body": "Adding a reply.",
                        "target_url": "https://mock.local/posts/older-run-p1-t1",
                        "wait_for": [],
                    }],
                }

        own = CampaignOrchestrator(
            planner=OwnPlanner(),
            runs_dir=Path(self.temp_dir.name) / "own-runs",
            logs_dir=Path(self.temp_dir.name) / "own-logs",
        )
        with self.assertRaisesRegex(Exception, "another selected persona"):
            await own.start("Add a reply", selected_personas=["Cobb", "Arthur"])


class ResponseParsingTests(unittest.TestCase):
    def test_extracts_responses_api_output_text(self):
        raw = {
            "output": [
                {
                    "type": "message",
                    "content": [{"type": "output_text", "text": '{"summary":"ok"}'}],
                }
            ]
        }
        self.assertEqual(_response_output_text(raw), '{"summary":"ok"}')


if __name__ == "__main__":
    unittest.main()
