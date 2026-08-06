"""Selección del proveedor de pago.

`BILLING_PROVIDER` decide cuál se usa. Añadir una pasarela es escribir un
adaptador que cumpla el puerto y registrarlo aquí — ni `api/billing.py` ni
`api/webhooks.py` cambian.

MercadoPago es la principal (ADR 0008): el ICP son PYMES chilenas que pagan con
tarjeta local o Redcompra, que Stripe no acepta. Stripe se conserva, y no por
nostalgia: **un puerto con una sola implementación no demuestra nada**. Son las
dos juntas las que obligan a que las diferencias estén declaradas en vez de
supuestas — `tiene_portal_de_gestion` es False en MercadoPago y True en Stripe,
y el endpoint responde 501 en vez de romperse.

La diferencia que queda pendiente de construir es la de la recurrencia: Khipu y
la transferencia de Flow no pueden auto-renovar, y por eso el puerto expone
`soporta_suscripcion_recurrente`. Hoy ambos adaptadores la tienen en True; el día
que entre una que no, hace falta un ciclo de vida distinto (cobro anual
prepagado, ADR 0008), no sólo otro adaptador.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from app.domain.billing import ErrorDeCobro, ProveedorDePago
from app.infra.billing.mercadopago_adapter import MercadoPagoAdapter
from app.infra.billing.stripe_adapter import StripeAdapter

logger = logging.getLogger(__name__)

PROVEEDORES: dict[str, type] = {
    "mercadopago": MercadoPagoAdapter,
    "stripe": StripeAdapter,
}


@lru_cache(maxsize=1)
def obtener_proveedor() -> ProveedorDePago:
    """Instancia el proveedor configurado.

    Se cachea porque los adaptadores no tienen estado por petición: sólo leen
    configuración e invocan la API de la pasarela.
    """
    from app.config import settings

    nombre = (getattr(settings, "billing_provider", None) or "mercadopago").lower()
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
