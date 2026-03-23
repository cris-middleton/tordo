"""
StripeService — all Stripe interactions.

When feature_billing=False or STRIPE_SECRET_KEY is not set, methods that
require a live API key raise HTTP 503 so the rest of the app keeps working.

The stripe SDK is imported lazily so the server starts without the key.

Checkout flow:
  1. POST /api/billing/checkout  → create Stripe Checkout session → return URL
  2. Stripe redirects to success_url on payment
  3. Stripe sends webhook → /api/webhooks/stripe  → update subscription_status

Portal flow:
  POST /api/billing/portal  → create Billing Portal session → return URL
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

# Map plan tier → Stripe price ID (read at call time from settings)
PLAN_PRICE_ENV: dict[str, str] = {
    "pro": "stripe_price_pro",
    "enterprise": "stripe_price_enterprise",
}


def _require_billing():
    from app.config import settings

    if not settings.feature_billing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing module is disabled. Set FEATURE_BILLING=true and configure Stripe keys.",
        )
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe is not configured. Set STRIPE_SECRET_KEY in .env.",
        )


def _stripe():
    """Lazily import and configure the Stripe SDK."""
    import stripe  # noqa: F401 — optional dep

    from app.config import settings

    stripe.api_key = settings.stripe_secret_key
    return stripe


# ─────────────────────────────────────────────────────────────────────────────
# Customer management
# ─────────────────────────────────────────────────────────────────────────────


def get_or_create_customer(user) -> str:
    """Return the Stripe customer ID for the user, creating one if needed."""
    _require_billing()
    s = _stripe()

    if user.stripe_customer_id:
        return user.stripe_customer_id

    customer = s.Customer.create(
        email=user.email,
        name=user.full_name or user.username,
        metadata={"user_id": str(user.id)},
    )
    return customer.id


# ─────────────────────────────────────────────────────────────────────────────
# Checkout & portal
# ─────────────────────────────────────────────────────────────────────────────


def create_checkout_session(user, plan_tier: str, success_url: str, cancel_url: str) -> str:
    """
    Create a Stripe Checkout session for the given plan.
    Returns the session URL.
    """
    _require_billing()
    s = _stripe()
    from app.config import settings

    price_attr = PLAN_PRICE_ENV.get(plan_tier)
    if not price_attr:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Plan '{plan_tier}' does not require payment.",
        )

    price_id = getattr(settings, price_attr, None)
    if not price_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Stripe price ID for plan '{plan_tier}' is not configured.",
        )

    customer_id = get_or_create_customer(user)

    session = s.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": str(user.id), "plan_tier": plan_tier},
        subscription_data={"metadata": {"user_id": str(user.id), "plan_tier": plan_tier}},
    )
    return session.url


def create_portal_session(customer_id: str, return_url: str) -> str:
    """Create a Stripe Billing Portal session. Returns the portal URL."""
    _require_billing()
    s = _stripe()

    session = s.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return session.url


# ─────────────────────────────────────────────────────────────────────────────
# Webhook handling
# ─────────────────────────────────────────────────────────────────────────────


def construct_webhook_event(payload: bytes, sig_header: str):
    """Verify Stripe webhook signature and return the event object."""
    from app.config import settings

    if not settings.stripe_webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="STRIPE_WEBHOOK_SECRET is not configured.",
        )

    s = _stripe()
    try:
        event = s.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except Exception as exc:
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")
    return event


def subscription_status_from_stripe(stripe_status: str) -> str:
    """Map Stripe subscription status to our local status string."""
    mapping = {
        "active": "active",
        "trialing": "trialing",
        "past_due": "past_due",
        "canceled": "canceled",
        "unpaid": "past_due",
        "incomplete": "inactive",
        "incomplete_expired": "inactive",
        "paused": "inactive",
    }
    return mapping.get(stripe_status, "inactive")
