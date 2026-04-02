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

from fastapi import APIRouter, HTTPException, Request, status

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
    from app.db import SyncSessionLocal
    from app.services.stripe_service import (
        construct_webhook_event,
        subscription_status_from_stripe,
    )

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


def _get_user_by_customer(db, customer_id: str):
    from app.models.user import User

    return db.query(User).filter(User.stripe_customer_id == customer_id).first()


def _handle_checkout_completed(db, session):
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")
    metadata = session.get("metadata", {})
    plan_tier = metadata.get("plan_tier", "pro")

    user = _get_user_by_customer(db, customer_id)
    if not user and metadata.get("user_id"):
        from app.models.user import User
        try:
            uid = int(metadata["user_id"])
        except (ValueError, KeyError):
            logger.error("checkout.session.completed: invalid user_id in metadata: %s", metadata.get("user_id"))
            return
        user = db.query(User).filter(User.id == uid).first()

    if not user:
        logger.warning("checkout.session.completed: no user found for customer %s", customer_id)
        return

    user.stripe_customer_id = customer_id
    user.stripe_subscription_id = subscription_id
    user.plan_tier = plan_tier
    user.subscription_status = "active"
    db.commit()
    logger.info("User %s upgraded to %s", user.id, plan_tier)


def _handle_subscription_updated(db, subscription):
    customer_id = subscription.get("customer")
    subscription_id = subscription.get("id")
    stripe_status = subscription.get("status", "inactive")

    user = _get_user_by_customer(db, customer_id)
    if not user:
        return

    user.subscription_status = subscription_status_from_stripe(stripe_status)
    user.stripe_subscription_id = subscription_id

    # Update plan tier from first price item
    items = subscription.get("items", {}).get("data", [])
    if items:
        price_id = items[0].get("price", {}).get("id")
        if price_id:
            user.plan_tier = _price_to_tier(price_id)

    db.commit()
    logger.info("Subscription updated for user %s: %s / %s", user.id, user.plan_tier, user.subscription_status)


def _handle_subscription_deleted(db, subscription):
    customer_id = subscription.get("customer")
    user = _get_user_by_customer(db, customer_id)
    if not user:
        return

    user.plan_tier = "basico"
    user.subscription_status = "canceled"
    user.stripe_subscription_id = None
    db.commit()
    logger.info("Subscription canceled for user %s → downgraded to basico", user.id)


def _handle_payment_failed(db, invoice):
    customer_id = invoice.get("customer")
    user = _get_user_by_customer(db, customer_id)
    if not user:
        return

    user.subscription_status = "past_due"
    db.commit()
    logger.warning("Payment failed for user %s → subscription past_due", user.id)
