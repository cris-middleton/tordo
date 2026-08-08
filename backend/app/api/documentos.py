"""Document management API."""

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import EmpresaContext, empresa_ctx, require_rol
from app.api.empresas import _get_empresa_or_404
from app.config import settings
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.empresa import DocumentoEmpresa
from app.models.user import User
from app.repositories import documentos as repo
from app.schemas.documento import DocumentoDownloadResponse, DocumentoOut
from app.services.storage_service import get_storage_service, make_document_key

router = APIRouter(tags=["documentos"])

MAX_UPLOAD_BYTES = 26_214_400  # 25 MB


@router.post(
    "/empresas/{empresa_id}/documentos",
    response_model=DocumentoOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_documento(
    file: UploadFile = File(...),
    tipo_documento: str = Form(...),
    nombre: str = Form(None),
    fecha_emision: str = Form(None),
    fecha_vencimiento: str = Form(None),
    ctx: EmpresaContext = Depends(require_rol("owner", "admin")),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    empresa_id = ctx.empresa_id
    await _get_empresa_or_404(empresa_id, db)

    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El archivo supera el límite de 25 MB",
        )

    from app.core.plan_limits import enforce_doc_quota

    existing_docs = await repo.listar_de_empresa(db, empresa_id)
    enforce_doc_quota(current_user, existing_docs, len(file_bytes))

    display_name = nombre or file.filename or "sin_nombre"
    key = make_document_key(str(empresa_id), file.filename or display_name)
    storage = get_storage_service()
    stored = storage.upload(file_bytes, key, file.content_type)

    from datetime import date as _date

    def _parse_date(s):
        if not s:
            return None
        try:
            return _date.fromisoformat(s)
        except ValueError:
            return None

    doc = DocumentoEmpresa(
        empresa_id=empresa_id,
        nombre=display_name,
        tipo_documento=tipo_documento,
        s3_key=stored.key,
        s3_bucket=stored.bucket,
        mime_type=file.content_type,
        tamano_bytes=stored.size_bytes,
        fecha_emision=_parse_date(fecha_emision),
        fecha_vencimiento=_parse_date(fecha_vencimiento),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/empresas/{empresa_id}/documentos", response_model=list[DocumentoOut])
async def listar_documentos(
    ctx: EmpresaContext = Depends(empresa_ctx),
    db: AsyncSession = Depends(get_db),
):
    empresa_id = ctx.empresa_id
    await _get_empresa_or_404(empresa_id, db)
    return await repo.listar_de_empresa(db, empresa_id)


@router.get(
    "/empresas/{empresa_id}/documentos/{doc_id}/download",
    response_model=DocumentoDownloadResponse,
)
async def download_documento(
    doc_id: UUID,
    ctx: EmpresaContext = Depends(empresa_ctx),
    db: AsyncSession = Depends(get_db),
):
    empresa_id = ctx.empresa_id
    await _get_empresa_or_404(empresa_id, db)

    doc = await repo.obtener_vigente(db, doc_id, empresa_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")

    storage = get_storage_service()
    return DocumentoDownloadResponse(
        url=storage.get_download_url(doc.s3_key), nombre=doc.nombre, mime_type=doc.mime_type
    )


@router.delete("/empresas/{empresa_id}/documentos/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_documento(
    doc_id: UUID,
    ctx: EmpresaContext = Depends(require_rol("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    empresa_id = ctx.empresa_id
    await _get_empresa_or_404(empresa_id, db)

    # Incluye los ya eliminados: borrar dos veces no debería dar 404.
    doc = await repo.obtener_incluso_eliminado(db, doc_id, empresa_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")

    doc.eliminado = True
    await db.commit()


file_router = APIRouter(tags=["files"])


@file_router.get("/files/{key:path}")
async def serve_local_file(key: str, current_user: User = Depends(get_current_active_user)):
    if settings.storage_backend != "local":
        raise HTTPException(status_code=404, detail="Local file server not available")
    file_path = Path(settings.local_storage_path) / key
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    try:
        file_path.resolve().relative_to(Path(settings.local_storage_path).resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return FileResponse(str(file_path))
