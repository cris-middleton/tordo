"""El CAGR sólo con años enteros, y la estacionalidad de un organismo sin rubro.

**Un año contaba como completo con tener diciembre** (`max(mes) == 12`). La
ventana de analytics empieza a mitad de año —36 meses hacia atrás, p. ej.
noviembre de 2023—, así que el primer año entraba al CAGR con dos meses contra
doce: un rubro que compra lo mismo cada mes salía creciendo un ~145 % al año
(dos meses de 100 contra doce de 100 en tres puntos: (1.200/200)^(1/2) - 1).
Y el cálculo estaba copiado en `/bi/tendencia` y en `/bi/resumen`.

**Sin rubro, `/bi/estacionalidad/{org}` devolvía doce filas por rubro**, sin el
campo del rubro: el mismo mes salía varias veces con cifras distintas.
"""

from __future__ import annotations

from datetime import date

import polars as pl
import pytest

from app.services.bi import mercado, rubro, temporal
from tests.analytics_en_memoria import AnalyticsEnMemoria

RUBRO = "Aseo"
VENTANA = {"ventana_desde": date(2023, 11, 1), "ventana_hasta": date(2026, 10, 20)}


def _serie(meses: list[tuple[int, int]], monto: float = 100.0) -> list[dict]:
    return [
        {
            "CodigoOrganismoPublico": "A",
            "RubroN2": RUBRO,
            "anio": anio,
            "mes": mes,
            "n_oc": 1,
            "monto_total": monto,
        }
        for anio, mes in meses
    ]


#: Nov 2023 a oct 2026, el mismo monto cada mes: un mercado PLANO.
MESES_VENTANA = (
    [(2023, 11), (2023, 12)]
    + [(anio, mes) for anio in (2024, 2025) for mes in range(1, 13)]
    + [(2026, mes) for mes in range(1, 11)]
)


@pytest.fixture
def datos(monkeypatch) -> AnalyticsEnMemoria:
    d = AnalyticsEnMemoria()
    d["time_series.parquet"] = _serie(MESES_VENTANA)
    d["competitors_by_market.parquet"] = [
        {
            "CodigoOrganismoPublico": "A",
            "RubroN2": RUBRO,
            "CodigoProveedor": "P",
            "NombreProveedor": "P SA",
            "monto_total": 1.0,
            "n_oc": 1,
            **VENTANA,
        }
    ]
    d.instalar(monkeypatch, temporal, mercado, rubro)
    return d


def test_un_mercado_plano_no_crece(datos):
    """Con el criterio viejo, 2023 (nov y dic) entraba como primer año."""
    cagr, yoy, filas = temporal._compute_cagr_rubro_desde_time_series(RUBRO)

    assert [f["anio"] for f in filas] == [2024, 2025]
    assert cagr == pytest.approx(0.0)
    assert yoy == pytest.approx(0.0)


def test_tendencia_y_resumen_dicen_lo_mismo(datos):
    datos.tablas["trend_by_market.parquet"] = pl.DataFrame(
        schema={"RubroN2": pl.Utf8, "cagr": pl.Float64, "tendencia": pl.Utf8}
    )
    t = temporal.get_tendencia(RUBRO)
    r = mercado.get_resumen(RUBRO)

    assert [p["anio"] for p in t["serie_anual"]] == [2024, 2025]
    assert t["cagr_rubro"] == pytest.approx(0.0)
    assert r["cagr_pct"] == t["cagr_rubro"]
    assert r["monto_anual_clp"] == 1200.0


def test_el_tamano_del_panorama_es_del_ultimo_anio_entero(datos):
    m = rubro._tamano_del_mercado(RUBRO)
    assert (m["anio"], m["monto_clp"], m["n_oc"]) == (2025, 1200.0, 12)


