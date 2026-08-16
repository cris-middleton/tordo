"""Stripe implementando el puerto `ProveedorDePago`.

La lógica es la que ya estaba en `services/stripe_service.py`; lo que cambia es
que ahora se expone a través del contrato del dominio, así que añadir una
pasarela local es un archivo nuevo y no cirugía en los endpoints.

El SDK de Stripe se importa perezosamente para que el servidor arranque sin las
claves configuradas.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Literal

from app.domain.billing import (
    ErrorDeCobro,
    EstadoSuscripcion,
    EventoDeSuscripcion,
    SesionDePago,
)

logger = logging.getLogger(__name__)

# (plan_tier, periodo) → atributo de settings con el price id
PRECIOS: dict[tuple[str, str], str] = {
    ("pro", "monthly"): "stripe_price_pro",
    ("pro", "annual"): "stripe_price_pro_annual",
    ("enterprise", "monthly"): "stripe_price_enterprise",
}

# Estado de Stripe → estado del dominio
_ESTADOS: dict[str, EstadoSuscripcion] = {
    "active": "active",
    "trialing": "trialing",
    "past_due": "past_due",
    "unpaid": "past_due",
    "canceled": "canceled",
    "incomplete": "inactive",
    "incomplete_expired": "inactive",
    "paused": "inactive",
}


class StripeAdapter:
    nombre = "stripe"
    # Stripe cobra solo cada periodo: no hay que hacer nada para renovar.
    soporta_suscripcion_recurrente = True
    # Stripe hospeda el portal donde el cliente cambia de plan o cancela.
    tiene_portal_de_gestion = True

    # ── Infraestructura ──────────────────────────────────────────────────────

    def _sdk(self):
        from app.config import settings

        if not settings.stripe_secret_key:
            raise ErrorDeCobro("STRIPE_SECRET_KEY no está configurada")
        import stripe

        stripe.api_key = settings.stripe_secret_key
        return stripe

    def _price_id(self, plan_tier: str, periodo: str) -> str:
        from app.config import settings

        attr = PRECIOS.get((plan_tier, periodo))
        if not attr:
            raise ErrorDeCobro(f"El plan '{plan_tier}' con cobro '{periodo}' no está disponible")
        price_id = getattr(settings, attr, None)
        if not price_id:
            raise ErrorDeCobro(
                f"Falta el price id de Stripe para '{plan_tier}' ({periodo}): configura {attr.upper()}"
            )
        return price_id

    def _tier_de_price(self, price_id: str) -> str:
        from app.config import settings

        for (tier, _periodo), attr in PRECIOS.items():
            if getattr(settings, attr, None) == price_id:
                return tier
        logger.warning("price id de Stripe desconocido: %s — se asume 'pro'", price_id)
        return "pro"

    # ── Puerto ───────────────────────────────────────────────────────────────

    def crear_o_recuperar_cliente(self, empresa, *, email_contacto: str | None = None) -> str:
        if empresa.billing_customer_id:
            return empresa.billing_customer_id

        cliente = self._sdk().Customer.create(
            email=email_contacto,
            name=empresa.nombre_empresa,
            metadata={"empresa_id": str(empresa.id), "rut_empresa": empresa.rut_empresa},
        )
        return cliente.id

    def iniciar_pago(
        self,
        empresa,
        *,
        plan_tier: str,
        periodo: Literal["monthly", "annual"],
        url_exito: str,
        url_cancelacion: str,
        email_contacto: str | None = None,
    ) -> SesionDePago:
        # `email_contacto` no se usa: el customer de Stripe ya lleva el correo.
        if periodo not in ("monthly", "annual"):
            raise ErrorDeCobro(f"Periodo inválido '{periodo}': usa 'monthly' o 'annual'")

        price_id = self._price_id(plan_tier, periodo)
        customer_id = self.crear_o_recuperar_cliente(empresa)

        # El empresa_id viaja en el metadata porque en el PRIMER pago la empresa
        # todavía no tiene guardado el customer_id: es la única forma de
        # localizarla cuando llegue el webhook.
        metadata = {
            "empresa_id": str(empresa.id),
            "plan_tier": plan_tier,
            "billing_period": periodo,
        }
        sesion = self._sdk().checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=url_exito,
            cancel_url=url_cancelacion,
            metadata=metadata,
            subscription_data={"metadata": metadata},
        )
        return SesionDePago(url=sesion.url, referencia=sesion.id)

    def url_portal_de_gestion(self, customer_id: str, url_retorno: str) -> str | None:
        sesion = self._sdk().billing_portal.Session.create(
            customer=customer_id, return_url=url_retorno
        )
        return sesion.url

    def cancelar_suscripcion(self, subscription_id: str) -> str | None:
        """Cancela en Stripe y devuelve el fin del periodo ya pagado.

        `Subscription.cancel` corta de inmediato en la pasarela; el acceso hasta
        `current_period_end` lo respeta la aplicación, no Stripe. Se hace así y no
        con `cancel_at_period_end=True` para que las dos pasarelas se comporten
        igual: con MercadoPago no existe esa opción, y una diferencia escondida
        aquí saldría como un cobro de más allá.
        """
        suscripcion = self._sdk().Subscription.cancel(subscription_id)
        fin = getattr(suscripcion, "current_period_end", None)
        if not fin:
            return None
        return datetime.fromtimestamp(fin, tz=UTC).isoformat()

    def interpretar_webhook(
        self, payload: bytes, cabeceras: dict[str, str]
    ) -> EventoDeSuscripcion | None:
        from app.config import settings

        if not settings.stripe_webhook_secret:
            raise ErrorDeCobro("STRIPE_WEBHOOK_SECRET no está configurada")

        firma = cabeceras.get("stripe-signature") or cabeceras.get("Stripe-Signature", "")
        try:
            evento = self._sdk().Webhook.construct_event(
                payload, firma, settings.stripe_webhook_secret
            )
        except Exception as exc:
            # Firma inválida es un intento de suplantación, no un evento a ignorar.
            raise ErrorDeCobro(f"Firma de webhook inválida: {exc}") from exc

        tipo = evento["type"]
        obj = evento["data"]["object"]

        if tipo == "checkout.session.completed":
            meta = obj.get("metadata") or {}
            return EventoDeSuscripcion(
                tipo="activada",
                customer_id=obj.get("customer"),
                subscription_id=obj.get("subscription"),
                plan_tier=meta.get("plan_tier", "pro"),
                estado="active",
                empresa_id=meta.get("empresa_id"),
            )

        if tipo == "customer.subscription.updated":
            items = (obj.get("items") or {}).get("data") or []
            price_id = (items[0].get("price") or {}).get("id") if items else None
            return EventoDeSuscripcion(
                tipo="actualizada",
                customer_id=obj.get("customer"),
                subscription_id=obj.get("id"),
                plan_tier=self._tier_de_price(price_id) if price_id else None,
                estado=_ESTADOS.get(obj.get("status", ""), "inactive"),
            )

        if tipo == "customer.subscription.deleted":
            # Mismo dato que `cancelar_suscripcion`, por la misma razón: si el
            # cliente cancela desde el portal de Stripe en vez de nuestro
            # endpoint, este webhook es la única notificación que llega, y
            # tiene que traer su propia fecha de vigencia.
            fin = obj.get("current_period_end")
            return EventoDeSuscripcion(
                tipo="cancelada",
                customer_id=obj.get("customer"),
                plan_tier="basico",
                estado="canceled",
                vigente_hasta=datetime.fromtimestamp(fin, tz=UTC).isoformat() if fin else None,
            )

        if tipo == "invoice.payment_failed":
            return EventoDeSuscripcion(
                tipo="pago_fallido",
                customer_id=obj.get("customer"),
                estado="past_due",
            )

        # Stripe emite decenas de tipos; los que no interesan no son un error.
        logger.debug("Evento de Stripe ignorado: %s", tipo)
        return None
