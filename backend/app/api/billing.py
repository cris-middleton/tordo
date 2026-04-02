"""Billing API — subscription management via Stripe."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.user import User
from app.schemas.billing import BillingStatus, CheckoutRequest, CheckoutResponse, Plan, PortalResponse

router = APIRouter(prefix="/api/billing", tags=["billing"])

PLANS: list[Plan] = [
    Plan(id="basico", nombre="Básico", precio_clp=None, descripcion="Para comenzar a explorar licitaciones públicas.", features=["Búsqueda de licitaciones", "Alertas básicas", "1 empresa", "Documentos (hasta 10)"]),
    Plan(id="pyme", nombre="Pyme", precio_clp=5900, descripcion="Para pymes que quieren más alcance.", features=["Todo lo de Básico", "50 BI queries/día", "Alertas ilimitadas", "Documentos (hasta 50)"]),
    Plan(id="pro", nombre="Pro", precio_clp=11900, descripcion="Para proveedores activos en Mercado Público.", features=["Todo lo de Pyme", "BI ilimitado", "Documentos ilimitados", "Estado hábil automático cada 6h", "Alertas avanzadas + WhatsApp", "Postulaciones ilimitadas"]),
    Plan(id="enterprise", nombre="Enterprise", precio_clp=29990, descripcion="Para equipos y empresas con múltiples RUTs.", features=["Todo lo de Pro", "Múltiples empresas", "API access", "SLA de soporte prioritario", "Onboarding asistido"]),
]


@router.get("/plans", response_model=list[Plan])
async def list_plans():
    return PLANS


@router.get("/status", response_model=BillingStatus)
async def get_billing_status(current_user: User = Depends(get_current_active_user)):
    from app.config import settings
    return BillingStatus(
        plan_tier=current_user.plan_tier,
        subscription_status=current_user.subscription_status,
        stripe_customer_id=current_user.stripe_customer_id,
        stripe_subscription_id=current_user.stripe_subscription_id,
        billing_enabled=settings.feature_billing,
    )


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout_session(
    payload: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from app.services.stripe_service import create_checkout_session, get_or_create_customer
    customer_id = get_or_create_customer(current_user)
    if customer_id != current_user.stripe_customer_id:
        current_user.stripe_customer_id = customer_id
        await db.commit()
        await db.refresh(current_user)
    url = create_checkout_session(current_user, payload.plan_tier, payload.success_url, payload.cancel_url)
    return CheckoutResponse(checkout_url=url)


@router.post("/portal", response_model=PortalResponse)
async def create_billing_portal(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from app.config import settings
    from app.services.stripe_service import create_portal_session
    if not settings.feature_billing:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing module is disabled.")
    if not current_user.stripe_customer_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No Stripe customer found. Complete a checkout first.")
    return_url = f"{settings.frontend_url}/dashboard/billing"
    url = create_portal_session(current_user.stripe_customer_id, return_url)
    return PortalResponse(portal_url=url)
