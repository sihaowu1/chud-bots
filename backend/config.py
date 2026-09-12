"""Environment-driven settings. Nothing here talks to the network."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

STEEL_API_KEY = os.environ.get("STEEL_API_KEY", "")
MAX_AGENTS = int(os.environ.get("MAX_AGENTS", "5"))
STEEL_USE_PROXY = os.environ.get("STEEL_USE_PROXY", "true").lower() == "true"

# Session hard timeout (ms). Agents finish well before this; Steel kills stragglers.
SESSION_TIMEOUT_MS = 10 * 60 * 1000

DISPLAY_DIR = ROOT / "display"
