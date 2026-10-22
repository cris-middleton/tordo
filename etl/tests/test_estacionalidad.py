"""Estacionalidad: un comprador que compra sólo en marzo tiene un pico en marzo.

`seasonality_patterns` trae sólo los meses CON compras, y el z-score se
calculaba sobre ellos: con una sola fila la desviación era nula y z = 0, así que
la estacionalidad más marcada no salía nunca como pico. Y la consistencia se
dividía por los años de calendario activos: una ventana de 36 meses abarca
cuatro años con tres de cada mes, y quedaba en 3/4 como mucho.
"""

from __future__ import annotations

import polars as pl
import pytest

from etl.analytics import seasonality

#: La ventana de producción: noviembre de 2023 a octubre de 2026.
MESES = [(2023, 11), (2023, 12)] + [(a, m) for a in (2024, 2025) for m in range(1, 13)]
MESES += [(2026, m) for m in range(1, 11)]


def _agregados() -> pl.DataFrame:
    filas = []
    for anio, mes in MESES:
        # Un hospital que compra parejo todo el año (fija qué meses cubre la ventana)…
        filas.append(("1000", "Aseo", anio, mes, 4))
        # …y una municipalidad que compra sólo en marzo, cada año.
        if mes == 3:
            filas.append(("2000", "Fiestas Patrias", anio, mes, 6))
        # …y otra que compra en marzo y abril.
        if mes in (3, 4):
            filas.append(("3000", "Útiles", anio, mes, 6))
    # Las tres estuvieron activas en 2023 (en otro rubro no cuenta: es el mismo).
    filas += [("2000", "Fiestas Patrias", 2023, 12, 1), ("3000", "Útiles", 2023, 12, 1)]
    return pl.DataFrame(
        filas,
        schema=["CodigoOrganismoPublico", "RubroN2", "anio", "mes", "n_compras"],
        orient="row",
    ).with_columns(pl.lit(0.0).alias("monto_total"))


@pytest.fixture(scope="module")
def patrones() -> pl.DataFrame:
    return seasonality.detect_seasonality_patterns(_agregados())


def _fila(patrones, organismo, mes):
    return patrones.filter(
        (pl.col("CodigoOrganismoPublico") == organismo) & (pl.col("mes") == mes)
    ).row(0, named=True)


def test_el_que_compra_solo_en_marzo_tiene_pico_en_marzo(patrones):
    marzo = _fila(patrones, "2000", 3)
    assert marzo["consistencia"] == pytest.approx(1.0)
    assert marzo["z_score"] > 1
    assert marzo["es_pico_estacional"]


def test_el_que_compra_en_dos_meses_tiene_dos_picos(patrones):
    for mes in (3, 4):
        assert _fila(patrones, "3000", mes)["es_pico_estacional"]


def test_el_que_compra_parejo_no_tiene_picos(patrones):
    hospital = patrones.filter(pl.col("CodigoOrganismoPublico") == "1000")
    assert not hospital["es_pico_estacional"].any()
    # Tres de cada mes en la ventana, y compró en los tres: consistencia 1.
    assert hospital["consistencia"].min() == pytest.approx(1.0)


def test_solo_se_escriben_los_meses_con_compras(patrones):
    assert patrones.filter(pl.col("CodigoOrganismoPublico") == "2000").height == 2  # marzo y dic.


def test_un_mes_visto_un_solo_anio_no_es_pico():
    """Con un solo año del mes, toda compra es «consistente»: no hay repetición que medir."""
    filas = [("1000", "Aseo", 2025, m, 4) for m in range(1, 13)]
    filas += [("2000", "Fiestas", 2025, 3, 6), ("2000", "Fiestas", 2026, 1, 1)]
    filas += [("1000", "Aseo", 2026, 1, 4)]
    agregados = pl.DataFrame(
        filas,
        schema=["CodigoOrganismoPublico", "RubroN2", "anio", "mes", "n_compras"],
        orient="row",
    )
    patrones = seasonality.detect_seasonality_patterns(agregados)
    marzo = _fila(patrones, "2000", 3)
    assert marzo["z_score"] > 1
    assert not marzo["es_pico_estacional"]
