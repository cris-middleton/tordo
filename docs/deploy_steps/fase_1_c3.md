# Fase 1 — Modelo de Empresa y Monitor de Estado Hábil
**Complejidad**: 3 · **LLM recomendado**: Claude Sonnet 4.6  
**Semana**: 2–3 · **Duración estimada**: 10 días

---

## Contexto del Proyecto

**LicitaFácil** es un SaaS B2B para PYMES chilenas. Su feature principal es el **monitor de estado hábil**: detectar automáticamente si una empresa pierde su habilitación para participar en licitaciones y alertar al usuario antes de que intente postular.

El codebase está en:
```
saas_licitaciones/
├── backend/   → FastAPI + SQLAlchemy 2.0 (async) + Celery + Redis
├── frontend/  → Next.js 14 + TypeScript + Tailwind CSS
├── etl/       → Python ETL
└── SPEC.md    → Especificaciones técnicas completas (léelo)
```

**La Fase 0 ya está completada**: dependencias instaladas, MinIO corriendo, Celery con timezone `America/Santiago`, tabla `task_failures` creada, `asyncpg` configurado.

---

## Objetivo de esta Fase

Al finalizar esta fase, el usuario puede:
1. Registrar su empresa (RUT + nombre)
2. Ver automáticamente su estado hábil en el dashboard
3. Recibir una alerta si el estado cambia

El estado hábil se obtiene descargando el CSV de `datos-abiertos.chilecompra.cl/proveedores/habiles` (no hay API REST pública para esto).

---

## Tareas

### 1.1 — Migración Alembic

