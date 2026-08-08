"""El encaje sale de `match_empresa_licitacion`, no del modelo TF-IDF.

Lo que estos tests fijan no es el cálculo —ese vive en el job y en el matcher—
sino las tres decisiones que se tomaron al mover el encaje a una tabla, y que un
refactor puede deshacer sin que nada falle:

1. Los datos de la licitación salen del **join**, no de una copia. Antes eran una
   foto de las 06:00 y se quedaban rancios.
2. Ordenar por encaje **no filtra**: lo que el job aún no puntuó sigue saliendo,
   al final.
3. Una licitación cerrada durante el día **no se ofrece**, aunque tenga fila.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.api.tenders import list_tenders
from app.models.empresa import Empresa, EmpresaUsuario
from app.models.licitacion import Licitacion
from app.models.match import MatchEmpresaLicitacion
from app.repositories import matches as repo_matches
from app.services.dashboard_home_service import load_matches


@pytest_asyncio.fixture
async def empresa(async_db, sample_user) -> Empresa:
    emp = Empresa(
        rut_empresa=f"7{uuid.uuid4().int % 10_000_000}-1",
        nombre_empresa="Encaje SpA",
        estado_habil="habil",
        plan_tier="pyme",
        subscription_status="active",
    )
    async_db.add(emp)
    await async_db.flush()
    async_db.add(EmpresaUsuario(empresa_id=emp.id, user_id=sample_user.id, rol="owner"))
    await async_db.flush()
    return emp


async def _licitacion(db, codigo: str, *, cierra_en_dias: int = 10, nombre: str | None = None):
    lic = Licitacion(
        codigo_externo=codigo,
        nombre=nombre or f"Servicio {codigo}",
        fecha_publicacion=datetime.now(UTC) - timedelta(days=1),
        fecha_cierre=datetime.now(UTC) + timedelta(days=cierra_en_dias),
        estado="Publicada",
        activo=True,
    )
    db.add(lic)
    await db.flush()
    return lic


async def _match(db, empresa_id, licitacion_id, score: int, nivel: str = "alto"):
    db.add(
        MatchEmpresaLicitacion(
            empresa_id=empresa_id,
            licitacion_id=licitacion_id,
            score=score,
            nivel=nivel,
            calculado_en=datetime.now(UTC),
        )
    )
    await db.flush()


# ── El join contra la licitación ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_la_portada_muestra_el_nombre_actual_no_el_del_calculo(async_db, empresa):
    """El caso que motivó el cambio.

    El blob guardaba nombre, monto y fecha DENTRO. Si el ETL corregía la
    licitación durante el día —y corre cada hora—, la portada seguía mostrando
    lo de las 06:00 hasta la mañana siguiente.
    """
    lic = await _licitacion(async_db, "ENC-1", nombre="Nombre viejo")
    await _match(async_db, empresa.id, lic.id, 90)

    lic.nombre = "Nombre corregido por el ETL"
    lic.monto_estimado = 7_000_000
    await async_db.flush()

    items, _calculado, total = await load_matches(async_db, empresa.id)

    assert total == 1
    assert items[0].nombre == "Nombre corregido por el ETL"
    assert items[0].monto_estimado == 7_000_000


@pytest.mark.asyncio
async def test_una_licitacion_cerrada_no_se_ofrece_aunque_tenga_fila(async_db, empresa):
    """El job puntúa lo abierto a las 06:00; una puede cerrar a mediodía."""
    abierta = await _licitacion(async_db, "ENC-ABIERTA")
    cerrada = await _licitacion(async_db, "ENC-CERRADA", cierra_en_dias=-1)
    await _match(async_db, empresa.id, abierta.id, 50)
    await _match(async_db, empresa.id, cerrada.id, 99)

    items, _c, _t = await load_matches(async_db, empresa.id)

    assert [i.codigo_externo for i in items] == ["ENC-ABIERTA"]


@pytest.mark.asyncio
async def test_sin_filas_la_portada_no_revienta(async_db, empresa):
    items, calculado, total = await load_matches(async_db, empresa.id)
    assert (items, calculado, total) == ([], None, 0)


# ── Ordenar por encaje ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ordenar_por_encaje_no_esconde_lo_no_puntuado(async_db, empresa):
    """Con un join interno, "ordenar" se convertiría en "filtrar".

    Una licitación ingerida hoy no tiene fila hasta la corrida siguiente. Si
    ordenar por encaje la hiciera desaparecer, el usuario vería el catálogo
    encogerse al cambiar un desplegable de orden.
    """
    puntuada = await _licitacion(async_db, "ENC-CON")
    sin_puntuar = await _licitacion(async_db, "ENC-SIN")
    await _match(async_db, empresa.id, puntuada.id, 80)

    stmt = select(Licitacion).where(Licitacion.codigo_externo.startswith("ENC-"))
    ordenado = repo_matches.ordenar_por_encaje(stmt, empresa.id)
    filas = (await async_db.execute(ordenado)).scalars().all()

    codigos = [f.codigo_externo for f in filas]
    assert set(codigos) == {"ENC-CON", "ENC-SIN"}
    # La puntuada primero; la que no tiene score, al final.
    assert codigos[0] == "ENC-CON"
    assert codigos[-1] == "ENC-SIN"
    assert sin_puntuar.codigo_externo == "ENC-SIN"


@pytest.mark.asyncio
async def test_el_encaje_de_otra_empresa_no_se_filtra(async_db, empresa, sample_user):
    """Dos empresas puntúan la misma licitación distinto. Cada una ve la suya."""
    otra = Empresa(
        rut_empresa=f"8{uuid.uuid4().int % 10_000_000}-2",
        nombre_empresa="Ajena SpA",
        estado_habil="habil",
    )
    async_db.add(otra)
    await async_db.flush()

    lic = await _licitacion(async_db, "ENC-COMPARTIDA")
    await _match(async_db, empresa.id, lic.id, 30, "bajo")
    await _match(async_db, otra.id, lic.id, 95, "alto")

    mio = await repo_matches.encaje_por_licitacion(async_db, empresa.id, [lic.id])
    assert mio == {lic.id: (30, "bajo")}


# ── A través del endpoint ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_el_listado_enriquece_desde_la_tabla_sin_cargar_el_modelo(
    async_db, empresa, sample_user, monkeypatch
):
    """El punto del ejercicio: el listado devuelve encaje sin tocar TF-IDF.

    Se rompe `is_available` a propósito — si algo volviera a llamar al matcher en
    tiempo de request, este test lo delataría.
    """
    from app.services import tfidf_matcher

    def prohibido():
        raise AssertionError("el listado no debe consultar el modelo TF-IDF")

    monkeypatch.setattr(tfidf_matcher, "is_available", prohibido)

    lic = await _licitacion(async_db, "ENC-LISTADO")
    await _match(async_db, empresa.id, lic.id, 42, "medio")

    respuesta = await list_tenders(
        skip=0,
        limit=100,
        estado=None,
        codigo_organismo=None,
        region=None,
        min_amount=None,
        max_amount=None,
        search=None,
        empresa_id=empresa.id,
        sort_by="score_encaje",
        sort_order="desc",
        db=async_db,
        current_user=sample_user,
    )

    fila = next(i for i in respuesta.items if i.codigo_externo == "ENC-LISTADO")
    # El contrato de la API es un coseno 0-1; en la tabla se guarda 0-100.
    assert fila.score_encaje == 0.42
    assert fila.nivel_encaje == "medio"


@pytest.mark.asyncio
async def test_sin_acceso_a_la_empresa_el_listado_da_403(async_db, sample_user):
    ajena = Empresa(
        rut_empresa=f"9{uuid.uuid4().int % 10_000_000}-3",
        nombre_empresa="No mía",
        estado_habil="habil",
    )
    async_db.add(ajena)
    await async_db.flush()

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await list_tenders(
            skip=0,
            limit=10,
            estado=None,
            codigo_organismo=None,
            region=None,
            min_amount=None,
            max_amount=None,
            search=None,
            empresa_id=ajena.id,
            sort_by=None,
            sort_order="desc",
            db=async_db,
            current_user=sample_user,
        )
    assert exc.value.status_code == 403
