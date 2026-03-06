# Fase 3 — Checklist de Postulaciones
**Complejidad**: 3 · **LLM recomendado**: Claude Sonnet 4.6  
**Semana**: 5–6 · **Duración estimada**: 10 días

---

## Contexto del Proyecto

**LicitaFácil** es un SaaS B2B para PYMES chilenas. Las Fases 1 y 2 ya implementaron el modelo de empresa, estado hábil y el gestor de documentos.

Esta fase implementa el **core de negocio**: el usuario puede marcar una licitación para seguimiento, y el sistema genera automáticamente un checklist de documentos requeridos según el tipo de licitación (L1, LE, LP, etc.).

Codebase en `saas_licitaciones/`. Ver `SPEC.md` para especificaciones completas.

**Estado al inicio de esta fase**:
- `empresas_usuario`, `documentos_empresa` funcionando
- `AlertService.create_alert_idempotent()` implementado
- `DocumentService` implementado
- La tabla `licitaciones` ya tiene datos del ETL de Mercado Público

---

## Objetivo de esta Fase

Al finalizar, el usuario puede:
1. Ver la lista de licitaciones relevantes para su empresa (filtradas por sus rubros/región)
2. Marcar una licitación como "en seguimiento"
3. Ver el checklist de documentos requeridos auto-generado según el tipo de licitación
4. Marcar ítems del checklist como completados y adjuntar documentos de su repositorio
5. Recibir alertas de plazo 48h y 24h antes del cierre

---

## Tareas

### 3.1 — Migración Alembic

Crear `backend/alembic/versions/0007_fase3_checklist.py` con tres tablas:

**Tabla `postulaciones`**:
```sql
CREATE TABLE postulaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas_usuario(id) ON DELETE CASCADE,
    licitacion_id UUID NOT NULL REFERENCES licitaciones(id),
    estado VARCHAR(30) NOT NULL DEFAULT 'en_seguimiento'
        CHECK (estado IN (
            'en_seguimiento', 'en_preparacion', 'enviada',
            'adjudicada', 'no_adjudicada', 'descartada'
        )),
    notas TEXT,
    recordatorio_activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(empresa_id, licitacion_id)
);
CREATE INDEX idx_postulaciones_empresa ON postulaciones(empresa_id);
CREATE INDEX idx_postulaciones_activas ON postulaciones(empresa_id, estado)
    WHERE estado IN ('en_seguimiento', 'en_preparacion');
```

**Tabla `checklist_postulacion`**:
```sql
CREATE TABLE checklist_postulacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    postulacion_id UUID NOT NULL REFERENCES postulaciones(id) ON DELETE CASCADE,
    descripcion VARCHAR(500) NOT NULL,
    es_obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
    completado BOOLEAN NOT NULL DEFAULT FALSE,
    completado_at TIMESTAMPTZ,
    completado_by UUID REFERENCES users(id),
    documento_id UUID REFERENCES documentos_empresa(id),
    orden SMALLINT NOT NULL DEFAULT 0,
    notas TEXT
);
CREATE INDEX idx_checklist_postulacion ON checklist_postulacion(postulacion_id);
```

**Tabla `plantillas_checklist`**:
```sql
CREATE TABLE plantillas_checklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_licitacion VARCHAR(10) NOT NULL
        CHECK (tipo_licitacion IN (
            'L1','LE','LP','LQ','LR','LS','E2','CO','B2','H2','I2','GENERICO'
        )),
    nombre_item VARCHAR(500) NOT NULL,
    descripcion TEXT,
    es_obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
    orden SMALLINT NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    aplica_si_monto_mayor NUMERIC(15,2),
    aplica_si_unspsc TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_plantillas_tipo ON plantillas_checklist(tipo_licitacion, activo)
    WHERE activo = TRUE;
```

También actualizar la tabla `licitaciones` con campos faltantes de la API:
```sql
ALTER TABLE licitaciones
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(10),
  ADD COLUMN IF NOT EXISTS codigo_estado INTEGER,
  ADD COLUMN IF NOT EXISTS categorias_unspsc TEXT[],
  ADD COLUMN IF NOT EXISTS organismo_codigo VARCHAR(100),
  ADD COLUMN IF NOT EXISTS organismo_nombre VARCHAR(510),
  ADD COLUMN IF NOT EXISTS region VARCHAR(510),
  ADD COLUMN IF NOT EXISTS moneda VARCHAR(10) DEFAULT 'CLP';
CREATE INDEX IF NOT EXISTS idx_licitaciones_tipo ON licitaciones(tipo);
CREATE INDEX IF NOT EXISTS idx_licitaciones_region ON licitaciones(region);
CREATE INDEX IF NOT EXISTS idx_licitaciones_categorias ON licitaciones USING gin(categorias_unspsc);
```

