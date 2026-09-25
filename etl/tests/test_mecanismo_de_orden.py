"""El mecanismo de compra de una orden sale de su detalle.

El listado de órdenes no trae `Tipo`; el transformer lo buscaba ahí, así que
`tipo_oc` quedaba NULL en TODAS las órdenes (17.908 de 17.908 en la base de
desarrollo) y nada se veía como Compra Ágil, Convenio Marco ni Trato Directo.
Los detalles reales sí lo traen: `Tipo` en letras y `CodigoTipo` en número.
"""

from __future__ import annotations

import json
import os
from datetime import datetime

import pytest
from sqlalchemy import create_engine, text

from etl.loaders.database_loader_v2 import DatabaseLoaderV2

IN_CI = os.getenv("CI", "").lower() in ("1", "true")
PREFIJO = "TEST-MECANISMO-"


def _url() -> str:
    url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/licitaciones")
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


@pytest.fixture(scope="module")
def loader():
    try:
        engine = create_engine(_url(), pool_pre_ping=True)
        with engine.begin() as conn:
            conn.execute(text("SELECT 1 FROM ordenes_compra LIMIT 1"))
    except Exception as exc:
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos ({type(exc).__name__})")

    cargador = DatabaseLoaderV2({"DATABASE_URL": _url()})
    cargador.connect()
    try:
        yield cargador
    finally:
        for tabla in ("ordenes_compra_detalle", "ordenes_compra"):
            cargador.session.execute(
                text(f"DELETE FROM {tabla} WHERE codigo_oc LIKE :p"), {"p": f"{PREFIJO}%"}
            )
        cargador.session.commit()
        cargador.disconnect()
        engine.dispose()


def _orden_con_detalle(loader, sufijo: str, tipo: str, codigo_tipo: int) -> str:
    codigo = f"{PREFIJO}{sufijo}"
    (oid,) = loader.session.execute(
        text(
            "INSERT INTO ordenes_compra (codigo_oc, nombre, fecha_publicacion, monto_total) "
            "VALUES (:c, 'Orden de prueba', :f, 1000) RETURNING id"
        ),
        {"c": codigo, "f": datetime(2026, 9, 1)},
    ).one()
    detalle = {"Listado": [{"Codigo": codigo, "Tipo": tipo, "CodigoTipo": codigo_tipo}]}
    loader.session.execute(
        text(
            "INSERT INTO ordenes_compra_detalle (orden_compra_id, codigo_oc, hash_contenido, "
            "datos_completos, numero_actualizaciones) VALUES (:o, :c, 'h', CAST(:d AS jsonb), 1)"
        ),
        {"o": oid, "c": codigo, "d": json.dumps(detalle)},
    )
    loader.session.commit()
    return codigo


def test_las_ordenes_con_detalle_recuperan_su_mecanismo(loader):
    casos = {
        "AG": ("AG", 13, "compra_agil"),
        "CM": ("CM", 9, "convenio_marco"),
        "TD": ("TD", 16, "trato_directo"),
        "SE": ("SE", 8, None),
    }
    codigos = {k: _orden_con_detalle(loader, k, tipo, num) for k, (tipo, num, _) in casos.items()}

    loader.sincronizar_ordenes_desde_detalle()

    for clave, (_, num, esperado) in casos.items():
        tipo_oc, convocatoria = loader.session.execute(
            text("SELECT tipo_oc, tipo_convocatoria FROM ordenes_compra WHERE codigo_oc = :c"),
            {"c": codigos[clave]},
        ).one()
        assert tipo_oc == str(num)
        assert convocatoria == esperado, clave
