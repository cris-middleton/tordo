# Fase 5a — Billing con Stripe
**Complejidad**: 3 · **LLM recomendado**: Claude Sonnet 4.6  
**Semana**: 8 · **Duración estimada**: 5 días

---

## Contexto del Proyecto

**LicitaFácil** es un SaaS B2B para PYMES chilenas. Las Fases 1–4 implementaron el producto completo. Esta fase implementa la **monetización**: el sistema puede cobrar suscripciones y hacer cumplir los límites por plan.

Codebase en `saas_licitaciones/`. Ver `SPEC.md` para especificaciones completas.

**Estado al inicio de esta fase**:
- Todos los endpoints de producto funcionando
- Tabla `users` ya tiene columnas `plan_tier`, `stripe_customer_id`, `stripe_subscription_id`
- `require_plan()` dependency ya existe pero no se usa masivamente aún
- `stripe==7.0.0` ya instalado en `requirements.txt`

**Pre-requisito manual** (lo hace el dueño del proyecto, no la IA):
- Cuenta de Stripe creada en `dashboard.stripe.com`
- 4 productos creados: free (gratis), pyme (USD 25/mes), pro (USD 55/mes), contador (USD 95/mes)
- Price IDs copiados al `.env`
- `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` en `.env`

---

## Objetivo de esta Fase

Al finalizar:
1. El usuario puede suscribirse a un plan de pago
2. Stripe actualiza automáticamente el `plan_tier` en la DB vía webhook
3. Los endpoints hacen cumplir los límites por plan
4. El plan `free` tiene comportamiento de conversión (alertas bloqueadas visibles)

---

## Tareas

### 5.1 — BillingService

Crear `backend/app/services/billing_service.py`:

```python
import stripe
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.core.config import settings
import structlog

stripe.api_key = settings.STRIPE_SECRET_KEY
logger = structlog.get_logger()

PLAN_FROM_STRIPE_PRICE = {
    settings.STRIPE_PRICE_PYME:     "pyme",
    settings.STRIPE_PRICE_PRO:      "pro",
    settings.STRIPE_PRICE_CONTADOR: "contador",
}

class BillingService:

    async def create_checkout_session(
        self, db: AsyncSession, user_id: str, price_id: str, success_url: str, cancel_url: str
    ) -> str:
        """Crea una Stripe Checkout Session y retorna la URL de pago."""
        user = await db.get(User, user_id)
        if not user:
            raise ValueError("Usuario no encontrado")

        # Crear o recuperar customer en Stripe
        if not user.stripe_customer_id:
            customer = stripe.Customer.create(
                email=user.email,
                metadata={"user_id": str(user.id)}
            )
            user.stripe_customer_id = customer.id
            await db.commit()

        session = stripe.checkout.Session.create(
            customer=user.stripe_customer_id,
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"user_id": str(user.id)}
        )
        return session.url

    async def create_portal_session(
        self, db: AsyncSession, user_id: str, return_url: str
    ) -> str:
        """Crea Stripe Customer Portal para gestionar suscripción."""
        user = await db.get(User, user_id)
        if not user or not user.stripe_customer_id:
            raise ValueError("Usuario sin suscripción activa")

        session = stripe.billing_portal.Session.create(
            customer=user.stripe_customer_id,
            return_url=return_url
        )
        return session.url

    async def update_plan_tier(self, db: AsyncSession, subscription: dict):
        """Actualiza plan_tier en DB cuando Stripe confirma el pago."""
        customer_id = subscription.get("customer")
        price_id = subscription["items"]["data"][0]["price"]["id"]
        new_plan = PLAN_FROM_STRIPE_PRICE.get(price_id, "free")

        result = await db.execute(
            select(User).where(User.stripe_customer_id == customer_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            logger.error("stripe_user_not_found", customer_id=customer_id)
            return

        user.plan_tier = new_plan
        user.stripe_subscription_id = subscription.get("id")
        await db.commit()
        logger.info("plan_updated", user_id=str(user.id), plan=new_plan)

    async def downgrade_to_free(self, db: AsyncSession, subscription: dict):
        """Downgrade a free cuando cancela la suscripción."""
        customer_id = subscription.get("customer")
        result = await db.execute(
            select(User).where(User.stripe_customer_id == customer_id)
        )
        user = result.scalar_one_or_none()
        if user:
            user.plan_tier = "free"
            user.stripe_subscription_id = None
            await db.commit()
            logger.info("plan_downgraded_to_free", user_id=str(user.id))
```

### 5.2 — API de Billing

Crear `backend/app/api/billing.py`:

```python
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
import stripe
from app.core.config import settings
from app.services.billing_service import BillingService
from app.core.security import get_current_user
from app.core.database import get_db
import structlog

router = APIRouter()
logger = structlog.get_logger()

@router.post("/checkout")
async def create_checkout(
    body: CheckoutRequest,  # {price_id, success_url, cancel_url}
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    svc = BillingService()
    url = await svc.create_checkout_session(
        db, str(current_user.id),
        body.price_id, body.success_url, body.cancel_url
    )
    return {"checkout_url": url}

@router.post("/portal")
async def create_portal(
    body: PortalRequest,  # {return_url}
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    svc = BillingService()
    url = await svc.create_portal_session(
        db, str(current_user.id), body.return_url
    )
    return {"portal_url": url}

@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    CRÍTICO: Verificar firma ANTES de procesar.
    Sin esto, cualquier actor puede escalar el plan de un usuario a 'contador' gratis.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(400, "Missing stripe-signature header")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError as e:
        logger.warning("stripe_invalid_signature", error=str(e))
        raise HTTPException(400, "Invalid signature")
    except Exception as e:
        logger.error("stripe_webhook_parse_error", error=str(e))
        raise HTTPException(400, "Parse error")

    # Procesar solo después de verificar firma
    svc = BillingService()
    if event["type"] == "customer.subscription.updated":
        await svc.update_plan_tier(db, event["data"]["object"])
    elif event["type"] in ("customer.subscription.deleted", "customer.subscription.paused"):
        await svc.downgrade_to_free(db, event["data"]["object"])

    return {"received": True}
```

