"""La primera visita de /mercado no puede traerse una tabla entera.

2026-10-14: la API de producción murió once veces en un día con `Killed` en el
log de Railway (OOM con 512 MB) y acabó en CRASHED. `/bi/tendencia?rubro=` leía
`analytics.time_series` ENTERA para quedarse con un rubro (+533 MB medido en
local con seis meses; producción guarda 36), y sin rubro `oportunidades`,
`tendencia` y `rubros` se traían sus tablas completas a la vez.

Se fija con un doble que registra cada lectura: toda lectura de una tabla
grande va acotada (filtro de igualdad o LIMIT), y acotar no cambia la respuesta.
"""

from __future__ import annotations

import json
from pathlib import Path

import polars as pl
import pytest

from app.services import bi
from app.services.bi import (
    competencia,
    comprador,
    mercado,
    oportunidad,
    precio,
    rubro,
    temporal,
)
from app.services.bi._base import MAX_FILAS_BUSQUEDA
from tests.analytics_en_memoria import AnalyticsEnMemoria

GOLDEN = Path(__file__).parent / "golden"

GRANDES = {
    "opportunity_scores.parquet",
    "time_series.parquet",
    "trend_by_market.parquet",
    "emerging_markets.parquet",
}


class Registro(AnalyticsEnMemoria):
    def __init__(self) -> None:
        super().__init__()
        self.lecturas: list[dict] = []

    def _load(self, filename, **kwargs):
        self.lecturas.append({"tabla": filename, **kwargs})
        return super()._load(filename, **kwargs)

    # El conteo agrupado y la búsqueda por subcadena también son lecturas, pero
    # acotadas por construcción: el SQL agrega, o corta a `MAX_FILAS_BUSQUEDA`.
    def _contar(self, filename, columna, **kwargs):
        self.lecturas.append({"tabla": filename, "limite": kwargs["limite"], "conteo": columna})
        return super()._contar(filename, columna, **kwargs)

    def _buscar(self, filename, columna, texto, **kwargs):
        self.lecturas.append({"tabla": filename, "limite": MAX_FILAS_BUSQUEDA, "busqueda": columna})
        return super()._buscar(filename, columna, texto, **kwargs)


def _oportunidad(codigo: str, rubro: str, score: float) -> dict:
    return {
        "CodigoOrganismoPublico": codigo,
        "RubroN2": rubro,
        "opportunity_score": score,
        "n_transacciones": 10,
        "coef_variacion": 0.3,
        "hhi": 1200.0,
        "n_proveedores": 5,
        "cagr": 0.1,
    }


def _tendencia(codigo: str, rubro: str, cagr, n_anios: int, total_oc: int, tendencia: str) -> dict:
    return {
        "CodigoOrganismoPublico": codigo,
        "RubroN2": rubro,
        "slope_mensual": 1.0,
        "r_squared": 0.8,
        "cagr": cagr,
        "tendencia": tendencia,
        "n_anios": n_anios,
        "total_oc": total_oc,
    }


@pytest.fixture
def datos(monkeypatch) -> Registro:
    r = Registro()
    r["opportunity_scores.parquet"] = [
        _oportunidad("A", "Aseo", 9.0),
        _oportunidad("B", "Aseo", 7.0),
        _oportunidad("C", "Obras", 3.0),
        _oportunidad("D", "NA", 5.0),
        _oportunidad("E", "", 2.0),
        _oportunidad("F", "Zapatos", 1.0),
        _oportunidad("G", "Árboles", 1.5),
    ]
    r["buyer_scores.parquet"] = [
        {"CodigoOrganismoPublico": "A", "NombreOrganismo": "Hospital A"},
        {"CodigoOrganismoPublico": "B", "NombreOrganismo": "Municipalidad B"},
        {"CodigoOrganismoPublico": "Z", "NombreOrganismo": "Nadie la pide"},
    ]
    tendencias = [
        # El de mayor CAGR NO cumple n_anios ≥ 3: un LIMIT antes del filtro lo perdería todo.
        _tendencia("X1", "Aseo", 0.9, 2, 100, "creciente"),
        _tendencia("X2", "Aseo", 0.5, 4, 20, "creciente"),
        _tendencia("X3", "Aseo", 0.3, 5, 10, "creciente"),
        _tendencia("X4", "Obras", 0.2, 3, 15, "estable"),
        _tendencia("X5", "Obras", None, 6, 50, "estable"),
    ]
    r["trend_by_market.parquet"] = tendencias
    r["emerging_markets.parquet"] = tendencias[:2]
    r["time_series.parquet"] = [
        {
            "CodigoOrganismoPublico": "A",
            "RubroN2": rubro,
            "anio": anio,
            "mes": mes,
            "n_oc": 1,
            "monto_total": monto,
        }
        for rubro, monto in (("Aseo", 100.0), ("Obras", 7.0))
        for anio in (2023, 2024)
        for mes in range(1, 13)
    ]
    r.instalar(monkeypatch, oportunidad, temporal)
    return r


