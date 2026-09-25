"""El mecanismo de compra deja de darse por supuesto.

El modelo asumía que todo lo ingerido es una licitación. **Compra Ágil y
Convenio Marco son cerca de la mitad del mercado chileno** y no se veían: sin
una columna que los distinga no hay forma de filtrarlos, contarlos ni alertar
sobre ellos.

Lo que estos tests fijan es lo que un refactor puede romper sin que nada falle:
el mapeo de los códigos oficiales, y que un filtro mal escrito no devuelva el
catálogo entero.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from app.api.tenders import list_tenders
from app.models.convocatoria import TipoConvocatoria, convocatoria_de_orden
from app.models.licitacion import Licitacion
from app.repositories import licitaciones as repo

# ── El vocabulario ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "tipo_api,esperado",
    [
        # Del diccionario de datos oficial de la API de órdenes de compra, §3.1.
        (9, TipoConvocatoria.CONVENIO_MARCO),
        ("9", TipoConvocatoria.CONVENIO_MARCO),
        (" 9 ", TipoConvocatoria.CONVENIO_MARCO),
        (2, TipoConvocatoria.TRATO_DIRECTO),
        # Lo que traen los detalles REALES: número y letras.
        (13, TipoConvocatoria.COMPRA_AGIL),
        ("AG", TipoConvocatoria.COMPRA_AGIL),
        (16, TipoConvocatoria.TRATO_DIRECTO),
        ("TD", TipoConvocatoria.TRATO_DIRECTO),
        ("CM", TipoConvocatoria.CONVENIO_MARCO),
        ("SE", None),
        # 1 y 8 describen CÓMO se emitió la orden, no por qué mecanismo se
        # compró. Meterlos en una categoría sería inventar información.
        (1, None),
        (8, None),
        (None, None),
        ("", None),
    ],
)
def test_el_codigo_de_la_orden_dice_el_mecanismo(tipo_api, esperado):
    assert convocatoria_de_orden(tipo_api) == esperado


def test_convenio_marco_solo_se_ve_por_la_orden_de_compra():
    """No hay endpoint propio para Convenio Marco en la API de Mercado Público.

    Las compras por catálogo aparecen como órdenes con `Tipo=9`. Si alguien
    borrara ese mapeo, Convenio Marco desaparecería del producto sin que fallara
    ningún test — de ahí éste.
    """
    assert convocatoria_de_orden("9") == "convenio_marco"


# ── El filtro de la API ──────────────────────────────────────────────────────


async def _licitacion(db, codigo: str, tipo: str) -> Licitacion:
    lic = Licitacion(
        codigo_externo=codigo,
        nombre=f"Compra {codigo}",
        fecha_publicacion=datetime.now(UTC) - timedelta(days=1),
        fecha_cierre=datetime.now(UTC) + timedelta(days=5),
        estado="Publicada",
        activo=True,
        tipo_convocatoria=tipo,
    )
    db.add(lic)
    await db.flush()
    return lic


async def _listar(db, usuario, **kwargs):
    return await list_tenders(
        skip=0,
        limit=100,
        estado=None,
        codigo_organismo=None,
        tipo_convocatoria=kwargs.pop("tipo_convocatoria", None),
        region=None,
        min_amount=None,
        max_amount=None,
        search=None,
        empresa_id=None,
        sort_by=None,
        sort_order="desc",
        db=db,
        current_user=usuario,
        **kwargs,
    )


@pytest.mark.asyncio
async def test_lo_ya_ingerido_queda_como_licitacion(async_db):
    """La columna nace con `server_default`, así que el histórico no queda en NULL."""
    lic = Licitacion(
        codigo_externo=f"TC-{uuid.uuid4().hex[:8]}",
        nombre="Sin tipo explícito",
        fecha_publicacion=datetime.now(UTC),
        estado="Publicada",
        activo=True,
    )
    async_db.add(lic)
    await async_db.flush()
    await async_db.refresh(lic)
    assert lic.tipo_convocatoria == TipoConvocatoria.LICITACION


@pytest.mark.asyncio
async def test_el_filtro_acota_al_mecanismo(async_db, sample_user):
    await _licitacion(async_db, "TC-LIC", TipoConvocatoria.LICITACION)
    await _licitacion(async_db, "TC-AGIL", TipoConvocatoria.COMPRA_AGIL)

    respuesta = await _listar(async_db, sample_user, tipo_convocatoria="compra_agil")
    codigos = {i.codigo_externo for i in respuesta.items if i.codigo_externo.startswith("TC-")}
    assert codigos == {"TC-AGIL"}


@pytest.mark.asyncio
async def test_varios_mecanismos_se_combinan_con_o(async_db, sample_user):
    """Quien filtra «ágil o convenio marco» pregunta por el mercado que NO es
    licitación, no por uno de los dos."""
    await _licitacion(async_db, "TC-LIC2", TipoConvocatoria.LICITACION)
    await _licitacion(async_db, "TC-AGIL2", TipoConvocatoria.COMPRA_AGIL)
    await _licitacion(async_db, "TC-CM2", TipoConvocatoria.CONVENIO_MARCO)

    respuesta = await _listar(async_db, sample_user, tipo_convocatoria="compra_agil,convenio_marco")
    codigos = {i.codigo_externo for i in respuesta.items if i.codigo_externo.startswith("TC-")}
    assert codigos == {"TC-AGIL2", "TC-CM2"}


@pytest.mark.asyncio
async def test_sin_filtro_salen_todos(async_db, sample_user):
    await _licitacion(async_db, "TC-LIC3", TipoConvocatoria.LICITACION)
    await _licitacion(async_db, "TC-AGIL3", TipoConvocatoria.COMPRA_AGIL)

    respuesta = await _listar(async_db, sample_user)
    codigos = {i.codigo_externo for i in respuesta.items if i.codigo_externo.startswith("TC-")}
    assert codigos == {"TC-LIC3", "TC-AGIL3"}


@pytest.mark.asyncio
async def test_un_mecanismo_desconocido_se_rechaza(async_db, sample_user):
    """Ignorarlo devolvería el catálogo entero.

    Quien escribe `compra_agiles` vería todos los resultados y concluiría que su
    filtro no encuentra nada especial — cuando lo que pasa es que no se aplicó.
    """
    with pytest.raises(HTTPException) as exc:
        await _listar(async_db, sample_user, tipo_convocatoria="compra_agiles")
    assert exc.value.status_code == 422
    assert "compra_agiles" in exc.value.detail


@pytest.mark.asyncio
async def test_el_repositorio_filtra_igual(async_db):
    await _licitacion(async_db, "TC-REPO-LIC", TipoConvocatoria.LICITACION)
    await _licitacion(async_db, "TC-REPO-CM", TipoConvocatoria.CONVENIO_MARCO)

    filas, total = await repo.buscar(
        async_db,
        repo.Filtros(tipos_convocatoria=[TipoConvocatoria.CONVENIO_MARCO]),
        limite=100,
    )
    codigos = {f.codigo_externo for f in filas if f.codigo_externo.startswith("TC-REPO")}
    assert codigos == {"TC-REPO-CM"}
    assert total >= 1
