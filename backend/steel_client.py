"""The only module that imports the Steel SDK. Everything else goes through here."""

from steel import AsyncSteel
from steel.types import Session

from . import config

_client: AsyncSteel | None = None


def client() -> AsyncSteel:
    global _client
    if _client is None:
        if not config.STEEL_API_KEY:
            raise RuntimeError("STEEL_API_KEY is not set (see .env.example)")
        _client = AsyncSteel(steel_api_key=config.STEEL_API_KEY)
    return _client


async def create_session(mobile: bool = False) -> Session:
    """Spin up a stealth, proxied Steel browser that looks like a real visitor."""
    dims = {"width": 390, "height": 844} if mobile else {"width": 1366, "height": 768}
    return await client().sessions.create(
        use_proxy=config.STEEL_USE_PROXY,
        solve_captcha=True,
        stealth_config={
            "humanize_interactions": True,
            "auto_captcha_solving": True,
        },
        device_config={"device": "mobile" if mobile else "desktop"},
        dimensions=dims,
        debug_config={"interactive": False, "system_cursor": True},
        api_timeout=config.SESSION_TIMEOUT_MS,
    )


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
        "status": s.status,
        "debug_url": s.debug_url,
        "viewer_url": s.session_viewer_url,
        "created_at": s.created_at.isoformat(),
        "duration_ms": s.duration,
        "region": getattr(s, "region", None),
        "proxy_bytes": getattr(s, "proxy_bytes_used", 0),
    }
