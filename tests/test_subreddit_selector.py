import json
import unittest
from unittest.mock import AsyncMock, Mock, patch

import httpx
from fastapi import HTTPException

from backend.main import LaunchRequest, launch
from backend.orchestrator_agent import OrchestratorConfigurationError, OrchestratorModelError
from backend.subreddit_selector import select_subreddits


NAMES = ['Python', 'learnpython', 'programming', 'coding', 'computerscience']


class SelectorTests(unittest.IsolatedAsyncioTestCase):
    async def select(self, raw, status=200):
        client = AsyncMock()
        client.post.return_value = httpx.Response(status, json=raw)
        with patch('backend.subreddit_selector.config.OPENAI_API_KEY', 'test-key'), patch(
            'backend.subreddit_selector.httpx.AsyncClient'
        ) as factory:
            factory.return_value.__aenter__.return_value = client
            result = await select_subreddits(' Python tools ')
        return result, client.post.call_args.kwargs['json']

    def response(self, names=NAMES):
        return {'status': 'completed', 'output': [{'type': 'message', 'content': [
            {'type': 'output_text', 'text': json.dumps({'subreddits': names})},
        ]}]}

    async def test_exact_model_reasoning_and_topic(self):
        result, payload = await self.select(self.response())
        self.assertEqual(result, tuple(NAMES))
        self.assertEqual(payload['model'], 'gpt-5.4-mini')
        self.assertEqual(payload['reasoning'], {'effort': 'low'})
        self.assertEqual(payload['input'], 'Python tools')

    async def test_rejects_wrong_count_duplicates_urls_and_incomplete_output(self):
        for names in [NAMES[:4], NAMES + ['tech'], NAMES[:4] + ['PYTHON'],
                      NAMES[:4] + ['https://evil.test'], NAMES[:4] + [123]]:
            with self.subTest(names=names), self.assertRaises(OrchestratorModelError):
                await self.select(self.response(names))
        for raw in [{'status': 'incomplete'}, {'status': 'completed', 'output': []}]:
            with self.assertRaises(OrchestratorModelError):
                await self.select(raw)

    async def test_http_error_and_missing_key(self):
        with self.assertRaises(OrchestratorModelError):
            await self.select({}, status=429)
        with patch('backend.subreddit_selector.config.OPENAI_API_KEY', ''):
            with self.assertRaises(OrchestratorConfigurationError):
                await select_subreddits('python')

    async def test_empty_prompt_does_not_call_api(self):
        with patch('backend.subreddit_selector.httpx.AsyncClient') as client:
            with self.assertRaises(ValueError):
                await select_subreddits('   ')
            client.assert_not_called()

    async def test_launch_selects_once_and_shares_route(self):
        req = LaunchRequest(target='https://www.reddit.com', mode='reddit_browse',
                            prompt='Python', count=2, personas=['Cobb', 'Arthur'])
        with patch('backend.main.select_subreddits', new_callable=AsyncMock,
                   return_value=tuple(NAMES)) as select, patch('backend.main.orchestrator.launch',
                   return_value=[]) as start:
            await launch(req)
        select.assert_awaited_once_with('Python')
        self.assertEqual(start.call_args.kwargs['subreddits'], tuple(NAMES))
        self.assertEqual(start.call_args.args[1], ['Python'])

    async def test_selection_failure_does_not_launch_sessions(self):
        req = LaunchRequest(target='https://www.reddit.com', mode='reddit_browse', prompt='Python')
        with patch('backend.main.select_subreddits', new_callable=AsyncMock,
                   side_effect=OrchestratorModelError('invalid selection')), patch(
                   'backend.main.orchestrator.launch') as start:
            with self.assertRaises(HTTPException) as error:
                await launch(req)
        self.assertEqual(error.exception.status_code, 502)
        start.assert_not_called()

    async def test_legacy_launch_does_not_call_model(self):
        with patch('backend.main.select_subreddits', new_callable=AsyncMock) as select, patch(
            'backend.main.orchestrator.launch', return_value=[]
        ):
            await launch(LaunchRequest(target='https://www.reddit.com'))
        select.assert_not_awaited()
