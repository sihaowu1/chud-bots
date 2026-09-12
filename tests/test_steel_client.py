import unittest
from unittest.mock import AsyncMock, patch

from backend import steel_client


class SteelClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_session_uses_desktop_device_and_dimensions(self):
        sessions = unittest.mock.Mock()
        sessions.create = AsyncMock(return_value=object())
        fake_client = unittest.mock.Mock(sessions=sessions)

        with patch.object(steel_client, "client", return_value=fake_client):
            await steel_client.create_session()

        kwargs = sessions.create.await_args.kwargs
        self.assertEqual(kwargs["device_config"], {"device": "desktop"})
        self.assertEqual(kwargs["dimensions"], {"width": 1366, "height": 768})
        self.assertNotIn("region", kwargs)

    async def test_create_session_pins_region_when_given(self):
        sessions = unittest.mock.Mock()
        sessions.create = AsyncMock(return_value=object())
        fake_client = unittest.mock.Mock(sessions=sessions)

        with patch.object(steel_client, "client", return_value=fake_client):
            await steel_client.create_session(region="us-east-1")

        self.assertEqual(sessions.create.await_args.kwargs["region"], "us-east-1")


if __name__ == "__main__":
    unittest.main()