### 3.2 — Seed de plantillas_checklist

Crear `backend/app/scripts/seed_plantillas.py` con los ítems de checklist para cada tipo de licitación. Los ítems base requeridos en toda licitación chilena incluyen:

```python
PLANTILLAS_BASE = [
    # L1 — Menor a 100 UTM (los más comunes para PYMES pequeñas)
    {"tipo_licitacion": "L1", "nombre_item": "Declaración jurada de no conflicto de interés", "es_obligatorio": True, "orden": 1},
    {"tipo_licitacion": "L1", "nombre_item": "Registro en ChileProveedores activo (estado hábil)", "es_obligatorio": True, "orden": 2},
    {"tipo_licitacion": "L1", "nombre_item": "Anexo técnico según bases", "es_obligatorio": True, "orden": 3},
    {"tipo_licitacion": "L1", "nombre_item": "Oferta económica firmada", "es_obligatorio": True, "orden": 4},

    # LE — 100 a 1.000 UTM
    {"tipo_licitacion": "LE", "nombre_item": "Declaración jurada de no conflicto de interés", "es_obligatorio": True, "orden": 1},
    {"tipo_licitacion": "LE", "nombre_item": "Registro en ChileProveedores activo (estado hábil)", "es_obligatorio": True, "orden": 2},
    {"tipo_licitacion": "LE", "nombre_item": "Certificado de deuda tributaria al día (SII)", "es_obligatorio": True, "orden": 3},
    {"tipo_licitacion": "LE", "nombre_item": "Certificado de deuda laboral al día (DT)", "es_obligatorio": True, "orden": 4},
    {"tipo_licitacion": "LE", "nombre_item": "Patente comercial vigente", "es_obligatorio": True, "orden": 5},
    {"tipo_licitacion": "LE", "nombre_item": "Anexo técnico según bases", "es_obligatorio": True, "orden": 6},
    {"tipo_licitacion": "LE", "nombre_item": "Oferta económica firmada", "es_obligatorio": True, "orden": 7},

    # LP — 1.000 a 2.000 UTM (agregar garantías y experiencia)
    # ... completar con input del analista de licitaciones

    # GENERICO — aplica a todos los tipos
    {"tipo_licitacion": "GENERICO", "nombre_item": "Revisar plazo de cierre en bases", "es_obligatorio": True, "orden": 0},
    {"tipo_licitacion": "GENERICO", "nombre_item": "Confirmar formato de entrega (portal/físico/email)", "es_obligatorio": True, "orden": 1},
]
```

> **NOTA PARA EL DESARROLLADOR**: Los ítems exactos deben ser revisados con el analista de licitaciones del equipo antes de ir a producción. Los listados aquí son aproximaciones. Crear el script como upsert para que pueda ejecutarse repetidamente.

### 3.3 — Modelos SQLAlchemy

Crear `backend/app/models/postulacion.py`:
```python
class Postulacion(Base):
    __tablename__ = "postulaciones"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    empresa_id = Column(UUID(as_uuid=True), ForeignKey("empresas_usuario.id", ondelete="CASCADE"), nullable=False)
    licitacion_id = Column(UUID(as_uuid=True), ForeignKey("licitaciones.id"), nullable=False)
    estado = Column(String(30), nullable=False, default='en_seguimiento')
    notas = Column(Text)
    recordatorio_activo = Column(Boolean, default=True)
    created_at = Column(TIMESTAMPTZ, server_default="NOW()")
    updated_at = Column(TIMESTAMPTZ, server_default="NOW()")
    checklist_items = relationship("ChecklistPostulacion", back_populates="postulacion", cascade="all, delete-orphan")

class ChecklistPostulacion(Base):
    __tablename__ = "checklist_postulacion"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    postulacion_id = Column(UUID(as_uuid=True), ForeignKey("postulaciones.id", ondelete="CASCADE"), nullable=False)
    descripcion = Column(String(500), nullable=False)
    es_obligatorio = Column(Boolean, nullable=False, default=True)
    completado = Column(Boolean, nullable=False, default=False)
    completado_at = Column(TIMESTAMPTZ)
    completado_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    documento_id = Column(UUID(as_uuid=True), ForeignKey("documentos_empresa.id"))
    orden = Column(SmallInteger, nullable=False, default=0)
    notas = Column(Text)
    postulacion = relationship("Postulacion", back_populates="checklist_items")
```

### 3.4 — ChecklistService

Crear `backend/app/services/checklist_service.py`:

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.postulacion import PlantillaChecklist, ChecklistPostulacion

