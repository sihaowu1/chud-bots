"""The only module that imports the Steel SDK. Everything else goes through here."""

import asyncio

from steel import AsyncSteel
from steel.types import Session

from . import agent_state_store, config

_client: AsyncSteel | None = None


def client() -> AsyncSteel:
    global _client
    if _client is None:
        if not config.STEEL_API_KEY:
            raise RuntimeError("STEEL_API_KEY is not set (see .env.example)")
        _client = AsyncSteel(steel_api_key=config.STEEL_API_KEY)
    return _client


async def create_session(
    *, persona: str | None = None, interactive: bool = False, region: str | None = None
) -> Session:
    """Spin up a stealth, proxied desktop Steel browser.

    `region` pins the exit node. The analytics search probe passes it so rank positions stay
    comparable over time; dreamers leave it unset.
    """
    profile_options = {}
    if persona:
        saved = agent_state_store.load_or_create(persona)
        profile_id = (saved.get("steel") or {}).get("profile_id")
        profile_options["persist_profile"] = True
        if profile_id:
            await wait_for_profile_ready(profile_id)
            profile_options["profile_id"] = profile_id
    if region:
        profile_options["region"] = region
    session = await client().sessions.create(
        use_proxy=config.STEEL_USE_PROXY,
        solve_captcha=True,
        stealth_config={
            "humanize_interactions": True,
            "auto_captcha_solving": True,
        },
        device_config={"device": "desktop"},
        dimensions={"width": 1366, "height": 768},
        debug_config={"interactive": interactive, "system_cursor": True},
        api_timeout=config.SESSION_TIMEOUT_MS,
        **profile_options,
    )
    if persona:
        try:
            if not session.profile_id:
                raise RuntimeError("Steel did not return a persistent profile ID")
            # Re-read so concurrent ledger activity is preserved.
            saved = agent_state_store.load_or_create(persona)
            saved.setdefault("steel", {})["profile_id"] = session.profile_id
            agent_state_store.save(persona, saved)
        except Exception:
            await release_session(session.id)
            raise
    return session


async def wait_for_profile_ready(profile_id: str) -> None:
    """Profile uploads finish after release; don't start from incomplete state."""
    async with asyncio.timeout(60):
        while True:
            profile = await client().profiles.get(profile_id)
            if profile.status == "READY":
                return
            if profile.status == "FAILED":
                raise RuntimeError("Steel profile upload failed; the saved profile cannot be reused")
            await asyncio.sleep(1)


async def captcha_status(session_id: str):
    """Return Steel's detected CAPTCHA state for every page in a session."""
    return await client().sessions.captchas.status(session_id)


async def solve_captcha(session_id: str, *, url: str):
    """Ask Steel to solve the CAPTCHA detected at ``url``."""
    return await client().sessions.captchas.solve(session_id, url=url)


async def release_session(session_id: str) -> None:
    try:
        await client().sessions.release(session_id)
    except Exception:
        pass  # already released / timed out — nothing to do


async def release_all() -> None:
    await client().sessions.release_all()


async def list_live_sessions() -> list[dict]:
    page = await client().sessions.list(status="live", limit=50)
    return [session_summary(s) for s in page.sessions]


def session_summary(s) -> dict:
    return {
        "id": s.id,
        "profile_id": getattr(s, "profile_id", None),
        "status": s.status,
        "debug_url": s.debug_url,
        "viewer_url": s.session_viewer_url,
        "created_at": s.created_at.isoformat(),
        "duration_ms": s.duration,
        "region": getattr(s, "region", None),
        "proxy_bytes": getattr(s, "proxy_bytes_used", 0),
    }
