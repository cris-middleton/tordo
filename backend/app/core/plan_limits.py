"""
Plan quota definitions and enforcement.

Tier hierarchy (ascending): basico → pyme → pro → enterprise

Quotas:
  basico     : 5 docs / 5 MB total / 3 BI queries/day / 5 active alerts
  pyme       : 50 docs / 25 MB / 50 BI queries/day / unlimited alerts
  pro        : 200 docs / unlimited MB / unlimited BI / unlimited alerts
  enterprise : unlimited everything

Redis keys:
  bi_queries:{user_id}:{YYYY-MM-DD}  — TTL 48h, INCR per analytics call
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

from fastapi import Depends, HTTPException

logger = logging.getLogger(__name__)


def effective_plan_tier(user) -> str:
    """
    Return the user's *effective* plan tier right now.

    Rule: if the user is in an unexpired trial (subscription_status='trialing'
    AND trial_ends_at is in the future), they get full 'pro' access regardless
    of the stored plan_tier. Otherwise return plan_tier as-is.
    """
    trial_ends = getattr(user, "trial_ends_at", None)
    status = getattr(user, "subscription_status", None)
    if status == "trialing" and trial_ends is not None:
        now = datetime.now(timezone.utc)
        if trial_ends > now:
            return "pro"
    return (user.plan_tier or "basico").lower()

# ── Tier ordering ─────────────────────────────────────────────────────────────

TIER_ORDER = ["basico", "pyme", "pro", "enterprise"]
_UNLIMITED = None


def _tier_idx(tier: str) -> int:
    try:
        return TIER_ORDER.index((tier or "basico").lower())
    except ValueError:
        return 0


def meets_min_tier(user_tier: str, required_tier: str) -> bool:
    """True when user_tier >= required_tier in the plan hierarchy."""
    return _tier_idx(user_tier) >= _tier_idx(required_tier)


# ── Quota table ───────────────────────────────────────────────────────────────

PLAN_QUOTAS: dict[str, dict[str, Any]] = {
    "basico": {
        "max_docs":           5,
        "max_docs_mb":        5,
        "bi_queries_per_day": 3,
        "max_active_alerts":  5,
    },
    "pyme": {
        "max_docs":           50,
        "max_docs_mb":        25,
        "bi_queries_per_day": 50,
        "max_active_alerts":  _UNLIMITED,
    },
    "pro": {
        "max_docs":           200,
        "max_docs_mb":        _UNLIMITED,
        "bi_queries_per_day": _UNLIMITED,
        "max_active_alerts":  _UNLIMITED,
    },
    "enterprise": {
        "max_docs":           _UNLIMITED,
        "max_docs_mb":        _UNLIMITED,
        "bi_queries_per_day": _UNLIMITED,
        "max_active_alerts":  _UNLIMITED,
    },
}

_UPGRADE_MAP: dict[str, str | None] = {
    "basico": "pyme",
    "pyme":   "pro",
    "pro":    "enterprise",
    "enterprise": None,
}

_TIER_LABEL: dict[str, str] = {
    "basico":     "Básico",
    "pyme":       "PYME",
    "pro":        "Pro",
    "enterprise": "Enterprise",
}


def get_quota(tier: str) -> dict[str, Any]:
    return PLAN_QUOTAS.get((tier or "basico").lower(), PLAN_QUOTAS["basico"])


def _quota_error(
    quota_key: str,
    plan_tier: str,
    limite: int | None,
    usado: int | None,
    mensaje: str,
) -> dict:
    return {
        "bloqueada_por_plan": True,
        "mensaje": mensaje,
        "plan_actual": plan_tier,
        "limite": limite,
        "usado": usado,
        "upgrade_sugerido": _UPGRADE_MAP.get(plan_tier),
    }


# ── Redis helpers ─────────────────────────────────────────────────────────────

def _redis_client():
    import redis as _redis
    from app.config import settings
    return _redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=1)


def _bi_redis_key(user_id: int) -> str:
    return f"bi_queries:{user_id}:{date.today().isoformat()}"


def get_bi_query_count(user_id: int) -> int:
    """Return today's BI query count for user_id. Fails open (returns 0) if Redis unavailable."""
    try:
        r = _redis_client()
        return int(r.get(_bi_redis_key(user_id)) or 0)
    except Exception as exc:
        logger.warning("Redis unavailable (get_bi_query_count): %s", exc)
        return 0


def increment_bi_query(user_id: int) -> int:
    """Increment and return new count. Sets 48h TTL on first use. Fails open (returns 0)."""
    try:
        r = _redis_client()
        key = _bi_redis_key(user_id)
        count = r.incr(key)
        if count == 1:
            r.expire(key, 172_800)  # 48h — survives timezone edge cases
        return count
    except Exception as exc:
        logger.warning("Redis unavailable (increment_bi_query): %s", exc)
        return 0


# ── FastAPI dependencies ──────────────────────────────────────────────────────

