import json
import tempfile
import unittest
from pathlib import Path

from backend import config
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
                        "instructions": "Create a clearly labeled synthetic kickoff post.",
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
        self.assertIn("Safety and demo boundary", self.planner.contexts[0]["repository_instructions"])

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
        self.assertEqual(ledger["reddit_username"], "synthetic_cobb")
        self.assertEqual(ledger["activity"][0]["url"], "https://mock.local/posts/1")
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