> **⚠️ Bug preexistente a resolver en esta migración (Bug #1 — ver SPEC.md Sección 0.3)**:
> La tabla `alerts` tiene la columna llamada `metadata` en SQL pero el modelo
> SQLAlchemy la llama `alert_metadata`. Esta migración **debe** incluir el rename
> antes de agregar las columnas nuevas de alertas. Sin esto, los metadatos de
> todas las alertas se pierden silenciosamente.

Crear `backend/alembic/versions/0005_fase1_empresa_estado_habil.py` con:

**Tabla `empresas_usuario`**:
```sql
CREATE TABLE empresas_usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rut_empresa VARCHAR(12) NOT NULL,
    nombre_empresa VARCHAR(255) NOT NULL,
    razon_social VARCHAR(255),
    rubros_cpv TEXT[],
    regiones TEXT[],
    email_contacto VARCHAR(255),
    telefono VARCHAR(20),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    estado_habil VARCHAR(20) NOT NULL DEFAULT 'desconocido'
        CHECK (estado_habil IN ('habil', 'inhabil', 'no_encontrado', 'desconocido')),
    estado_habil_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, rut_empresa)
);
CREATE INDEX idx_empresas_rut ON empresas_usuario(rut_empresa);
CREATE INDEX idx_empresas_user ON empresas_usuario(user_id);
CREATE INDEX idx_empresas_activo ON empresas_usuario(activo) WHERE activo = TRUE;
```

**Tabla `estado_habil_log`**:
```sql
CREATE TABLE estado_habil_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas_usuario(id) ON DELETE CASCADE,
    rut_empresa VARCHAR(12) NOT NULL,
    estado_anterior VARCHAR(20),
    estado_nuevo VARCHAR(20) NOT NULL,
    fuente VARCHAR(50) DEFAULT 'csv_datos_abiertos',
    raw_response JSONB,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_estado_habil_empresa ON estado_habil_log(empresa_id, checked_at DESC);
CREATE INDEX idx_estado_habil_rut ON estado_habil_log(rut_empresa, checked_at DESC);
```

**Fix Bug #1 + columnas nuevas en `alerts`**:
```sql
-- PRIMERO: corregir nombre de columna inconsistente (Bug #1 — SPEC.md Sección 0.3)
-- La columna existe como 'metadata' en SQL pero el modelo ORM la llama 'alert_metadata'
ALTER TABLE alerts RENAME COLUMN metadata TO alert_metadata;

-- LUEGO: agregar columnas nuevas para YUCA
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas_usuario(id);
ALTER TABLE alerts
  ADD CONSTRAINT alerts_idempotency_key_unique UNIQUE (idempotency_key);
```

**Columnas nuevas en `users`**:
```sql
ALTER TABLE users
  ADD COLUMN plan_tier VARCHAR(20) NOT NULL DEFAULT 'free'
      CHECK (plan_tier IN ('free', 'pyme', 'pro', 'contador', 'gremio')),
  ADD COLUMN stripe_customer_id VARCHAR(255),
  ADD COLUMN stripe_subscription_id VARCHAR(255),
  ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN onboarding_step SMALLINT NOT NULL DEFAULT 0;
```

### 1.2 — Modelos SQLAlchemy

Crear `backend/app/models/empresa.py`:
```python
from sqlalchemy import Column, String, Boolean, ForeignKey, ARRAY, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB, TIMESTAMPTZ
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid

class EmpresaUsuario(Base):
    __tablename__ = "empresas_usuario"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rut_empresa = Column(String(12), nullable=False)
    nombre_empresa = Column(String(255), nullable=False)
    razon_social = Column(String(255))
    rubros_cpv = Column(ARRAY(Text))
    regiones = Column(ARRAY(Text))
    email_contacto = Column(String(255))
    telefono = Column(String(20))
    activo = Column(Boolean, nullable=False, default=True)
    estado_habil = Column(String(20), nullable=False, default='desconocido')
    estado_habil_updated_at = Column(TIMESTAMPTZ)
    created_at = Column(TIMESTAMPTZ, server_default="NOW()")
    updated_at = Column(TIMESTAMPTZ, server_default="NOW()")
    estado_habil_logs = relationship("EstadoHabilLog", back_populates="empresa")

class EstadoHabilLog(Base):
    __tablename__ = "estado_habil_log"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    empresa_id = Column(UUID(as_uuid=True), ForeignKey("empresas_usuario.id", ondelete="CASCADE"), nullable=False)
    rut_empresa = Column(String(12), nullable=False)
    estado_anterior = Column(String(20))
    estado_nuevo = Column(String(20), nullable=False)
    fuente = Column(String(50), default='csv_datos_abiertos')
    raw_response = Column(JSONB)
    checked_at = Column(TIMESTAMPTZ, server_default="NOW()")
    empresa = relationship("EmpresaUsuario", back_populates="estado_habil_logs")
```

Actualizar `backend/app/models/user.py` para agregar las columnas nuevas (`plan_tier`, `stripe_customer_id`, `stripe_subscription_id`, `onboarding_completed`, `onboarding_step`).

### 1.3 — Utilidad de validación de RUT

Crear `backend/app/utils/rut_validator.py`:
```python
def validar_rut(rut: str) -> bool:
    """Valida RUT chileno con dígito verificador."""
    rut_limpio = rut.upper().replace(".", "").replace("-", "").strip()
    if len(rut_limpio) < 2 or not rut_limpio[:-1].isdigit():
        return False
    body, dv = rut_limpio[:-1], rut_limpio[-1]
    total, factor = 0, 2
    for digit in reversed(body):
        total += int(digit) * factor
        factor = factor % 7 + 2
    remainder = 11 - (total % 11)
    expected = {10: 'K', 11: '0'}.get(remainder, str(remainder))
    return dv == expected

def normalizar_rut(rut: str) -> str:
    """Normaliza a formato 12345678-9."""
    rut_limpio = rut.upper().replace(".", "").replace("-", "").strip()
    if len(rut_limpio) < 2:
        raise ValueError(f"RUT inválido: {rut}")
    return rut_limpio[:-1] + "-" + rut_limpio[-1]
```

### 1.4 — Schemas Pydantic

Crear `backend/app/schemas/empresa.py`:
```python
from pydantic import BaseModel, field_validator
from typing import Optional, List
from uuid import UUID
from app.utils.rut_validator import validar_rut, normalizar_rut

class EmpresaCreate(BaseModel):
    rut_empresa: str
    nombre_empresa: str
    razon_social: Optional[str] = None
    rubros_cpv: Optional[List[str]] = []
    regiones: Optional[List[str]] = []
    email_contacto: Optional[str] = None
    telefono: Optional[str] = None

    @field_validator('rut_empresa')
    @classmethod
    def validate_rut(cls, v):
        if not validar_rut(v):
            raise ValueError(f'RUT inválido: {v}')
        return normalizar_rut(v)

class EmpresaResponse(BaseModel):
    id: UUID
    user_id: UUID
    rut_empresa: str
    nombre_empresa: str
    razon_social: Optional[str]
    rubros_cpv: Optional[List[str]]
    regiones: Optional[List[str]]
    estado_habil: str
    estado_habil_updated_at: Optional[str]
    activo: bool

    model_config = {"from_attributes": True}

class EstadoHabilHistoryItem(BaseModel):
    estado_anterior: Optional[str]
    estado_nuevo: str
    fuente: str
    checked_at: str

    model_config = {"from_attributes": True}
```

### 1.5 — AlertService con idempotencia

Crear `backend/app/services/alert_service.py`:
```python
import hashlib
from datetime import date, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert
import structlog
from app.models.alert import Alert  # Usar el modelo existente

logger = structlog.get_logger()

class AlertService:

    async def create_alert_idempotent(
        self,
        db: AsyncSession,
        empresa_id: str,
        alert_type: str,
        context_date: date,
        metadata: dict = None,
        user_id: str = None
    ) -> bool:
        """
        Crea una alerta solo si no existe una con el mismo contexto.
        Retorna True si fue creada, False si ya existía (duplicado).
        """
        key_content = f"{empresa_id}:{alert_type}:{context_date.isoformat()}"
        idempotency_key = hashlib.sha256(key_content.encode()).hexdigest()

        stmt = insert(Alert).values(
            empresa_id=empresa_id,
            alert_type=alert_type,
            idempotency_key=idempotency_key,
            status='unread',
            created_at=datetime.utcnow()
        ).on_conflict_do_nothing(index_elements=["idempotency_key"])

        result = await db.execute(stmt)
        created = result.rowcount > 0

        if created:
            logger.info("alert_created", empresa_id=empresa_id,
                       alert_type=alert_type, date=context_date.isoformat())
        else:
            logger.debug("alert_skipped_duplicate", empresa_id=empresa_id,
                        alert_type=alert_type)
        return created
```

### 1.6 — Extractor de Estado Hábil (ETL) — SIMPLIFICADO

> **Actualización v3.1**: No existe CSV masivo. Usar solo el endpoint per-RUT.

Crear `etl/extractors/estado_habil_extractor.py` con el código simplificado de la SPEC.md sección 7.2. Puntos clave:
- Consulta el endpoint per-RUT para cada empresa: `GET https://datos-abiertos.chilecompra.cl/organismos-proveedores/{rut}`
- Retorna: `"habil"`, `"inhabil"` o `"no_encontrado"`
- Usa `tenacity` para retry con backoff: `@retry(stop=stop_after_attempt(2), wait=wait_exponential(min=5, max=30))`
- Normaliza RUTs al formato `12345678-9` (sin puntos, con guión)
- Si la consulta falla, lanza excepción para que Celery la reintente (no asume que está inhábil sin confirmar)

### 1.7 — API de Empresas

Crear `backend/app/api/empresas.py` con:
- `POST /api/empresas` — Crear empresa (validar RUT, verificar que user no tenga ya esa empresa)
- `GET /api/empresas/me` — Obtener empresa del usuario autenticado + estado hábil
- `PUT /api/empresas/me` — Actualizar datos de empresa (rubros, regiones, etc.)
- `GET /api/empresas/me/estado-habil/history` — Últimos 30 registros de `estado_habil_log`

Registrar en `backend/app/main.py`:
```python
from app.api import empresas
app.include_router(empresas.router, prefix="/api/empresas", tags=["empresas"])
```

Agregar rate limiting al endpoint de estado hábil:
```python
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

@router.get("/me/estado-habil/history")
@limiter.limit("10/minute")
async def get_estado_habil_history(request: Request, ...):
    ...
```

### 1.8 — Celery Task: check_estado_habil_all_users

Crear `backend/app/tasks/estado_habil_tasks.py`.

**PATRÓN CRÍTICO — leer con atención**:
Las Celery tasks son funciones `def` (síncronas). Si tu lógica usa `await`, debes envolver con `asyncio.run()`. Usar `await` directamente en un `def` task falla silenciosamente.

```python
import asyncio
from celery import shared_task
import structlog
import time

logger = structlog.get_logger()

@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=300,
    acks_late=True,
)
def check_estado_habil_all_users(self):
    """Task sync que envuelve lógica async."""
    try:
        asyncio.run(_check_estado_habil_async())
    except Exception as exc:
        logger.error("check_estado_habil_failed", error=str(exc))
        raise self.retry(exc=exc)

async def _check_estado_habil_async():
    """
    1. Para cada empresa activa: consultar endpoint per-RUT
    2. Si estado cambió: crear alerta idempotente + actualizar registro
    3. Registrar timestamp en Redis para watchdog
    """
    from etl.extractors.estado_habil_extractor import EstadoHabilExtractor
    from app.services.alert_service import AlertService
    from app.models.empresa import EmpresaUsuario
    from app.core.database import AsyncSessionLocal
    from app.models.empresa import EstadoHabilLog
    from sqlalchemy import select, or_
    from datetime import datetime, timedelta, date

    log = logger.bind(task="check_estado_habil")
    extractor = EstadoHabilExtractor()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(EmpresaUsuario).where(
                EmpresaUsuario.activo == True,
                or_(
                    EmpresaUsuario.estado_habil_updated_at <
                        datetime.utcnow() - timedelta(hours=5),
                    EmpresaUsuario.estado_habil_updated_at.is_(None)
                )
            ).limit(1000)
        )
        empresas = result.scalars().all()
        log.info("empresas_a_revisar", total=len(empresas))

        alert_service = AlertService()
        procesadas = 0
        for empresa in empresas:
            try:
                # Consultar endpoint per-RUT (SIMPLIFICADO v3.1)
                nuevo_estado = await extractor.check_rut(empresa.rut_empresa)
            except Exception as e:
                log.warning("estado_habil_check_failed", rut=empresa.rut_empresa, error=str(e))
                continue  # Reintentar en el próximo ciclo de Celery

            # Registrar en log y crear alerta si cambió
            if nuevo_estado != empresa.estado_habil:
                # Registrar cambio en historial
                log_entry = EstadoHabilLog(
                    empresa_id=empresa.id,
                    rut_empresa=empresa.rut_empresa,
                    estado_anterior=empresa.estado_habil,
                    estado_nuevo=nuevo_estado,
                    fuente="api_per_rut"
                )
                db.add(log_entry)

                # Crear alerta idempotente
                await alert_service.create_alert_idempotent(
                    db=db,
                    empresa_id=str(empresa.id),
                    alert_type="estado_habil_cambio",
                    context_date=date.today(),
                    metadata={"estado_anterior": empresa.estado_habil,
                              "estado_nuevo": nuevo_estado}
                )
                empresa.estado_habil = nuevo_estado
                empresa.estado_habil_updated_at = datetime.utcnow()
                log.info("estado_cambio_detectado", rut=empresa.rut_empresa,
                        antes=empresa.estado_habil, ahora=nuevo_estado)
                procesadas += 1

        await db.commit()
        log.info("check_completado", procesadas=procesadas)
    
    # Registrar para watchdog
    from app.core.cache import redis_client
    redis_client.set("last_run:check_estado_habil", time.time(), ex=86400)
    log.info("completado", procesadas=len(empresas))
```

Agregar al `beat_schedule` en `celery_app.py`:
```python
"check-estado-habil": {
    "task": "app.tasks.estado_habil_tasks.check_estado_habil_all_users",
    "schedule": crontab(minute=0, hour="*/6"),
},
```

### 1.9 — Frontend: Widget EstadoHabilBadge

Crear `frontend/components/EstadoHabilBadge.tsx`:
```tsx
interface Props {
  estado: 'habil' | 'inhabil' | 'no_encontrado' | 'desconocido'
  updatedAt?: string
}

export function EstadoHabilBadge({ estado, updatedAt }: Props) {
  const config = {
    habil:        { label: 'Hábil', color: 'bg-green-100 text-green-800 border-green-300' },
    inhabil:      { label: 'Inhábil', color: 'bg-red-100 text-red-800 border-red-300' },
    no_encontrado:{ label: 'No encontrado', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    desconocido:  { label: 'No verificado', color: 'bg-gray-100 text-gray-600 border-gray-300' },
  }
  const { label, color } = config[estado] ?? config.desconocido
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${color}`}>
      <span className={`w-2 h-2 rounded-full ${estado === 'habil' ? 'bg-green-500' : estado === 'inhabil' ? 'bg-red-500' : 'bg-gray-400'}`} />
      {label}
      {updatedAt && <span className="text-xs opacity-60">· {updatedAt}</span>}
    </div>
  )
}
```

Incorporar el badge en `frontend/app/dashboard/page.tsx` como la primera card visible, consultando `GET /api/empresas/me`.

### 1.10 — Frontend: Onboarding Paso 1 (básico)

Crear `frontend/app/onboarding/page.tsx` con un formulario mínimo:
1. Input de RUT empresa con validación client-side (formato chileno)
2. Al submit: `POST /api/empresas` con el RUT
3. Mostrar el resultado del estado hábil recibido de la API
4. Si el usuario ya tiene empresa, redirigir a `/dashboard`

Agregar en el layout de dashboard: si `user.onboarding_completed === false`, mostrar banner con link a `/onboarding`.

---

## Criterios de Aceptación

- [ ] `alembic upgrade head` aplica sin errores las nuevas tablas
- [ ] `POST /api/empresas` con RUT válido crea la empresa
- [ ] `POST /api/empresas` con RUT inválido retorna 422 con mensaje descriptivo
- [ ] `GET /api/empresas/me` retorna la empresa con `estado_habil`
- [ ] La Celery task `check_estado_habil_all_users` corre sin `RuntimeError: no running event loop`
- [ ] Verificar en Flower (`http://localhost:5555`) que la task aparece en el schedule
- [ ] El widget `<EstadoHabilBadge>` muestra el color correcto según el estado
- [ ] Si el estado hábil cambia (simularlo cambiando manualmente en DB), se crea una alerta con `idempotency_key`
- [ ] Ejecutar la task dos veces: solo se crea 1 alerta (idempotencia funciona)

---

## Patrones obligatorios de esta fase

1. **Celery async**: Siempre `asyncio.run(_async_fn())` en el body del task. Nunca `await` dentro de `def task`.
2. **Idempotencia**: Toda alerta creada desde una task Celery debe usar `AlertService.create_alert_idempotent()`.
3. **RUT**: Todo RUT que entra al sistema se normaliza con `normalizar_rut()` antes de guardarse.
4. **Logging**: Usar `structlog.get_logger()` y nunca loggear el RUT en texto plano (usar empresa_id).

---

## NO implementes en esta fase

- Upload de documentos (Fase 2)
- Checklist (Fase 3)
- Billing/Stripe (Fase 5a)
- Google OAuth (Fase 6)
- Dashboard completo (Fase 4) — solo el widget de estado hábil en el dashboard existente
