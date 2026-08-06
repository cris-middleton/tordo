"""Pydantic schemas for Billing API."""

from typing import Literal

from pydantic import BaseModel


class Plan(BaseModel):
    id: str
    nombre: str
    descripcion: str
    features: list[str]
    precio_mensual_clp: int | None = None
    precio_anual_mensualizado_clp: int | None = None  # monthly-equivalent of the annual plan
    precio_anual_total_clp: int | None = None  # one-time annual charge amount


class BillingStatus(BaseModel):
    plan_tier: str
    subscription_status: str
    billing_customer_id: str | None = None
    billing_subscription_id: str | None = None
    billing_enabled: bool
    # MercadoPago no hospeda portal de gestión y Stripe sí. Sin este dato el
    # frontend muestra un botón "Gestionar suscripción" que responde 501.
    tiene_portal_de_gestion: bool = False


class CheckoutRequest(BaseModel):
    plan_tier: str
    billing_period: Literal["monthly", "annual"] = "monthly"
    success_url: str
    cancel_url: str


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalResponse(BaseModel):
    portal_url: str
