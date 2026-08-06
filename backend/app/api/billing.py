"""Billing API — subscription management via Stripe."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import empresa_facturable
from app.core.security import get_current_active_user
from app.db import get_db
from app.domain.billing import ErrorDeCobro
from app.infra.billing import obtener_proveedor
from app.models.empresa import Empresa
from app.models.user import User
from app.schemas.billing import (
    BillingStatus,
    CheckoutRequest,
    CheckoutResponse,
    Plan,
    PortalResponse,
)

router = APIRouter(prefix="/api/billing", tags=["billing"])

PLANS: list[Plan] = [
    Plan(
        id="free",
        nombre="Free",
        descripcion="Para explorar sin compromiso.",
        features=[
            "Exploración de licitaciones",
            "3 alertas al mes",
            "Monitor de estado hábil",
            "Sin tarjeta de crédito",
        ],
    ),
    Plan(
        id="pro",
        nombre="Pro",
        descripcion="Inteligencia completa para ganar más licitaciones.",
        features=[
            "Alertas ilimitadas",
            "Benchmarks de precio por producto",
            "Análisis de competidores",
            "Score de oportunidad",
            "Matching semántico",
            "Checklist por tipo de licitación",
            "Alertas de vencimiento de documentos",
        ],
        precio_mensual_clp=11900,
        precio_anual_mensualizado_clp=9900,
        precio_anual_total_clp=118800,
    ),
]


@router.get("/plans", response_model=list[Plan])
async def list_plans():
    return PLANS


@router.get("/status", response_model=BillingStatus)
async def get_billing_status(empresa: Empresa = Depends(empresa_facturable)):
    """Estado de la suscripción de la empresa.

    El sujeto es la empresa, no el usuario (ADR 0002). Si el usuario pertenece a
    varias, tiene que decir de cuál con `empresa_id`.
    """
    from app.config import settings

    return BillingStatus(
        plan_tier=empresa.plan_tier,
        subscription_status=empresa.subscription_status,
        stripe_customer_id=empresa.stripe_customer_id,
        stripe_subscription_id=empresa.stripe_subscription_id,
        billing_enabled=settings.feature_billing,
    )


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout_session(
    payload: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    empresa: Empresa = Depends(empresa_facturable),
):
    proveedor = obtener_proveedor()

    # El cliente del proveedor representa a la EMPRESA. El correo del usuario que
    # inicia el pago va sólo como contacto.
    try:
        customer_id = proveedor.crear_o_recuperar_cliente(
            empresa, email_contacto=current_user.email
        )
        if customer_id != empresa.stripe_customer_id:
            empresa.stripe_customer_id = customer_id
            await db.commit()
            await db.refresh(empresa)

        sesion = proveedor.iniciar_pago(
            empresa,
            plan_tier=payload.plan_tier,
            periodo=payload.billing_period,
            url_exito=payload.success_url,
            url_cancelacion=payload.cancel_url,
        )
    except ErrorDeCobro as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return CheckoutResponse(checkout_url=sesion.url)


@router.post("/portal", response_model=PortalResponse)
async def create_billing_portal(
    empresa: Empresa = Depends(empresa_facturable),
):
    from app.config import settings

    if not settings.feature_billing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El módulo de cobro está apagado.",
        )
    if not empresa.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La empresa no tiene un cliente de cobro. Completa un pago primero.",
        )

    proveedor = obtener_proveedor()
    if not proveedor.tiene_portal_de_gestion:
        # Las pasarelas locales no hospedan portal: hay que ofrecer UI propia.
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=(
                f"El proveedor '{proveedor.nombre}' no tiene portal de gestión. "
                "Usa la pantalla de planes para cambiar o cancelar."
            ),
        )

    url = proveedor.url_portal_de_gestion(
        empresa.stripe_customer_id, f"{settings.frontend_url}/dashboard/billing"
    )
    return PortalResponse(portal_url=url)
