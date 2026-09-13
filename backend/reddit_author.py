"""Posts and comments through an authenticated Steel page.

Submission is never retried automatically. A durable receipt is claimed before
clicking; an interrupted/uncertain submission must be inspected on Reddit.
"""

import asyncio
import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

from playwright.async_api import Page

from . import agent_state_store, config
from .agent import Dreamer

COMMUNITY = "HackathonsCanada"
ORIGIN = "https://www.reddit.com"


def thread_url(value: str) -> str:
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or parsed.netloc != "www.reddit.com"
            or not re.fullmatch(r"/r/HackathonsCanada/comments/[a-z0-9]+/[^/]+/?", parsed.path, re.I)):
        raise ValueError("Use a www.reddit.com post permalink in r/HackathonsCanada")
    return ORIGIN + parsed.path.rstrip("/") + "/"


def comment_target_url(value: str) -> str:
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or parsed.netloc != "www.reddit.com"
            or not re.fullmatch(
                r"/r/HackathonsCanada/comments/[a-z0-9]+/[^/]+(?:/[a-z0-9]+)?/?",
                parsed.path,
                re.I,
            )):
        raise ValueError("Use a www.reddit.com post or comment permalink in r/HackathonsCanada")
    return ORIGIN + parsed.path.rstrip("/") + "/"


def _comment_parent_id(value: str) -> str:
    parts = urlsplit(value).path.strip("/").split("/")
    post_id = parts[3]
    comment_id = parts[5] if len(parts) > 5 else None
    return f"t1_{comment_id}" if comment_id else f"t3_{post_id}"


def validated_body(body: str, limit: int) -> str:
    body = body.strip()
    if not body:
        raise ValueError("Body must not be empty")
    if len(body) > limit:
        raise ValueError(f"Body exceeds {limit} characters")
    return body


def profile_post_url(value: str, username: str) -> str:
    """Return a same-origin permalink for a post owned by this profile."""
    parsed = urlsplit(value)
    profile = re.fullmatch(
        rf"/user/{re.escape(username)}/comments/[a-z0-9]+/[^/]+/?",
        parsed.path,
        re.I,
    )
    legacy = re.fullmatch(
        rf"/r/u_{re.escape(username)}/comments/[a-z0-9]+/[^/]+/?",
        parsed.path,
        re.I,
    )
    if parsed.scheme != "https" or parsed.netloc != "www.reddit.com" or not (profile or legacy):
        raise ValueError("Reddit returned an invalid profile post permalink")
    return ORIGIN + parsed.path.rstrip("/") + "/"


