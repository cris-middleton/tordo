"""API de cobro.

No conoce la pasarela: todo pasa por el puerto (`app/domain/billing.py`). Las
llamadas al proveedor van a un thread porque hacen red de forma síncrona y
bloquearían el bucle de eventos.
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import empresa_facturable, verificar_acceso_empresa
from app.core.plan_limits import get_quota
from app.core.security import get_current_active_user
from app.db import get_db
from app.domain.billing import ErrorDeCobro, parsear_vigente_hasta
from app.infra.billing import obtener_proveedor
from app.models.empresa import Empresa
from app.models.user import User
from app.schemas.billing import (
    BillingStatus,
    CancelacionResponse,
    CheckoutRequest,
    CheckoutResponse,
    Plan,
    PortalResponse,
)

router = APIRouter(prefix="/billing", tags=["billing"])

PLANS: list[Plan] = [
    # El id ES el plan_tier almacenado. Se llamaba "free" mientras la base
    # guardaba "basico": el gating funcionaba de casualidad, porque un tier
    # desconocido cae al índice 0, que resulta ser basico.
    Plan(
        id="basico",
        nombre="Free",
        descripcion="Para ver si esto te sirve.",
        # Las capacidades tienen que decir lo que `PLAN_QUOTAS` aplica de verdad.
        # Decían "3 alertas al mes" y el código aplica **5 alertas activas**; y no
        # mencionaban el límite que de verdad separa este plan del de pago, que
        # son las 3 consultas de BI al día. Una lista de capacidades que no
        # coincide con el gating es una promesa que el producto incumple sola.
        features=[
            "Explora licitaciones, Compra Ágil y Convenio Marco",
            "3 consultas de precio al día",
            "5 alertas activas",
            "Monitor de estado hábil",
            "1 usuario · sin tarjeta de crédito",
        ],
        max_usuarios=get_quota("basico")["max_usuarios"],
    ),
    Plan(
        id="pro",
        nombre="Pro",
        descripcion="Para cuando postular es parte del negocio.",
        features=[
            "Consultas de precio sin límite",
            "Perfil del comprador y competencia",
            "Score de oportunidad",
            "Matching semántico: encaje con lo que vendes",
            "Informe semanal en PDF",
            "Vigilancia de precios de tus productos",
            "Alertas ilimitadas y recordatorios de cierre",
            "Checklist por tipo y hasta 200 documentos",
            "Hasta 5 personas en el equipo",
        ],
        max_usuarios=get_quota("pro")["max_usuarios"],
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
        billing_customer_id=empresa.billing_customer_id,
        billing_subscription_id=empresa.billing_subscription_id,
        billing_enabled=settings.feature_billing,
        tiene_portal_de_gestion=obtener_proveedor().tiene_portal_de_gestion,
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
        customer_id = await asyncio.to_thread(
            proveedor.crear_o_recuperar_cliente, empresa, email_contacto=current_user.email
        )
        if (
            customer_id != empresa.billing_customer_id
            or empresa.billing_provider != proveedor.nombre
        ):
            empresa.billing_customer_id = customer_id
            # Se registra QUÉ pasarela tiene esta empresa: con más de una activa,
            # el webhook y el portal tienen que saber a cuál preguntar.
            empresa.billing_provider = proveedor.nombre
            await db.commit()
            await db.refresh(empresa)

        sesion = await asyncio.to_thread(
            proveedor.iniciar_pago,
            empresa,
            plan_tier=payload.plan_tier,
            periodo=payload.billing_period,
            url_exito=payload.success_url,
            url_cancelacion=payload.cancel_url,
            email_contacto=current_user.email,
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
    if not empresa.billing_customer_id:
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

    url = await asyncio.to_thread(
        proveedor.url_portal_de_gestion,
        empresa.billing_customer_id,
        f"{settings.frontend_url}/dashboard/billing",
    )
    return PortalResponse(portal_url=url)


@router.post("/cancelar", response_model=CancelacionResponse)
async def cancelar_suscripcion(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    empresa: Empresa = Depends(empresa_facturable),
):
    """Da de baja la suscripción de la empresa.

    Existe porque MercadoPago no hospeda portal de gestión: sin este endpoint la
    única forma de dejar de pagar sería escribir un correo, y contratar por un
    canal obliga a poder terminar por el mismo.

    **El rol se comprueba sobre la empresa YA resuelta**, con
    `verificar_acceso_empresa` — la misma implementación que usan las
    dependencias, nunca una consulta de membresía propia. Apilar
    `Depends(require_rol(...))` aquí haría obligatorio el `empresa_id` que el
    resto de `/billing` deja opcional: `require_rol` cuelga de `empresa_ctx`,
    pensado para rutas con `{empresa_id}` en el path, y sin eso FastAPI lo
    reclasifica como query obligatorio.

    **El orden importa.** Primero se le pide la baja a la pasarela y sólo
    después se escribe en la base. Al revés, un fallo de red dejaría a la
    empresa viéndose como cancelada mientras el cobro sigue corriendo.
    """
    ctx = await verificar_acceso_empresa(empresa.id, current_user, db)
    if ctx.rol not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol owner o admin",
        )

    if not empresa.billing_subscription_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta empresa no tiene una suscripción activa que cancelar.",
        )

    proveedor = obtener_proveedor()
    try:
        vigente_hasta = await asyncio.to_thread(
            proveedor.cancelar_suscripcion, empresa.billing_subscription_id
        )
    except ErrorDeCobro as exc:
        # 502 y no 400: el fallo es de la pasarela, no de lo que pidió el usuario.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo cancelar en la pasarela: {exc}",
        ) from exc

    empresa.subscription_status = "canceled"
    empresa.billing_subscription_id = None
    # El plan NO se degrada aquí: el acceso ya pagado se respeta hasta
    # `plan_vigente_hasta`, y el job nocturno lo baja cuando esa fecha pasa
    # (Tarea 5). Degradar en este punto sería cobrar el mes y cortarlo el día 3.
    if vigente_hasta:
        try:
            empresa.plan_vigente_hasta = parsear_vigente_hasta(vigente_hasta)
        except ValueError as exc:
            # La suscripción YA está cancelada en la pasarela — esto no
            # deshace eso. Pero nada de lo anterior se ha comprometido
            # todavía (el `commit` está más abajo), así que la empresa sigue
            # viéndose en la base como estaba antes de este endpoint: no
            # perder acceso por un bug de parseo nuestro es preferible a
            # degradarla en silencio, y un 502 explícito es preferible a un
            # 500 sin contexto. Queda para reconciliar a mano.
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"La pasarela devolvió una fecha de vigencia inválida: {exc}",
            ) from exc
    else:
        # La pasarela no informó fecha (pago único, o no la trae): no hay
        # periodo ya pagado que respetar.
        empresa.plan_tier = "basico"
    await db.commit()
    await db.refresh(empresa)

    return CancelacionResponse(
        plan_tier=empresa.plan_tier,
        subscription_status=empresa.subscription_status,
        vigente_hasta=vigente_hasta,
    )
