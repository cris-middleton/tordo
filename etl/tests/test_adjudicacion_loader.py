"""Que el loader escriba el resultado de una licitación, contra Postgres de verdad.

`actualizar_licitacion_detalle` llena las tres columnas de adjudicación de
`licitaciones_detalle` (`fecha_adjudicacion`, `monto_adjudicado`,
`proveedor_adjudicado`), y el catálogo público las sirve (`schemas/tender.py`).

Este test vivía en `test_resultado_producer.py`, junto con el de la cola de
re-consulta de licitaciones SEGUIDAS. La cola se fue con las cuentas (no hay a
quién seguir); el productor de las columnas se queda, y su test con él.

Hubo un tiempo en que nada llenaba esas columnas y los tests no lo vieron porque
construían `LicitacionDetalle` a mano con ellas ya pobladas: probaban al
consumidor contra un productor de mentira.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, text

from etl.loaders.database_loader_v2 import DatabaseLoaderV2

IN_CI = os.getenv("CI", "").lower() in ("1", "true")

PREFIJO = "TEST-RESULTADO-"


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
        # Historial y detalle antes que licitaciones, por las FK.
        cargador.session.execute(
            text(
                "DELETE FROM licitaciones_historial WHERE licitacion_id IN "
                "(SELECT id FROM licitaciones WHERE codigo_externo LIKE :p)"
            ),
            {"p": f"{PREFIJO}%"},
        )
        cargador.session.execute(
            text(
                "DELETE FROM licitaciones_detalle WHERE licitacion_id IN "
                "(SELECT id FROM licitaciones WHERE codigo_externo LIKE :p)"
            ),
            {"p": f"{PREFIJO}%"},
        )
        cargador.session.execute(
            text("DELETE FROM licitaciones WHERE codigo_externo LIKE :p"), {"p": f"{PREFIJO}%"}
        )
        cargador.session.commit()
        cargador.disconnect()
        engine.dispose()


def _crear_licitacion(loader, codigo: str, *, fecha_cierre: datetime) -> int:
    loader.load_licitaciones(
        [
            {
                "codigo_externo": f"{PREFIJO}{codigo}",
                "nombre": f"Licitación {codigo}",
                "descripcion": "Descripción de prueba",
                "fecha_publicacion": fecha_cierre - timedelta(days=30),
                "fecha_cierre": fecha_cierre,
                "estado": "Cerrada",
                "activo": True,
            }
        ]
    )
    fila = loader.session.execute(
        text("SELECT id FROM licitaciones WHERE codigo_externo = :c"),
        {"c": f"{PREFIJO}{codigo}"},
    ).fetchone()
    return fila[0]


def _payload_adjudicado(rut: str, nombre: str, monto_unitario: float) -> dict:
    return {
        "Listado": [
            {
                "FechaAdjudicacion": "2026-03-15T00:00:00",
                "Estado": "Adjudicada",
                "Items": {
                    "Cantidad": 1,
                    "Listado": [
                        {
                            "Correlativo": 1,
                            "Adjudicacion": {
                                "RutProveedor": rut,
                                "NombreProveedor": nombre,
                                "CantidadAdjudicada": 1,
                                "MontoUnitario": monto_unitario,
                            },
                        }
                    ],
                },
            }
        ]
    }


class TestElProductorEscribeLasTresColumnas:
    """Si `actualizar_licitacion_detalle` no escribe las tres columnas, nada en
    el sistema lo hace — y el catálogo las sirve."""

    def test_una_licitacion_recien_adjudicada_queda_con_las_tres_columnas(self, loader):
        licitacion_id = _crear_licitacion(
            loader, "A", fecha_cierre=datetime.now(UTC) - timedelta(days=5)
        )
        loader.load_licitacion_detalle_inicial(
            licitacion_id, f"{PREFIJO}A", {"Listado": [{"Estado": "Publicada"}]}
        )

        cambio = loader.actualizar_licitacion_detalle(
            licitacion_id=licitacion_id,
            codigo_externo=f"{PREFIJO}A",
            datos_nuevos=_payload_adjudicado("76543210-3", "PYME GANADORA SPA", 1_500_000),
        )

        assert cambio is True
        fila = loader.session.execute(
            text(
                "SELECT fecha_adjudicacion, monto_adjudicado, proveedor_adjudicado "
                "FROM licitaciones_detalle WHERE licitacion_id = :id"
            ),
            {"id": licitacion_id},
        ).fetchone()
        assert fila[0] is not None
        assert fila[1] == "1500000"
        assert "PYME GANADORA SPA" in fila[2]
        assert "76543210-3" in fila[2]

    def test_sin_detalle_previo_load_licitacion_detalle_inicial_tambien_escribe(self, loader):
        """`actualizar_licitacion_detalle` cae en `load_licitacion_detalle_inicial`
        cuando no hay detalle todavía — ese camino también debe llenar las
        tres columnas, no sólo el de actualización."""
        licitacion_id = _crear_licitacion(
            loader, "B", fecha_cierre=datetime.now(UTC) - timedelta(days=5)
        )

        cambio = loader.actualizar_licitacion_detalle(
            licitacion_id=licitacion_id,
            codigo_externo=f"{PREFIJO}B",
            datos_nuevos=_payload_adjudicado("11111111-1", "OTRA PYME SPA", 500_000),
        )

        assert cambio is True
        fila = loader.session.execute(
            text(
                "SELECT fecha_adjudicacion, monto_adjudicado FROM licitaciones_detalle "
                "WHERE licitacion_id = :id"
            ),
            {"id": licitacion_id},
        ).fetchone()
        assert fila[0] is not None
        assert fila[1] == "500000"
