"""Una sola definición de «abierta»: la cuenta de la portada y el filtro del catálogo.

Spec del rediseño §6.6. La tira de cifras de la portada dice «N licitaciones
abiertas» y enlaza a `/licitaciones?abiertas=1`: si la cuenta y el listado usaran
condiciones distintas —una con `activo`, la otra sin él; una mirando el cierre, la
otra sólo el estado, como hace hoy `?estado=Publicada`—, el número que se lee y lo
que se encuentra al hacer clic no coincidirían, y nada fallaría.

Los conteos se miden POR DIFERENCIA (antes y después de sembrar): la base de los
tests puede ser la de desarrollo, con datos (`tests/conftest.py`).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.core.versionado import PREFIJO_API
from app.db import get_db
from app.main import app
from app.models.licitacion import Licitacion
from app.repositories import licitaciones as repo

AHORA = datetime.now(UTC)
TERMINO = "zzabiertasportada"

#: Las que se pueden postular de `mezcla`. Las otras cuatro no.
ABIERTAS = {"AB-LIC", "AB-SIN-CIERRE", "AB-CM", "AB-CA", "AB-CA-POCO"}


def _lic(
    codigo: str,
    *,
    tipo: str = "licitacion",
    estado: str = "Publicada",
    cierre: timedelta | None = timedelta(days=3),
    activo: bool = True,
) -> Licitacion:
    return Licitacion(
        codigo_externo=codigo,
        nombre=f"Compra de {TERMINO} {codigo}",
        tipo_convocatoria=tipo,
        estado=estado,
        fecha_publicacion=AHORA - timedelta(days=1),
        fecha_cierre=None if cierre is None else AHORA + cierre,
        activo=activo,
    )


@pytest_asyncio.fixture
async def mezcla(async_db) -> tuple[int, int]:
    """Siembra nueve filas y devuelve `contar_abiertas` de ANTES de sembrar:
    (no Compra Ágil, Compra Ágil)."""
    antes = await repo.contar_abiertas(async_db)
    async_db.add_all(
        [
            _lic("AB-LIC"),  # abierta
            _lic("AB-SIN-CIERRE", cierre=None),  # publicada y sin cierre: abierta
            _lic("AB-CM", tipo="convenio_marco"),  # «no Compra Ágil» no es «licitacion»
            _lic("AB-CA", tipo="compra_agil", cierre=timedelta(hours=5)),
            # Abierta aunque no entre en «Lo mejor de hoy» (que exige > 2 h).
            _lic("AB-CA-POCO", tipo="compra_agil", cierre=timedelta(hours=1)),
            _lic("AB-VENCIDA", cierre=timedelta(hours=-1)),  # «Publicada» con cierre pasado
            _lic("AB-CERRADA", estado="Cerrada"),
            _lic("AB-RETIRADA", activo=False),
            _lic("AB-CA-RETIRADA", tipo="compra_agil", activo=False),
        ]
    )
    await async_db.flush()
    return antes.licitaciones, antes.compra_agil


@pytest.mark.asyncio
async def test_cuenta_las_abiertas_separando_compra_agil(async_db, mezcla):
    lic_antes, ca_antes = mezcla

    conteo = await repo.contar_abiertas(async_db)

    assert (conteo.licitaciones - lic_antes, conteo.compra_agil - ca_antes) == (3, 2)


@pytest.mark.asyncio
async def test_el_filtro_del_catalogo_lista_lo_que_se_cuenta(async_db, mezcla):
    filas, total = await repo.buscar(
        async_db, repo.Filtros(abiertas=True, terminos=[TERMINO]), limite=100
    )

    assert {f.codigo_externo for f in filas} == ABIERTAS
    assert total == len(ABIERTAS)


@pytest.mark.asyncio
async def test_misma_definicion_en_toda_la_base(async_db, mezcla):
    """Sobre TODA la tabla, no sólo lo sembrado: vale también con la base de desarrollo."""
    conteo = await repo.contar_abiertas(async_db)
    lic, ca = conteo.licitaciones, conteo.compra_agil
    _, total = await repo.buscar(async_db, repo.Filtros(abiertas=True), limite=1)
    _, total_ca = await repo.buscar(
        async_db, repo.Filtros(abiertas=True, tipos_convocatoria=["compra_agil"]), limite=1
    )

    assert total == lic + ca
    assert total_ca == ca


@pytest.mark.asyncio
async def test_sin_el_filtro_tambien_salen_las_cerradas(async_db, mezcla):
    _, total = await repo.buscar(async_db, repo.Filtros(terminos=[TERMINO]), limite=100)

    assert total == 7  # las nueve menos las dos retiradas


RUTA_TENDERS = f"{PREFIJO_API}/tenders/"


@pytest_asyncio.fixture
async def cliente(async_db):
    """Cliente async sobre la app real con la sesión del test, como `test_compra_agil_destacadas.py`."""

    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize("valor", ["true", "1"])
async def test_el_catalogo_filtra_abiertas_por_http(cliente, mezcla, valor):
    r = await cliente.get(RUTA_TENDERS, params={"abiertas": valor, "search": TERMINO, "limit": 100})

    assert r.status_code == 200, r.text
    assert {i["codigo_externo"] for i in r.json()["items"]} == ABIERTAS
    assert r.json()["total"] == len(ABIERTAS)


@pytest.mark.asyncio
async def test_sin_abiertas_el_catalogo_no_cambia(cliente, mezcla):
    r = await cliente.get(
        RUTA_TENDERS, params={"abiertas": "false", "search": TERMINO, "limit": 100}
    )

    assert r.status_code == 200
    assert r.json()["total"] == 7


@pytest.mark.asyncio
async def test_abiertas_invalido_es_422(cliente):
    r = await cliente.get(RUTA_TENDERS, params={"abiertas": "quizas"})

    assert r.status_code == 422


RUTA_PORTADA = f"{PREFIJO_API}/publico/portada"


@pytest.mark.asyncio
async def test_la_portada_cuenta_con_la_definicion_del_catalogo(cliente, mezcla):
    lic_antes, ca_antes = mezcla

    r = await cliente.get(RUTA_PORTADA)

    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert set(cuerpo) == {"licitaciones_abiertas", "compra_agil_abiertas", "actualizado_en"}
    assert cuerpo["licitaciones_abiertas"] - lic_antes == 3
    assert cuerpo["compra_agil_abiertas"] - ca_antes == 2
    # Lo que enlaza la portada da el mismo total.
    total = (await cliente.get(RUTA_TENDERS, params={"abiertas": "true", "limit": 1})).json()[
        "total"
    ]
    assert total == cuerpo["licitaciones_abiertas"] + cuerpo["compra_agil_abiertas"]


@pytest.mark.asyncio
async def test_la_hora_de_la_portada_va_en_hora_de_chile(cliente, mezcla):
    """Toda cifra viva lleva su hora (spec, principio 4): con Compras Ágiles sembradas, la hay."""
    valor = (await cliente.get(RUTA_PORTADA)).json()["actualizado_en"]

    assert valor is not None
    assert datetime.fromisoformat(valor).utcoffset() in (timedelta(hours=-3), timedelta(hours=-4))


@pytest.mark.asyncio
async def test_la_portada_no_pide_sesion_ni_analytics(cliente, monkeypatch):
    """Son conteos del catálogo: con FEATURE_ANALYTICS apagado (lo normal en
    desarrollo) la portada sigue teniendo cifras. Y sin `Authorization`."""
    monkeypatch.setattr(settings, "feature_analytics", False)

    r = await cliente.get(RUTA_PORTADA)

    assert r.status_code == 200
    assert isinstance(r.json()["licitaciones_abiertas"], int)
