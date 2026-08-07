"""
Plan quota definitions and enforcement.

Tier hierarchy (ascending): basico → pyme → pro → enterprise

Quotas:
  basico     : 5 docs / 5 MB total / 3 BI queries/day / 5 active alerts
  pyme       : 50 docs / 25 MB / 50 BI queries/day / unlimited alerts
  pro        : 200 docs / unlimited MB / unlimited BI / unlimited alerts
  enterprise : unlimited everything

Redis keys:
  bi_queries:{empresa_id}:{YYYY-MM-DD}  — TTL 48h, INCR por consulta de BI.
  Se cuenta por EMPRESA: la cuota es del plan, y el plan es de la empresa.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Any

from fastapi import Depends, HTTPException

logger = logging.getLogger(__name__)


def effective_plan_tier(empresa) -> str:
    """
    Return the user's *effective* plan tier right now.

    Rule: if the user is in an unexpired trial (subscription_status='trialing'
    AND trial_ends_at is in the future), they get full 'pro' access regardless
    of the stored plan_tier. Otherwise return plan_tier as-is.

    Opera sobre la EMPRESA: la suscripción y el trial son de ella, no del
    usuario (ADR 0002). Acepta cualquier objeto con `plan_tier`,
    `subscription_status` y `trial_ends_at`.
    """
    if esta_en_trial(empresa):
        return "pro"
    return (empresa.plan_tier or "basico").lower()


def esta_en_trial(empresa) -> bool:
    """Si la empresa está dentro de un trial vigente.

    Separado de `effective_plan_tier` porque una empresa que contrata Pro y
    está en trial da el MISMO tier efectivo que fuera de él: deducir el trial
    comparando tiers la daría por pagando.
    """
    trial_ends = getattr(empresa, "trial_ends_at", None)
    if getattr(empresa, "subscription_status", None) != "trialing" or trial_ends is None:
        return False
    # Postgres devuelve el timestamp con zona; otros drivers lo devuelven sin
    # ella, y comparar ambos lanza TypeError. Un valor sin zona se interpreta
    # como UTC, que es como se guarda.
    if trial_ends.tzinfo is None:
        trial_ends = trial_ends.replace(tzinfo=UTC)
    return trial_ends > datetime.now(UTC)


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
#
# `max_usuarios` son ASIENTOS. La suscripción es de la empresa y los planes se
# diferencian por capacidades, no por asiento (ADR 0002): por eso el número vive
# aquí, junto al resto de límites del plan, y no en un precio por usuario.
#
# Sin este límite, una empresa podía sumar usuarios sin tope sobre un plan de
# CLP 11.900/mes — vender por empresa y no contar asientos es regalar el producto.
#
# Los números son una decisión de producto, y cambiarlos es editar esta tabla.
# `basico` tiene 1 porque el asiento único ES la palanca de conversión: durante
# el trial de 14 días `effective_plan_tier` devuelve "pro", así que el equipo
# puede probarse completo antes de decidir.

PLAN_QUOTAS: dict[str, dict[str, Any]] = {
    "basico": {
        "max_docs": 5,
        "max_docs_mb": 5,
        "bi_queries_per_day": 3,
        "max_active_alerts": 5,
        "max_usuarios": 1,
    },
    "pyme": {
        "max_docs": 50,
        "max_docs_mb": 25,
        "bi_queries_per_day": 50,
        "max_active_alerts": _UNLIMITED,
        "max_usuarios": 3,
    },
    "pro": {
        "max_docs": 200,
        "max_docs_mb": _UNLIMITED,
        "bi_queries_per_day": _UNLIMITED,
        "max_active_alerts": _UNLIMITED,
        "max_usuarios": 5,
    },
    "enterprise": {
        "max_docs": _UNLIMITED,
        "max_docs_mb": _UNLIMITED,
        "bi_queries_per_day": _UNLIMITED,
        "max_active_alerts": _UNLIMITED,
        "max_usuarios": _UNLIMITED,
    },
}

_UPGRADE_MAP: dict[str, str | None] = {
    "basico": "pyme",
    "pyme": "pro",
    "pro": "enterprise",
    "enterprise": None,
}

_TIER_LABEL: dict[str, str] = {
    "basico": "Básico",
    "pyme": "PYME",
    "pro": "Pro",
    "enterprise": "Enterprise",
}


def get_quota(tier: str) -> dict[str, Any]:
    return PLAN_QUOTAS.get((tier or "basico").lower(), PLAN_QUOTAS["basico"])


def etiqueta_de_tier(tier: str) -> str:
    return _TIER_LABEL.get((tier or "basico").lower(), (tier or "basico").title())


def siguiente_tier(tier: str) -> str | None:
    return _UPGRADE_MAP.get((tier or "basico").lower())


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


def _bi_redis_key(empresa_id) -> str:
    return f"bi_queries:{empresa_id}:{date.today().isoformat()}"


def get_bi_query_count(empresa_id) -> int:
    """Consultas de BI de hoy para la empresa. Falla abierto (0) si Redis no responde."""
    try:
        r = _redis_client()
        return int(r.get(_bi_redis_key(empresa_id)) or 0)
    except Exception as exc:
        logger.warning("Redis unavailable (get_bi_query_count): %s", exc)
        return 0


def increment_bi_query(empresa_id) -> int:
    """Increment and return new count. Sets 48h TTL on first use. Fails open (returns 0)."""
    try:
        r = _redis_client()
        key = _bi_redis_key(empresa_id)
        count = r.incr(key)
        if count == 1:
            r.expire(key, 172_800)  # 48h — survives timezone edge cases
        return count
    except Exception as exc:
        logger.warning("Redis unavailable (increment_bi_query): %s", exc)
        return 0


def verificar_asiento_disponible(empresa, usuarios_actuales: int) -> None:
    """Lanza 402 si la empresa ya agotó los asientos de su plan.

    No se comprueba al *listar* ni al iniciar sesión, sólo al AÑADIR. Un
    downgrade (o una cancelación, que deja la empresa en `basico`) puede dejar
    más usuarios que asientos, y expulsar gente automáticamente por un impago
    sería peor que el problema: se bloquea sumar más y ya.
    """
    tier = effective_plan_tier(empresa)
    limite = get_quota(tier)["max_usuarios"]
    if limite is _UNLIMITED or usuarios_actuales < limite:
        return

    label = _TIER_LABEL.get(tier, tier.title())
    plural = "usuario" if limite == 1 else "usuarios"
    raise HTTPException(
        status_code=402,
        detail=_quota_error(
            "max_usuarios",
            tier,
            limite,
            usuarios_actuales,
            f"El plan {label} incluye {limite} {plural}. "
            "Actualiza la suscripción para sumar más miembros al equipo.",
        ),
    )


# ── FastAPI dependencies ──────────────────────────────────────────────────────


def require_plan(min_tier: str):
    """
    Dependency factory.  Usage::

        @router.get("/some-endpoint")
        def endpoint(user=Depends(require_plan("pyme"))):
            ...
    """
    from app.api.deps import empresa_facturable
    from app.models.empresa import Empresa

    def _exigir_plan(empresa: Empresa = Depends(empresa_facturable)) -> Empresa:
        tier = effective_plan_tier(empresa)
        if not meets_min_tier(tier, min_tier):
            label = _TIER_LABEL.get(min_tier, min_tier.title())
            raise HTTPException(
                status_code=402,
                detail=_quota_error(
                    "plan_tier",
                    tier,
                    None,
                    None,
                    f"Esta función requiere el plan {label} o superior. "
                    f"Actualiza tu suscripción para acceder.",
                ),
            )
        return empresa

    return _exigir_plan


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
    from app.api.deps import empresa_facturable
    from app.models.empresa import Empresa

    def _exigir_cuota_bi(empresa: Empresa = Depends(empresa_facturable)) -> Empresa:
        tier = effective_plan_tier(empresa)
        quota = get_quota(tier)
        daily_limit: int | None = quota["bi_queries_per_day"]

        if daily_limit is _UNLIMITED:
            increment_bi_query(empresa.id)
            return empresa

        # Se incrementa primero (atómico) y luego se comprueba: evita un GET+SET
        new_count = increment_bi_query(empresa.id)
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
        return empresa

    return _exigir_cuota_bi


# Callable dependency — used as `Depends(check_bi_quota_dep)`
check_bi_quota_dep = _make_bi_quota_dep()


def _make_alert_quota_dep_real():
    from sqlalchemy import func, select
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.deps import empresa_facturable
    from app.core.security import get_current_active_user
    from app.db import get_db
    from app.models.empresa import Empresa
    from app.models.user import User

    async def _exigir_cuota_alertas(
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_active_user),
        empresa: Empresa = Depends(empresa_facturable),
    ) -> User:
        from app.models.alert import AlertPreference

        # El LÍMITE sale del plan, que es de la empresa. El CONTEO sigue siendo
        # por usuario, porque AlertPreference es una preferencia personal y no
        # tiene empresa_id.
        #
        # Matiz pendiente de decisión de producto: con varios asientos, el
        # límite se multiplica de hecho por el número de usuarios. Hacerlo un
        # entitlement de la cuenta exige darle empresa_id a AlertPreference.
        tier = effective_plan_tier(empresa)
        quota = get_quota(tier)
        max_alerts: int | None = quota["max_active_alerts"]
        if max_alerts is _UNLIMITED:
            return current_user

        active_count: int = (
            await db.execute(
                select(func.count())
                .select_from(AlertPreference)
                .where(
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

    return _exigir_cuota_alertas


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
        total_bytes = (
            sum(getattr(d, "tamano_bytes", 0) or 0 for d in existing_docs) + new_file_bytes
        )
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
