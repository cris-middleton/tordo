"""MercadoPago implementando el puerto `ProveedorDePago` (ADR 0008).

Se habla con la API REST directamente vía httpx en vez de usar el SDK oficial:
son cuatro endpoints, httpx ya es dependencia, y el SDK añade una capa que hay
que aprender para envolver las mismas llamadas.

Tres diferencias con Stripe que el código NO puede esconder
-----------------------------------------------------------

1. **El webhook no trae el recurso, sólo su id.** Stripe manda el objeto
   completo firmado; MercadoPago manda `{"type": ..., "data": {"id": ...}}` y hay
   que ir a buscarlo. Por eso `interpretar_webhook` hace una llamada de red, algo
   que en Stripe era criptografía pura. Los endpoints la sacan del bucle de
   eventos con `asyncio.to_thread`.

2. **No hay objeto "cliente" en el flujo de suscripción.** El pagador se
   identifica por correo, y `payer_id` sólo existe una vez autorizada. Ver
   `crear_o_recuperar_cliente`.

3. **No hay portal hospedado.** `tiene_portal_de_gestion = False`, que es
   exactamente la capacidad que el puerto ya modelaba: `/api/billing/portal`
   responde 501 y hace falta pantalla propia para cambiar de plan.

Lo que sí es mejor que en Stripe: `external_reference` viaja en la suscripción y
vuelve en cada consulta, así que el `empresa_id` se puede recuperar SIEMPRE, no
sólo en el primer pago.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any, Literal

import httpx

from app.domain.billing import (
    ErrorDeCobro,
    EstadoSuscripcion,
    EventoDeSuscripcion,
    SesionDePago,
)

logger = logging.getLogger(__name__)

API = "https://api.mercadopago.com"
TIMEOUT = httpx.Timeout(15.0, connect=5.0)

# (plan_tier, periodo) → atributo de settings con el preapproval_plan_id
PLANES: dict[tuple[str, str], str] = {
    ("pro", "monthly"): "mercadopago_plan_pro",
    ("pro", "annual"): "mercadopago_plan_pro_annual",
    ("enterprise", "monthly"): "mercadopago_plan_enterprise",
}

# Estado de MercadoPago → estado del dominio.
#
# `paused` se mapea a past_due y no a inactive a propósito: MercadoPago pausa la
# suscripción cuando el cobro falla de forma repetida, y es un estado del que se
# vuelve. Degradar el acceso a inactive cortaría a un cliente que sólo tiene que
# actualizar la tarjeta.
_ESTADOS: dict[str, EstadoSuscripcion] = {
    "authorized": "active",
    "pending": "inactive",
    "paused": "past_due",
    "cancelled": "canceled",
}


class MercadoPagoAdapter:
    nombre = "mercadopago"
    # `preapproval` cobra solo cada periodo, igual que Stripe. Es la razón por la
    # que se eligió sobre Transbank Oneclick, donde la recurrencia hay que
    # construirla a mano (ADR 0008).
    soporta_suscripcion_recurrente = True
    # MercadoPago no hospeda un portal de gestión equivalente al de Stripe.
    tiene_portal_de_gestion = False

    # ── Infraestructura ──────────────────────────────────────────────────────

    def _token(self) -> str:
        from app.config import settings

        if not settings.mercadopago_access_token:
            raise ErrorDeCobro("MERCADOPAGO_ACCESS_TOKEN no está configurada")
        return settings.mercadopago_access_token

    def _pedir(self, metodo: str, ruta: str, **kwargs) -> dict[str, Any]:
        cabeceras = {
            "Authorization": f"Bearer {self._token()}",
            "Content-Type": "application/json",
        }
        try:
            respuesta = httpx.request(
                metodo, f"{API}{ruta}", headers=cabeceras, timeout=TIMEOUT, **kwargs
            )
        except httpx.HTTPError as exc:
            raise ErrorDeCobro(f"No se pudo contactar a MercadoPago: {exc}") from exc

        if respuesta.status_code >= 400:
            # El detalle de MercadoPago es lo único que permite distinguir "plan
            # inexistente" de "token de otro entorno"; tragarlo deja el error mudo.
            raise ErrorDeCobro(
                f"MercadoPago respondió {respuesta.status_code} en {metodo} {ruta}: "
                f"{respuesta.text[:500]}"
            )
        return respuesta.json()

    def _plan_id(self, plan_tier: str, periodo: str) -> str:
        from app.config import settings

        attr = PLANES.get((plan_tier, periodo))
        if not attr:
            raise ErrorDeCobro(f"El plan '{plan_tier}' con cobro '{periodo}' no está disponible")
        plan_id = getattr(settings, attr, None)
        if not plan_id:
            raise ErrorDeCobro(
                f"Falta el plan de MercadoPago para '{plan_tier}' ({periodo}): "
                f"configura {attr.upper()}"
            )
        return plan_id

    def _tier_de_plan(self, plan_id: str) -> str | None:
        from app.config import settings

        for (tier, _periodo), attr in PLANES.items():
            if getattr(settings, attr, None) == plan_id:
                return tier
        logger.warning("preapproval_plan_id desconocido: %s", plan_id)
        return None

    # ── Puerto ───────────────────────────────────────────────────────────────

    def crear_o_recuperar_cliente(self, empresa, *, email_contacto: str | None = None) -> str:
        """Identificador del pagador.

        MercadoPago **no tiene un objeto cliente** que crear en el flujo de
        suscripción: el pagador se identifica por correo al crear el
        `preapproval`, y `payer_id` recién existe cuando la suscripción queda
        autorizada.

        Así que aquí no se crea nada. Se devuelve el `payer_id` ya guardado si lo
        hay — el webhook lo escribe en cuanto MercadoPago lo reporta — y si no,
        el correo, que es lo que MercadoPago sí usa para identificar al pagador
        en ese momento.

        Fabricar un cliente vía `/v1/customers` sólo para tener un id sería peor:
        ningún webhook de suscripción lo menciona, así que la búsqueda por
        `billing_customer_id` nunca casaría y fallaría en silencio.
        """
        if empresa.billing_customer_id:
            return empresa.billing_customer_id
        if not email_contacto:
            raise ErrorDeCobro(
                "MercadoPago necesita el correo del pagador para crear la suscripción"
            )
        return email_contacto

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
        if periodo not in ("monthly", "annual"):
            raise ErrorDeCobro(f"Periodo inválido '{periodo}': usa 'monthly' o 'annual'")

        plan_id = self._plan_id(plan_tier, periodo)

        # El correo tiene que venir de quien inicia el pago. Deducirlo de
        # `billing_customer_id` sólo funciona en la PRIMERA suscripción: en cuanto
        # el webhook la autoriza, esa columna pasa a tener el payer_id numérico.
        guardado = empresa.billing_customer_id or ""
        pagador = email_contacto or (guardado if "@" in guardado else "")
        if not pagador:
            raise ErrorDeCobro(
                "MercadoPago necesita el correo del pagador para crear la suscripción"
            )

        cuerpo = {
            "preapproval_plan_id": plan_id,
            "payer_email": pagador,
            "back_url": url_exito,
            "reason": f"TORDO {plan_tier.capitalize()}",
            # Es lo que permite reencontrar la empresa en CADA evento, no sólo en
            # el primero: MercadoPago lo devuelve en toda consulta al preapproval.
            # `url_cancelacion` no tiene equivalente: MercadoPago usa un único
            # back_url y devuelve el estado en la query string.
            "external_reference": str(empresa.id),
        }
        respuesta = self._pedir("POST", "/preapproval", json=cuerpo)

        url = respuesta.get("init_point") or respuesta.get("sandbox_init_point")
        if not url:
            raise ErrorDeCobro(f"MercadoPago no devolvió init_point: {respuesta}")
        return SesionDePago(url=url, referencia=respuesta.get("id"))

    def url_portal_de_gestion(self, customer_id: str, url_retorno: str) -> str | None:
        """MercadoPago no hospeda portal. El endpoint responde 501 antes de llegar aquí."""
        return None

    def cancelar_suscripcion(self, subscription_id: str) -> str | None:
        """MercadoPago cancela con un PUT sobre el preapproval.

        No hay DELETE: el recurso sigue existiendo en estado `cancelled`, que es
        lo que permite seguir consultándolo después. La respuesta trae
        `next_payment_date`, que es exactamente la fecha hasta la que el cliente
        ya pagó — y por tanto hasta cuándo le toca conservar el acceso.
        """
        respuesta = self._pedir(
            "PUT", f"/preapproval/{subscription_id}", json={"status": "cancelled"}
        )
        return respuesta.get("next_payment_date") or None

    def interpretar_webhook(
        self, payload: bytes, cabeceras: dict[str, str]
    ) -> EventoDeSuscripcion | None:
        cuerpo = self._verificar_firma(payload, cabeceras)

        tipo = cuerpo.get("type") or cuerpo.get("topic")
        recurso_id = str((cuerpo.get("data") or {}).get("id") or "")
        if not recurso_id:
            logger.debug("Notificación de MercadoPago sin id de recurso: %s", tipo)
            return None

        if tipo == "subscription_preapproval":
            return self._evento_de_suscripcion(recurso_id)

        if tipo == "subscription_authorized_payment":
            return self._evento_de_cobro(recurso_id)

        # MercadoPago notifica también pagos sueltos, contracargos y órdenes
        # comerciales. No son un error, simplemente no son una suscripción.
        logger.debug("Notificación de MercadoPago ignorada: %s", tipo)
        return None

    # ── Traducción de eventos ────────────────────────────────────────────────

    def _evento_de_suscripcion(self, preapproval_id: str) -> EventoDeSuscripcion:
        sub = self._pedir("GET", f"/preapproval/{preapproval_id}")
        estado = _ESTADOS.get(sub.get("status", ""), "inactive")
        empresa_id = sub.get("external_reference")
        # `payer_id` es numérico en la respuesta; el modelo guarda texto.
        customer_id = str(sub.get("payer_id") or "") or None
        plan_id = sub.get("preapproval_plan_id")
        tier = self._tier_de_plan(plan_id) if plan_id else None

        if estado == "canceled":
            return EventoDeSuscripcion(
                tipo="cancelada",
                customer_id=customer_id,
                subscription_id=preapproval_id,
                plan_tier="basico",
                estado="canceled",
                empresa_id=empresa_id,
            )

        if estado == "active":
            # `activada` es idempotente en el manejador: reescribe plan y estado
            # con los mismos valores. MercadoPago reenvía notificaciones cuando no
            # recibe 200, así que tiene que serlo.
            return EventoDeSuscripcion(
                tipo="activada",
                customer_id=customer_id,
                subscription_id=preapproval_id,
                plan_tier=tier or "pro",
                estado="active",
                empresa_id=empresa_id,
            )

        return EventoDeSuscripcion(
            tipo="actualizada",
            customer_id=customer_id,
            subscription_id=preapproval_id,
            plan_tier=tier,
            estado=estado,
            empresa_id=empresa_id,
        )

    def _evento_de_cobro(self, pago_id: str) -> EventoDeSuscripcion | None:
        """Cobro recurrente de una suscripción ya autorizada.

        Sólo interesa cuando falla: el cobro exitoso no cambia nada que la
        aplicación tenga guardado, y `subscription_preapproval` ya reporta los
        cambios de estado.
        """
        pago = self._pedir("GET", f"/authorized_payments/{pago_id}")
        estado = pago.get("status")
        if estado in ("rejected", "cancelled"):
            preapproval_id = str(pago.get("preapproval_id") or "") or None
            return EventoDeSuscripcion(
                tipo="pago_fallido",
                customer_id=str(pago.get("payer_id") or "") or None,
                subscription_id=preapproval_id,
                estado="past_due",
            )
        logger.debug("Cobro recurrente %s en estado %s: sin efecto", pago_id, estado)
        return None

    # ── Firma ────────────────────────────────────────────────────────────────

    def _verificar_firma(self, payload: bytes, cabeceras: dict[str, str]) -> dict[str, Any]:
        """Valida `x-signature` y devuelve el cuerpo.

        MercadoPago firma un *manifiesto* con el id del recurso, el id de la
        petición y la marca de tiempo — no el cuerpo entero como Stripe. Una firma
        inválida es un intento de suplantación, no un evento a ignorar: alguien
        que pueda falsificarlo activa suscripciones que nadie pagó.
        """
        from app.config import settings

        if not settings.mercadopago_webhook_secret:
            raise ErrorDeCobro("MERCADOPAGO_WEBHOOK_SECRET no está configurada")

        # Las cabeceras HTTP no distinguen mayúsculas; el dict que llega sí.
        normal = {k.lower(): v for k, v in cabeceras.items()}
        firma = normal.get("x-signature", "")
        partes = dict(trozo.strip().split("=", 1) for trozo in firma.split(",") if "=" in trozo)
        ts, recibido = partes.get("ts"), partes.get("v1")
        if not ts or not recibido:
            raise ErrorDeCobro("Falta la cabecera x-signature de MercadoPago")

        try:
            cuerpo = json.loads(payload)
        except (ValueError, TypeError) as exc:
            raise ErrorDeCobro(f"Cuerpo de webhook ilegible: {exc}") from exc

        recurso_id = str((cuerpo.get("data") or {}).get("id") or "")
        manifiesto = ""
        if recurso_id:
            manifiesto += f"id:{recurso_id};"
        if normal.get("x-request-id"):
            manifiesto += f"request-id:{normal['x-request-id']};"
        manifiesto += f"ts:{ts};"

        esperado = hmac.new(
            settings.mercadopago_webhook_secret.encode(),
            manifiesto.encode(),
            hashlib.sha256,
        ).hexdigest()

        # compare_digest y no ==: la comparación normal termina en el primer byte
        # distinto y filtra la firma correcta por tiempo.
        if not hmac.compare_digest(esperado, recibido):
            raise ErrorDeCobro("Firma de webhook inválida")
        return cuerpo