@pytest.mark.parametrize(
    "llamada",
    [
        lambda: oportunidad.get_oportunidades(None, None, 4.0, 50),
        lambda: oportunidad.get_oportunidades(None, "Aseo", 4.0, 50),
        lambda: temporal.get_tendencia(None, None, False, 15),
        lambda: temporal.get_tendencia("Aseo", None, False, 15),
    ],
    ids=["oportunidades", "oportunidades-rubro", "tendencia", "tendencia-rubro"],
)
def test_toda_lectura_de_una_tabla_grande_va_acotada(datos, llamada):
    llamada()

    grandes = [lectura for lectura in datos.lecturas if lectura["tabla"] in GRANDES]
    # Guarda: sin lecturas, el test comprobaría el vacío.
    assert grandes, "no se registró ninguna lectura de tablas grandes"
    for lectura in grandes:
        assert lectura.get("filtros") or lectura.get("limite"), (
            f"{lectura['tabla']} se lee entera: {lectura}"
        )


def test_rubros_se_cuentan_en_sql_sin_leer_la_tabla(datos):
    resultado = oportunidad.get_rubros(354)

    # Una sola lectura: el conteo agrupado, con su límite. Ninguna trae filas.
    assert datos.lecturas == [
        {"tabla": "opportunity_scores.parquet", "limite": 354, "conteo": "RubroN2"}
    ]
    # «NA» y la cadena vacía fuera; empates por bytes («Zapatos» antes que «Árboles»).
    assert resultado == {
        "disponible": True,
        "rubros": ["Aseo", "Obras", "Zapatos", "Árboles"],
        "total": 4,
    }


def test_oportunidades_respetan_el_minimo_y_el_limite(datos):
    todas = oportunidad.get_oportunidades(None, None, 4.0, 50)
    una = oportunidad.get_oportunidades(None, None, 6.0, 1)

    assert [
        (o["CodigoOrganismoPublico"], o["NombreOrganismo"]) for o in todas["oportunidades"]
    ] == [
        ("A", "Hospital A"),
        ("B", "Municipalidad B"),
        ("D", None),
    ]
    assert [o["CodigoOrganismoPublico"] for o in una["oportunidades"]] == ["A"]
    # Los nombres se piden sólo para los compradores de la respuesta.
    nombres = [lectura for lectura in datos.lecturas if lectura["tabla"] == "buyer_scores.parquet"]
    assert nombres[0]["filtros"] == {"CodigoOrganismoPublico": ["A", "B", "D"]}


def test_tendencia_con_limite_chico_devuelve_el_mejor_valido(datos):
    resultado = temporal.get_tendencia(None, None, False, 1)

    assert [t["CodigoOrganismoPublico"] for t in resultado["tendencias"]] == ["X2"]


def test_tendencia_filtra_por_tendencia_antes_de_limitar(datos):
    resultado = temporal.get_tendencia(None, "estable", False, 1)

    assert [t["CodigoOrganismoPublico"] for t in resultado["tendencias"]] == ["X4"]


def test_tendencia_con_rubro_lee_solo_ese_rubro_de_time_series(datos):
    resultado = temporal.get_tendencia("Aseo", None, False, 15)

    lecturas = [lectura for lectura in datos.lecturas if lectura["tabla"] == "time_series.parquet"]
    assert [lectura["filtros"] for lectura in lecturas] == [{"RubroN2": "Aseo"}]
    assert resultado["serie_anual"] == [
        {"anio": 2023, "monto_total": 1200.0, "n_oc": 12},
        {"anio": 2024, "monto_total": 1200.0, "n_oc": 12},
    ]


# ── La guarda ancha: toda función de BI que un visitante alcanza ─────────────

