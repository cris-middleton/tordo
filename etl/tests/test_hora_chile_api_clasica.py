"""Las fechas de la API clásica de licitaciones son hora de Chile.

La API clásica manda sus fechas sin zona («2026-10-20T15:00:00») y son hora de
pared de Santiago. El transformador las devolvía **ingenuas**, y una fecha
ingenua que llega a una columna `timestamptz` se lee en la zona de la sesión de
Postgres, que es UTC: cada cierre quedaba guardado 3 h antes en horario de
verano y 4 h antes en invierno. Una licitación que cerraba a las 15:00 salía
cerrada a mediodía en el catálogo, en `esta_abierta()` y en el RSS.

Compra Ágil ya lo había sufrido y arreglado en su transformador (spec del pivote
§6.1). Las dos APIs leen ahora con la misma función, `en_hora_de_chile`.

**El día del cambio de hora** se resuelve con `zoneinfo` y `fold=0`, como
`inicio_del_dia()` y la Compra Ágil:

- la hora que no existe (2026-09-06, de 00:00 a 00:59) se lee con el desfase
  de antes del salto (-04): 00:30 es 04:30 UTC, lo que el reloj marcó como 01:30;
- la hora repetida (2027-04-03, de 23:00 a 23:59) se lee como la **primera**
  vez (-03): 23:30 es 02:30 UTC. Ante la duda, el cierre más temprano: el sitio
  nunca dice que sigue abierta una licitación que ya cerró.

En los dos casos el error posible es de una hora, en una franja de madrugada en
la que ChileCompra casi no cierra nada.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, text

from etl.loaders.database_loader_v2 import DatabaseLoaderV2
from etl.transformers.licitacion_transformer import LicitacionTransformer
from etl.utils.adjudicacion import extraer_datos_adjudicacion
from etl.utils.licitacion_base import campos_base_desde_detalle

IN_CI = os.getenv("CI", "").lower() in ("1", "true")
PREFIJO = "TEST-HORA-CHILE-"


def _utc(*partes: int) -> datetime:
    return datetime(*partes, tzinfo=UTC)


def _cierre(texto: str) -> datetime:
    """Lo que hace el transformador con una `FechaCierre` del listado."""
    fila = LicitacionTransformer().transform(
        {"CodigoExterno": "1-1-LE26", "Nombre": "Prueba", "FechaCierre": texto}
    )
    return fila["fecha_cierre"]


# ── El transformador del listado ─────────────────────────────────────────────


def test_un_cierre_de_octubre_es_hora_de_verano():
    """Octubre: Chile en -03. Las 15:00 de Santiago son las 18:00 UTC."""
    cierre = _cierre("2026-10-20T15:00:00")
    assert cierre.tzinfo is not None
    assert cierre == _utc(2026, 10, 20, 18, 0)


def test_un_cierre_de_junio_es_hora_de_invierno():
    """Junio: Chile en -04. Las 15:00 de Santiago son las 19:00 UTC."""
    assert _cierre("2026-06-20T15:00:00") == _utc(2026, 6, 20, 19, 0)


def test_todas_las_fechas_del_listado_llevan_zona():
    fila = LicitacionTransformer().transform(
        {
            "CodigoExterno": "1-1-LE26",
            "Nombre": "Prueba",
            "FechaPublicacion": "2026-10-01T09:30:00.250",
            "FechaCierre": "2026-10-20 15:00:00",
            "FechaInicio": "2026-10-02",
            "FechaFinal": "20/10/2026",
        }
    )
    assert fila["fecha_publicacion"] == _utc(2026, 10, 1, 12, 30, 0, 250000)
    assert fila["fecha_cierre"] == _utc(2026, 10, 20, 18, 0)
    # Una fecha sin hora es la medianoche DE CHILE.
    assert fila["fecha_inicio"] == _utc(2026, 10, 2, 3, 0)
    assert fila["fecha_final"] == _utc(2026, 10, 20, 3, 0)


def test_basura_sigue_siendo_none():
    assert _cierre("no es una fecha") is None
    assert _cierre("") is None


# ── El día del cambio de hora ────────────────────────────────────────────────


def test_la_hora_que_no_existe_se_lee_con_el_desfase_de_antes():
    """2026-09-06: a las 00:00 el reloj salta a la 01:00. 00:30 no existe."""
    assert _cierre("2026-09-06T00:30:00") == _utc(2026, 9, 6, 4, 30)
    # Alrededor, cada hora es la que es.
    assert _cierre("2026-09-05T23:30:00") == _utc(2026, 9, 6, 3, 30)
    assert _cierre("2026-09-06T01:30:00") == _utc(2026, 9, 6, 4, 30)


def test_la_hora_repetida_es_la_primera_vez():
    """2027-04-04: a las 00:00 el reloj vuelve a las 23:00 del día 3, así que
    las 23:30 del 3 de abril pasan dos veces. Se toma la primera (-03)."""
    assert _cierre("2027-04-03T23:30:00") == _utc(2027, 4, 4, 2, 30)
    assert _cierre("2027-04-03T22:30:00") == _utc(2027, 4, 4, 1, 30)
    assert _cierre("2027-04-04T00:30:00") == _utc(2027, 4, 4, 4, 30)


# ── El detalle y el resultado ────────────────────────────────────────────────

DETALLE = {
    "Listado": [
        {
            "CodigoExterno": "1-1-LE26",
            "Fechas": {
                "FechaPublicacion": "2026-09-22T15:39:03.827",
                "FechaCierre": "2026-10-20T15:00:00",
                "FechaAdjudicacion": "2026-12-01T18:30:00",
            },
        }
    ]
}


def test_el_detalle_copia_las_fechas_con_zona():
    campos = campos_base_desde_detalle(DETALLE)
    assert campos["fecha_cierre"] == _utc(2026, 10, 20, 18, 0)
    assert campos["fecha_publicacion"] == _utc(2026, 9, 22, 18, 39, 3, 827000)


def test_la_fecha_de_adjudicacion_lleva_zona():
    """Diciembre: horario de verano, -03."""
    resultado = extraer_datos_adjudicacion(DETALLE["Listado"][0])
    assert resultado["fecha_adjudicacion"] == _utc(2026, 12, 1, 21, 30)


# ── Contra Postgres: lo que queda guardado ───────────────────────────────────


def _url() -> str:
    url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/licitaciones")
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


@pytest.fixture(scope="module")
def url_base():
    try:
        engine = create_engine(_url(), pool_pre_ping=True)
        with engine.begin() as conn:
            conn.execute(text("SELECT 1 FROM licitaciones LIMIT 1"))
    except Exception as exc:
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos ({type(exc).__name__}) — usa `make dev-up-d`")
    try:
        yield _url()
    finally:
        with engine.begin() as conn:
            for tabla in ("licitaciones_detalle", "licitaciones"):
                conn.execute(
                    text(f"DELETE FROM {tabla} WHERE codigo_externo LIKE :p"), {"p": f"{PREFIJO}%"}
                )
        engine.dispose()


def _con_zona(url: str, zona: str) -> str:
    """La misma base, con otra zona en la sesión (parámetro `options` de libpq)."""
    separador = "&" if "?" in url else "?"
    return f"{url}{separador}options=-c%20TimeZone%3D{zona.replace('/', '%2F')}"


@pytest.mark.parametrize("zona_sesion", ["UTC", "America/Santiago", "Asia/Tokyo"])
def test_el_cierre_se_guarda_como_las_15_de_santiago(url_base, zona_sesion):
    """Lo guardado no depende de la zona de la sesión de Postgres. Con una fecha
    ingenua, sí: en una sesión UTC (la de producción) quedaba a las 15:00 UTC."""
    codigo = f"{PREFIJO}{zona_sesion.replace('/', '-')}"
    fila = LicitacionTransformer().transform(
        {
            "CodigoExterno": codigo,
            "Nombre": "Prueba de hora",
            "FechaCierre": "2026-10-20T15:00:00",
            "Estado": "Publicada",
        }
    )
    with DatabaseLoaderV2({"DATABASE_URL": _con_zona(url_base, zona_sesion)}) as loader:
        (zona_vista,) = loader.session.execute(text("SHOW TimeZone")).one()
        assert zona_vista == zona_sesion
        loader.load_licitaciones([fila])

    engine = create_engine(url_base)
    with engine.connect() as conn:
        en_utc, en_chile = conn.execute(
            text(
                "SELECT fecha_cierre AT TIME ZONE 'UTC', "
                "fecha_cierre AT TIME ZONE 'America/Santiago' "
                "FROM licitaciones WHERE codigo_externo = :c"
            ),
            {"c": codigo},
        ).one()
    engine.dispose()
    assert en_utc == datetime(2026, 10, 20, 18, 0)
    assert en_chile == datetime(2026, 10, 20, 15, 0)
