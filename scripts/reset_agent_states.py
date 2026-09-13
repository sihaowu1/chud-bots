"""Clear campaign assignments and activity from every agent state ledger."""

import json
from pathlib import Path


STATE_DIR = Path(__file__).resolve().parents[1] / "backend" / "agent_states"


def main() -> None:
    paths = sorted(STATE_DIR.glob("*.json"))

    for path in paths:
        state = json.loads(path.read_text(encoding="utf-8"))
        state["assignments"] = []
        state["activity"] = []
        path.write_text(
            json.dumps(state, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    print(f"Reset assignments and activity in {len(paths)} agent state files.")


if __name__ == "__main__":
    main()
