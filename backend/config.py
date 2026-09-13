"""Environment-driven settings. Nothing here talks to the network."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

STEEL_API_KEY = os.environ.get("STEEL_API_KEY", "")
MAX_AGENTS = min(8, int(os.environ.get("MAX_AGENTS", "5")))
STEEL_USE_PROXY = os.environ.get("STEEL_USE_PROXY", "true").lower() == "true"

# Model-backed campaign coordinator. The model name is intentionally configurable:
# deployments may expose different model IDs while keeping the requested default.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ORCHESTRATOR_MODEL = os.environ.get("ORCHESTRATOR_MODEL", "gpt-5.6-sol")
ORCHESTRATOR_REASONING_EFFORT = os.environ.get("ORCHESTRATOR_REASONING_EFFORT", "medium")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")

# Session hard timeout (ms). Agents finish well before this; Steel kills stragglers.
SESSION_TIMEOUT_MS = 10 * 60 * 1000

DISPLAY_DIR = ROOT / "display"
AGENT_STATES_DIR = ROOT / "backend" / "agent_states"
ORCHESTRATOR_RUNS_DIR = ROOT / "backend" / "orchestrator_runs"
ORCHESTRATOR_LOGS_DIR = ROOT / "orchestrator_logs"
AGENTS_INSTRUCTIONS_PATH = ROOT / "agents.md"
