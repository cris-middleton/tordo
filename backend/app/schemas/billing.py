"""Pydantic schemas for Billing API."""

from typing import Literal

from pydantic import BaseModel


class Plan(BaseModel):
    # El id es el `plan_tier` que se guarda en la empresa y contra el que resuelve
    # el gating: basico | pyme | pro | enterprise. `nombre` es lo que se muestra,
    # y puede diferir ("Free" para basico).
    id: str
    nombre: str
    descripcion: str
    features: list[str]
    max_usuarios: int | None = None  # None = sin tope
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
