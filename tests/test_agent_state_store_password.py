import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import agent_state_store, config


class AgentStatePasswordTests(unittest.TestCase):
    def test_save_generates_password_when_email_is_added(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(config, "AGENT_STATES_DIR", Path(directory)):
                state = agent_state_store.load_or_create("Arthur")
                state["email"]["address"] = "arthur@example.com"
                agent_state_store.save("Arthur", state)

                saved = agent_state_store.load_or_create("Arthur")

        self.assertEqual(saved["email"]["password"], "123ABC#Arthur")

    def test_load_backfills_password_for_existing_email(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(config, "AGENT_STATES_DIR", Path(directory)):
                path = Path(directory) / "ariadne.json"
                path.write_text(
                    '{"persona":"Ariadne","email":{"address":"a@example.com"}}',
                    encoding="utf-8",
                )

                saved = agent_state_store.load_or_create("Ariadne")

        self.assertEqual(saved["email"]["password"], "123ABC#Ariadne")


if __name__ == "__main__":
    unittest.main()
