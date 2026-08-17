"""El productor del resultado, contra Postgres de verdad.

Por qué existe
--------------
PR #76 escribió todo el consumidor del resultado de una licitación —
`services/resultados.py`, alertas, correo, 19 tests— sobre tres columnas de
`licitaciones_detalle` (`fecha_adjudicacion`, `monto_adjudicado`,
`proveedor_adjudicado`) que **nada llenaba nunca**. `detectar_resultados()`
filtraba por `fecha_adjudicacion IS NOT NULL` y siempre estaba vacío: el job
diario registraba "0 detectados" para siempre. Peor,
`query_licitaciones_seguidas_sin_resultado` filtraba por
`fecha_adjudicacion IS NULL`, que era eternamente verdadero, así que **cada
licitación seguida y cerrada se volvía a pedir a la API de Mercado Público
cada día, para siempre**, gastando una cuota que el propio PR describe como
escasa.

Los 19 tests existentes no lo agarraron porque construían `LicitacionDetalle`
a mano con esas columnas ya pobladas: probaban al consumidor contra un
productor de mentira. Éste es el test que faltaba: que
`actualizar_licitacion_detalle` (el único método que llama el camino
`--only-resultados`) realmente escriba las tres columnas, y que la licitación
salga de la cola de re-consulta una vez que lo hace.
"""

from __future__ import annotations

import os
import uuid
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
        # Orden que respeta las FK: postulaciones/empresas e
        # historial/detalle antes que licitaciones.
        cargador.session.execute(
            text(
                "DELETE FROM postulaciones WHERE licitacion_id IN "
                "(SELECT id FROM licitaciones WHERE codigo_externo LIKE :p)"
            ),
            {"p": f"{PREFIJO}%"},
        )
        cargador.session.execute(
            text("DELETE FROM empresas WHERE nombre_empresa LIKE :p"), {"p": f"{PREFIJO}%"}
        )
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


def _seguir(loader, licitacion_id: int, codigo: str) -> None:
    """Una empresa + una postulación: lo mínimo para que la licitación entre
    en `query_licitaciones_seguidas_sin_resultado`, que filtra por
    `licitaciones.id IN (SELECT licitacion_id FROM postulaciones)`."""
    empresa_id = uuid.uuid4()
    loader.session.execute(
        text("INSERT INTO empresas (id, rut_empresa, nombre_empresa) VALUES (:id, :rut, :nombre)"),
        {"id": str(empresa_id), "rut": f"{codigo}-K"[:12], "nombre": f"{PREFIJO}{codigo}"},
    )
    loader.session.execute(
        text(
            "INSERT INTO postulaciones (id, empresa_id, licitacion_id, estado) "
            "VALUES (:id, :empresa_id, :licitacion_id, 'en_seguimiento')"
        ),
        {"id": str(uuid.uuid4()), "empresa_id": str(empresa_id), "licitacion_id": licitacion_id},
    )
    loader.session.commit()


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
    """`actualizar_licitacion_detalle` es el único método que llama el camino
    `--only-resultados` (ver `run_etl_resultados_licitaciones` en `main.py`).
    Si esto no escribe las tres columnas, nada en el sistema lo hace."""

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


