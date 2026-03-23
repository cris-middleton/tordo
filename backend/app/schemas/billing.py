"""Pydantic schemas for Billing API."""
from typing import Optional
from pydantic import BaseModel


class Plan(BaseModel):
    id: str
    nombre: str
    precio_clp: Optional[int] = None  # None = free
    descripcion: str
    features: list[str]


class BillingStatus(BaseModel):
    plan_tier: str
    subscription_status: str
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    billing_enabled: bool


class CheckoutRequest(BaseModel):
    plan_tier: str
    success_url: str
    cancel_url: str


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalResponse(BaseModel):
    portal_url: str
