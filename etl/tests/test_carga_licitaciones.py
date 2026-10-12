"""El cargador de licitaciones, contra Postgres de verdad.

Por qué existe
--------------
`load_licitaciones` **no cargaba nada**. El `ON CONFLICT DO UPDATE` se construía
sobre *todas* las columnas de la tabla, incluidas las **generadas** (`busqueda`,
`nombre_norm`). Postgres rechaza escribirlas —«column "busqueda" can only be
updated to DEFAULT»— y ese rechazo aborta la sentencia entera: fallaba también
el INSERT.

Llevaba así desde que F4 añadió las columnas generadas, y nada lo destapó: los
tests del ETL no ejercitaban este cargador contra una base real. Se descubrió al
cargar la primera Compra Ágil, que pasa por el mismo camino.

Estos tests son la red que faltaba, y sólo valen contra Postgres: una columna
generada no existe en ninguna otra cosa.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, text

from etl.loaders.database_loader_v2 import DatabaseLoaderV2

IN_CI = os.getenv("CI", "").lower() in ("1", "true")

PREFIJO = "TEST-CARGA-"


def _url() -> str:
    url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/licitaciones")
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


# Módulo y no función: `connect()` verifica el esquema entero, y repetirlo por
# test multiplicaba por cinco lo que tarda el fichero.
@pytest.fixture(scope="module")
def loader():
    try:
        engine = create_engine(_url(), pool_pre_ping=True)
        with engine.begin() as conn:
            conn.execute(text("SELECT 1 FROM licitaciones LIMIT 1"))
    except Exception as exc:
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos ({type(exc).__name__}) — usa `make dev-up-d`")

    cargador = DatabaseLoaderV2({"DATABASE_URL": _url()})
    cargador.connect()
    try:
        yield cargador
    finally:
        # Se limpia por prefijo: el cargador hace commit, así que no vale
        # envolverlo en una transacción que se revierta.
        cargador.session.execute(
            text("DELETE FROM licitaciones WHERE codigo_externo LIKE :p"), {"p": f"{PREFIJO}%"}
        )
        cargador.session.commit()
        cargador.disconnect()
        engine.dispose()


def _fila(codigo: str, **extra) -> dict:
    base = {
        "codigo_externo": f"{PREFIJO}{codigo}",
        "nombre": f"Servicio {codigo}",
        "descripcion": "Descripción de prueba",
        "fecha_publicacion": datetime.now(UTC) - timedelta(days=1),
        "fecha_cierre": datetime.now(UTC) + timedelta(days=10),
        "estado": "Publicada",
        "activo": True,
    }
    base.update(extra)
    return base


def test_una_licitacion_nueva_se_carga(loader):
    """El caso más básico, y el que estaba roto."""
    assert loader.load_licitaciones([_fila("A")]) == 1

    fila = loader.session.execute(
        text("SELECT nombre FROM licitaciones WHERE codigo_externo = :c"),
        {"c": f"{PREFIJO}A"},
    ).fetchone()
    assert fila is not None and fila[0] == "Servicio A"


def test_recargarla_la_actualiza(loader):
    """El ETL corre cada hora sobre las mismas licitaciones.

    Si el camino de conflicto falla, la primera pasada carga y **todas las
    demás no hacen nada**: los estados y las fechas de cierre se congelan.
    """
    loader.load_licitaciones([_fila("B")])
    loader.load_licitaciones([_fila("B", nombre="Nombre corregido", estado="Cerrada")])

    fila = loader.session.execute(
        text("SELECT nombre, estado FROM licitaciones WHERE codigo_externo = :c"),
        {"c": f"{PREFIJO}B"},
    ).fetchone()
    assert fila == ("Nombre corregido", "Cerrada")


def test_las_columnas_generadas_las_calcula_postgres(loader):
    """No se escriben, se derivan.

    `busqueda` y `nombre_norm` sostienen la búsqueda por palabra y por
    fragmento. Que se llenen solas es lo que permite excluirlas del upsert sin
    perder nada.
    """
    loader.load_licitaciones([_fila("C", nombre="Suministro de válvulas")])

    fila = loader.session.execute(
        text(
            "SELECT busqueda IS NOT NULL, nombre_norm FROM licitaciones WHERE codigo_externo = :c"
        ),
        {"c": f"{PREFIJO}C"},
    ).fetchone()
    assert fila[0] is True
    # `nombre_norm` es el nombre sin tildes: es lo que hace que buscar
    # "valvulas" encuentre "válvulas".
    assert "valvulas" in fila[1].lower()


def test_una_compra_agil_entra_por_el_mismo_camino(loader):
    """Compra Ágil comparte tabla con las licitaciones; lo que cambia es el
    mecanismo, y para eso está `tipo_convocatoria`."""
    assert (
        loader.load_licitaciones([_fila("D", tipo_convocatoria="compra_agil", descripcion="")]) == 1
    )

    fila = loader.session.execute(
        text("SELECT tipo_convocatoria FROM licitaciones WHERE codigo_externo = :c"),
        {"c": f"{PREFIJO}D"},
    ).fetchone()
    assert fila[0] == "compra_agil"


def test_lo_que_no_declara_mecanismo_queda_como_licitacion(loader):
    """El `server_default` cubre todo lo que ya estaba ingerido."""
    loader.load_licitaciones([_fila("E")])

    fila = loader.session.execute(
        text("SELECT tipo_convocatoria FROM licitaciones WHERE codigo_externo = :c"),
        {"c": f"{PREFIJO}E"},
    ).fetchone()
    assert fila[0] == "licitacion"


def test_el_mismo_codigo_repetido_en_la_misma_tanda(loader):
    """Mercado Público repite registros dentro de una misma respuesta.

    Medido contra la API: una consulta diaria trajo 1.289 registros con 1.265
    códigos distintos — doce repetidos tres veces. Un `ON CONFLICT DO UPDATE`
    no admite dos filas con la misma clave de conflicto en la misma sentencia
    («ON CONFLICT DO UPDATE command cannot affect row a second time»), y como
    el upsert va por tandas de 500, **un solo duplicado tiraba la tanda entera**.
    No se cargaba ni una licitación, y el error quedaba en un log que nadie mira:
    el resumen decía «0 new, 0 updated, 1285 errors» y el proceso terminaba con
    éxito.
    """
    assert loader.load_licitaciones([_fila("DUP"), _fila("DUP")]) == 1

    fila = loader.session.execute(
        text("SELECT count(*) FROM licitaciones WHERE codigo_externo = :c"),
        {"c": f"{PREFIJO}DUP"},
    ).fetchone()
    assert fila[0] == 1


def test_de_un_codigo_repetido_gana_la_ultima_version(loader):
    """Es lo que habría quedado aplicando las filas de a una."""
    loader.load_licitaciones(
        [
            _fila("DUP2", nombre="Versión vieja", estado="Publicada"),
            _fila("DUP2", nombre="Versión nueva", estado="Cerrada"),
        ]
    )

    fila = loader.session.execute(
        text("SELECT nombre, estado FROM licitaciones WHERE codigo_externo = :c"),
        {"c": f"{PREFIJO}DUP2"},
    ).fetchone()
    assert fila == ("Versión nueva", "Cerrada")


def test_un_duplicado_no_arrastra_a_las_demas(loader):
    """El fallo real no era perder la repetida: era perder la tanda entera."""
    cargadas = loader.load_licitaciones([_fila("F"), _fila("DUP3"), _fila("DUP3"), _fila("G")])
    assert cargadas == 3

    fila = loader.session.execute(
        text("SELECT count(*) FROM licitaciones WHERE codigo_externo LIKE :p"),
        {"p": f"{PREFIJO}%"},
    ).fetchone()
    assert fila[0] >= 3
