"""Las otras formas de una palabra buscada (`app/utils/sinonimos.py`).

Medido en la copia local el 2026-10-22: «computadora» no encontraba ninguna de
las 7 licitaciones de «computador», «lápices» dejaba fuera los 165 productos de
«lápiz» y «guantes» los 385 de «guante». Estos tests fijan que se encuentran, y
que lo que separaba «mesa» de «meses» sigue separándolo.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.api.tenders import list_tenders
from app.models.licitacion import Licitacion
from app.repositories.licitaciones import coincide_termino
from app.utils import sinonimos
from app.utils.sinonimos import Forma

# ── La regla, sin base ───────────────────────────────────────────────────────


def test_el_singular_va_entero_y_la_palabra_como_comienzo():
    assert sinonimos.formas("guantes") == [
        Forma("guantes", prefijo=True),
        Forma("guante", prefijo=False),
        Forma("guant", prefijo=False),
    ]


def test_el_plural_en_ces_y_su_singular():
    assert sinonimos.singulares("lapices")[-1] == "lapiz"
    assert sinonimos.alternativas("lapiz")[:2] == ["lapiz", "lapices"]
    assert sinonimos.alternativas("luces")[:2] == ["luces", "luz"]


def test_ora_encuentra_el_masculino_sin_la_a():
    assert Forma("computador", prefijo=True) in sinonimos.formas("computadora")
    assert Forma("computador", prefijo=True) in sinonimos.formas("computadoras")
    # Cortas no: «hora» no busca «hor».
    assert Forma("hor", prefijo=True) not in sinonimos.formas("hora")


def test_los_sinonimos_van_en_los_dos_sentidos():
    assert "boligrafo" in sinonimos.alternativas("lapiz")
    assert "lapiz" in sinonimos.alternativas("boligrafo")
    assert "mantencion" in sinonimos.alternativas("mantenimiento")
    assert "mantenimiento" in sinonimos.alternativas("mantenciones")


def test_una_clave_corta_lleva_a_otra_pero_no_se_busca():
    """«pc» lleva a «computador» y a su grupo; como prefijo encontraría «PCR»."""
    assert sinonimos.alternativas("pc")[:2] == ["computador", "computadora"]
    assert "notebook" in sinonimos.alternativas("pc")
    assert "pc" not in sinonimos.alternativas("computador")


def test_sin_sinonimos_la_palabra_sola():
    assert sinonimos.alternativas("mesa") == ["mesa"]
    assert sinonimos.alternativas("meses") == ["meses"]


def test_ningun_sinonimo_es_corto_ni_lleva_tildes():
    """Un sinónimo se busca como comienzo de palabra: con menos de cuatro letras
    encontraría de todo, y con tildes o mayúsculas no casaría con el texto
    normalizado."""
    for palabra, otras in sinonimos.SINONIMOS.items():
        for otra in (palabra, *otras):
            if otra in sinonimos.SOLO_CLAVE:
                continue
            assert otra.isascii() and otra.isalpha() and otra.islower(), otra
            assert len(otra) >= 4, otra


# ── En el catálogo ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def catalogo(async_db):
    ahora = datetime.now(UTC)
    filas = [
        ("A-1", "Adquisición de computadores para liceo", "Equipos"),
        ("A-2", "Compra de notebooks", "Para docentes"),
        ("A-3", "Lápices de colores y grafito", "Útiles"),
        ("A-4", "Bolígrafos azules", "Útiles de oficina"),
        ("A-5", "Servicio de mantención de ascensores", "Anual"),
        ("A-6", "Reactivos PCR", "Laboratorio"),
        ("A-7", "Mesas de comedor", "Mobiliario"),
        ("A-8", "Servicio de vigilancia", "Contrato por 12 meses"),
    ]
    licitaciones = [
        Licitacion(
            codigo_externo=codigo,
            nombre=nombre,
            descripcion=descripcion,
            fecha_publicacion=ahora - timedelta(minutes=i),
            activo=True,
        )
        for i, (codigo, nombre, descripcion) in enumerate(filas)
    ]
    async_db.add_all(licitaciones)
    await async_db.flush()
    return licitaciones


async def _buscar(db, termino: str) -> set[str]:
    filas = (
        (
            await db.execute(
                select(Licitacion).where(
                    Licitacion.codigo_externo.startswith("A-"), coincide_termino(termino)
                )
            )
        )
        .scalars()
        .all()
    )
    return {f.codigo_externo for f in filas}


@pytest.mark.asyncio
@pytest.mark.parametrize("termino", ["computadora", "computadoras", "Computadora"])
async def test_computadora_encuentra_computador(async_db, catalogo, termino):
    assert {"A-1", "A-2"} <= await _buscar(async_db, termino)


@pytest.mark.asyncio
async def test_lapiz_encuentra_lapices_y_boligrafos(async_db, catalogo):
    assert await _buscar(async_db, "lápiz") == {"A-3", "A-4"}
    assert await _buscar(async_db, "lapices") == {"A-3", "A-4"}


@pytest.mark.asyncio
async def test_mantenimiento_encuentra_mantencion(async_db, catalogo):
    assert await _buscar(async_db, "mantenimiento") == {"A-5"}


@pytest.mark.asyncio
async def test_pc_encuentra_computadores(async_db, catalogo):
    """Y sigue encontrando lo que empieza por «pc», como antes."""
    assert await _buscar(async_db, "pc") == {"A-1", "A-2", "A-6"}


@pytest.mark.asyncio
async def test_mesa_sigue_sin_encontrar_meses(async_db, catalogo):
    assert await _buscar(async_db, "mesa") == {"A-7"}
    assert await _buscar(async_db, "meses") == {"A-8"}


@pytest.mark.asyncio
async def test_lo_escrito_sale_antes_que_el_sinonimo(async_db, catalogo):
    """El bolígrafo es más nuevo, pero «lápiz» lo dice la otra."""
    respuesta = await list_tenders(
        skip=0,
        limit=100,
        estado=None,
        codigo_organismo=None,
        tipo_convocatoria=None,
        region=None,
        min_amount=None,
        max_amount=None,
        search="lapices",
        abiertas=False,
        sort_by="relevance",
        sort_order="desc",
        db=async_db,
    )
    codigos = [i.codigo_externo for i in respuesta.items if i.codigo_externo.startswith("A-")]
    assert codigos == ["A-3", "A-4"]