#: Tablas que se leen ENTERAS a propósito, cada una con su motivo. Entrar aquí
#: exige decir por qué es pequeña. Cualquier otra lectura sin filtro ni límite
#: hace fallar el test de abajo.
LECTURA_ENTERA_PERMITIDA = {
    # Una fila por sector de mercado (un puñado de sectores): ~4 KB.
    "sector_dashboard.parquet",
    # Una fila por comprador con score (~1–2 mil): `/bi/resumen` los necesita
    # todos para poner el nombre a las oportunidades del rubro.
    "buyer_scores.parquet",
    # ~200 filas: los compradores con banderas de riesgo (ver `rubro.py`).
    "buyer_risk_flags.parquet",
}

#: Las funciones que un visitante alcanza son las que `app.services.bi` exporta.
FUNCIONES_PUBLICAS = sorted(n for n in bi.__all__ if n.startswith("get_"))

#: Llamadas que el golden no incluye y que son las de la primera visita: sin
#: rubro, sin organismo. Es justo donde una lectura sin filtro se esconde.
LLAMADAS_EXTRA = [
    ("get_oportunidades", {}),
    ("get_tendencia", {}),
    ("get_tendencia", {"solo_emergentes": True}),
    ("get_resumen", {}),
    ("get_panorama", {"rubro": "Válvulas electrónicas"}),
    ("get_forecast_competidores", {"organismo_id": "113258"}),
    (
        "get_forecast_competidores",
        {
            "organismo_id": "113258",
            "rubro": "ELIMINACIÓN Y TRATAMIENTO DE DESECHOS",
            "tipo": "1",
        },
    ),
    ("get_forecast_competidores", {"rubro": "VESTUARIO CLÍNICO"}),
    ("get_forecast_competidores", {"tipo": "1"}),
    (
        "get_licitacion_panel",
        {"codigo_externo": "2405-24-B226", "organismo_id": "7084", "product_codes": ["41122004"]},
    ),
]


def _llamadas() -> list[tuple[str, dict]]:
    golden = json.loads((GOLDEN / "bi_golden.json").read_text())
    return [(c["funcion"], c["kwargs"]) for c in golden] + LLAMADAS_EXTRA


@pytest.fixture
def fixture_en_memoria(monkeypatch) -> Registro:
    """Las tablas del fixture del golden en el doble, listas para cualquier función."""
    r = Registro()
    for parquet in sorted((GOLDEN / "fixture_analytics").glob("*.parquet")):
        r.tablas[parquet.name] = pl.read_parquet(parquet)
    r.instalar(monkeypatch, competencia, comprador, mercado, oportunidad, precio, rubro, temporal)
    return r


def test_cada_funcion_publica_tiene_llamadas_en_la_guarda():
    # Una función nueva en `app.services.bi` no entra a la guarda sola: aquí
    # falla hasta que alguien le ponga una llamada (en el golden o en LLAMADAS_EXTRA).
    cubiertas = {nombre for nombre, _ in _llamadas()}
    assert set(FUNCIONES_PUBLICAS) <= cubiertas, sorted(set(FUNCIONES_PUBLICAS) - cubiertas)
    # Guarda de la guarda: se esperaban las 16 funciones de hoy.
    assert len(FUNCIONES_PUBLICAS) >= 16, FUNCIONES_PUBLICAS


@pytest.mark.parametrize("funcion", FUNCIONES_PUBLICAS)
def test_ninguna_funcion_publica_lee_una_tabla_entera(fixture_en_memoria, funcion):
    llamadas = [kw for nombre, kw in _llamadas() if nombre == funcion]
    assert llamadas, funcion

    total = 0
    for kwargs in llamadas:
        antes = len(fixture_en_memoria.lecturas)
        getattr(bi, funcion)(**kwargs)
        lecturas = fixture_en_memoria.lecturas[antes:]
        total += len(lecturas)

        for lectura in lecturas:
            if lectura["tabla"] in LECTURA_ENTERA_PERMITIDA:
                continue
            assert lectura.get("filtros") or lectura.get("limite"), (
                f"{funcion}({kwargs}) lee {lectura['tabla']} entera: {lectura}"
            )

    # Guarda: una función que no lee nada no comprueba nada (y una que dejó de
    # leer por un cambio de nombre de tabla tampoco). Algunas llamadas vuelven
    # antes de tocar la base (`q` corta, sin rubro); alguna de las otras no.
    assert total, f"{funcion}: ninguna de sus llamadas registró una lectura"


