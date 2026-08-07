"""Semántica de la búsqueda de licitaciones.

Antes era `nombre ILIKE '%t%' OR descripcion ILIKE '%t%'`, con el comodín al
principio: ningún índice puede servir eso, así que cada búsqueda recorría la
tabla entera. Ahora cada término coincide por **palabra** (columna generada
`busqueda`, con stemming en español) **o** por **fragmento** en `nombre`
(índice de trigramas).

Lo que estos tests fijan es el cambio de comportamiento, que es lo que un
usuario nota:

- se GANAN las coincidencias por palabra con stemming, en ambos campos;
- se CONSERVAN los fragmentos a mitad de palabra en `nombre`;
- se PIERDEN los fragmentos a mitad de palabra que sólo estaban en
  `descripcion` — ahí no hay índice de trigramas a propósito: es texto largo y
  sería el más caro de mantener en cada carga del ETL.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.api.tenders import _coincide_termino, list_tenders
from app.models.licitacion import Licitacion


@pytest_asyncio.fixture
async def licitaciones(async_db):
    filas = [
        Licitacion(
            codigo_externo="T-1",
            nombre="Servicios de aseo integral",
            descripcion="Contrato anual de limpieza",
            fecha_publicacion=datetime.now(UTC),
            activo=True,
        ),
        Licitacion(
            codigo_externo="T-2",
            nombre="Construcción de hospital regional",
            descripcion="Obra nueva de tres pisos",
            fecha_publicacion=datetime.now(UTC),
            activo=True,
        ),
        Licitacion(
            codigo_externo="T-3",
            nombre="Arriendo de maquinaria",
            descripcion="Incluye servicio de mantención mensual",
            fecha_publicacion=datetime.now(UTC),
            activo=True,
        ),
    ]
    async_db.add_all(filas)
    await async_db.flush()
    return filas


async def _buscar(db, termino: str) -> set[str]:
    """Busca, pero sólo entre las filas de este test.

    La base de test puede tener datos de otras corridas o de desarrollo, así que
    comparar contra el resultado global haría estos tests dependientes del
    entorno. Se acota por prefijo del código.
    """
    filas = (
        (
            await db.execute(
                select(Licitacion).where(
                    Licitacion.codigo_externo.startswith("T-"),
                    _coincide_termino(termino),
                )
            )
        )
        .scalars()
        .all()
    )
    return {f.codigo_externo for f in filas}


@pytest.mark.asyncio
async def test_encuentra_por_palabra_en_el_nombre(async_db, licitaciones):
    assert await _buscar(async_db, "hospital") == {"T-2"}


@pytest.mark.asyncio
async def test_el_stemming_ignora_el_plural(async_db, licitaciones):
    """ "servicios" tiene que encontrar "servicio", y al revés.

    Es la ganancia principal: antes, buscar el plural no encontraba el singular.
    T-3 dice "servicio" en la descripcion.
    """
    assert await _buscar(async_db, "servicios") == {"T-1", "T-3"}
    assert await _buscar(async_db, "servicio") == {"T-1", "T-3"}


@pytest.mark.asyncio
async def test_busca_tambien_en_la_descripcion(async_db, licitaciones):
    assert await _buscar(async_db, "limpieza") == {"T-1"}


@pytest.mark.asyncio
async def test_conserva_el_fragmento_a_mitad_de_palabra_en_el_nombre(async_db, licitaciones):
    """Lo que hacía el ILIKE de antes, ahora apoyado en el índice de trigramas."""
    assert await _buscar(async_db, "ospital") == {"T-2"}


@pytest.mark.asyncio
async def test_el_fragmento_solo_en_descripcion_ya_no_coincide(async_db, licitaciones):
    """La pérdida, escrita a propósito para que no sorprenda.

    "antención" es un fragmento de "mantención", que sólo está en la descripcion
    de T-3. Antes coincidía; ahora no, porque `descripcion` no lleva trigrama.
    Buscar la palabra entera sí funciona.
    """
    assert await _buscar(async_db, "antención") == set()
    assert await _buscar(async_db, "mantención") == {"T-3"}


@pytest.mark.asyncio
async def test_encuentra_sin_escribir_las_tildes(async_db, licitaciones):
    """El caso normal en Chile, no el raro.

    T-2 se llama "Construcción de hospital regional". Escribir "construccion" sin
    tilde tiene que encontrarlo: es como se teclea la mayoría de las veces.
    """
    assert await _buscar(async_db, "construccion") == {"T-2"}
    assert await _buscar(async_db, "construcción") == {"T-2"}


@pytest.mark.asyncio
async def test_tambien_al_reves(async_db, licitaciones):
    """Buscar CON tilde algo escrito sin ella.

    Se normalizan los dos lados —el texto indexado y el término—, así que la
    correspondencia funciona en ambos sentidos. Normalizar sólo uno habría roto
    esta mitad.
    """
    assert await _buscar(async_db, "mantencion") == {"T-3"}
    assert await _buscar(async_db, "mantención") == {"T-3"}


@pytest.mark.asyncio
async def test_las_tildes_tampoco_importan_en_el_fragmento(async_db, licitaciones):
    """La otra vía de coincidencia, la del trigrama sobre `nombre_norm`."""
    assert await _buscar(async_db, "onstruccion") == {"T-2"}


@pytest.mark.asyncio
async def test_la_sintaxis_de_tsquery_no_se_interpreta(async_db, licitaciones):
    """`plainto_tsquery` trata la entrada como texto plano.

    Con `to_tsquery`, escribir `hospital | maquinaria` en el buscador daría un OR
    —una consulta que el usuario no debería poder construir— y un `&` suelto
    reventaría con error de sintaxis.

    Con `plainto_tsquery` los operadores son puntuación: se descartan y las
    palabras restantes se exigen TODAS. Por eso "hospital & maquinaria" no
    devuelve nada: ninguna licitación tiene ambas.
    """
    assert await _buscar(async_db, "hospital | maquinaria") == set()
    assert await _buscar(async_db, "hospital & regional") == {"T-2"}

    # Un operador suelto no revienta la consulta, sólo no encuentra nada.
    assert await _buscar(async_db, "&") == set()
    assert await _buscar(async_db, "!") == set()


# ── El término como FILTRO, no sólo como criterio de orden ───────────────────


@pytest.mark.asyncio
async def test_relevancia_sin_modelo_sigue_filtrando_por_el_termino(
    async_db, licitaciones, sample_user, monkeypatch
):
    """`sort_by=relevance` sin artefactos TF-IDF devolvía TODO.

    La rama semántica aplicaba el filtro de términos dentro de sí misma, y
    cuando el modelo no estaba disponible caía al orden por defecto con la
    consulta **sin filtrar**. El usuario escribía "hospital" y recibía el
    catálogo entero ordenado por fecha, sin ningún aviso de que su búsqueda se
    había ignorado.

    Es el estado normal de un despliegue nuevo: los artefactos del modelo se
    generan después, y el frontend cambia a `relevance` en cuanto se escribe
    algo en el buscador.
    """
    from app.services import tfidf_matcher

    monkeypatch.setattr(tfidf_matcher, "is_available", lambda: False)

    respuesta = await list_tenders(
        skip=0,
        limit=100,
        estado=None,
        codigo_organismo=None,
        region=None,
        min_amount=None,
        max_amount=None,
        search="hospital",
        empresa_id=None,
        sort_by="relevance",
        sort_order="desc",
        db=async_db,
        current_user=sample_user,
    )

    codigos = {i.codigo_externo for i in respuesta.items if i.codigo_externo.startswith("T-")}
    assert codigos == {"T-2"}, "la búsqueda tiene que filtrar aunque no haya ranking semántico"


@pytest.mark.asyncio
async def test_relevancia_sin_termino_no_filtra_nada(async_db, licitaciones, sample_user):
    """El caso simétrico: ordenar por relevancia sin escribir nada lista todo."""
    respuesta = await list_tenders(
        skip=0,
        limit=100,
        estado=None,
        codigo_organismo=None,
        region=None,
        min_amount=None,
        max_amount=None,
        search=None,
        empresa_id=None,
        sort_by="relevance",
        sort_order="desc",
        db=async_db,
        current_user=sample_user,
    )
    codigos = {i.codigo_externo for i in respuesta.items if i.codigo_externo.startswith("T-")}
    assert codigos == {"T-1", "T-2", "T-3"}
