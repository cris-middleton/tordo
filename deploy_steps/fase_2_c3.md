# Fase 2 — Gestor de Documentos
**Complejidad**: 3 · **LLM recomendado**: Claude Sonnet 4.6  
**Semana**: 3–4 · **Duración estimada**: 8 días

---

## Contexto del Proyecto

**LicitaFácil** es un SaaS B2B para PYMES chilenas. La Fase 1 ya implementó el modelo de empresa y el monitor de estado hábil. Esta fase implementa el **repositorio de documentos**: los usuarios pueden subir documentos empresariales (patente, certificados) con fecha de vencimiento, y el sistema alerta cuando están por vencer.

Codebase en `saas_licitaciones/`. Ver `SPEC.md` para especificaciones completas.

**Estado al inicio de esta fase**:
- Tablas `empresas_usuario`, `estado_habil_log` creadas y funcionando
- `AlertService.create_alert_idempotent()` implementado
- MinIO corriendo en `http://localhost:9000`
- Variable `S3_ENDPOINT_URL=http://localhost:9000` en `.env`
- `boto3` ya instalado en `backend/requirements.txt`

---

## Objetivo de esta Fase

Al finalizar, el usuario puede:
1. Subir documentos (PDFs, imágenes) a su repositorio de empresa
2. Ver qué documentos están vigentes, por vencer o vencidos
3. Recibir alertas automáticas 30 días antes de que un documento venza

**Patrón de upload**: El backend **nunca recibe el archivo**. Genera una URL firmada (presigned URL) y el browser sube directamente a S3/MinIO. Esto reduce la superficie de ataque y no satura el servidor.

---

## Tareas

### 2.1 — Migración Alembic

Crear `backend/alembic/versions/0006_fase2_documentos.py` con la tabla `documentos_empresa`:

```sql
CREATE TABLE documentos_empresa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas_usuario(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    tipo_documento VARCHAR(50) NOT NULL
        CHECK (tipo_documento IN (
            'patente_comercial', 'cert_deuda_tributaria', 'cert_deuda_laboral',
            'declaracion_jurada', 'cert_experiencia', 'cert_vigencia_sociedad',
            'balance', 'otro'
        )),
    s3_key VARCHAR(500) NOT NULL,
    s3_bucket VARCHAR(100) NOT NULL,
    mime_type VARCHAR(100)
        CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
    tamano_bytes BIGINT CHECK (tamano_bytes <= 26214400),
    fecha_emision DATE,
    fecha_vencimiento DATE,
    esta_vigente BOOLEAN GENERATED ALWAYS AS (
        fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE
    ) STORED,
    eliminado BOOLEAN NOT NULL DEFAULT FALSE,
    eliminado_at TIMESTAMPTZ,
    notas TEXT,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_docs_empresa ON documentos_empresa(empresa_id) WHERE eliminado = FALSE;
CREATE INDEX idx_docs_vencimiento ON documentos_empresa(fecha_vencimiento)
    WHERE fecha_vencimiento IS NOT NULL AND eliminado = FALSE;
```

También agregar los nuevos tipos de alerta a la constraint de `alerts.alert_type`:
```sql
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_alert_type_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_alert_type_check
  CHECK (alert_type IN (
      'new_tender', 'tender_update', 'tender_closed',
      'estado_habil_cambio',
      'plazo_cierre_48h', 'plazo_cierre_24h',
      'documento_por_vencer', 'documento_vencido'
  ));
```

### 2.2 — Modelo SQLAlchemy

Crear `backend/app/models/documento.py`:
```python
from sqlalchemy import Column, String, Boolean, ForeignKey, BigInteger, Date, Text
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMPTZ
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid

class DocumentoEmpresa(Base):
    __tablename__ = "documentos_empresa"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    empresa_id = Column(UUID(as_uuid=True), ForeignKey("empresas_usuario.id", ondelete="CASCADE"), nullable=False)
    nombre = Column(String(255), nullable=False)
    tipo_documento = Column(String(50), nullable=False)
    s3_key = Column(String(500), nullable=False)
    s3_bucket = Column(String(100), nullable=False)
    mime_type = Column(String(100))
    tamano_bytes = Column(BigInteger)
    fecha_emision = Column(Date)
    fecha_vencimiento = Column(Date)
    # esta_vigente es columna GENERATED, no mapear como Column editable
    eliminado = Column(Boolean, nullable=False, default=False)
    eliminado_at = Column(TIMESTAMPTZ)
    notas = Column(Text)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(TIMESTAMPTZ, server_default="NOW()")
    updated_at = Column(TIMESTAMPTZ, server_default="NOW()")
```

### 2.3 — Schemas Pydantic

