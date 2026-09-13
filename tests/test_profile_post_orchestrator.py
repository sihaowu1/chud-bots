import unittest

from backend.orchestrator_agent import OrchestratorModelError
from backend.profile_post_orchestrator import ProfilePostOrchestrator


class FakePlanner:
    def __init__(self, assignments=None):
        self.calls = []
        self.assignments = assignments

    async def plan(self, query, agents):
        self.calls.append((query, agents))
        assignments = self.assignments or [
            {
                "persona": agent["persona"],
                "title": f"{agent['persona']} on the topic",
                "body": f"A distinct take from {agent['persona']}.",
            }
            for agent in agents
        ]
        return {"assignments": assignments}


class ProfilePostOrchestratorTests(unittest.IsolatedAsyncioTestCase):
    async def test_one_query_creates_one_post_for_every_selected_persona(self):
        planner = FakePlanner()
        result = await ProfilePostOrchestrator(planner).plan(
            "  Inception won Battle of the Schools  ", ["Cobb", "Arthur"],
        )

        self.assertEqual(set(result), {"Cobb", "Arthur"})
        self.assertEqual(planner.calls[0][0], "Inception won Battle of the Schools")
        self.assertEqual(
            [agent["persona"] for agent in planner.calls[0][1]], ["Cobb", "Arthur"],
        )
        self.assertNotEqual(result["Cobb"]["request_id"], result["Arthur"]["request_id"])
        self.assertTrue(result["Cobb"]["request_id"].startswith("profile-"))

    async def test_missing_duplicate_or_unknown_personas_are_rejected(self):
        cases = [
            [{"persona": "Cobb", "title": "One", "body": "Body"}],
            [
                {"persona": "Cobb", "title": "One", "body": "Body"},
                {"persona": "Cobb", "title": "Two", "body": "Body"},
            ],
            [
                {"persona": "Cobb", "title": "One", "body": "Body"},
                {"persona": "Nobody", "title": "Two", "body": "Body"},
            ],
        ]
        for assignments in cases:
            with self.subTest(assignments=assignments):
                with self.assertRaises(OrchestratorModelError):
                    await ProfilePostOrchestrator(FakePlanner(assignments)).plan(
                        "topic", ["Cobb", "Arthur"],
                    )

    async def test_query_validation_happens_before_model_call(self):
        planner = FakePlanner()
        for query in (" ", "x" * 501):
            with self.assertRaisesRegex(ValueError, "query"):
                await ProfilePostOrchestrator(planner).plan(query, ["Cobb"])
        self.assertEqual(planner.calls, [])


if __name__ == "__main__":
    unittest.main()
