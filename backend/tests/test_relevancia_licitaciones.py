"""El orden por relevancia lo decide Postgres, no un modelo cargado en la API.

Hasta el paso 8 del pivote público (docs/PIVOTE_PUBLICO_2026-10.md §7.3),
`sort_by=relevance` reordenaba con el TF-IDF del ETL cargado DENTRO del proceso
de la API: ~165 MB más por worker, medidos con `make medir-memoria`. Ahora ordena
con `ts_rank_cd` sobre la misma columna `busqueda` que ya filtra.

Lo que estos tests fijan es lo que un usuario nota del orden:

- la licitación con los términos **juntos** va antes que la que los tiene
  dispersos;
- la que los **repite** —en el nombre y en la descripción— va antes que la que
  los nombra una vez de pasada;
- nada de eso salta por encima de «las abiertas primero»;
- el término sigue siendo un FILTRO: relevancia no es «todo, ordenado».

Los términos llevan el prefijo `zz` para no coincidir con datos de otras
corridas en la base de test.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio

from app.api.tenders import list_tenders
from app.models.licitacion import Licitacion
from app.repositories import licitaciones as repo

AHORA = datetime.now(UTC)
EN_UNA_SEMANA = AHORA + timedelta(days=7)

RELLENO = (
    "Contrato de suministro con entrega mensual en bodega central, "
    "según especificaciones técnicas, garantía de seriedad de la oferta, "
    "visita a terreno obligatoria y evaluación por comisión. "
)


def _abierta(codigo: str, nombre: str, descripcion: str, *, hace_dias: int) -> Licitacion:
    return Licitacion(
        codigo_externo=codigo,
        nombre=nombre,
        descripcion=descripcion,
        estado="Publicada",
        fecha_publicacion=AHORA - timedelta(days=hace_dias),
        fecha_cierre=EN_UNA_SEMANA,
        activo=True,
    )


@pytest_asyncio.fixture
async def catalogo(async_db):
    filas = [
        # Los dos términos juntos, en el nombre. La más antigua: si gana, gana
        # por relevancia y no por fecha.
        _abierta(
            "R-FRASE",
            "Guantes zznitrilo zzquirurgicos talla M",
            "Caja de cien unidades",
            hace_dias=9,
        ),
        # Los dos términos, pero uno en el nombre y el otro perdido al final de
        # una descripción larga. La más reciente.
        _abierta(
            "R-DISPERSO",
            "Insumos varios de zznitrilo",
            RELLENO * 3 + "Incluye material zzquirurgicos.",
            hace_dias=1,
        ),
        # Un término repetido en nombre y descripción.
        _abierta(
            "R-DENSO",
            "Zzcemento para obra menor",
            "Zzcemento portland en sacos; zzcemento de fraguado rápido.",
            hace_dias=8,
        ),
        # El mismo término, una vez y de pasada. Más reciente.
        _abierta(
            "R-DEBIL",
            "Materiales de construcción",
            RELLENO + "Puede incluir zzcemento.",
            hace_dias=2,
        ),
        # La más densa de todas, pero cerrada: no se puede postular.
        Licitacion(
            codigo_externo="R-CERRADA",
            nombre="Zzcemento zzcemento zzcemento",
            descripcion="Zzcemento a granel, zzcemento en sacos, zzcemento especial.",
            estado="Cerrada",
            fecha_publicacion=AHORA - timedelta(days=3),
            fecha_cierre=AHORA - timedelta(days=1),
            activo=True,
        ),
    ]
    async_db.add_all(filas)
    await async_db.flush()
    return filas


async def _por_relevancia(db, *terminos: str) -> tuple[list[str], int]:
    filas, total = await repo.buscar_por_relevancia(
        db, repo.Filtros(terminos=list(terminos)), salto=0, limite=50
    )
    return [f.codigo_externo for f in filas if f.codigo_externo.startswith("R-")], total


@pytest.mark.asyncio
async def test_los_terminos_juntos_van_antes_que_dispersos(async_db, catalogo):
    codigos, _ = await _por_relevancia(async_db, "zznitrilo", "zzquirurgicos")

    assert codigos == ["R-FRASE", "R-DISPERSO"]


@pytest.mark.asyncio
async def test_el_termino_repetido_va_antes_que_el_mencionado_de_pasada(async_db, catalogo):
    codigos, _ = await _por_relevancia(async_db, "zzcemento")

    assert codigos.index("R-DENSO") < codigos.index("R-DEBIL")


@pytest.mark.asyncio
async def test_la_relevancia_no_salta_por_encima_de_las_abiertas(async_db, catalogo):
    """La cerrada es la que más repite el término, y aun así va última.

    Quien busca, busca a qué postular — el mismo criterio que `abiertas_primero`
    en todo otro orden del listado.
    """
    codigos, _ = await _por_relevancia(async_db, "zzcemento")

    assert codigos == ["R-DENSO", "R-DEBIL", "R-CERRADA"]


@pytest.mark.asyncio
async def test_todos_los_terminos_tienen_que_coincidir(async_db, catalogo):
    """Relevancia ordena; no amplía. Es el mismo filtro (AND) que el resto de
    órdenes, así que el total no cambia al pasar de «fecha» a «relevancia»."""
    codigos, _ = await _por_relevancia(async_db, "zznitrilo", "zzcemento")
    assert codigos == []

    _, total_relevancia = await _por_relevancia(async_db, "zzcemento")
    _, total_fecha = await repo.buscar(async_db, repo.Filtros(terminos=["zzcemento"]))
    assert total_relevancia == total_fecha == 3


@pytest.mark.asyncio
async def test_un_fragmento_sigue_encontrando_aunque_no_puntue(async_db, catalogo):
    """«zzcem» no es una palabra: no puntúa en el tsvector, pero coincide por
    trigrama en el nombre. Sale igual — ordenar por relevancia no puede perder
    lo que el filtro encuentra."""
    codigos, total = await _por_relevancia(async_db, "zzcem")

    assert set(codigos) == {"R-DENSO", "R-CERRADA"}
    assert total == 2


@pytest.mark.asyncio
async def test_el_endpoint_ordena_por_relevancia(async_db, catalogo):
    respuesta = await list_tenders(
        skip=0,
        limit=100,
        estado=None,
        codigo_organismo=None,
        tipo_convocatoria=None,
        region=None,
        min_amount=None,
        max_amount=None,
        search="zznitrilo zzquirurgicos",
        sort_by="relevance",
        sort_order="desc",
        db=async_db,
    )

    codigos = [i.codigo_externo for i in respuesta.items if i.codigo_externo.startswith("R-")]
    assert codigos == ["R-FRASE", "R-DISPERSO"]
    assert respuesta.total == 2