Crear `backend/app/schemas/documento.py`:
```python
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import date

class DocumentoUploadRequest(BaseModel):
    nombre: str
    tipo_documento: str
    mime_type: str
    tamano_bytes: int
    fecha_emision: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    notas: Optional[str] = None

class DocumentoCreateMetadata(DocumentoUploadRequest):
    """Enviado por el cliente después de completar el upload a S3."""
    s3_key: str
    s3_bucket: str

class DocumentoResponse(BaseModel):
    id: UUID
    empresa_id: UUID
    nombre: str
    tipo_documento: str
    mime_type: Optional[str]
    tamano_bytes: Optional[int]
    fecha_emision: Optional[date]
    fecha_vencimiento: Optional[date]
    esta_vigente: bool
    notas: Optional[str]
    created_at: str

    model_config = {"from_attributes": True}

class PresignedUrlResponse(BaseModel):
    upload_url: str
    s3_key: str
    expires_in: int = 300
```

### 2.4 — DocumentService

Crear `backend/app/services/document_service.py`:

```python
import hashlib
from uuid import uuid4
from pathlib import PurePosixPath
import boto3
from botocore.config import Config
from fastapi import HTTPException
from app.core.config import settings

ALLOWED_MIME_TYPES = {
    "application/pdf", "image/jpeg", "image/png", "image/webp"
}
MAX_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB


def _get_s3_client():
    kwargs = {
        "aws_access_key_id": settings.AWS_ACCESS_KEY_ID,
        "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY,
        "region_name": settings.AWS_REGION,
        "config": Config(signature_version='s3v4'),
    }
    if settings.S3_ENDPOINT_URL:
        # MinIO en desarrollo local
        kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
    return boto3.client("s3", **kwargs)


class DocumentService:

    def generate_upload_url(
        self, empresa_id: str, filename: str, content_type: str, size_bytes: int
    ) -> dict:
        """
        Genera presigned URL para upload directo desde browser.
        El backend NUNCA recibe el archivo.
        """
        if content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(400, f"Tipo de archivo no permitido: {content_type}")
        if size_bytes > MAX_SIZE_BYTES:
            raise HTTPException(400, f"Archivo demasiado grande. Máximo 25 MB.")

        safe_filename = hashlib.sha256(filename.encode()).hexdigest()[:16]
        s3_key = f"empresas/{empresa_id}/docs/{uuid4()}/{safe_filename}"

        s3 = _get_s3_client()
        url = s3.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': settings.S3_BUCKET,
                'Key': s3_key,
                'ContentType': content_type,
                'ServerSideEncryption': 'AES256',
            },
            ExpiresIn=300  # 5 minutos
        )
        return {"upload_url": url, "s3_key": s3_key, "expires_in": 300}

    def generate_download_url(self, s3_key: str, empresa_id: str) -> str:
        """URL firmada temporal para descarga. Valida ownership."""
        self._validate_s3_key_ownership(s3_key, empresa_id)
        s3 = _get_s3_client()
        return s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': settings.S3_BUCKET, 'Key': s3_key},
            ExpiresIn=3600
        )

    def _validate_s3_key_ownership(self, s3_key: str, empresa_id: str) -> None:
        """
        Validación explícita de ownership.
        NUNCA usar assert (desactivable con python -O).
        """
        expected_prefix = f"empresas/{empresa_id}/"
        normalized = str(PurePosixPath(s3_key))
        if not normalized.startswith(expected_prefix):
            raise HTTPException(
                status_code=403,
                detail="Acceso denegado: el recurso no pertenece a esta empresa"
            )

    def soft_delete(self, s3_key: str) -> None:
        """
        No elimina físicamente. S3 lifecycle policy borra a los 30 días.
        En producción: agregar tag 'soft-deleted: true' al objeto en S3.
        """
        # Solo marcar en DB (el caller hace el update en DB)
        # Opcionalmente: taggear el objeto S3 para lifecycle
        pass
```

### 2.5 — API de Documentos

Crear `backend/app/api/documentos.py`:

