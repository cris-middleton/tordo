"""Tendencia de gasto: mes de creación, meses completos, ceros y años de calendario.

Antes la serie contaba por mes de ARCHIVO (el primer mes de la ventana perdía
las órdenes creadas antes de ella), incluía el mes en curso a medias, saltaba
los meses sin compras y llamaba «primer año» a los 12 primeros meses con compras.
"""

from __future__ import annotations

import polars as pl
import pytest

from etl.analytics import data_loader, trend_analysis


def _orden(codigo, creada, monto, periodo):
    return {
        "Codigo": codigo,
        "CodigoOrganismoPublico": "7084",
        "OrganismoPublico": "HOSPITAL",
        "RubroN2": "Vigilancia",
        "sector": "Salud",
        "MontoTotalOC": str(monto),
        "MontoTotalOC_PesosChilenos": str(monto),
        "TipoMonedaOC": "CLP",
        "totalLineaNeto": str(monto),
        "Estado": "Aceptada",
        "FechaCreacion": creada,
        "_periodo_archivo": periodo,
    }


@pytest.fixture
def archivos(tmp_path, monkeypatch):
    oc = tmp_path / "oc"
    oc.mkdir()
    meses = {
        "2025-1": [_orden("A", "2025-01-10", 100, "2025-1")],
        "2025-2": [
            _orden("B", "2025-02-03", 200, "2025-2"),
            # Creada en enero y enviada en febrero: es de enero.
            _orden("C", "2025-01-28", 50, "2025-2"),
            # Creada antes del primer archivo: diciembre llega a medias, fuera.
            _orden("D", "2024-12-15", 999, "2025-2"),
        ],
        # El último archivo: el mes en curso, a medias. Fuera.
        "2025-3": [_orden("E", "2025-03-02", 10, "2025-3")],
    }
    for periodo, filas in meses.items():
        pl.DataFrame(filas).write_parquet(oc / f"{periodo}.parquet")
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", oc)
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", tmp_path / "lic")
    return oc


def test_la_serie_cuenta_por_mes_de_creacion_y_solo_meses_completos(archivos):
    ts = trend_analysis.build_time_series()
    por_mes = {(r["anio"], r["mes"]): (r["n_oc"], r["monto_total"]) for r in ts.to_dicts()}
    assert por_mes == {(2025, 1): (2, 150.0), (2025, 2): (1, 200.0)}
    # El esquema que materializa y lee la API no cambia.
    assert set(ts.columns) == {
        "CodigoOrganismoPublico",
        "RubroN2",
        "sector",
        "anio",
        "mes",
        "n_oc",
        "monto_total",
        "OrganismoPublico",
    }


def _serie(*mercados):
    """`mercados`: (rubro, {indice de mes desde ene-2023: monto}). 36 meses en total."""
    filas = []
    for rubro, montos in mercados:
        for i, monto in montos.items():
            filas.append(
                {
                    "CodigoOrganismoPublico": "7084",
                    "OrganismoPublico": "HOSPITAL",
                    "RubroN2": rubro,
                    "sector": "Salud",
                    "anio": 2023 + i // 12,
                    "mes": i % 12 + 1,
                    "n_oc": 5,
                    "monto_total": float(monto),
                }
            )
    # Un mercado activo en el primer y el último mes fija el rango en 36 meses.
    filas += [
        {**filas[0], "RubroN2": "Ancla", "anio": 2023, "mes": 1},
        {**filas[0], "RubroN2": "Ancla", "anio": 2025, "mes": 12},
    ]
    return pl.DataFrame(filas).with_columns(pl.col("anio", "mes").cast(pl.Int32))


def _tendencia(ts, rubro):
    return (
        trend_analysis.compute_market_trends(ts)
        .filter(pl.col("RubroN2") == rubro)
        .row(0, named=True)
    )


def test_el_primer_anio_es_de_calendario_no_los_primeros_meses_con_compras():
    # Empieza a comprar en octubre de 2023, siempre lo mismo. Con «los 12 primeros
    # meses activos» su CAGR era 0; de verdad pasó de 3 meses de compras a 12.
    ts = _serie(("Nuevo", dict.fromkeys(range(9, 36), 100)))
    fila = _tendencia(ts, "Nuevo")
    primer_anio, ultimo_anio = 300 / 12, 100.0
    assert fila["cagr"] == pytest.approx((ultimo_anio / primer_anio) ** (1 / 2) - 1, abs=1e-4)


def test_los_meses_sin_compras_son_ceros():
    # Compra cada mes el primer año y después sólo en enero, siempre 100. Sin los
    # ceros, la serie eran 14 puntos iguales: «estable», CAGR 0. Con ellos, el
    # gasto pasó de 1.200 al año a 100.
    ts = _serie(("Se apaga", {**dict.fromkeys(range(12), 100), 12: 100, 24: 100}))
    fila = _tendencia(ts, "Se apaga")
    assert fila["slope_mensual"] < 0
    assert fila["tendencia"] == "decrecimiento"
    assert fila["cagr"] == pytest.approx((100 / 1_200) ** (1 / 2) - 1, abs=1e-4)


def test_con_menos_de_dos_anios_no_hay_cagr():
    filas = [
        {
            "CodigoOrganismoPublico": "7084",
            "OrganismoPublico": "HOSPITAL",
            "RubroN2": "Corto",
            "sector": "Salud",
            "anio": 2025 + (9 + i) // 12,
            "mes": (9 + i) % 12 + 1,
            "n_oc": 5,
            "monto_total": 100.0 * (i + 1),
        }
        for i in range(6)
    ]
    ts = pl.DataFrame(filas).with_columns(pl.col("anio", "mes").cast(pl.Int32))
    fila = _tendencia(ts, "Corto")
    assert fila["cagr"] is None
    assert fila["tendencia"] == "crecimiento"


def test_un_mercado_que_nace_no_tiene_cagr_y_uno_que_muere_cae_un_cien_por_ciento():
    # «Nace»: nada el primer año, compras desde el segundo. «Muere»: compras el
    # primer año y nada el último. Los dos salían con CAGR 0, «estable».
    ts = _serie(
        ("Nace", dict.fromkeys(range(12, 36), 100)),
        ("Muere", dict.fromkeys(range(0, 24), 100)),
    )
    assert _tendencia(ts, "Nace")["cagr"] is None
    assert _tendencia(ts, "Muere")["cagr"] == -1.0
