"""La ventana de analytics: recorta de verdad y se ancla en los DATOS, no en hoy.

Con los datos locales (6 meses) la ventana de 36 no recorta nada, así que esto
es lo único que prueba que funciona: cuatro años sintéticos, de julio de 2021 a
junio de 2025. Hoy es posterior; si la ventana se anclara en hoy, empezaría más
de un año después de donde debe.
"""

from datetime import date

import polars as pl
import pytest

from etl.analytics import data_loader
from etl.analytics.data_loader import (
    VENTANA_ANALYTICS_MESES,
    inicio_ventana,
    iter_oc_parquets,
    limites_ventana,
    scan_oc,
)
from etl.analytics.product_price_bands import VENTANA_BANDAS_PRECIO_MESES

ULTIMO = (2025, 6)


def _meses():
    anio, mes = 2021, 7
    while (anio, mes) <= ULTIMO:
        yield anio, mes
        anio, mes = (anio + 1, 1) if mes == 12 else (anio, mes + 1)


@pytest.fixture
def cuatro_anios(tmp_path, monkeypatch):
    oc = tmp_path / "oc"
    oc.mkdir()
    for anio, mes in _meses():
        filas = {
            "Codigo": [f"{anio}-{mes}-a", f"{anio}-{mes}-b"],
            "FechaCreacion": [f"{anio}-{mes:02d}-03", f"{anio}-{mes:02d}-25"],
        }
        if (anio, mes) == ULTIMO:
            # Una orden creada hace 40 meses que aparece en el último archivo
            # (se envió tarde): el archivo se lee, la fila no entra.
            filas["Codigo"].append("tardia")
            filas["FechaCreacion"].append("2022-02-14")
        pl.DataFrame(filas).write_parquet(oc / f"{anio}-{mes}.parquet")
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", oc)
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", tmp_path / "lic")
    return oc


def _leidas(**kw):
    return pl.concat(
        [df for _, df in iter_oc_parquets(columns=["Codigo", "FechaCreacion"], **kw)]
    ).with_columns(pl.col("FechaCreacion").str.to_date())


def test_las_constantes():
    assert VENTANA_ANALYTICS_MESES == 36
    assert VENTANA_BANDAS_PRECIO_MESES == 12


def test_la_ventana_de_36_meses_se_ancla_en_el_ultimo_periodo(cuatro_anios):
    # Junio de 2025 hacia atrás 36 meses: desde julio de 2022. Si se anclara en
    # HOY empezaría bastante después, y lo de 2022–2023 desaparecería.
    assert inicio_ventana(cuatro_anios, 36) == date(2022, 7, 1)
    assert limites_ventana(cuatro_anios, 36) == (date(2022, 7, 1), date(2025, 6, 30))


def test_la_ventana_no_termina_en_el_futuro(cuatro_anios):
    """El último archivo es el del mes en curso: la ventana termina hoy, no a fin de mes."""
    assert limites_ventana(cuatro_anios, 36, hoy=date(2025, 6, 13)) == (
        date(2022, 7, 1),
        date(2025, 6, 13),
    )

    leidas = _leidas()
    assert leidas["FechaCreacion"].min() == date(2022, 7, 3)
    assert leidas["FechaCreacion"].max() == date(2025, 6, 25)
    assert len(leidas) == 36 * 2


def test_lo_de_hace_37_meses_no_entra(cuatro_anios):
    codigos = set(_leidas()["Codigo"])
    assert "2022-6-b" not in codigos  # 37 meses antes del último período
    assert "2022-7-a" in codigos  # 36
    assert "tardia" not in codigos  # vino en un archivo de la ventana, pero es vieja


def test_los_archivos_anteriores_ni_se_abren(cuatro_anios, monkeypatch):
    abiertos = []
    original = data_loader._leer
    monkeypatch.setattr(
        data_loader, "_leer", lambda p, cols: abiertos.append(p.stem) or original(p, cols)
    )
    list(iter_oc_parquets(columns=["Codigo"]))
    assert len(abiertos) == 36
    assert abiertos[0] == "2022-7" and abiertos[-1] == "2025-6"
    # En orden cronológico, no por nombre («2022-10» antes que «2022-7»).
    assert abiertos.index("2022-9") < abiertos.index("2022-10")


def test_las_bandas_de_precio_miran_12_meses(cuatro_anios):
    leidas = _leidas(meses=VENTANA_BANDAS_PRECIO_MESES)
    assert leidas["FechaCreacion"].min() == date(2024, 7, 3)
    assert len(leidas) == 12 * 2


def test_sin_ventana_se_lee_todo(cuatro_anios):
    assert len(_leidas(meses=None)) == 48 * 2 + 1


def test_scan_respeta_la_misma_ventana(cuatro_anios):
    lazy = scan_oc(columns=["Codigo", "FechaCreacion"]).collect()
    assert set(lazy["Codigo"]) == set(_leidas()["Codigo"])


def test_quien_no_pide_la_fecha_no_la_recibe(cuatro_anios):
    _, df = next(iter_oc_parquets(columns=["Codigo"]))
    assert df.columns == ["Codigo"]


def test_con_max_date_se_ancla_en_esa_fecha(cuatro_anios):
    """El harness de evaluación corta por arriba: la ventana sale de ahí."""
    assert inicio_ventana(cuatro_anios, 12, max_date=date(2023, 3, 15)) == date(2022, 4, 1)
    leidas = _leidas(meses=12, max_date=date(2023, 3, 15))
    assert leidas["FechaCreacion"].min() == date(2022, 4, 3)
    assert leidas["FechaCreacion"].max() <= date(2023, 3, 15)
