"""Unit tests for dashboard_home_service composers."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.empresa import Empresa, EmpresaUsuario
from app.models.licitacion import Licitacion
from app.models.postulacion import ChecklistPostulacion, Postulacion
from app.models.user import User
from app.services.dashboard_home_service import compose_urgencias


@pytest.mark.asyncio
async def test_compose_urgencias_includes_postulacion_closing_in_36h(
    async_db: AsyncSession,
    sample_user: User,
    sample_empresa: Empresa,
):
    """A postulación whose licitación closes in <48h must produce a red urgencia."""
    now = datetime.now(timezone.utc)
    cierre = now + timedelta(hours=36, minutes=30)

    licitacion = Licitacion(
        codigo_externo="LIC-TEST-001",
        nombre="Servicios de aseo Municipalidad de Ñuñoa",
        fecha_publicacion=now - timedelta(days=5),
        fecha_cierre=cierre,
        estado="Publicada",
        codigo_organismo="ORG-001",
        nombre_organismo="Municipalidad de Ñuñoa",
        activo=True,
    )
    async_db.add(licitacion)
    await async_db.flush()

    postulacion = Postulacion(
        empresa_id=sample_empresa.id,
        licitacion_id=licitacion.id,
        estado="en_preparacion",
    )
    async_db.add(postulacion)
    await async_db.commit()

    items = await compose_urgencias(async_db, sample_user.id, sample_empresa.id)

    assert any(
        u.tipo == "postulacion_cierre" and u.severidad == "rojo" and "36h" in u.tiempo_label
        for u in items
    )


@pytest.mark.asyncio
async def test_compose_urgencias_includes_documento_vence_orange(
    async_db, sample_user, sample_empresa,
):
    from datetime import date as _date
    from app.models.empresa import DocumentoEmpresa
    doc = DocumentoEmpresa(
        empresa_id=sample_empresa.id,
        nombre="Certificado de antecedentes",
        tipo_documento="certificado",
        s3_key="x",
        s3_bucket="b",
        fecha_vencimiento=_date.today() + timedelta(days=20),
    )
    async_db.add(doc)
    await async_db.commit()
    items = await compose_urgencias(async_db, sample_user.id, sample_empresa.id)
    assert any(
        u.tipo == "documento_vence" and u.severidad == "naranja" for u in items
    )


@pytest.mark.asyncio
async def test_compose_urgencias_includes_estado_inhabil(
    async_db, sample_user, sample_empresa,
):
    sample_empresa.estado_habil = "inhabil"
    sample_empresa.estado_habil_updated_at = datetime.now(timezone.utc) - timedelta(days=4)
    await async_db.commit()
    items = await compose_urgencias(async_db, sample_user.id, sample_empresa.id)
    assert any(u.tipo == "estado_inhabil" and u.severidad == "amarillo" for u in items)


@pytest.mark.asyncio
async def test_compose_urgencias_returns_empty_when_nothing_urgent(
    async_db, sample_user, sample_empresa,
):
    items = await compose_urgencias(async_db, sample_user.id, sample_empresa.id)
    assert items == []
