"""
Stripe webhook handler.

Endpoint: POST /api/webhooks/stripe
Stripe sends signed events here after payment/subscription changes.

Handled events:
  - checkout.session.completed        → link subscription_id to user
  - customer.subscription.updated     → sync plan_tier + subscription_status
  - customer.subscription.deleted     → downgrade to basico
  - invoice.payment_failed            → mark as past_due

The endpoint verifies the Stripe-Signature header and ignores unrecognised events.
"""

import asyncio
import logging

from fastapi import APIRouter, Request, status

from app.db import SyncSessionLocal
from app.services.stripe_service import (
    construct_webhook_event,
    subscription_status_from_stripe,
)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)


# Map Stripe price IDs to plan tiers at runtime (from settings)
def _price_to_tier(price_id: str) -> str:
    from app.config import settings

    mapping = {
        settings.stripe_price_pro: "pro",
        settings.stripe_price_enterprise: "enterprise",
    }
    return mapping.get(price_id, "basico")


@router.post("/stripe", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request):
    """
    Stripe sends POST requests here for subscription lifecycle events.
    Must be publicly reachable (no auth header — Stripe signs the payload instead).
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    event = construct_webhook_event(payload, sig_header)
    event_type: str = event["type"]
    data = event["data"]["object"]

    logger.info("Stripe webhook received: %s", event_type)

    def _sync_db_work():
        db = SyncSessionLocal()
        try:
            if event_type == "checkout.session.completed":
                _handle_checkout_completed(db, data)

            elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
                _handle_subscription_updated(db, data)

            elif event_type == "customer.subscription.deleted":
                _handle_subscription_deleted(db, data)

            elif event_type == "invoice.payment_failed":
                _handle_payment_failed(db, data)

            else:
                logger.debug("Unhandled Stripe event: %s", event_type)

        except Exception as exc:
            logger.error("Error processing Stripe event %s: %s", event_type, exc)
            # Return 200 to prevent Stripe from retrying for non-critical errors
        finally:
            db.close()

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _sync_db_work)

    return {"received": True}


# ─── Event handlers ───────────────────────────────────────────────────────────


def _empresa_por_customer(db, customer_id: str):
    """La empresa dueña de ese customer de Stripe.

    El sujeto de la facturación es la empresa (ADR 0002). Antes se buscaba un
    usuario, lo que con varios asientos habría aplicado el cobro a la persona
    que hizo el checkout en vez de a la cuenta.
    """
    from app.models.empresa import Empresa

    return db.query(Empresa).filter(Empresa.stripe_customer_id == customer_id).first()


def _handle_checkout_completed(db, session):
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")
    metadata = session.get("metadata", {})
    plan_tier = metadata.get("plan_tier", "pro")

    empresa = _empresa_por_customer(db, customer_id)
    if not empresa and metadata.get("empresa_id"):
        # Primer checkout: el customer todavía no está guardado en la empresa,
        # así que se recupera del metadata que se envió al crear la sesión.
        from uuid import UUID

        from app.models.empresa import Empresa

        try:
            eid = UUID(metadata["empresa_id"])
        except (ValueError, KeyError):
            logger.error(
                "checkout.session.completed: empresa_id inválido en metadata: %s",
                metadata.get("empresa_id"),
            )
            return
        empresa = db.query(Empresa).filter(Empresa.id == eid).first()

    if not empresa:
        logger.warning(
            "checkout.session.completed: ninguna empresa para el customer %s", customer_id
        )
        return

    empresa.stripe_customer_id = customer_id
    empresa.stripe_subscription_id = subscription_id
    empresa.plan_tier = plan_tier
    empresa.subscription_status = "active"
    db.commit()
    logger.info("Empresa %s activó el plan %s", empresa.id, plan_tier)


def _handle_subscription_updated(db, subscription):
    customer_id = subscription.get("customer")
    subscription_id = subscription.get("id")
    stripe_status = subscription.get("status", "inactive")

    empresa = _empresa_por_customer(db, customer_id)
    if not empresa:
        return

    empresa.subscription_status = subscription_status_from_stripe(stripe_status)
    empresa.stripe_subscription_id = subscription_id

    # El plan sale del primer price del item
    items = subscription.get("items", {}).get("data", [])
    if items:
        price_id = items[0].get("price", {}).get("id")
        if price_id:
            empresa.plan_tier = _price_to_tier(price_id)

    db.commit()
    logger.info(
        "Suscripción actualizada para la empresa %s: %s / %s",
        empresa.id,
        empresa.plan_tier,
        empresa.subscription_status,
    )


def _handle_subscription_deleted(db, subscription):
    customer_id = subscription.get("customer")
    empresa = _empresa_por_customer(db, customer_id)
    if not empresa:
        return

    empresa.plan_tier = "basico"
    empresa.subscription_status = "canceled"
    empresa.stripe_subscription_id = None
    db.commit()
    logger.info("Suscripción cancelada para la empresa %s → baja a basico", empresa.id)


def _handle_payment_failed(db, invoice):
    customer_id = invoice.get("customer")
    empresa = _empresa_por_customer(db, customer_id)
    if not empresa:
        return

    empresa.subscription_status = "past_due"
    db.commit()
    logger.warning("Pago fallido de la empresa %s → suscripción en past_due", empresa.id)
