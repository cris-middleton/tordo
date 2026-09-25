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
  La fecha es la de **America/Santiago**, no la del servidor: ver core/tiempo.py.
  Se cuenta por EMPRESA: la cuota es del plan, y el plan es de la empresa.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException

from app.core.tiempo import hoy_chile

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
ILIMITADO = None


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
        "api_requests_per_minute": 30,
        "max_docs": 5,
        "max_docs_mb": 5,
        "bi_queries_per_day": 3,
        "max_active_alerts": 5,
        "max_usuarios": 1,
    },
    "pyme": {
        "api_requests_per_minute": 60,
        "max_docs": 50,
        "max_docs_mb": 25,
        "bi_queries_per_day": 50,
        "max_active_alerts": ILIMITADO,
        "max_usuarios": 3,
    },
    "pro": {
        "api_requests_per_minute": 120,
        "max_docs": 200,
        "max_docs_mb": ILIMITADO,
        "bi_queries_per_day": ILIMITADO,
        "max_active_alerts": ILIMITADO,
        "max_usuarios": 5,
    },
    "enterprise": {
        "api_requests_per_minute": 600,
        "max_docs": ILIMITADO,
        "max_docs_mb": ILIMITADO,
        "bi_queries_per_day": ILIMITADO,
        "max_active_alerts": ILIMITADO,
        "max_usuarios": ILIMITADO,
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


def error_de_cuota(
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


def redis_client():
    """El cliente que usan las cuotas. Público porque también lo usa el límite
    por clave de API (`core/limites_api.py`): dos formas de crear la conexión
    serían dos sitios donde cambiar el timeout."""
    import redis as _redis

    from app.config import settings

    return _redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=1)


def _bi_redis_key(empresa_id) -> str:
    """La clave del contador diario, fechada en la zona de Chile.

    Usaba `date.today()`, que es la fecha local del proceso — UTC dentro del
    contenedor. El día de la cuota cambiaba entonces a las 20:00 de Santiago.
    Ver `core/tiempo.py`.
    """
    return f"bi_queries:{empresa_id}:{hoy_chile().isoformat()}"


def get_bi_query_count(empresa_id) -> int:
    """Consultas de BI de hoy para la empresa. Falla abierto (0) si Redis no responde."""
    try:
        r = redis_client()
        return int(r.get(_bi_redis_key(empresa_id)) or 0)
    except Exception as exc:
        logger.warning("Redis unavailable (get_bi_query_count): %s", exc)
        return 0


def increment_bi_query(empresa_id) -> int:
    """Increment and return new count. Sets 48h TTL on first use. Fails open (returns 0)."""
    try:
        r = redis_client()
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
    if limite is ILIMITADO or usuarios_actuales < limite:
        return

    label = _TIER_LABEL.get(tier, tier.title())
    plural = "usuario" if limite == 1 else "usuarios"
    raise HTTPException(
        status_code=402,
        detail=error_de_cuota(
            "max_usuarios",
            tier,
            limite,
            usuarios_actuales,
            f"El plan {label} incluye {limite} {plural}. "
            "Actualiza la suscripción para sumar más miembros al equipo.",
        ),
    )


# ── FastAPI dependencies ──────────────────────────────────────────────────────


def consumir_cuota_bi(empresa) -> None:
    """Descuenta una consulta de BI a la empresa, o lanza 402 si ya no le quedan.

    Es una función normal y no una dependencia de FastAPI porque tiene **dos**
    puntos de entrada: los endpoints de BI (a través de `api/deps.py`) y el
    servidor MCP, que no pasa por el enrutador. Escrita dos veces, una de las dos
    se quedaría atrás — y sería la que no cobra.
    """
    tier = effective_plan_tier(empresa)
    limite_diario: int | None = get_quota(tier)["bi_queries_per_day"]

    if limite_diario is ILIMITADO:
        increment_bi_query(empresa.id)
        return

    # Se incrementa primero (atómico) y luego se comprueba: evita un GET+SET.
    consumidas = increment_bi_query(empresa.id)
    if consumidas > limite_diario:
        raise HTTPException(
            status_code=402,
            detail=error_de_cuota(
                "bi_queries_per_day",
                tier,
                limite_diario,
                consumidas,
                f"Has alcanzado el límite de {limite_diario} consultas BI por día "
                f"del plan {etiqueta_de_tier(tier)}. Actualiza tu plan para continuar.",
            ),
        )


# ── Document quota helper (called inline, not as Depends) ─────────────────────


def enforce_doc_quota(empresa, existing_docs: list, new_file_bytes: int) -> None:
    """
    Raise HTTP 402 if adding new_file_bytes would exceed plan document quotas.

    Recibe la EMPRESA, dueña del plan y del trial (ADR 0002) — no el usuario.
    """
    tier = effective_plan_tier(empresa)
    quota = get_quota(tier)
    max_docs: int | None = quota["max_docs"]
    max_mb: float | None = quota["max_docs_mb"]
    label = _TIER_LABEL.get(tier, tier.title())

    if max_docs is not ILIMITADO and len(existing_docs) >= max_docs:
        raise HTTPException(
            status_code=402,
            detail=error_de_cuota(
                "max_docs",
                tier,
                max_docs,
                len(existing_docs),
                f"Has alcanzado el límite de {max_docs} documentos del plan {label}. "
                f"Elimina documentos o actualiza tu plan.",
            ),
        )

    if max_mb is not ILIMITADO:
        total_bytes = (
            sum(getattr(d, "tamano_bytes", 0) or 0 for d in existing_docs) + new_file_bytes
        )
        total_mb_used = total_bytes / (1024 * 1024)
        if total_mb_used > max_mb:
            raise HTTPException(
                status_code=402,
                detail=error_de_cuota(
                    "max_docs_mb",
                    tier,
                    max_mb,
                    round(total_mb_used, 1),
                    f"Has superado el límite de almacenamiento de {max_mb} MB "
                    f"del plan {label}. Actualiza tu plan para subir más documentos.",
                ),
            )
