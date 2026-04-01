# Fase 6 — Google OAuth y Notificaciones WhatsApp
**Complejidad**: 2 · **LLM recomendado**: Haiku 4.5 o similar  
**Semana**: 9 · **Duración estimada**: 4 días

---

## Contexto del Proyecto

**LicitaFácil** es un SaaS B2B para PYMES chilenas. Las Fases 1–5a implementaron el producto completo con monetización. Esta fase agrega dos integraciones externas:
1. **Google OAuth**: Login simplificado sin contraseña
2. **WhatsApp Business API (WABA)**: Canal de alertas de alta apertura para estado hábil y plazos críticos

Codebase en `saas_licitaciones/`. Ver `SPEC.md` para especificaciones completas.

**Pre-requisitos (lo hace el dueño del proyecto)**:
- Google Cloud Console: OAuth 2.0 credentials creadas. `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env`
- Si WABA fue aprobada (iniciado en Fase 0): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_WHATSAPP_FROM` en `.env`
- Si WABA NO está aprobada aún: implementar solo Google OAuth. WhatsApp se activa cuando llegue la aprobación.

---

## Objetivo de esta Fase

Al finalizar:
1. El usuario puede registrarse e iniciar sesión con Google (sin contraseña)
2. Las alertas críticas (estado hábil y plazos) se envían también por WhatsApp
3. Si WhatsApp falla, el sistema degrada silenciosamente a email

---

## Tareas

### 6.1 — Google OAuth (Backend)

**Instalar dependencias** (`authlib==1.3.0` ya está en requirements.txt):

Crear `backend/app/api/auth_oauth.py`:

```python
from authlib.integrations.starlette_client import OAuth
from starlette.requests import Request
from starlette.responses import RedirectResponse
from fastapi import APIRouter
from app.core.config import settings
from app.services.user_service import get_or_create_google_user
from app.core.security import create_access_token

router = APIRouter()

oauth = OAuth()
oauth.register(
    name='google',
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'},
)

@router.get("/auth/google")
async def google_login(request: Request):
    """Redirige al usuario a la pantalla de login de Google."""
    redirect_uri = str(request.url_for('google_callback'))
    return await oauth.google.authorize_redirect(request, redirect_uri)

@router.get("/auth/google/callback")
async def google_callback(request: Request, db=Depends(get_db)):
    """
    Google redirige aquí tras la autenticación.
    Crea el usuario si no existe o lo obtiene si ya existe.
    """
    token = await oauth.google.authorize_access_token(request)
    user_info = token.get('userinfo')
    if not user_info:
        raise HTTPException(400, "No se pudo obtener información del usuario de Google")

    user = await get_or_create_google_user(
        db=db,
        email=user_info['email'],
        nombre=user_info.get('name', ''),
        google_id=user_info['sub']
    )

    # Crear JWT y redirigir al frontend con el token
    access_token = create_access_token(data={"sub": str(user.id)})
    
    # Redirigir al frontend con el token como query param
    # El frontend lo lee y lo guarda en localStorage
    frontend_url = f"{settings.FRONTEND_URL}/auth/callback?token={access_token}"
    return RedirectResponse(url=frontend_url)
