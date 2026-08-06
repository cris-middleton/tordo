"""Selección del proveedor de pago.

`BILLING_PROVIDER` decide cuál se usa. Hoy sólo está Stripe; añadir la pasarela
local (ADR 0005) es escribir un adaptador que cumpla el puerto y registrarlo
aquí — ni `api/billing.py` ni `api/webhooks.py` cambian.

Para el mercado chileno faltan por evaluar Transbank WebPay, Flow y Khipu. La
diferencia que más pesa en el diseño: **ninguno cobra recurrente por sí solo**
como Stripe. Con Transbank hay que inscribir la tarjeta (Oneclick) o cobrar en
cada periodo desde un job propio. Por eso el puerto expone
`soporta_suscripcion_recurrente`: si es False, hace falta un cron de renovación
y una UI propia de cambio de plan.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from app.domain.billing import ErrorDeCobro, ProveedorDePago
from app.infra.billing.stripe_adapter import StripeAdapter

logger = logging.getLogger(__name__)

PROVEEDORES: dict[str, type] = {
    "stripe": StripeAdapter,
}


@lru_cache(maxsize=1)
def obtener_proveedor() -> ProveedorDePago:
    """Instancia el proveedor configurado.

    Se cachea porque los adaptadores no tienen estado por petición: sólo leen
    configuración e invocan al SDK.
    """
    from app.config import settings

    nombre = (getattr(settings, "billing_provider", None) or "stripe").lower()
    clase = PROVEEDORES.get(nombre)
    if clase is None:
        raise ErrorDeCobro(
            f"Proveedor de pago desconocido '{nombre}'. Disponibles: {sorted(PROVEEDORES)}"
        )
    proveedor = clase()
    logger.info(
        "Proveedor de pago: %s (recurrente=%s, portal=%s)",
        proveedor.nombre,
        proveedor.soporta_suscripcion_recurrente,
        proveedor.tiene_portal_de_gestion,
    )
    return proveedor


def _limpiar_cache() -> None:
    """Sólo para tests, que cambian la configuración entre casos."""
    obtener_proveedor.cache_clear()


__all__ = ["PROVEEDORES", "obtener_proveedor"]
