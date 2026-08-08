"""Webhooks de la pasarela de pago.

Endpoint: POST /api/webhooks/stripe

El proveedor verifica la firma y traduce el evento al dominio; aquí sólo se
aplica el efecto sobre la empresa. **Este archivo no sabe de ninguna pasarela**:
cambiar de MercadoPago a Stripe no lo toca (ver `app/domain/billing.py` y
`app/infra/billing/`).

El sujeto es la EMPRESA, no el usuario: la suscripción le pertenece a ella y los
usuarios son asientos (ADR 0002).
"""

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request, status

from app.db import SyncSessionLocal
from app.domain.billing import ErrorDeCobro, EventoDeSuscripcion
from app.infra.billing import obtener_proveedor
from app.repositories import empresas_sync as repo

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)


@router.post("/stripe", status_code=status.HTTP_200_OK)
async def webhook_pasarela(request: Request):
    """Recibe los eventos de la pasarela.

    Debe ser alcanzable sin autenticación: la garantía es la firma del payload,
    que verifica el proveedor.

    La ruta conserva el sufijo `/stripe` por compatibilidad: es la ya registrada
    en el dashboard de Stripe. Sirve para cualquier pasarela — la URL de
    notificación de MercadoPago se configura apuntando aquí.
    """
    payload = await request.body()
    proveedor = obtener_proveedor()

    try:
        # A un thread porque con MercadoPago esto hace red: su notificación trae
        # sólo el id del recurso y hay que ir a buscarlo (con Stripe era
        # criptografía pura, y por eso no se notaba). Bloquear el bucle de
        # eventos aquí frena TODAS las peticiones del proceso.
        evento = await asyncio.to_thread(
            proveedor.interpretar_webhook, payload, dict(request.headers)
        )
    except ErrorDeCobro as exc:
        logger.warning("Webhook rechazado: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if evento is None:
        return {"status": "ignorado"}

    logger.info("Evento de cobro: %s (customer=%s)", evento.tipo, evento.customer_id)
    await asyncio.to_thread(aplicar_evento_de_suscripcion, evento, proveedor.nombre)
    return {"status": "ok"}


def aplicar_evento_de_suscripcion(
    evento: EventoDeSuscripcion, proveedor_nombre: str = "mercadopago"
) -> None:
    """Aplica el evento sobre la empresa. Síncrono: corre en un thread.

    Público a propósito para poder testearlo sin montar el endpoint.
    """
    db = SyncSessionLocal()
    try:
        empresa = buscar_empresa_del_evento(db, evento)
        if empresa is None:
            logger.warning(
                "Evento %s sin empresa asociada (customer=%s)", evento.tipo, evento.customer_id
            )
            return

        if evento.tipo == "activada":
            empresa.billing_provider = proveedor_nombre
            empresa.billing_customer_id = evento.customer_id
            empresa.billing_subscription_id = evento.subscription_id
            empresa.plan_tier = evento.plan_tier or "pro"
            empresa.subscription_status = "active"

        elif evento.tipo == "actualizada":
            empresa.subscription_status = evento.estado or "inactive"
            if evento.subscription_id:
                empresa.billing_subscription_id = evento.subscription_id
            if evento.plan_tier:
                empresa.plan_tier = evento.plan_tier

        elif evento.tipo == "cancelada":
            empresa.plan_tier = "basico"
            empresa.subscription_status = "canceled"
            empresa.billing_subscription_id = None

        elif evento.tipo == "pago_fallido":
            empresa.subscription_status = "past_due"

        db.commit()
        logger.info(
            "Empresa %s → %s / %s", empresa.id, empresa.plan_tier, empresa.subscription_status
        )
    finally:
        db.close()


def buscar_empresa_del_evento(db, evento: EventoDeSuscripcion):
    """Localiza la empresa del evento.

    Normalmente por `billing_customer_id`. En el PRIMER pago la empresa todavía no
    lo tiene guardado, así que se recurre al `empresa_id` que el proveedor extrae
    del metadata enviado al iniciar el cobro.
    """
    if evento.customer_id:
        empresa = repo.buscar_por_customer_id(db, evento.customer_id)
        if empresa:
            return empresa

    if evento.empresa_id:
        return repo.buscar_por_id_textual(db, evento.empresa_id)
    return None