```python
@router.post("/upload-url", response_model=PresignedUrlResponse)
@limiter.limit("20/minute")
async def get_upload_url(
    body: DocumentoUploadRequest,
    request: Request,
    empresa=Depends(get_empresa_activa),  # dependency que obtiene empresa del user
):
    """Genera presigned URL para upload directo a S3."""
    svc = DocumentService()
    return svc.generate_upload_url(
        empresa_id=str(empresa.id),
        filename=body.nombre,
        content_type=body.mime_type,
        size_bytes=body.tamano_bytes
    )

@router.post("/", response_model=DocumentoResponse)
async def register_document(
    body: DocumentoCreateMetadata,
    db: AsyncSession = Depends(get_db),
    empresa=Depends(get_empresa_activa),
    current_user=Depends(get_current_user),
):
    """Registra metadata del documento después de que el cliente completó el upload."""
    doc = DocumentoEmpresa(
        empresa_id=empresa.id,
        uploaded_by=current_user.id,
        **body.model_dump()
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc

@router.get("/", response_model=List[DocumentoResponse])
async def list_documents(
    tipo: Optional[str] = None,
    vigentes_only: bool = False,
    db: AsyncSession = Depends(get_db),
    empresa=Depends(get_empresa_activa),
):
    """Lista documentos activos de la empresa."""
    ...

@router.get("/{doc_id}/download-url")
async def get_download_url(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
    empresa=Depends(get_empresa_activa),
):
    """Genera URL temporal de descarga."""
    doc = await db.get(DocumentoEmpresa, doc_id)
    if not doc or doc.empresa_id != empresa.id or doc.eliminado:
        raise HTTPException(404)
    svc = DocumentService()
    url = svc.generate_download_url(doc.s3_key, str(empresa.id))
    return {"download_url": url, "expires_in": 3600}

@router.delete("/{doc_id}")
async def delete_document(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
    empresa=Depends(get_empresa_activa),
):
    """Soft delete — no elimina de S3 inmediatamente."""
    doc = await db.get(DocumentoEmpresa, doc_id)
    if not doc or doc.empresa_id != empresa.id:
        raise HTTPException(404)
    doc.eliminado = True
    doc.eliminado_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}
```

Crear la dependency `get_empresa_activa` que obtiene la empresa del usuario autenticado o lanza 404.

Registrar en `main.py`:
```python
app.include_router(documentos.router, prefix="/api/documentos", tags=["documentos"])
```

### 2.6 — Celery Task: check_document_expiry

Agregar a `backend/app/tasks/documento_tasks.py`:

```python
@celery_app.task(bind=True, max_retries=3, acks_late=True)
def check_document_expiry(self):
    """Corre a las 09:30 AM Santiago. Alerta por documentos por vencer/vencidos."""
    try:
        asyncio.run(_check_document_expiry_async())
    except Exception as exc:
        raise self.retry(exc=exc)

async def _check_document_expiry_async():
    from datetime import date, timedelta
    from sqlalchemy import select, and_
    
    hoy = date.today()
    en_30_dias = hoy + timedelta(days=30)
    
    async with AsyncSessionLocal() as db:
        # Documentos por vencer en los próximos 30 días
        result = await db.execute(
            select(DocumentoEmpresa).where(
                and_(
                    DocumentoEmpresa.eliminado == False,
                    DocumentoEmpresa.fecha_vencimiento.isnot(None),
                    DocumentoEmpresa.fecha_vencimiento >= hoy,
                    DocumentoEmpresa.fecha_vencimiento <= en_30_dias,
                )
            )
        )
        por_vencer = result.scalars().all()

        # Documentos ya vencidos
        result2 = await db.execute(
            select(DocumentoEmpresa).where(
                and_(
                    DocumentoEmpresa.eliminado == False,
                    DocumentoEmpresa.fecha_vencimiento.isnot(None),
                    DocumentoEmpresa.fecha_vencimiento < hoy,
                )
            )
        )
        vencidos = result2.scalars().all()

        alert_svc = AlertService()
        for doc in por_vencer:
            await alert_svc.create_alert_idempotent(
                db=db,
                empresa_id=str(doc.empresa_id),
                alert_type="documento_por_vencer",
                context_date=hoy,
                metadata={"documento_id": str(doc.id), "nombre": doc.nombre,
                          "fecha_vencimiento": str(doc.fecha_vencimiento)}
            )
        for doc in vencidos:
            await alert_svc.create_alert_idempotent(
                db=db,
                empresa_id=str(doc.empresa_id),
                alert_type="documento_vencido",
                context_date=hoy,
                metadata={"documento_id": str(doc.id), "nombre": doc.nombre}
            )
        await db.commit()
```

Agregar al `beat_schedule` en `celery_app.py`:
```python
"check-document-expiry": {
    "task": "app.tasks.documento_tasks.check_document_expiry",
    "schedule": crontab(hour=9, minute=30),  # 09:30 AM Santiago
},
```

### 2.7 — Frontend: Página de Documentos

Crear `frontend/app/dashboard/documentos/page.tsx`:

**Flujo de upload** (implementar con `react-dropzone`):
1. Usuario arrastra/selecciona archivo
2. Frontend llama a `POST /api/documentos/upload-url` con nombre, tipo MIME, tamaño
3. Recibe `{ upload_url, s3_key }`
4. Frontend hace `PUT upload_url` con el archivo directamente (sin pasar por el backend)
5. Si el PUT fue exitoso (status 200), frontend llama a `POST /api/documentos` con la metadata + `s3_key`
6. El documento aparece en la lista

