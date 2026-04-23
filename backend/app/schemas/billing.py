"""Pydantic schemas for Billing API."""
from typing import Literal, Optional
from pydantic import BaseModel


class Plan(BaseModel):
    id: str
    nombre: str
    descripcion: str
    features: list[str]
    precio_mensual_clp: Optional[int] = None
    precio_anual_mensualizado_clp: Optional[int] = None  # monthly-equivalent of the annual plan
    precio_anual_total_clp: Optional[int] = None         # one-time annual charge amount


class BillingStatus(BaseModel):
    plan_tier: str
    subscription_status: str
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    billing_enabled: bool


class CheckoutRequest(BaseModel):
    plan_tier: str
    billing_period: Literal["monthly", "annual"] = "monthly"
    success_url: str
    cancel_url: str


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalResponse(BaseModel):
    portal_url: str
