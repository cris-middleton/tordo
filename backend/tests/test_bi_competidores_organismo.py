"""Los competidores de un organismo y el panel de una licitación.

Tres fallos de la auditoría de BI (2026-10-21), cada uno con su caso:

- **`rank_monto` con decimales tumbaba la respuesta.** El ETL rankeaba con el
  método por defecto de Polars (`average`): dos empatados en el 2.º puesto
  salían con 2,5, y `Competidor.rank_monto: int` lo rechazaba con un 500 en
  `/bi/competidores/{org}?rubro=` y en el panel de la licitación. El fixture del
  golden tiene seis filas así (115167 en «Servicios de recursos humanos»).
- **Sin rubro, los «competidores» eran los primeros de rubros cualesquiera.**
  Se ordenaban todas las filas del organismo por `rank_monto`, así que salían
  los n.º 1 de cinco rubros, cada uno con la cuota de SU rubro, bajo «parte de
  lo que compra este organismo»; y el HHI era el de la primera fila de
  concentración, de un rubro arbitrario.
- **El panel no buscaba precios sin organismo**, y la Compra Ágil no trae
  código de organismo: la sección de precios salía vacía para la mitad del
  catálogo, aunque L0N, L2 y L3 no lo necesitan.
"""

from __future__ import annotations

import pytest
import pytest_asyncio

from app.config import settings
from app.core.versionado import PREFIJO_API
from app.repositories import analytics_sync as repo
from app.schemas.bi import Competidor, CompetidoresResponse, LicitacionBIPanel
from app.services.bi import competencia, comprador, panel, precio, temporal
from tests.analytics_en_memoria import AnalyticsEnMemoria

ORG = "7084"


# ── rank_monto ───────────────────────────────────────────────────────────────


@pytest.mark.parametrize(("rango", "puesto"), [(2.5, 2), (3.5, 3), (1.0, 1), (4, 4), (None, None)])
def test_un_rango_con_decimales_se_lee_como_el_puesto_compartido(rango, puesto):
    assert Competidor(rank_monto=rango).rank_monto == puesto


def test_la_respuesta_valida_con_un_empate_de_las_tablas_ya_materializadas():
    """Lo que devuelve el servicio con una tabla materializada antes del arreglo
    del ETL: la validación de la respuesta (lo que FastAPI hace con
    `response_model`) ya no revienta."""
    cuerpo = CompetidoresResponse.model_validate(
        {
            "disponible": True,
            "competidores": [{"NombreProveedor": "Empatado", "rank_monto": 3.5}],
        }
    )
    assert cuerpo.competidores[0].rank_monto == 3


@pytest_asyncio.fixture
async def cliente(async_db):
    from httpx import ASGITransport, AsyncClient

    from app.db import get_db
    from app.main import app

    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_por_http_un_mercado_con_empate_responde_200(cliente, monkeypatch):
    """El fallo real, sobre el fixture del golden materializado en Postgres: las
    filas con `rank_monto` 3,5 están en la tabla tal cual."""
    repo.invalidar_cache_existencia()
    if not repo.existe_tabla("competitors_by_market", usar_cache=False):
        pytest.skip("el esquema analytics no está materializado")
    monkeypatch.setattr(settings, "feature_analytics", True)

    r = await cliente.get(
        f"{PREFIJO_API}/bi/competidores/115167",
        params={"rubro": "Servicios de recursos humanos"},
    )

    assert r.status_code == 200, r.text
    rangos = [c["rank_monto"] for c in r.json()["competidores"]]
    assert 3 in rangos
    assert all(isinstance(x, int) for x in rangos)


# ── Sin rubro: todo lo que compra el organismo ───────────────────────────────


def _fila(rubro: str, proveedor: str, nombre: str, monto: float, n_oc: int, rango: float) -> dict:
    return {
        "CodigoOrganismoPublico": ORG,
        "OrganismoPublico": "HOSPITAL DE PRUEBA",
        "RubroN2": rubro,
        "CodigoProveedor": proveedor,
        "NombreProveedor": nombre,
        "n_oc": n_oc,
        "monto_total": monto,
        "market_share_pct": None,
        "win_rate_pct": None,
        "rank_monto": rango,
        "n_proveedores": 2,
        "ventana_desde": "2023-11-01",
        "ventana_hasta": "2026-10-20",
    }


#: Un hospital que compra en dos rubros:
#:
#:   Aseo      A 100, B 100       (empate: rango 1,5 y 1,5)
#:   Insumos   C 700, A 100
#:
#: Por proveedor: C 700 (70 %), A 200 (20 %), B 100 (10 %), sobre 1.000.
#: HHI = 70² + 20² + 10² = 4.900 + 400 + 100 = 5.400 → concentrado.
#: El código viejo ordenaba por `rank_monto` y devolvía A y B de Aseo (rango
#: 1,5) con el 50 % cada uno, antes que C, que es quien más le vende.
FILAS = [
    _fila("Aseo", "A", "ASEO A SPA", 100.0, 5, 1.5),
    _fila("Aseo", "B", "LIMPIA B LTDA", 100.0, 5, 1.5),
    _fila("Insumos", "C", "INSUMOS C SA", 700.0, 2, 1.0),
    _fila("Insumos", "A", "ASEO A SPA", 100.0, 8, 2.0),
]