def require_plan(min_tier: str):
    """
    Dependency factory.  Usage::

        @router.get("/some-endpoint")
        def endpoint(user=Depends(require_plan("pyme"))):
            ...
    """
    from app.core.security import get_current_active_user
    from app.models.user import User

    def _check(current_user: User = Depends(get_current_active_user)) -> User:
        if not meets_min_tier(effective_plan_tier(current_user), min_tier):
            label = _TIER_LABEL.get(min_tier, min_tier.title())
            raise HTTPException(
                status_code=402,
                detail=_quota_error(
                    "plan_tier",
                    effective_plan_tier(current_user),
                    None,
                    None,
                    f"Esta función requiere el plan {label} o superior. "
                    f"Actualiza tu suscripción para acceder.",
                ),
            )
        return current_user

    return _check


def check_bi_quota(
    current_user=Depends(  # type: ignore[assignment]
        # Resolved lazily to avoid circular import
        lambda: None
    ),
) -> Any:
    """
    Inline dependency — do NOT use directly.  Use check_bi_quota_dep below.
    """
    raise NotImplementedError


def _make_bi_quota_dep():
    from app.core.security import get_current_active_user
    from app.models.user import User

    def _check(current_user: User = Depends(get_current_active_user)) -> User:
        tier = effective_plan_tier(current_user)
        quota = get_quota(tier)
        daily_limit: int | None = quota["bi_queries_per_day"]

        if daily_limit is _UNLIMITED:
            increment_bi_query(current_user.id)
            return current_user

        # Increment first (atomic), then check — avoids a separate GET+SET
        new_count = increment_bi_query(current_user.id)
        if new_count > daily_limit:
            label = _TIER_LABEL.get(tier, tier.title())
            raise HTTPException(
                status_code=402,
                detail=_quota_error(
                    "bi_queries_per_day",
                    tier,
                    daily_limit,
                    new_count,
                    f"Has alcanzado el límite de {daily_limit} consultas BI por día "
                    f"del plan {label}. Actualiza tu plan para continuar.",
                ),
            )
        return current_user

    return _check


# Callable dependency — used as `Depends(check_bi_quota_dep)`
check_bi_quota_dep = _make_bi_quota_dep()


def _make_alert_quota_dep_real():
    from app.core.security import get_current_active_user
    from app.db import get_db
    from app.models.user import User
    from sqlalchemy import select, func
    from sqlalchemy.ext.asyncio import AsyncSession

    async def _check(
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_active_user),
    ) -> User:
        from app.models.alert import AlertPreference

        tier = effective_plan_tier(current_user)
        quota = get_quota(tier)
        max_alerts: int | None = quota["max_active_alerts"]
        if max_alerts is _UNLIMITED:
            return current_user

        active_count: int = (
            await db.execute(
                select(func.count()).select_from(AlertPreference).where(
                    AlertPreference.user_id == current_user.id,
                    AlertPreference.is_active.is_(True),
                )
            )
        ).scalar() or 0
        if active_count >= max_alerts:
            label = _TIER_LABEL.get(tier, tier.title())
            raise HTTPException(
                status_code=402,
                detail=_quota_error(
                    "max_active_alerts",
                    tier,
                    max_alerts,
                    active_count,
                    f"Has alcanzado el límite de {max_alerts} alertas activas "
                    f"del plan {label}. Actualiza tu plan para agregar más alertas.",
                ),
            )
        return current_user

    return _check


check_alert_quota_dep = _make_alert_quota_dep_real()


# ── Document quota helper (called inline, not as Depends) ─────────────────────

def enforce_doc_quota(user, existing_docs: list, new_file_bytes: int) -> None:
    """
    Raise HTTP 402 if adding new_file_bytes would exceed plan document quotas.

    Accepts the full User ORM object so trial status is considered.
    """
    tier = effective_plan_tier(user)
    quota = get_quota(tier)
    max_docs: int | None = quota["max_docs"]
    max_mb: float | None = quota["max_docs_mb"]
    label = _TIER_LABEL.get(tier, tier.title())

    if max_docs is not _UNLIMITED and len(existing_docs) >= max_docs:
        raise HTTPException(
            status_code=402,
            detail=_quota_error(
                "max_docs",
                tier,
                max_docs,
                len(existing_docs),
                f"Has alcanzado el límite de {max_docs} documentos del plan {label}. "
                f"Elimina documentos o actualiza tu plan.",
            ),
        )

    if max_mb is not _UNLIMITED:
        total_bytes = sum(getattr(d, "tamano_bytes", 0) or 0 for d in existing_docs) + new_file_bytes
        total_mb_used = total_bytes / (1024 * 1024)
        if total_mb_used > max_mb:
            raise HTTPException(
                status_code=402,
                detail=_quota_error(
                    "max_docs_mb",
                    tier,
                    max_mb,
                    round(total_mb_used, 1),
                    f"Has superado el límite de almacenamiento de {max_mb} MB "
                    f"del plan {label}. Actualiza tu plan para subir más documentos.",
                ),
            )