def test_con_la_ventana_un_mes_sin_compras_no_descarta_el_anio():
    """Un rubro que no compró en febrero de 2024 sigue teniendo 2024 entero:
    ese mes vale cero, no «sin dato»."""
    ts = pl.DataFrame(_serie([(2024, m) for m in range(1, 13) if m != 2]))
    ventana = (date(2023, 11, 1), date(2025, 12, 31))
    assert temporal.anios_completos(ts, ventana) == [2024]


def test_la_ventana_que_termina_antes_de_diciembre_deja_el_anio_fuera():
    ts = pl.DataFrame(_serie([(2025, m) for m in range(1, 13)]))
    assert temporal.anios_completos(ts, (date(2023, 11, 1), date(2025, 12, 20))) == []
    assert temporal.anios_completos(ts, (date(2023, 11, 1), date(2025, 12, 31))) == [2025]


def test_sin_ventana_hacen_falta_los_doce_meses():
    """Una tabla de antes de la ventana: el año necesita sus doce meses en la serie."""
    ts = pl.DataFrame(_serie(MESES_VENTANA))
    assert temporal.anios_completos(ts) == [2024, 2025]


def test_sin_ventana_publicada_cae_a_los_doce_meses(monkeypatch):
    d = AnalyticsEnMemoria()
    d["time_series.parquet"] = _serie(MESES_VENTANA)
    d.instalar(monkeypatch, temporal)

    assert temporal.ventana_de_los_datos() is None
    _, _, filas = temporal._compute_cagr_rubro_desde_time_series(RUBRO)
    assert [f["anio"] for f in filas] == [2024, 2025]


# ── Estacionalidad de un organismo ───────────────────────────────────────────


def _patron(rubro_: str, mes: int, compras: int, consistencia: float) -> dict:
    return {
        "CodigoOrganismoPublico": "7084",
        "RubroN2": rubro_,
        "mes": mes,
        "compras_mes": compras,
        "prob_mes": None,
        "consistencia": consistencia,
        "z_score": 0.0,
        "es_pico_estacional": False,
    }


@pytest.fixture
def estacionalidad(monkeypatch) -> AnalyticsEnMemoria:
    d = AnalyticsEnMemoria()
    d["seasonality_patterns.parquet"] = [
        *[_patron("Aseo", m, 10, 1.0) for m in range(1, 13)],
        # Insumos compra sólo en marzo: 30 compras.
        _patron("Insumos", 3, 30, 0.5),
    ]
    d.instalar(monkeypatch, temporal)
    return d


def test_sin_rubro_son_doce_meses_sumados(estacionalidad):
    patrones = temporal.get_estacionalidad("7084")["patrones"]

    assert [p["mes"] for p in patrones] == list(range(1, 13))
    marzo = patrones[2]
    assert marzo["compras_mes"] == 40
    assert marzo["prob_mes"] == pytest.approx(40 / 150)
    assert sum(p["prob_mes"] for p in patrones) == pytest.approx(1.0)
    assert marzo["z_score"] > 1
    # No se puede reconstruir en cuántos años compró: nula, y el pico también.
    assert {p["consistencia"] for p in patrones} == {None}
    assert {p["es_pico_estacional"] for p in patrones} == {None}


def test_con_rubro_son_las_filas_del_etl(estacionalidad):
    patrones = temporal.get_estacionalidad("7084", "Insumos")["patrones"]
    assert patrones == [
        {
            "mes": 3,
            "compras_mes": 30,
            "prob_mes": None,
            "consistencia": 0.5,
            "z_score": 0.0,
            "es_pico_estacional": False,
        }
    ]


def test_con_un_solo_rubro_no_hay_nada_que_sumar(estacionalidad):
    estacionalidad.tablas["seasonality_patterns.parquet"] = estacionalidad.tablas[
        "seasonality_patterns.parquet"
    ].filter(pl.col("RubroN2") == "Aseo")

    patrones = temporal.get_estacionalidad("7084")["patrones"]
    assert len(patrones) == 12
    assert {p["consistencia"] for p in patrones} == {1.0}