class RedditAuthor:
    def __init__(self, dreamer: Dreamer, page: Page, *, dry_run: bool = False):
        self.dreamer = dreamer
        self.page = page
        self.dry_run = dry_run

    def _receipt_path(self, key: str) -> Path:
        if not key.strip() or len(key) > 200:
            raise ValueError("request_id must contain 1 to 200 characters")
        digest = hashlib.sha256((self.dreamer.persona.name + "\0" + key).encode()).hexdigest()
        return config.AGENT_STATES_DIR / "reddit_receipts" / (digest + ".json")

    def _receipt(self, key: str, payload: dict) -> tuple[Path, dict | None]:
        path = self._receipt_path(key)
        if path.exists():
            receipt = json.loads(path.read_text(encoding="utf-8"))
            if receipt["payload"] != payload:
                raise ValueError("request_id already used with different content")
            if receipt["status"] != "confirmed":
                raise RuntimeError("Previous submission is uncertain; inspect Reddit and its receipt before retrying")
            return path, receipt["result"]
        return path, None

    async def _identity(self) -> str:
        self.dreamer._check_stop()
        if urlsplit(self.page.url).netloc != "www.reddit.com":
            raise RuntimeError("Open Reddit and authenticate before authoring")
        username = await self.dreamer._reddit_username(self.page)
        if not username:
            raise RuntimeError("A confirmed Reddit login is required")
        saved = agent_state_store.load_or_create(self.dreamer.persona.name)
        expected = saved["reddit"].get("username")
        if expected and expected.casefold() != username.casefold():
            raise RuntimeError("Signed-in Reddit identity differs from the persona ledger")
        return username

    async def _json(self, url: str):
        return await self.page.evaluate("""async (url) => {
            const r = await fetch(url, {credentials: 'same-origin',
                signal: AbortSignal.timeout(10000)});
            if (!r.ok) throw new Error(`Reddit verification HTTP ${r.status}`);
            return await r.json();
        }""", url)

    async def _open(self, url: str) -> None:
        self.dreamer._check_stop()
        response = await self.page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        if response and response.status >= 400:
            raise RuntimeError(f"Reddit navigation HTTP {response.status}")

    async def _submitted(self, username: str) -> list[dict]:
        listing = await self._json(f"{ORIGIN}/user/{username}/submitted.json?limit=100&sort=new")
        return [child["data"] for child in listing["data"]["children"]]

    @staticmethod
    def _matches_post(data: dict, payload: dict, username: str) -> bool:
        return (data.get("author") == username and data.get("title") == payload["title"]
                and data.get("selftext", "").strip() == payload["body"]
                and data.get("subreddit", "").casefold() == COMMUNITY.casefold())

    @staticmethod
    def _post_result(data: dict, username: str) -> dict:
        return {"url": thread_url(ORIGIN + data["permalink"]),
                "reddit_id": data["name"], "reddit_username": username,
                "removed_by_category": data.get("removed_by_category")}

    @staticmethod
    def _matches_profile_post(data: dict, payload: dict, username: str) -> bool:
        return (
            data.get("author", "").casefold() == username.casefold()
            and data.get("title") == payload["title"]
            and data.get("selftext", "").strip() == payload["body"]
            and data.get("subreddit", "").casefold() == f"u_{username}".casefold()
        )

    @staticmethod
    def _profile_post_result(data: dict, username: str) -> dict:
        return {
            "url": profile_post_url(ORIGIN + data["permalink"], username),
            "reddit_id": data["name"],
            "reddit_username": username,
            "removed_by_category": data.get("removed_by_category"),
        }

    async def reconcile_post(self, request_id: str, post_id: str) -> dict:
        """Read-only recovery of an uncertain post using its observed Reddit ID."""
        if not re.fullmatch(r"t3_[a-z0-9]+", post_id):
            raise ValueError("Expected a Reddit post ID such as t3_abc123")
        path = self._receipt_path(request_id)
        receipt = json.loads(path.read_text(encoding="utf-8"))
        if receipt["payload"]["action"] != "create_post":
            raise ValueError("This receipt is not a post")
        if receipt["status"] == "confirmed":
            return receipt["result"]
        username = await self._identity()
        listing = await self._json(f"{ORIGIN}/api/info.json?id={post_id}")
        children = listing["data"]["children"]
        if not children or not self._matches_post(children[0]["data"], receipt["payload"], username):
            raise RuntimeError("Existing post does not match the requested author/title/body/community")
        data = children[0]["data"]
        result = self._post_result(data, username)
        self._confirm(path, receipt, result, username)
        return result

    @staticmethod
    def _matches_comment(data: dict, payload: dict, username: str) -> bool:
        return (data.get("author") == username
                and data.get("body", "").strip() == payload["body"]
                and data.get("parent_id") == _comment_parent_id(payload["post_url"])
                and data.get("subreddit", "").casefold() == COMMUNITY.casefold())

    @staticmethod
    def _comment_result(data: dict, username: str) -> dict:
        return {"url": ORIGIN + data["permalink"],
                "reddit_id": data["name"], "reddit_username": username}

    @staticmethod
    def _comments(data: dict) -> list[dict]:
        out = []
        stack = list(data.get("data", {}).get("children", []))
        while stack:
            child = stack.pop(0)
            item = child.get("data", {})
            if child.get("kind") == "t1" or item.get("name", "").startswith("t1_"):
                out.append(item)
            replies = item.get("replies")
            if isinstance(replies, dict):
                stack.extend(replies.get("data", {}).get("children", []))
        return out

    async def reconcile_comment(self, request_id: str, comment_id: str) -> dict:
        """Verify an uncertain comment by ID without submitting another reply."""
        if not re.fullmatch(r"t1_[a-z0-9]+", comment_id):
            raise ValueError("Expected a Reddit comment ID such as t1_abc123")
        path = self._receipt_path(request_id)
        receipt = json.loads(path.read_text(encoding="utf-8"))
        if receipt["payload"]["action"] != "comment":
            raise ValueError("This receipt is not a comment")
        if receipt["status"] == "confirmed":
            if receipt["result"]["reddit_id"] != comment_id:
                raise ValueError("request_id is already confirmed with another comment ID")
            return receipt["result"]
        username = await self._identity()
        if username != receipt["reddit_username"]:
            raise RuntimeError("Signed-in identity differs from the original submission")
        listing = await self._json(f"{ORIGIN}/api/info.json?id={comment_id}")
        children = listing["data"]["children"]
        if (len(children) != 1 or children[0]["data"].get("name") != comment_id
                or not self._matches_comment(children[0]["data"], receipt["payload"], username)):
            raise RuntimeError("Existing comment does not match the requested author/body/post/community")
        result = self._comment_result(children[0]["data"], username)
        self._confirm(path, receipt, result, username)
        return result

    def _confirm(self, path: Path, receipt: dict, result: dict, username: str) -> None:
        receipt.update(status="confirmed", result=result)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)
        agent_state_store.append_activity(self.dreamer.persona.name, {
            **receipt["payload"], **result, "status": "completed",
        }, reddit_username=username)
        submission = (
            "post"
            if receipt["payload"]["action"] in {"create_post", "create_profile_post"}
            else "comment"
        )
        self.dreamer._emit(3, f"Reddit {submission} confirmed", result["url"])

    async def _submit(self, path: Path, payload: dict, username: str, button, verify) -> dict:
        self.dreamer._check_stop()
        if self.dry_run:
            await button.wait_for(state="visible", timeout=15_000)
            async with asyncio.timeout(15):
                while not await button.is_enabled():
                    await asyncio.sleep(0.2)
            return {"status": "draft", "url": self.page.url, "reddit_username": username}
        receipt = {"status": "uncertain", "payload": payload, "reddit_username": username,
                   "attempted_at": datetime.now(UTC).isoformat()}
        path.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation protects against concurrent processes using this key.
        with path.open("x", encoding="utf-8") as handle:
            json.dump(receipt, handle, indent=2)
        destination = (
            "the signed-in profile"
            if payload["action"] == "create_profile_post"
            else f"r/{COMMUNITY}"
        )
        self.dreamer._emit(2, f"submitting {payload['action']} to {destination}")
        await button.click(timeout=15_000)
        result = await verify()
        self._confirm(path, receipt, result, username)
        return result

    async def create_post(self, title: str, body: str, *, request_id: str) -> dict:
        title = title.strip()
        if not title or len(title) > 300 or "\n" in title or "\r" in title:
            raise ValueError("Title must be a single line of 1 to 300 characters")
        body = validated_body(body, 40_000)
        payload = dict(action="create_post", subreddit=COMMUNITY, title=title,
                       body=body, request_id=request_id)
        path, cached = self._receipt(request_id, payload)
        if cached:
            return cached
        username = await self._identity()
        existing = {data["name"] for data in await self._submitted(username)}
        await self._open(f"{ORIGIN}/r/{COMMUNITY}/submit/?type=TEXT")
        await self.page.get_by_role("textbox", name="Title", exact=True).fill(title)
        await self.page.get_by_role("textbox", name="Post body text field", exact=True).fill(body)

        async def verify():
            async with asyncio.timeout(45):
                while True:
                    try:
                        for data in await self._submitted(username):
                            if data["name"] not in existing and self._matches_post(data, payload, username):
                                return self._post_result(data, username)
                    except Exception:
                        # Navigation can replace the JS context; only retry reads.
                        pass
                    await asyncio.sleep(2)

        return await self._submit(path, payload, username,
                                  self.page.get_by_role("button", name="Post", exact=True), verify)

    async def create_profile_post(self, title: str, body: str, *, request_id: str) -> dict:
        """Create a text post on the authenticated account's own profile."""
        title = title.strip()
        if not title or len(title) > 300 or "\n" in title or "\r" in title:
            raise ValueError("Title must be a single line of 1 to 300 characters")
        body = validated_body(body, 40_000)
        payload = dict(
            action="create_profile_post", target="profile", title=title,
            body=body, request_id=request_id,
        )
        path, cached = self._receipt(request_id, payload)
        if cached:
            return cached
        username = await self._identity()
        existing = {data["name"] for data in await self._submitted(username)}
        await self._open(f"{ORIGIN}/user/{username}/submit/?type=TEXT")
        await self.page.get_by_role("textbox", name="Title", exact=True).fill(title)
        await self.page.get_by_role(
            "textbox", name="Post body text field", exact=True,
        ).fill(body)

        async def verify():
            async with asyncio.timeout(45):
                while True:
                    try:
                        for data in await self._submitted(username):
                            if (data["name"] not in existing
                                    and self._matches_profile_post(data, payload, username)):
                                return self._profile_post_result(data, username)
                    except Exception:
                        pass
                    await asyncio.sleep(2)

        return await self._submit(
            path, payload, username,
            self.page.get_by_role("button", name="Post", exact=True), verify,
        )

    async def comment(self, post_url: str, body: str, *, request_id: str) -> dict:
        url = comment_target_url(post_url)
        body = validated_body(body, 10_000)
        payload = dict(action="comment", subreddit=COMMUNITY, post_url=url,
                       body=body, request_id=request_id)
        path, cached = self._receipt(request_id, payload)
        if cached:
            return cached
        username = await self._identity()
        await self._open(url)
        before = await self._json(url + ".json?limit=500&sort=new")
        post = before[0]["data"]["children"][0]["data"]
        if post.get("subreddit", "").casefold() != COMMUNITY.casefold() or post.get("locked") or post.get("archived"):
            raise RuntimeError("Post is outside the test subreddit, locked, or archived")
        parent_id = _comment_parent_id(url)
        if parent_id.startswith("t1_") and parent_id not in {
            item.get("name") for item in self._comments(before[1])
        }:
            raise RuntimeError("Target comment was not found in the thread")
        existing = {item["name"] for item in self._comments(before[1])}
        editor = self.page.locator('shreddit-composer').filter(has=self.page.locator('[contenteditable="true"]')).first
        if parent_id.startswith("t1_"):
            target = self.page.locator(f'shreddit-comment[thingid="{parent_id}"]').first
            await target.get_by_role("button", name=re.compile(r"^\s*reply\s*$", re.I)).click(timeout=15_000)
        else:
            # Reddit keeps both a loading and a ready trigger in slotted DOM.
            await self.page.locator('faceplate-tracker[noun="add_comment_button"] faceplate-textarea-input').last.click(timeout=15_000)
        await editor.locator('[contenteditable="true"]').fill(body)

        async def verify():
            async with asyncio.timeout(45):
                while True:
                    listing = await self._json(url + ".json?limit=500&sort=new")
                    for data in self._comments(listing[1]):
                        if data.get("name") not in existing and self._matches_comment(data, payload, username):
                            return self._comment_result(data, username)
                    await asyncio.sleep(2)

        return await self._submit(path, payload, username,
                                  editor.get_by_role("button", name="Comment", exact=True), verify)
