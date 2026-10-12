"""La re-consulta impersonal de resultados, contra Postgres de verdad.

Por qué existe
--------------
La adjudicación (`fecha_adjudicacion`, `monto_adjudicado`,
`proveedor_adjudicado`, que el catálogo sirve) sólo se llenaba si aparecía
mientras la licitación seguía publicada: el detalle se pide una vez, con el
llamado abierto. La única re-consulta de cerradas miraba las SEGUIDAS por una
empresa y se fue con las cuentas (#125). Ahora el cron `frecuente` pregunta, una
vez al día y con tope, por cualquier cerrada reciente sin resultado.

Lo que se fija aquí es la selección —cerrada, reciente, sin resultado, no
desierta, sólo licitaciones, con rotación y con tope— y que la corrida escriba la
adjudicación y marque lo que preguntó.

Las fechas viven en 2031, lejos de cualquier dato real de la base de pruebas: la
consulta mira una ventana relativa a «ahora», y ese «ahora» se fija.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, text

from etl import main as etl_main
from etl.loaders import database_loader_v2
from etl.loaders.database_loader_v2 import DatabaseLoaderV2

IN_CI = os.getenv("CI", "").lower() in ("1", "true")

PREFIJO = "TEST-RECONSULTA-"
AHORA = datetime(2031, 6, 15, 12, 0, tzinfo=UTC)
REINTENTO = timedelta(days=3)


def _url() -> str:
    url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/licitaciones")
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


def _borrar(sesion) -> None:
    for tabla in ("licitaciones_historial", "licitaciones_detalle"):
        sesion.execute(
            text(
                f"DELETE FROM {tabla} WHERE licitacion_id IN "
                "(SELECT id FROM licitaciones WHERE codigo_externo LIKE :p)"
            ),
            {"p": f"{PREFIJO}%"},
        )
    sesion.execute(
        text("DELETE FROM licitaciones WHERE codigo_externo LIKE :p"), {"p": f"{PREFIJO}%"}
    )
    sesion.commit()


@pytest.fixture
def loader():
    try:
        engine = create_engine(_url(), pool_pre_ping=True)
        with engine.begin() as conn:
            conn.execute(text("SELECT resultado_consultado_en FROM licitaciones LIMIT 1"))
    except Exception as exc:
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos migrada ({type(exc).__name__}) — usa `make dev-up-d`")

    cargador = DatabaseLoaderV2({"DATABASE_URL": _url()})
    cargador.connect()
    _borrar(cargador.session)
    try:
        yield cargador
    finally:
        _borrar(cargador.session)
        cargador.disconnect()
        engine.dispose()


def _licitacion(
    loader,
    codigo: str,
    *,
    cerro_hace: timedelta,
    estado: str = "Cerrada",
    tipo: str = "licitacion",
    consultada_hace: timedelta | None = None,
    adjudicada: bool = False,
    con_detalle: bool = True,
) -> int:
    cierre = AHORA - cerro_hace
    loader.load_licitaciones(
        [
            {
                "codigo_externo": f"{PREFIJO}{codigo}",
                "nombre": f"Licitación {codigo}",
                "fecha_publicacion": cierre - timedelta(days=20),
                "fecha_cierre": cierre,
                "estado": estado,
                "tipo_convocatoria": tipo,
                "activo": True,
            }
        ]
    )
    licitacion_id = loader.session.execute(
        text("SELECT id FROM licitaciones WHERE codigo_externo = :c"),
        {"c": f"{PREFIJO}{codigo}"},
    ).scalar_one()
    if con_detalle:
        loader.load_licitacion_detalle_inicial(
            licitacion_id, f"{PREFIJO}{codigo}", {"Listado": [{"Estado": estado}]}
        )
    if adjudicada:
        loader.session.execute(
            text(
                "UPDATE licitaciones_detalle SET fecha_adjudicacion = :f WHERE licitacion_id = :i"
            ),
            {"f": cierre + timedelta(days=1), "i": licitacion_id},
        )
    if consultada_hace is not None:
        loader.marcar_resultado_consultado(licitacion_id, AHORA - consultada_hace)
    loader.session.commit()
    return licitacion_id


def _seleccion(loader, *, dias: int = 30, limite: int = 100) -> list[str]:
    filas = loader.licitaciones_cerradas_sin_resultado(
        dias=dias, limite=limite, reintento=REINTENTO, ahora=AHORA
    )
    return [codigo.removeprefix(PREFIJO) for _, codigo in filas]


# ── La selección ─────────────────────────────────────────────────────────────


def test_entran_las_cerradas_recientes_sin_resultado(loader):
    _licitacion(loader, "CON-DETALLE", cerro_hace=timedelta(days=5))
    _licitacion(loader, "SIN-DETALLE", cerro_hace=timedelta(days=6), con_detalle=False)
    assert sorted(_seleccion(loader)) == ["CON-DETALLE", "SIN-DETALLE"]


@pytest.mark.parametrize(
    "caso,kwargs",
    [
        ("adjudicada", {"cerro_hace": timedelta(days=5), "adjudicada": True}),
        ("antigua", {"cerro_hace": timedelta(days=31)}),
        ("abierta", {"cerro_hace": -timedelta(days=1), "estado": "Publicada"}),
        (
            "desierta",
            {"cerro_hace": timedelta(days=5), "estado": "Desierta (o se rechazan las ofertas)"},
        ),
        ("revocada", {"cerro_hace": timedelta(days=5), "estado": "Revocada"}),
        ("compra-agil", {"cerro_hace": timedelta(days=5), "tipo": "compra_agil"}),
        (
            "recien-consultada",
            {"cerro_hace": timedelta(days=5), "consultada_hace": timedelta(days=1)},
        ),
    ],
)
def test_no_entran(loader, caso, kwargs):
    _licitacion(loader, caso, **kwargs)
    assert _seleccion(loader) == []


def test_una_consultada_hace_tiempo_vuelve(loader):
    _licitacion(loader, "VUELVE", cerro_hace=timedelta(days=10), consultada_hace=timedelta(days=4))
    assert _seleccion(loader) == ["VUELVE"]


def test_tope_y_orden_las_nunca_consultadas_primero_y_las_mas_viejas(loader):
    _licitacion(
        loader, "YA-CONSULTADA", cerro_hace=timedelta(days=20), consultada_hace=timedelta(days=5)
    )
    _licitacion(loader, "RECIENTE", cerro_hace=timedelta(days=2))
    _licitacion(loader, "VIEJA", cerro_hace=timedelta(days=25))
    _licitacion(loader, "MEDIA", cerro_hace=timedelta(days=12))

    assert _seleccion(loader) == ["VIEJA", "MEDIA", "RECIENTE", "YA-CONSULTADA"]
    assert _seleccion(loader, limite=2) == ["VIEJA", "MEDIA"]


def test_un_listado_no_borra_la_marca(loader):
    """El upsert de los listados reescribe casi todo; la marca es sólo del cron."""
    _licitacion(loader, "MARCADA", cerro_hace=timedelta(days=5), consultada_hace=timedelta(days=1))
    _licitacion(loader, "MARCADA", cerro_hace=timedelta(days=5))  # vuelve en un listado
    marca = loader.session.execute(
        text("SELECT resultado_consultado_en FROM licitaciones WHERE codigo_externo = :c"),
        {"c": f"{PREFIJO}MARCADA"},
    ).scalar_one()
    assert marca is not None


# ── La corrida ───────────────────────────────────────────────────────────────


class _ExtractorFalso:
    def __init__(self, _config):
        pass

    def extract_detalle_licitacion(self, codigo):
        if codigo.endswith("FALLA"):
            return None
        return {
            "Listado": [
                {
                    "FechaAdjudicacion": "2031-06-10T00:00:00",
                    "Estado": "Adjudicada",
                    "Items": {
                        "Cantidad": 1,
                        "Listado": [
                            {
                                "Correlativo": 1,
                                "Adjudicacion": {
                                    "RutProveedor": "76543210-3",
                                    "NombreProveedor": "PYME GANADORA SPA",
                                    "CantidadAdjudicada": 1,
                                    "MontoUnitario": 900_000,
                                },
                            }
                        ],
                    },
                }
            ]
        }


@pytest.fixture
def corrida(loader, monkeypatch):
    monkeypatch.setattr(etl_main, "MercadoPublicoLicitacionesExtractor", _ExtractorFalso)
    monkeypatch.setattr(etl_main.config, "DATABASE_URL", _url())
    monkeypatch.setattr(etl_main.time, "sleep", lambda _s: None)
    monkeypatch.setattr(etl_main, "now_santiago", lambda: AHORA)
    monkeypatch.setattr(database_loader_v2, "now_santiago", lambda: AHORA)
    return lambda: etl_main.run_etl_resultados_licitaciones(
        dias=30, limite=100, reintento=REINTENTO
    )


def test_la_corrida_escribe_la_adjudicacion_y_marca_lo_preguntado(loader, corrida):
    gana = _licitacion(loader, "GANA", cerro_hace=timedelta(days=5))
    falla = _licitacion(loader, "FALLA", cerro_hace=timedelta(days=5))

    assert corrida() is True

    filas = dict(
        loader.session.execute(
            text(
                "SELECT l.id, d.monto_adjudicado FROM licitaciones l "
                "LEFT JOIN licitaciones_detalle d ON d.licitacion_id = l.id "
                "WHERE l.codigo_externo LIKE :p"
            ),
            {"p": f"{PREFIJO}%"},
        ).all()
    )
    assert filas[gana] == "900000"
    assert filas[falla] is None
    marcas = loader.session.execute(
        text(
            "SELECT count(*) FROM licitaciones WHERE codigo_externo LIKE :p AND resultado_consultado_en = :a"
        ),
        {"p": f"{PREFIJO}%", "a": AHORA},
    ).scalar_one()
    # También la que falló: si no, se pediría cada día por delante de las demás.
    assert marcas == 2
    # Y ya no vuelven a la cola hasta el reintento.
    assert _seleccion(loader) == []


def test_si_fallan_todas_la_corrida_falla(loader, corrida):
    """API caída o cuota agotada: lo tiene que ver el latido."""
    _licitacion(loader, "SOLA-FALLA", cerro_hace=timedelta(days=5))
    assert corrida() is False


def test_sin_pendientes_la_corrida_es_buena(loader, corrida):
    assert corrida() is True