class ChecklistService:

    async def generate_from_template(
        self,
        db: AsyncSession,
        postulacion_id: str,
        tipo_licitacion: str,
        monto_estimado: float = None,
        categorias_unspsc: list = None
    ) -> list[ChecklistPostulacion]:
        """
        Genera los ítems del checklist para una postulación
        basándose en la plantilla del tipo de licitación.
        
        Lógica:
        1. Obtener plantillas para el tipo específico + GENERICO
        2. Filtrar por condiciones (monto, UNSPSC si aplica)
        3. Crear ChecklistPostulacion para cada ítem
        """
        # Obtener plantillas del tipo + GENERICO
        result = await db.execute(
            select(PlantillaChecklist).where(
                PlantillaChecklist.tipo_licitacion.in_([tipo_licitacion, 'GENERICO']),
                PlantillaChecklist.activo == True
            ).order_by(PlantillaChecklist.orden)
        )
        plantillas = result.scalars().all()

        items = []
        for plantilla in plantillas:
            # Evaluar condición de monto
            if (plantilla.aplica_si_monto_mayor and monto_estimado and
                    monto_estimado < plantilla.aplica_si_monto_mayor):
                continue

            # Evaluar condición de categoría UNSPSC
            if (plantilla.aplica_si_unspsc and categorias_unspsc):
                tiene_match = any(
                    cat in categorias_unspsc for cat in plantilla.aplica_si_unspsc
                )
                if not tiene_match:
                    continue

            item = ChecklistPostulacion(
                postulacion_id=postulacion_id,
                descripcion=plantilla.nombre_item,
                es_obligatorio=plantilla.es_obligatorio,
                orden=plantilla.orden,
                notas=plantilla.descripcion
            )
            items.append(item)

        db.add_all(items)
        return items

    def calculate_completion_percentage(self, items: list) -> int:
        """Calcula % de ítems obligatorios completados."""
        obligatorios = [i for i in items if i.es_obligatorio]
        if not obligatorios:
            return 100
        completados = sum(1 for i in obligatorios if i.completado)
        return round((completados / len(obligatorios)) * 100)
```

### 3.5 — API de Postulaciones

Crear `backend/app/api/postulaciones.py`:

```python
@router.post("/", response_model=PostulacionResponse)
async def create_postulacion(
    body: PostulacionCreate,  # {licitacion_id, notas}
    db: AsyncSession = Depends(get_db),
    empresa=Depends(get_empresa_activa),
):
    """
    Crea la postulación y auto-genera el checklist desde la plantilla
    basada en el tipo de licitación (campo `tipo` de la tabla licitaciones).
    """
    # Verificar que la licitación existe
    licitacion = await db.get(Licitacion, body.licitacion_id)
    if not licitacion:
        raise HTTPException(404, "Licitación no encontrada")

    postulacion = Postulacion(
        empresa_id=empresa.id,
        licitacion_id=body.licitacion_id,
        notas=body.notas
    )
    db.add(postulacion)
    await db.flush()  # Para obtener el ID antes del commit

    # Auto-generar checklist
    checklist_svc = ChecklistService()
    await checklist_svc.generate_from_template(
        db=db,
        postulacion_id=str(postulacion.id),
        tipo_licitacion=licitacion.tipo or 'GENERICO',
        monto_estimado=float(licitacion.monto_estimado) if licitacion.monto_estimado else None,
        categorias_unspsc=licitacion.categorias_unspsc or []
    )
    await db.commit()
    await db.refresh(postulacion)
    return postulacion

@router.get("/", response_model=List[PostulacionConProgreso])
async def list_postulaciones(
    db: AsyncSession = Depends(get_db),
    empresa=Depends(get_empresa_activa),
):
    """Lista postulaciones activas con % completado del checklist."""
    ...

@router.patch("/{postulacion_id}/estado")
async def update_estado(postulacion_id: UUID, body: EstadoUpdate, ...):
    ...

@router.get("/{postulacion_id}/checklist", response_model=List[ChecklistItemResponse])
async def get_checklist(postulacion_id: UUID, ...):
    ...

@router.patch("/{postulacion_id}/checklist/{item_id}")
async def update_checklist_item(
    postulacion_id: UUID,
    item_id: UUID,
    body: ChecklistItemUpdate,  # {completado, documento_id, notas}
    ...
):
    """Marcar ítem como completado. Opcionalmente adjuntar documento del repositorio."""
    ...
```

Registrar en `main.py`:
```python
app.include_router(postulaciones.router, prefix="/api/postulaciones", tags=["postulaciones"])
```

### 3.6 — Celery Task: send_deadline_reminders

Agregar a `backend/app/tasks/postulacion_tasks.py`:

```python
@celery_app.task(bind=True, max_retries=3, acks_late=True)
def send_deadline_reminders(self):
    """Corre a las 09:00 AM Santiago. Alerta 48h y 24h antes del cierre."""
    try:
        asyncio.run(_send_deadline_reminders_async())
    except Exception as exc:
        raise self.retry(exc=exc)

