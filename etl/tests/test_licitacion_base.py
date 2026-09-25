"""Lo que sólo trae el detalle llega a `licitaciones`.

El listado de la API trae código, nombre, estado y cierre; el resto —fecha de
publicación, monto, comprador, región, ítems— vive en el detalle, que se
guardaba en `licitaciones_detalle` y no se copiaba a ningún sitio. Toda tarjeta
decía «Sin monto», los filtros por monto y región no encontraban nada y el panel
de BI de cada licitación respondía «organismo_id no disponible».

El payload de abajo es la forma REAL de un detalle (capturado en 2026-09, sin
los nombres de los funcionarios): fechas anidadas en `Fechas`, `FechaCierre`
plana presente pero nula, comprador en `Comprador`, ítems en `Items.Listado`.
"""

from __future__ import annotations

import copy
import json
import os
from datetime import datetime

import pytest
from sqlalchemy import create_engine, text

from etl.loaders.database_loader_v2 import DatabaseLoaderV2
from etl.utils.licitacion_base import campos_base_desde_detalle

IN_CI = os.getenv("CI", "").lower() in ("1", "true")
PREFIJO = "TEST-BASE-DETALLE-"

DETALLE_REAL = {
    "Cantidad": 1,
    "Version": "v1",
    "Listado": [
        {
            "CodigoExterno": "1057478-203-LE26",
            "Nombre": "ADQUISICIÓN DE INSUMOS PARA IMAGENOLOGÍA",
            "CodigoEstado": 5,
            "Estado": "Publicada",
            "Descripcion": "Que, este Hospital Clínico requiere la ADQUISICIÓN DE INSUMOS PARA IMAGENOLOGÍA ",
            "FechaCierre": None,
            "Tipo": "LE",
            "CodigoTipo": 1,
            "Moneda": "CLP",
            "MontoEstimado": 65000000.0,
            "VisibilidadMonto": 1,
            "Comprador": {
                "CodigoOrganismo": "7326",
                "NombreOrganismo": "SERV SALUD METROPOLITANO CENTRAL HOSPITAL CLINICO SAN BORJA ARRIARAN",
                "RutUnidad": "61.608.604-9",
                "CodigoUnidad": "1057049",
                "NombreUnidad": "Bienes y Servicios",
                "DireccionUnidad": "Santa Rosa 1234",
                "ComunaUnidad": "Santiago",
                "RegionUnidad": "Región Metropolitana de Santiago",
            },
            "Fechas": {
                "FechaCreacion": "2026-09-22T11:50:56.197",
                "FechaCierre": "2026-10-05T15:30:00",
                "FechaInicio": "2026-09-22T16:01:00",
                "FechaFinal": "2026-09-26T12:00:00",
                "FechaPublicacion": "2026-09-22T15:39:03.827",
                "FechaAdjudicacion": "2026-12-01T18:30:00",
            },
            "Items": {
                "Cantidad": 1,
                "Listado": [
                    {
                        "Correlativo": 1,
                        "CodigoProducto": 42181801,
                        "CodigoCategoria": "42181800",
                        "NombreProducto": "Unidades de oxímetros de pulso",
                        "Descripcion": "SATUROMETRO DESECH. INFANT ADHES. X10",
                        "UnidadMedida": "Unidad",
                        "Cantidad": 2.0,
                        "Adjudicacion": None,
                    }
                ],
            },
        }
    ],
}


# ── La traducción, sin base ──────────────────────────────────────────────────


def test_copia_lo_que_el_listado_no_trae():
    campos = campos_base_desde_detalle(DETALLE_REAL)

    assert campos["fecha_publicacion"] == datetime(2026, 9, 22, 15, 39, 3, 827000)
    assert campos["monto_estimado"] == 65_000_000.0
    assert campos["codigo_organismo"] == "7326"
    assert campos["nombre_organismo"].startswith("SERV SALUD METROPOLITANO CENTRAL")
    assert campos["rut_organismo"] == "61.608.604-9"
    assert campos["region"] == "Región Metropolitana de Santiago"
    assert campos["comuna"] == "Santiago"
    assert campos["tipo_licitacion"] == "LE"
    assert campos["descripcion"].startswith("Que, este Hospital")
    # El panel de BI busca `CodigoProducto` en una lista plana.
    assert campos["items"][0]["CodigoProducto"] == 42181801


