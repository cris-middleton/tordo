"""Unit tests for dashboard_home_service composers."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.empresa import Empresa
from app.models.licitacion import Licitacion
from app.models.postulacion import Postulacion
from app.models.user import User
from app.services.dashboard_home_service import compose_urgencias


@pytest.mark.asyncio
async def test_compose_urgencias_includes_postulacion_closing_in_36h(
    async_db: AsyncSession,
    sample_user: User,
    sample_empresa: Empresa,
):
    """A postulación whose licitación closes in <48h must produce a red urgencia."""
    now = datetime.now(UTC)
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
    async_db,
    sample_user,
    sample_empresa,
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
    assert any(u.tipo == "documento_vence" and u.severidad == "naranja" for u in items)


@pytest.mark.asyncio
async def test_compose_urgencias_includes_estado_inhabil(
    async_db,
    sample_user,
    sample_empresa,
):
    sample_empresa.estado_habil = "inhabil"
    sample_empresa.estado_habil_updated_at = datetime.now(UTC) - timedelta(days=4)
    await async_db.commit()
    items = await compose_urgencias(async_db, sample_user.id, sample_empresa.id)
    assert any(u.tipo == "estado_inhabil" and u.severidad == "amarillo" for u in items)


@pytest.mark.parametrize("estado", ["desconocido", "inscrito"])
@pytest.mark.asyncio
async def test_no_saber_el_estado_no_es_una_urgencia(async_db, sample_user, sample_empresa, estado):
    """Toda empresa nueva empieza en `desconocido`, y la API sólo confirma la
    inscripción. Antes la primera tarea del panel era «Estado desconocido desde
    fecha desconocida — revisa deudas en Tesorería»: alarma sobre nada."""
    sample_empresa.estado_habil = estado
    await async_db.commit()
    items = await compose_urgencias(async_db, sample_user.id, sample_empresa.id)
    assert not any(u.tipo == "estado_inhabil" for u in items)


@pytest.mark.asyncio
async def test_no_figurar_en_el_registro_si_es_urgente_y_no_inventa_causa(
    async_db, sample_user, sample_empresa
):
    sample_empresa.estado_habil = "no_encontrado"
    await async_db.commit()
    items = await compose_urgencias(async_db, sample_user.id, sample_empresa.id)
    [aviso] = [u for u in items if u.tipo == "estado_inhabil"]
    assert "Registro de Proveedores" in aviso.titulo
    assert "Tesorería" not in aviso.subtitulo


@pytest.mark.asyncio
async def test_compose_urgencias_returns_empty_when_nothing_urgent(
    async_db,
    sample_user,
    sample_empresa,
):
    items = await compose_urgencias(async_db, sample_user.id, sample_empresa.id)
    assert items == []


@pytest.mark.asyncio
async def test_compose_urgencias_includes_match_alto_alert(
    async_db,
    sample_user,
    sample_empresa,
):
    """An unread NUEVA_LICITACION_MATCH alert in the last 5 days must produce a match_alto urgencia."""
    from app.models.alert import Alert, AlertStatus, AlertType

    alert = Alert(
        user_id=sample_user.id,
        alert_type=AlertType.NUEVA_LICITACION_MATCH,
        status=AlertStatus.SENT,
        entity_type="licitacion",
        entity_id=42,
        title="Nueva licitación con match 87%: Suministro de computadores MINEDUC",
        message="Match score 87. Cierre en 8 días.",
        notification_channels=["in_app"],
    )
    async_db.add(alert)
    await async_db.commit()

    items = await compose_urgencias(async_db, sample_user.id, sample_empresa.id)
    assert any(u.tipo == "match_alto" and u.severidad == "naranja" for u in items)


from app.services.dashboard_home_service import (
    compose_pipeline,
    compose_resumen,
    compose_trend,
    load_matches,
)


def _new_licitacion(codigo: str, now: datetime) -> Licitacion:
    return Licitacion(
        codigo_externo=codigo,
        nombre=f"Licitación {codigo}",
        fecha_publicacion=now - timedelta(days=30),
        fecha_cierre=now + timedelta(days=10),
        estado="Publicada",
        activo=True,
    )


@pytest.mark.asyncio
async def test_compose_pipeline_counts_by_estado(
    async_db,
    sample_user,
    sample_empresa,
):
    """Pipeline counts must reflect the 5 displayed estados over the last 90 days."""
    now = datetime.now(UTC)
    for idx, estado in enumerate(("en_seguimiento", "en_preparacion", "enviada", "adjudicada")):
        lic = _new_licitacion(f"LIC-PIPE-{idx}", now)
        async_db.add(lic)
        await async_db.flush()
        async_db.add(
            Postulacion(
                empresa_id=sample_empresa.id,
                licitacion_id=lic.id,
                estado=estado,
            )
        )
        await async_db.flush()
    await async_db.commit()

    pipeline = await compose_pipeline(async_db, sample_empresa.id)
    assert pipeline.en_seguimiento == 1
    assert pipeline.en_preparacion == 1
    assert pipeline.enviada == 1
    assert pipeline.adjudicada == 1
    assert pipeline.no_adjudicada == 0


@pytest.mark.asyncio
async def test_compose_resumen_aggregates_counts(
    async_db,
    sample_user,
    sample_empresa,
):
    resumen = await compose_resumen(async_db, sample_user.id, sample_empresa.id)
    assert resumen.matches_semana == 0
    assert resumen.postulaciones_activas == 0
    assert resumen.postulaciones_cierran_72h == 0
    assert resumen.docs_por_vencer_30d == 0
    assert resumen.adjudicaciones_mes == 0


@pytest.mark.asyncio
async def test_compose_trend_unavailable_with_short_history(
    async_db,
    sample_user,
    sample_empresa,
):
    trend = await compose_trend(async_db, sample_empresa.id)
    assert trend.disponible is False
    assert trend.postulaciones_semana == []


@pytest.mark.asyncio
async def test_load_matches_returns_empty_when_no_cache(
    async_db,
    sample_user,
    sample_empresa,
):
    matches, cached_at, total = await load_matches(async_db, sample_empresa.id)
    assert matches == []
    assert cached_at is None
    assert total == 0