Registrar en `main.py`:
```python
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])
```

### 5.3 — Hacer cumplir límites de plan

Aplicar `require_plan()` en los endpoints correspondientes:

```python
# Documentos — requiere plan pyme o superior
@router.post("/upload-url")
async def get_upload_url(
    ...,
    user=Depends(require_plan('pyme'))  # free no puede subir documentos
):
    ...

# Checklist — requiere plan pyme o superior
@router.post("/postulaciones")
async def create_postulacion(
    ...,
    user=Depends(require_plan('pyme'))
):
    ...
```

Para el plan `free`, implementar el comportamiento de alertas bloqueadas en `AlertService`:

```python
async def create_alert_idempotent(self, ..., user_plan: str = "free"):
    # Verificar cuota de alertas para plan free
    if user_plan == "free":
        alert_count = await self._count_active_alerts(db, empresa_id)
        if alert_count >= 5:
            # Guardar pero marcar como bloqueada (punto de conversión)
            stmt = insert(Alert).values(
                ...,
                status='bloqueada_por_plan',
                idempotency_key=idempotency_key,
            ).on_conflict_do_nothing(index_elements=["idempotency_key"])
            await db.execute(stmt)
            return False  # No enviar notificación
```

### 5.4 — Frontend: Página de Precios

Crear `frontend/app/precios/page.tsx` con las cards de planes:

```tsx
const PLANES = [
  {
    nombre: "Básico",
    precio: "Gratis",
    descripcion: "Para probar",
    features: ["5 alertas/mes", "1 usuario", "Alertas básicas", "Calendario"],
    planId: "free",
    cta: "Empezar gratis",
  },
  {
    nombre: "PYME",
    precio: "USD 25/mes",
    descripcion: "Para PYMES con 1–10 licitaciones/mes",
    features: ["Alertas ilimitadas", "Checklist de anexos", "Monitor estado hábil",
               "Gestor de documentos", "1 empresa"],
    planId: "pyme",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PYME,
    cta: "Comenzar",
    destacado: true,
  },
  {
    nombre: "Pro",
    precio: "USD 55/mes",
    features: ["Todo PYME", "3 empresas", "Plantillas de anexos", "Soporte prioritario"],
    planId: "pro",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO,
    cta: "Comenzar",
  },
]
```

Al hacer clic en "Comenzar":
1. Llamar a `POST /api/billing/checkout` con el `price_id`
2. Redirigir al `checkout_url` de Stripe

### 5.5 — Frontend: Componente de Upgrade en Sidebar

En `frontend/components/Layout.tsx`, mostrar al final del sidebar:

```tsx
{user?.plan_tier === 'free' && (
  <UpgradeBanner
    message="Activa el checklist y el monitor de documentos"
    ctaText="Ver planes"
    ctaHref="/precios"
  />
)}
```

### 5.6 — Frontend: Banner de alertas bloqueadas en Dashboard

En el dashboard, si hay alertas con `status === 'bloqueada_por_plan'`:

```tsx
<AlertasBloqueadasBanner
  count={alertasBloqueadas}
  onUpgrade={() => router.push('/precios')}
/>
```

Texto: "Tienes X alerta(s) bloqueada(s). Actualiza tu plan para recibirlas."

### 5.7 — Webhook en desarrollo local

Para probar webhooks de Stripe en local, usar Stripe CLI:
```bash
stripe listen --forward-to localhost:8000/api/billing/webhook
```
> Esto lo ejecuta el desarrollador manualmente. No es código de la app.

---

## Criterios de Aceptación

- [ ] `POST /api/billing/checkout` retorna una URL de Stripe válida
- [ ] El flujo de checkout completo funciona en modo test: tarjeta `4242 4242 4242 4242`
- [ ] El webhook actualiza `plan_tier` en la DB al completar el pago
- [ ] El webhook falla con 400 si la firma es inválida (probar con payload modificado)
- [ ] Un usuario free recibe 403 al intentar subir un documento
- [ ] Un usuario free con 5 alertas ve el banner de "alertas bloqueadas" en el dashboard
- [ ] La página de precios muestra las 3 opciones de plan correctamente

---

## Patrones obligatorios

1. **Verificación de firma en webhook**: `stripe.Webhook.construct_event()` SIEMPRE antes de procesar. Sin excepción.
2. **No confiar en datos del body del webhook**: El `plan_tier` se deriva del `price_id`, no de campos del body que podrían ser manipulados.
3. **Idempotencia del webhook**: Stripe puede enviar el mismo evento más de una vez. El `update_plan_tier()` debe ser idempotente (upsert, no crash si ya está actualizado).

---

## NO implementes en esta fase

- Transbank Webpay (Fase 5b — post-MVP)
- Google OAuth (Fase 6)
- WhatsApp (Fase 6)
