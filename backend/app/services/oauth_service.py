"""
Google OAuth 2.0 service.

Uses httpx (already in deps) — no extra library needed.

Flow:
  1. build_auth_url()  → redirect user to Google
  2. exchange_code(code) → POST to Google token endpoint → get id_token + access_token
  3. get_userinfo(access_token) → fetch email/name/google_id
  4. find_or_create_user(db, google_user) → User ORM object + JWT token

When feature_oauth=False or GOOGLE_CLIENT_ID is not set, build_auth_url raises 503.
"""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def _require_oauth():
    from app.config import settings

    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )


def build_auth_url(state: str | None = None) -> str:
    """Build the Google OAuth2 authorization URL."""
    _require_oauth()
    from app.config import settings

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
        "state": state or secrets.token_urlsafe(16),
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_code(code: str) -> dict:
    """Exchange an authorization code for tokens. Returns the token response dict."""
    _require_oauth()
    from app.config import settings

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    if resp.status_code != 200:
        logger.error("Google token exchange failed: %s", resp.text)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to exchange Google authorization code.",
        )
    return resp.json()


async def get_userinfo(access_token: str) -> dict:
    """Fetch Google user info using the access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to fetch Google user info.",
        )
    return resp.json()


async def find_or_create_user(db: AsyncSession, google_user: dict):
    """
    Given Google userinfo, find an existing user or create a new one.
    Returns the User ORM object.

    Matching priority:
      1. google_id (most reliable)
      2. email (for users who registered normally before OAuth)
    """
    import re

    from app.core.security import get_password_hash
    from app.models.user import User

    google_id: str = google_user.get("id", "")
    email: str = google_user.get("email", "")
    name: str = google_user.get("name", "")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account does not have a verified email.",
        )

    # Check by google_id first
    user = (await db.execute(select(User).where(User.google_id == google_id))).scalar_one_or_none()
    if user:
        user.last_login = datetime.now(UTC)
        await db.commit()
        return user

    # Check by email (existing non-OAuth account)
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user:
        user.google_id = google_id
        user.is_verified = True
        user.last_login = datetime.now(UTC)
        await db.commit()
        return user

    # Create new user — find unique username
    base_username = re.sub(r"[^a-z0-9]", "", email.split("@")[0].lower()) or "user"
    username = base_username
    counter = 1
    while (await db.execute(select(User).where(User.username == username))).scalar_one_or_none():
        username = f"{base_username}{counter}"
        counter += 1

    user = User(
        email=email,
        username=username,
        full_name=name,
        hashed_password=get_password_hash(secrets.token_hex(32)),  # unusable password
        google_id=google_id,
        is_verified=True,
        last_login=datetime.now(UTC),
    )
    from app.api.auth import _apply_trial_defaults

    _apply_trial_defaults(user)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
