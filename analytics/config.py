"""Analytics settings. Reads the repo's shared .env; nothing here talks to the network."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DB_PATH = Path(os.environ.get("ANALYTICS_DB_PATH", Path(__file__).resolve().parent / "data" / "analytics.db"))

# Presence probes. 0 disables the background loop entirely.
VISIBILITY_INTERVAL_S = int(os.environ.get("VISIBILITY_INTERVAL_S", "900"))
PROBE_DEPTH_PAGES = int(os.environ.get("PROBE_DEPTH_PAGES", "3"))

# Search probes use their own Steel session budget, separate from backend's MAX_AGENTS.
# Keep MAX_AGENTS + MAX_PROBES within your Steel plan's concurrent session cap.
MAX_PROBES = int(os.environ.get("MAX_PROBES", "1"))

SERP_GL = os.environ.get("SERP_GL", "us")
SERP_HL = os.environ.get("SERP_HL", "en")
# Pins the probe's exit node so positions stay comparable over time.
STEEL_REGION = os.environ.get("STEEL_REGION") or None

# AI-answer probe. Gated on key presence, never a separate flag, so a fresh clone cannot
# spend money by accident. Deliberately not OPENAI_API_KEY: setting up the orchestrator
# must not silently start paid probing too.
AI_PROBE_API_KEY = os.environ.get("AI_PROBE_API_KEY", "")
AI_PROBE_ENABLED = bool(AI_PROBE_API_KEY)
AI_PROBE_API_URL = os.environ.get("AI_PROBE_API_URL", "https://api.anthropic.com/v1/messages")
AI_PROBE_MODEL = os.environ.get("AI_PROBE_MODEL", "claude-haiku-4-5-20251001")
AI_PROBE_MAX_CALLS_PER_DAY = int(os.environ.get("AI_PROBE_MAX_CALLS_PER_DAY", "50"))