@pytest.fixture
def datos(monkeypatch) -> AnalyticsEnMemoria:
    d = AnalyticsEnMemoria()
    d["competitors_by_market.parquet"] = FILAS
    d["market_concentration.parquet"] = [
        {
            "CodigoOrganismoPublico": ORG,
            "RubroN2": "Aseo",
            "hhi": 5000.0,
            "tipo_mercado": "concentrado",
            "n_proveedores": 2,
        },
        {
            "CodigoOrganismoPublico": ORG,
            "RubroN2": "Insumos",
            "hhi": 6800.0,
            "tipo_mercado": "concentrado",
            "n_proveedores": 2,
        },
    ]
    d.instalar(monkeypatch, competencia, comprador, precio, temporal)
    return d


def test_sin_rubro_agrega_por_proveedor_sobre_todo_el_organismo(datos):
    r = competencia.get_competidores(ORG, top_n=5)

    filas = [
        (c["NombreProveedor"], round(c["market_share_pct"], 6), c["rank_monto"])
        for c in r["competidores"]
    ]
    assert filas == [("INSUMOS C SA", 70.0, 1), ("ASEO A SPA", 20.0, 2), ("LIMPIA B LTDA", 10.0, 3)]
    # Las cuotas son de un mismo total: suman 100.
    assert sum(c["market_share_pct"] for c in r["competidores"]) == pytest.approx(100.0)
    # Cuota por órdenes del organismo: A tiene 13 de 20.
    a = next(c for c in r["competidores"] if c["CodigoProveedor"] == "A")
    assert a["n_oc"] == 13
    assert a["win_rate_pct"] == pytest.approx(65.0)
    assert {c["RubroN2"] for c in r["competidores"]} == {None}
    assert {c["n_proveedores"] for c in r["competidores"]} == {3}


def test_sin_rubro_el_hhi_es_el_de_esas_cuotas(datos):
    conc = competencia.get_competidores(ORG)["concentracion"]

    assert len(conc) == 1
    assert conc[0]["RubroN2"] is None
    assert conc[0]["hhi"] == pytest.approx(5400.0)
    assert conc[0]["tipo_mercado"] == "concentrado"
    assert conc[0]["n_proveedores"] == 3


def test_sin_rubro_respeta_top_n_y_lleva_periodo(datos):
    r = competencia.get_competidores(ORG, top_n=1)

    assert [c["CodigoProveedor"] for c in r["competidores"]] == ["C"]
    assert r["periodo"] == {"desde": "2023-11-01", "hasta": "2026-10-20"}


def test_con_rubro_sigue_siendo_ese_mercado(datos):
    r = competencia.get_competidores(ORG, rubro="Insumos")

    assert [c["CodigoProveedor"] for c in r["competidores"]] == ["C", "A"]
    assert [c["RubroN2"] for c in r["concentracion"]] == ["Insumos"]


def test_un_organismo_sin_filas_lo_dice(datos):
    r = competencia.get_competidores("999")
    assert r == {"disponible": False, "motivo": "organismo no encontrado en histórico"}


def test_el_panel_muestra_los_del_organismo_con_su_hhi(datos):
    r = panel.get_licitacion_panel("1-1-LE26", organismo_id=ORG)

    c = r["competidores"]
    assert [x["NombreProveedor"] for x in c["top5"]] == [
        "INSUMOS C SA",
        "ASEO A SPA",
        "LIMPIA B LTDA",
    ]
    assert c["hhi"] == pytest.approx(5400.0)
    assert c["tipo_mercado"] == "concentrado"
    LicitacionBIPanel.model_validate(r)


# ── Panel: precios sin organismo ─────────────────────────────────────────────


def test_sin_organismo_el_panel_busca_precios_igual(datos):
    """Compra Ágil: sin código de organismo. L3 no lo necesita."""
    datos["product_price_bands_L3.parquet"] = [
        {
            "codigoProductoONU": "44121700",
            "NombreroductoGenerico": "Instrumentos de escritura",
            "UnidadMedida": "Unidad",
            "p10": 100.0,
            "p25": 150.0,
            "p50": 200.0,
            "p75": 250.0,
            "p90": 300.0,
            "n": 40,
            "confianza": 0.7,
        }
    ]

    r = panel.get_licitacion_panel("1-2-COT26", organismo_id=None, product_codes=["44121700"])

    assert r["precios"] == [
        {
            "disponible": True,
            "codigo_producto": "44121700",
            "nivel_usado": "L3",
            "fallback": True,
            "p10": 100.0,
            "p25": 150.0,
            "p50": 200.0,
            "p75": 250.0,
            "p90": 300.0,
            "confianza": 0.7,
            "n": 40,
        }
    ]
    # Lo demás sigue diciendo que falta el organismo.
    assert r["competidores"]["disponible"] is False
    LicitacionBIPanel.model_validate(r)


def test_sin_organismo_y_sin_datos_el_precio_dice_no_disponible(datos):
    r = panel.get_licitacion_panel("1-2-COT26", organismo_id=None, product_codes=["00000000"])
    assert r["precios"] == [{"disponible": False, "codigo_producto": "00000000"}]
