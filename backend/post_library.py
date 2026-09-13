"""Saved confirmed posts shared by the dashboard and campaign planner."""

import json
from urllib.parse import urlsplit

from . import agent_state_store, personas


def list_posts() -> list[dict]:
    posts = []
    seen = set()
    for name in personas.names():
        ledger = agent_state_store.public_ledger(name)
        for activity in ledger.get("activity", []):
            url = activity.get("url")
            if (
                activity.get("kind") != "post"
                or activity.get("status") != "completed"
                or not isinstance(url, str)
                or url in seen
            ):
                continue
            seen.add(url)
            posts.append({
                "id": activity.get("task_id") or activity.get("request_id") or url,
                "persona": name,
                "url": url,
                "title": _activity_title(activity),
                "content": activity.get("content") or activity.get("body"),
                "reddit_username": activity.get("reddit_username"),
                "timestamp": activity.get("timestamp"),
                "kind": "profile_post" if _is_profile_post_url(url) else "post",
            })
    return sorted(posts, key=lambda item: item.get("timestamp") or "", reverse=True)


def _activity_title(activity: dict) -> str | None:
    title = activity.get("title")
    if isinstance(title, str) and title.strip():
        return title.strip()
    note = activity.get("note")
    if isinstance(note, str):
        try:
            parsed = json.loads(note)
        except json.JSONDecodeError:
            return None
        title = parsed.get("title") if isinstance(parsed, dict) else None
        if isinstance(title, str) and title.strip():
            return title.strip()
    return None


def _is_profile_post_url(url: str) -> bool:
    parsed = urlsplit(url)
    return (
        parsed.netloc == "mock.local" and parsed.path.startswith("/profile-posts/")
    ) or parsed.path.startswith("/user/") or parsed.path.startswith("/r/u_")