def test_la_lista_de_lecturas_enteras_no_tiene_entradas_de_mas(fixture_en_memoria):
    # Una entrada que nadie lee ya sin filtro es una excusa vieja: se quita.
    sin_acotar: set[str] = set()
    for nombre, kwargs in _llamadas():
        antes = len(fixture_en_memoria.lecturas)
        getattr(bi, nombre)(**kwargs)
        for lectura in fixture_en_memoria.lecturas[antes:]:
            if not (lectura.get("filtros") or lectura.get("limite")):
                sin_acotar.add(lectura["tabla"])
    assert sin_acotar == LECTURA_ENTERA_PERMITIDA


# ── Pronóstico de competencia: el filtro viaja al SQL, la respuesta no cambia ─


def _forecast(org, rubro_, tipo_, n, nivel=1):
    fila = {"Rubro2": rubro_, "CodigoTipo": tipo_, "n": n, "p50": float(n), "nivel": nivel}
    return {"CodigoOrganismo": org, "NombreOrganismo": f"Org {org}", **fila} if org else fila


@pytest.fixture
def pronostico(monkeypatch) -> Registro:
    r = Registro()
    r["competitor_forecast_l1.parquet"] = [
        _forecast("7", "Aseo", "1", 10),
        _forecast("7", "Aseo", "3", 11),
        _forecast("7", "Obras", "1", 12),
        _forecast("8", "Aseo", "1", 13),
    ]
    r["competitor_forecast_l2.parquet"] = [
        _forecast(None, "Aseo", "1", 20, 2),
        _forecast(None, "Aseo", None, 21, 2),
        _forecast(None, "Obras", "1", 22, 2),
        _forecast(None, "Obras", "3", 23, 2),
    ]
    r["competitor_forecast_l3.parquet"] = [
        {"CodigoTipo": "1", "n": 30, "nivel": 3},
        {"CodigoTipo": "3", "n": 31, "nivel": 3},
    ]
    r.instalar(monkeypatch, competencia)
    return r


def _ns(respuesta: dict) -> list[int]:
    return [fila["n"] for fila in respuesta["data"]]


def test_forecast_l1_filtra_en_sql_y_devuelve_las_mismas_filas(pronostico):
    res = competencia.get_forecast_competidores("7", "Aseo", "1")

    assert (res["nivel_usado"], res["fallback"], _ns(res)) == ("L1", False, [10])
    assert [lec["filtros"] for lec in pronostico.lecturas] == [
        {"CodigoOrganismo": "7", "Rubro2": "Aseo", "CodigoTipo": "1"}
    ]
    # Sólo el organismo: todas sus filas, en el orden de la tabla.
    assert _ns(competencia.get_forecast_competidores("7")) == [10, 11, 12]


def test_forecast_cae_a_l2_si_el_organismo_no_tiene_filas(pronostico):
    res = competencia.get_forecast_competidores("999", "Aseo", "1")

    assert (res["nivel_usado"], res["fallback"], _ns(res)) == ("L2", True, [20])
    for lectura in pronostico.lecturas:
        assert lectura.get("filtros") or lectura.get("limite")


def test_forecast_l2_sin_tipo_deja_fuera_las_filas_sin_tipo(pronostico):
    # Comportamiento previo: `CodigoTipo is not null` aunque no se pida tipo.
    res = competencia.get_forecast_competidores(None, "Aseo", None)

    assert (res["nivel_usado"], _ns(res)) == ("L2", [20])
    assert [lec["filtros"] for lec in pronostico.lecturas] == [{"Rubro2": "Aseo"}]


def test_forecast_cae_a_l3_por_tipo(pronostico):
    res = competencia.get_forecast_competidores("999", "Inexistente", "3")

    assert (res["nivel_usado"], res["fallback"], _ns(res)) == ("L3", True, [31])
    assert pronostico.lecturas[-1]["filtros"] == {"CodigoTipo": "3"}


def test_forecast_sin_parametros_lee_l2_acotada_y_no_hay_l3(pronostico):
    res = competencia.get_forecast_competidores()

    assert (res["nivel_usado"], _ns(res)) == ("L2", [20, 22, 23])
    assert [lec["tabla"] for lec in pronostico.lecturas] == ["competitor_forecast_l2.parquet"]
    assert pronostico.lecturas[0]["limite"] == competencia.MAX_FILAS_FORECAST


def test_forecast_sin_datos(pronostico):
    res = competencia.get_forecast_competidores("999", "Nada", "9")

    assert res == {"disponible": False, "motivo": "sin datos para los parámetros solicitados"}