def test_la_fecha_anidada_gana_a_la_plana_nula():
    """La `FechaCierre` de la raíz llega nula en las respuestas reales."""
    assert campos_base_desde_detalle(DETALLE_REAL)["fecha_cierre"] == datetime(2026, 10, 5, 15, 30)


def test_lo_que_no_viene_no_aparece():
    """Un monto oculto llega `null`: no debe pisar nada ni convertirse en $0."""
    oculto = copy.deepcopy(DETALLE_REAL)
    oculto["Listado"][0]["MontoEstimado"] = None
    oculto["Listado"][0]["VisibilidadMonto"] = 0
    del oculto["Listado"][0]["Comprador"]

    campos = campos_base_desde_detalle(oculto)

    assert "monto_estimado" not in campos
    assert "codigo_organismo" not in campos
    assert "region" not in campos


def test_un_codigo_de_organismo_numerico_se_guarda_como_texto():
    numerico = copy.deepcopy(DETALLE_REAL)
    numerico["Listado"][0]["Comprador"]["CodigoOrganismo"] = 7326
    assert campos_base_desde_detalle(numerico)["codigo_organismo"] == "7326"


def test_basura_no_revienta():
    assert campos_base_desde_detalle(None) == {}
    assert campos_base_desde_detalle({"Listado": []}) == {}


# ── Contra Postgres: el cargador lo aplica ───────────────────────────────────


def _url() -> str:
    url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/licitaciones")
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


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
        # El detalle primero: tiene FK a la licitación.
        for tabla in ("licitaciones_detalle", "licitaciones"):
            cargador.session.execute(
                text(f"DELETE FROM {tabla} WHERE codigo_externo LIKE :p"), {"p": f"{PREFIJO}%"}
            )
        cargador.session.commit()
        cargador.disconnect()
        engine.dispose()


def _licitacion_del_listado(loader, sufijo: str) -> tuple[int, str]:
    """Una licitación tal como la deja el listado: sin comprador, sin monto."""
    codigo = f"{PREFIJO}{sufijo}"
    loader.load_licitaciones(
        [
            {
                "codigo_externo": codigo,
                "nombre": "ADQUISICIÓN DE INSUMOS PARA IMAGENOLOGÍA",
                "fecha_publicacion": datetime(2026, 9, 24, 21, 34),  # la hora de ingesta
                "fecha_cierre": datetime(2026, 10, 5, 15, 30),
                "estado": "Publicada",
                "activo": True,
            }
        ]
    )
    (lid,) = loader.session.execute(
        text("SELECT id FROM licitaciones WHERE codigo_externo = :c"), {"c": codigo}
    ).one()
    return lid, codigo


def _fila(loader, codigo: str):
    return loader.session.execute(
        text(
            "SELECT codigo_organismo, monto_estimado, region, fecha_publicacion::date, "
            "jsonb_array_length(items) FROM licitaciones WHERE codigo_externo = :c"
        ),
        {"c": codigo},
    ).one()


def test_al_cargar_el_detalle_se_completa_la_licitacion(loader):
    lid, codigo = _licitacion_del_listado(loader, "A")

    assert loader.load_licitacion_detalle_inicial(lid, codigo, DETALLE_REAL)

    org, monto, region, publicada, n_items = _fila(loader, codigo)
    assert org == "7326"
    assert monto == 65_000_000
    assert region == "Región Metropolitana de Santiago"
    assert str(publicada) == "2026-09-22"  # la de la API, no la de ingesta
    assert n_items == 1


def test_las_ya_cargadas_se_reparan_sin_llamar_a_la_api(loader):
    """Las de antes del arreglo tienen detalle y la fila vacía, y su detalle —el
    de una licitación cerrada— no va a cambiar nunca para disparar la copia."""
    lid, codigo = _licitacion_del_listado(loader, "B")
    loader.session.execute(
        text(
            "INSERT INTO licitaciones_detalle "
            "(licitacion_id, codigo_externo, hash_contenido, datos_completos, numero_actualizaciones) "
            "VALUES (:lid, :c, 'h', CAST(:d AS jsonb), 1)"
        ),
        {"lid": lid, "c": codigo, "d": json.dumps(DETALLE_REAL)},
    )
    loader.session.commit()
    assert _fila(loader, codigo)[0] is None

    assert loader.sincronizar_licitaciones_desde_detalle() >= 1

    assert _fila(loader, codigo)[0] == "7326"
