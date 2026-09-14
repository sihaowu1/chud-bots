import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.orchestrator_agent import OrchestratorConfigurationError, OrchestratorModelError
from backend.search_prompt_selector import select_search_prompts


def _response(assignments):
    return {
        "status": "completed",
        "output": [{"type": "message", "content": [{
            "type": "output_text", "text": json.dumps({"assignments": assignments}),
        }]}],
    }


class SearchPromptSelectorTests(unittest.IsolatedAsyncioTestCase):
    async def test_assigns_one_distinct_query_per_persona_with_requested_model(self):
        response = MagicMock()
        response.is_error = False
        response.json.return_value = _response([
            {"persona": "Eames", "query": "python automation tools"},
            {"persona": "Saito", "query": "best python developer platforms"},
        ])
        client = AsyncMock()
        client.__aenter__.return_value.post.return_value = response
        with patch("backend.search_prompt_selector.config.OPENAI_API_KEY", "test-key"), patch(
            "backend.search_prompt_selector.httpx.AsyncClient", return_value=client,
        ):
            result = await select_search_prompts("Python tools", ["Eames", "Saito"])

        self.assertEqual(result["Eames"], "python automation tools")
        payload = client.__aenter__.return_value.post.await_args.kwargs["json"]
        self.assertEqual(payload["model"], "gpt-5.6-sol")
        self.assertEqual(payload["reasoning"], {"effort": "low"})

    async def test_rejects_duplicate_queries(self):
        response = MagicMock()
        response.is_error = False
        response.json.return_value = _response([
            {"persona": "Eames", "query": "same query"},
            {"persona": "Saito", "query": "Same Query"},
        ])
        client = AsyncMock()
        client.__aenter__.return_value.post.return_value = response
        with patch("backend.search_prompt_selector.config.OPENAI_API_KEY", "test-key"), patch(
            "backend.search_prompt_selector.httpx.AsyncClient", return_value=client,
        ):
            with self.assertRaises(OrchestratorModelError):
                await select_search_prompts("topic", ["Eames", "Saito"])

    async def test_requires_api_key(self):
        with patch("backend.search_prompt_selector.config.OPENAI_API_KEY", ""):
            with self.assertRaises(OrchestratorConfigurationError):
                await select_search_prompts("topic", ["Eames"])


if __name__ == "__main__":
    unittest.main()