class TestLaColaDeReconsultaSeCierra:
    """El defecto original en una frase: `fecha_adjudicacion IS NULL` era
    eternamente verdadero, así que esta consulta nunca se vaciaba."""

    def test_una_licitacion_sin_adjudicar_esta_en_la_cola(self, loader):
        licitacion_id = _crear_licitacion(
            loader, "C", fecha_cierre=datetime.now(UTC) - timedelta(days=5)
        )
        loader.load_licitacion_detalle_inicial(
            licitacion_id, f"{PREFIJO}C", {"Listado": [{"Estado": "Cerrada"}]}
        )
        _seguir(loader, licitacion_id, "C")

        pendientes = {fila[0] for fila in loader.query_licitaciones_seguidas_sin_resultado()}
        assert licitacion_id in pendientes

    def test_tras_producir_el_resultado_sale_de_la_cola(self, loader):
        """La prueba directa de que el ciclo se cierra: antes de este fix, esta
        licitación se habría vuelto a pedir a la API cada día, para siempre."""
        licitacion_id = _crear_licitacion(
            loader, "D", fecha_cierre=datetime.now(UTC) - timedelta(days=5)
        )
        loader.load_licitacion_detalle_inicial(
            licitacion_id, f"{PREFIJO}D", {"Listado": [{"Estado": "Cerrada"}]}
        )
        _seguir(loader, licitacion_id, "D")

        pendientes_antes = {fila[0] for fila in loader.query_licitaciones_seguidas_sin_resultado()}
        assert licitacion_id in pendientes_antes

        loader.actualizar_licitacion_detalle(
            licitacion_id=licitacion_id,
            codigo_externo=f"{PREFIJO}D",
            datos_nuevos=_payload_adjudicado("22222222-2", "TERCERA PYME SPA", 800_000),
        )

        pendientes_despues = {
            fila[0] for fila in loader.query_licitaciones_seguidas_sin_resultado()
        }
        assert licitacion_id not in pendientes_despues

    def test_una_adjudicacion_reciente_sigue_en_la_cola_por_si_se_corrige(self, loader):
        """Ventana de reconsideración: ChileCompra puede revocar y volver a
        adjudicar. Si saliera de la cola de inmediato, una corrección nunca
        llegaría a `licitaciones_detalle`."""
        licitacion_id = _crear_licitacion(
            loader, "E", fecha_cierre=datetime.now(UTC) - timedelta(days=5)
        )
        loader.load_licitacion_detalle_inicial(
            licitacion_id, f"{PREFIJO}E", {"Listado": [{"Estado": "Cerrada"}]}
        )
        _seguir(loader, licitacion_id, "E")
        loader.actualizar_licitacion_detalle(
            licitacion_id=licitacion_id,
            codigo_externo=f"{PREFIJO}E",
            datos_nuevos=_payload_adjudicado("33333333-3", "CUARTA PYME SPA", 100_000),
        )
        loader.session.execute(
            text(
                "UPDATE licitaciones_detalle SET fecha_adjudicacion = :f WHERE licitacion_id = :id"
            ),
            {"f": datetime.now(UTC) - timedelta(days=10), "id": licitacion_id},
        )
        loader.session.commit()

        pendientes = {fila[0] for fila in loader.query_licitaciones_seguidas_sin_resultado()}
        assert licitacion_id in pendientes

    def test_una_adjudicacion_antigua_ya_no_se_reconsidera(self, loader):
        """Pasada la ventana, sale de la cola y no vuelve — la contrapartida
        deliberada de mantener esto acotado en vez de otra vez ilimitado."""
        licitacion_id = _crear_licitacion(
            loader, "F", fecha_cierre=datetime.now(UTC) - timedelta(days=90)
        )
        loader.load_licitacion_detalle_inicial(
            licitacion_id, f"{PREFIJO}F", {"Listado": [{"Estado": "Cerrada"}]}
        )
        _seguir(loader, licitacion_id, "F")
        loader.actualizar_licitacion_detalle(
            licitacion_id=licitacion_id,
            codigo_externo=f"{PREFIJO}F",
            datos_nuevos=_payload_adjudicado("44444444-4", "QUINTA PYME SPA", 100_000),
        )
        loader.session.execute(
            text(
                "UPDATE licitaciones_detalle SET fecha_adjudicacion = :f WHERE licitacion_id = :id"
            ),
            {"f": datetime.now(UTC) - timedelta(days=60), "id": licitacion_id},
        )
        loader.session.commit()

        pendientes = {fila[0] for fila in loader.query_licitaciones_seguidas_sin_resultado()}
        assert licitacion_id not in pendientes
