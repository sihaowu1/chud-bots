import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from backend import orchestrator, personas
from backend.agent import Dreamer
from backend.main import LaunchRequest, launch


BOUND = {'Yusuf', 'Cobb', 'Arthur', 'Ariadne', 'Generic 1', 'Generic 2', 'Generic 3', 'Generic 4'}
ROUTE = ('python', 'coding', 'programming', 'learnpython', 'technology')


class BindingTests(unittest.IsolatedAsyncioTestCase):
    def test_exactly_four_named_and_four_generic_bound_in_every_launch_mode(self):
        pool = personas.pick(15)
        self.assertEqual({p.name for p in pool if p.browsing_mode == 'reddit_browse'}, BOUND)
        for requested_mode in ('legacy', 'reddit_browse'):
            for persona in pool:
                agent = Dreamer(persona, 'Python', '', mode=requested_mode)
                expected = 'reddit_browse' if persona.name in BOUND else 'legacy'
                self.assertEqual(agent.mode, expected)
                self.assertEqual(agent.state.snapshot()['mode'], expected)

    async def test_mixed_launch_injects_route_only_into_bound_personas(self):
        with patch.dict(orchestrator._agents, {}, clear=True), patch(
            'backend.orchestrator.config.MAX_AGENTS', 15
        ), patch.object(Dreamer, 'run', new_callable=AsyncMock):
            snapshots = orchestrator.launch('', ['Python'], 15, subreddits=ROUTE)
            self.assertEqual(len(snapshots), 15)
            for agent in orchestrator._agents.values():
                self.assertEqual(agent.browse_subreddits, ROUTE if agent.persona.name in BOUND else None)
            await asyncio.gather(*(agent.task for agent in orchestrator._agents.values()))

    async def test_bound_persona_selects_topic_even_with_legacy_request(self):
        with patch('backend.main.select_subreddits', new_callable=AsyncMock, return_value=ROUTE) as select, patch(
            'backend.main.orchestrator.launch', return_value=[]
        ):
            await launch(LaunchRequest(target='', prompt='Python', personas=['Generic 4']))
        select.assert_awaited_once_with('Python')

    async def test_unbound_persona_does_not_select_even_with_browse_request(self):
        with patch('backend.main.select_subreddits', new_callable=AsyncMock) as select, patch(
            'backend.main.orchestrator.launch', return_value=[]
        ):
            await launch(LaunchRequest(target='', mode='reddit_browse', prompt='Python', personas=['Generic 5']))
        select.assert_not_awaited()

    async def test_direct_run_selects_before_opening_steel(self):
        agent = Dreamer(personas.pick(1)[0], 'Python', '')
        with patch('backend.subreddit_selector.select_subreddits', new_callable=AsyncMock,
                   side_effect=RuntimeError('selection failed')) as select, patch(
                   'backend.agent.steel_client.create_session', new_callable=AsyncMock) as create:
            await agent.run()
        select.assert_awaited_once_with('Python')
        create.assert_not_awaited()
        self.assertEqual(agent.state.status, 'failed')