async def _send_deadline_reminders_async():
    from datetime import date, timedelta
    from sqlalchemy import select, and_
    from sqlalchemy.orm import joinedload

    hoy = date.today()
    en_2_dias = hoy + timedelta(days=2)
    en_1_dia = hoy + timedelta(days=1)

    async with AsyncSessionLocal() as db:
        # Postulaciones activas — cargar licitación relacionada
        result = await db.execute(
            select(Postulacion)
            .options(joinedload(Postulacion.licitacion))  # ajustar relationship
            .where(
                Postulacion.recordatorio_activo == True,
                Postulacion.estado.in_(['en_seguimiento', 'en_preparacion'])
            )
        )
        postulaciones = result.scalars().all()

        alert_svc = AlertService()
        for post in postulaciones:
            if not post.licitacion or not post.licitacion.fecha_cierre:
                continue

            fecha_cierre = post.licitacion.fecha_cierre.date()
            dias_restantes = (fecha_cierre - hoy).days

            if dias_restantes == 2:
                await alert_svc.create_alert_idempotent(
                    db=db,
                    empresa_id=str(post.empresa_id),
                    alert_type="plazo_cierre_48h",
                    context_date=hoy,
                    metadata={"postulacion_id": str(post.id),
                              "licitacion_nombre": post.licitacion.titulo,
                              "fecha_cierre": str(fecha_cierre)}
                )
            elif dias_restantes == 1:
                await alert_svc.create_alert_idempotent(
                    db=db,
                    empresa_id=str(post.empresa_id),
                    alert_type="plazo_cierre_24h",
                    context_date=hoy,
                    metadata={"postulacion_id": str(post.id),
                              "licitacion_nombre": post.licitacion.titulo}
                )
        await db.commit()
```

Agregar al `beat_schedule`:
```python
"send-deadline-reminders": {
    "task": "app.tasks.postulacion_tasks.send_deadline_reminders",
    "schedule": crontab(hour=9, minute=0),  # 09:00 AM Santiago
},
```

### 3.7 — Frontend: Badge en lista de licitaciones

En `frontend/app/dashboard/tenders/page.tsx`:
- Agregar botón "Seguir licitación" en cada fila de la tabla
- Si la licitación ya está en postulaciones, mostrar badge "En seguimiento" con % del checklist

### 3.8 — Frontend: Detalle de licitación con checklist

En `frontend/app/dashboard/tenders/[codigo]/page.tsx`:
- Agregar sección "Mi Postulación" si está en seguimiento
- Mostrar lista de checklist con checkboxes interactivos
- Progress bar con % de ítems obligatorios completados
- Para cada ítem: opción de adjuntar documento del repositorio (selector del `GET /api/documentos`)
- Botón "Agregar a mis postulaciones" si no está en seguimiento aún

---

## Criterios de Aceptación

- [ ] `alembic upgrade head` aplica las 3 nuevas tablas sin errores
- [ ] El seed de plantillas se ejecuta sin errores: `python -m app.scripts.seed_plantillas`
- [ ] `POST /api/postulaciones` con una licitación de tipo `LE` genera automáticamente el checklist con los ítems correctos
- [ ] `PATCH /api/postulaciones/{id}/checklist/{item_id}` con `completado: true` actualiza el estado
- [ ] `GET /api/postulaciones` retorna el % de completado calculado correctamente
- [ ] La task `send_deadline_reminders` crea alertas `plazo_cierre_48h` para postulaciones que cierran mañana
- [ ] Las alertas son idempotentes: ejecutar la task dos veces no duplica alertas
- [ ] El badge de seguimiento aparece en la lista de licitaciones
- [ ] El checklist es visible e interactivo en el detalle de licitación

---

## Patrones obligatorios

1. **Auto-generación de checklist**: Al crear la postulación, siempre llamar a `ChecklistService.generate_from_template()` en la misma transacción.
2. **Celery async**: `asyncio.run(_async_fn())` en tasks. Nunca `await` en `def task`.
3. **Idempotencia**: Alertas de plazo con `create_alert_idempotent()` usando la fecha del día como `context_date`.
4. **Tipo de licitación**: Usar el campo `tipo` de la tabla `licitaciones` (L1, LE, LP, etc.), que viene de la API de Mercado Público.

---

## NO implementes en esta fase

- Dashboard rediseñado (Fase 4)
- Billing (Fase 5a)
- Notificación por WhatsApp (Fase 6)