```tsx
// Ejemplo de flujo de upload
const handleUpload = async (file: File, tipoDoc: string, fechaVencimiento?: Date) => {
  // 1. Obtener presigned URL
  const { upload_url, s3_key } = await api.post('/documentos/upload-url', {
    nombre: file.name,
    tipo_documento: tipoDoc,
    mime_type: file.type,
    tamano_bytes: file.size,
    fecha_vencimiento: fechaVencimiento?.toISOString().split('T')[0],
  })

  // 2. Upload directo a S3/MinIO
  await fetch(upload_url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })

  // 3. Registrar metadata en backend
  await api.post('/documentos', {
    nombre: file.name,
    tipo_documento: tipoDoc,
    mime_type: file.type,
    tamano_bytes: file.size,
    s3_key,
    s3_bucket: process.env.NEXT_PUBLIC_S3_BUCKET,
    fecha_vencimiento: fechaVencimiento?.toISOString().split('T')[0],
  })
}
```

**Badges de vigencia** en la lista de documentos:
- Verde: vigente (fecha_vencimiento en el futuro o null)
- Amarillo: por vencer (vence en ≤ 30 días)
- Rojo: vencido

Agregar el link a Documentos en `frontend/components/Layout.tsx` (sidebar).

### 2.8 — Cuotas por plan (middleware)

Antes de generar el presigned URL, verificar que el usuario no supere su cuota:

```python
# backend/app/services/quota_service.py

PLAN_QUOTAS = {
    "free":     {"max_docs": 5,    "max_size_bytes": 5 * 1024 * 1024,   "total_storage": 25 * 1024 * 1024},
    "pyme":     {"max_docs": 50,   "max_size_bytes": 25 * 1024 * 1024,  "total_storage": 500 * 1024 * 1024},
    "pro":      {"max_docs": 200,  "max_size_bytes": 25 * 1024 * 1024,  "total_storage": 2 * 1024 * 1024 * 1024},
    "contador": {"max_docs": 1000, "max_size_bytes": 25 * 1024 * 1024,  "total_storage": 10 * 1024 * 1024 * 1024},
}

async def check_upload_quota(db: AsyncSession, empresa_id: str, plan_tier: str, new_size: int):
    """Lanza HTTPException 403 si el plan no permite el upload."""
    quotas = PLAN_QUOTAS.get(plan_tier, PLAN_QUOTAS["free"])
    
    # Contar documentos actuales
    result = await db.execute(
        select(func.count()).where(
            DocumentoEmpresa.empresa_id == empresa_id,
            DocumentoEmpresa.eliminado == False
        )
    )
    doc_count = result.scalar()
    if doc_count >= quotas["max_docs"]:
        raise HTTPException(403, f"Límite de {quotas['max_docs']} documentos alcanzado para plan {plan_tier}")
    if new_size > quotas["max_size_bytes"]:
        raise HTTPException(403, "Archivo supera el tamaño máximo para tu plan")
```

---

## Criterios de Aceptación

- [ ] `alembic upgrade head` aplica la tabla `documentos_empresa` sin errores
- [ ] `POST /api/documentos/upload-url` retorna una URL que funciona para hacer PUT al MinIO local
- [ ] El archivo aparece en MinIO (`http://localhost:9001`) después del upload
- [ ] `POST /api/documentos` registra la metadata en la DB
- [ ] `GET /api/documentos` lista los documentos con `esta_vigente` correcto
- [ ] `DELETE /api/documentos/{id}` hace soft delete (no elimina de MinIO)
- [ ] Un usuario del plan `free` que ya tiene 5 documentos recibe 403 al intentar subir el 6to
- [ ] La task `check_document_expiry` corre sin error y crea alertas idempotentes

---

## Patrones obligatorios de esta fase

1. **Presigned URL**: El backend nunca recibe bytes de archivos. Genera URL y el cliente hace el PUT directamente.
2. **Ownership validation**: `_validate_s3_key_ownership()` con `HTTPException`, nunca `assert`.
3. **Soft delete**: Los documentos se marcan como `eliminado=True`. No se borran de S3 inmediatamente.
4. **Idempotencia**: Alertas de vencimiento con `create_alert_idempotent()`.
5. **Celery async**: `asyncio.run(_async_fn())` en tasks.

---

## NO implementes en esta fase

- Checklist (Fase 3)
- Adjuntar documento a item de checklist (Fase 3)
- Billing (Fase 5a)