```

Crear `backend/app/services/user_service.py` (o agregar función al existente):
```python
async def get_or_create_google_user(
    db: AsyncSession, email: str, nombre: str, google_id: str
) -> User:
    """
    Obtiene el usuario por email o lo crea si no existe.
    Compatible con usuarios que ya se registraron con email/password.
    """
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if not user:
        user = User(
            email=email,
            username=email.split('@')[0],
            hashed_password="",  # Sin contraseña para usuarios OAuth
            google_id=google_id,  # Agregar columna si no existe
            is_active=True,
            plan_tier='free',
            onboarding_completed=False
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    
    return user
```

> **NOTA**: Si la tabla `users` no tiene columna `google_id`, crear migración:
> ```sql
> ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
> ```

Registrar en `main.py`:
```python
from app.api import auth_oauth
app.include_router(auth_oauth.router, tags=["auth"])
```

Agregar `SESSION_SECRET_KEY` a config y al middleware de Starlette (requerido por authlib):
```python
# main.py
from starlette.middleware.sessions import SessionMiddleware
app.add_middleware(SessionMiddleware, secret_key=settings.SESSION_SECRET_KEY)
```

### 6.2 — Google OAuth (Frontend)

Crear `frontend/app/auth/callback/page.tsx`:
```tsx
'use client'
import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function AuthCallback() {
  const params = useSearchParams()
  const router = useRouter()
  const { loginWithToken } = useAuth()

  useEffect(() => {
    const token = params.get('token')
    if (token) {
      loginWithToken(token)  // Guardar en localStorage y actualizar contexto
      router.push('/dashboard')
    } else {
      router.push('/login?error=oauth_failed')
    }
  }, [params])

  return <div>Iniciando sesión...</div>
}
```

Agregar a `AuthContext.tsx`:
```tsx
const loginWithToken = (token: string) => {
  localStorage.setItem('access_token', token)
  // Llamar a GET /api/auth/me para obtener datos del usuario
  fetchCurrentUser(token)
}
```

En `frontend/app/login/page.tsx`, agregar botón de Google:
```tsx
<a
  href={`${process.env.NEXT_PUBLIC_API_URL}/auth/google`}
  className="flex items-center gap-2 border rounded px-4 py-2 hover:bg-gray-50"
>
  <GoogleIcon />
  Continuar con Google
</a>
```

### 6.3 — Servicio de WhatsApp

Crear `backend/app/services/notification_service.py`:

```python
from twilio.rest import Client as TwilioClient
from twilio.base.exceptions import TwilioRestException
from app.core.config import settings
from app.core.email import send_email  # el servicio de email existente
import structlog

logger = structlog.get_logger()

ALERT_TYPE_MESSAGES = {
    "estado_habil_cambio": {
        "inhabil": "⚠️ *LicitaFácil*: Tu empresa cambió a estado INHÁBIL en el Registro de Proveedores. No podrás postular a licitaciones hasta regularizar.",
        "habil":   "✅ *LicitaFácil*: Tu empresa recuperó el estado HÁBIL. Ya puedes postular a licitaciones.",
    },
    "plazo_cierre_48h":    "⏰ *LicitaFácil*: La licitación '{nombre}' cierra en 48 horas. ¡No olvides enviar tu postulación!",
    "plazo_cierre_24h":    "🚨 *LicitaFácil*: URGENTE — La licitación '{nombre}' cierra MAÑANA. ¡Última oportunidad!",
    "documento_por_vencer":"📄 *LicitaFácil*: Tu documento '{nombre}' vence en 30 días. Renuévalo antes de postular.",
    "documento_vencido":   "❌ *LicitaFácil*: Tu documento '{nombre}' está VENCIDO. Actualízalo para participar en licitaciones.",
}

class NotificationService:

    def __init__(self):
        if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN:
            self.twilio = TwilioClient(
                settings.TWILIO_ACCOUNT_SID,
                settings.TWILIO_AUTH_TOKEN
            )
        else:
            self.twilio = None

    async def send_alert(
        self,
        alert_type: str,
        metadata: dict,
        email: str,
        whatsapp_number: str = None,
    ) -> dict:
        """
        Envía alerta por WhatsApp si está disponible, con fallback a email.
        Retorna dict con canales usados y resultado.
        """
        message_template = ALERT_TYPE_MESSAGES.get(alert_type, "")
        
        # Formatear mensaje
        if isinstance(message_template, dict):
            nuevo_estado = metadata.get("estado_nuevo", "")
            message = message_template.get(nuevo_estado, message_template.get("inhabil", ""))
        else:
            message = message_template.format(**metadata)

        results = {}

        # Intentar WhatsApp
        if self.twilio and whatsapp_number:
            try:
                self.twilio.messages.create(
                    body=message,
                    from_=settings.TWILIO_WHATSAPP_FROM,
                    to=f"whatsapp:{whatsapp_number}"
                )
                results["whatsapp"] = "sent"
                logger.info("whatsapp_sent", alert_type=alert_type)
            except TwilioRestException as e:
                logger.warning("whatsapp_failed_fallback_email",
                              error=str(e), alert_type=alert_type)
                results["whatsapp"] = f"failed: {e.code}"
                # Continuar con email como fallback

        # Siempre enviar email (o como fallback de WhatsApp)
        try:
            await send_email(
                to=email,
                subject=f"LicitaFácil — {self._get_subject(alert_type)}",
                body=message.replace("*", "")  # Email sin markdown
            )
            results["email"] = "sent"
        except Exception as e:
            logger.error("email_failed", error=str(e), alert_type=alert_type)
            results["email"] = f"failed: {str(e)}"

        return results

    def _get_subject(self, alert_type: str) -> str:
        subjects = {
            "estado_habil_cambio":   "Cambio en tu Estado Hábil",
            "plazo_cierre_48h":      "Licitación cierra en 48 horas",
            "plazo_cierre_24h":      "URGENTE: Licitación cierra mañana",
            "documento_por_vencer":  "Documento por vencer",
            "documento_vencido":     "Documento vencido",
        }
        return subjects.get(alert_type, "Notificación")
```

### 6.4 — Integrar NotificationService en AlertService

Actualizar `backend/app/services/alert_service.py` para enviar notificaciones después de crear alertas:

```python
from app.services.notification_service import NotificationService

class AlertService:
    
    async def create_alert_idempotent(self, ..., send_notification: bool = True) -> bool:
        # ... código existente de crear alerta idempotente ...
        
        created = result.rowcount > 0
        
        if created and send_notification:
            # Obtener datos del usuario para notificar
            # (email y whatsapp si lo configuró)
            notif_svc = NotificationService()
            await notif_svc.send_alert(
                alert_type=alert_type,
                metadata=metadata or {},
                email=user_email,
                whatsapp_number=user_whatsapp,
            )
        
        return created
```

### 6.5 — Campo whatsapp_number en usuario

Si el usuario configuró su número de WhatsApp en el onboarding (Paso 4):

Agregar migración:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20);
```

Agregar al schema de user update y al formulario de configuración.

### 6.6 — Página de configuración: Notificaciones

En `frontend/app/dashboard/configuracion/page.tsx`, agregar sección de notificaciones:
- Toggle "Alertas por email" (siempre activo por defecto)
- Input "Número de WhatsApp" con indicador de estado WABA
- Si WABA no está activo: mensaje informativo "WhatsApp en camino"

---

## Criterios de Aceptación

### Google OAuth:
- [ ] El botón "Continuar con Google" en `/login` redirige a la pantalla de Google
- [ ] Después de autenticarse con Google, el usuario llega a `/dashboard` autenticado
- [ ] Un usuario que se registró con email/password puede también hacer login con Google (mismo email)
- [ ] Usuarios nuevos de OAuth tienen `onboarding_completed: false` y van al onboarding

### WhatsApp (si WABA aprobada):
- [ ] Una alerta de `estado_habil_cambio` llega por WhatsApp Y por email
- [ ] Si el número de WhatsApp no existe/falla, la alerta llega solo por email (no hay error en el sistema)
- [ ] El log muestra `whatsapp_failed_fallback_email` cuando WhatsApp falla

### Sin WABA aún:
- [ ] El sistema funciona completamente solo con email
- [ ] No hay errores si `TWILIO_ACCOUNT_SID` está vacío en `.env`

---

## Patrones obligatorios

1. **Fallback de notificaciones**: WhatsApp falla → email. Email falla → log en DB. Nunca propagar excepción de notificación al caller.
2. **OAuth no rompe email/password**: Un usuario con email/password puede seguir usando ese login. OAuth es adicional.
3. **Sin bloquear la task Celery**: Las notificaciones deben ser async y no bloquear el procesamiento del batch de empresas.

---

## NO implementes en esta fase

- Transbank Webpay (Fase 5b — post-MVP)
- PWA / Push notifications (v3)
- Multi-empresa para plan Contador (v2 feature)
