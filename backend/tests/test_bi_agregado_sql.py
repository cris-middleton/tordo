"""El agregado por proveedor en Postgres da lo mismo que en Polars.

`_competencia_del_rubro`, el resumen y los competidores de un organismo
agregaban `competitors_by_market` en Polars, con todas las filas del rubro en la
memoria de la API (512 MB). Ahora agregan en SQL (`sql_agregado`,
`sql_totales`). El golden master cubre el resumen; el panorama no está en él,
así que aquí se compara, rubro por rubro del fixture materializado, contra el
cálculo de antes escrito en Polars sobre el parquet.

Requiere el esquema `analytics` materializado con el fixture del golden (como
`test_bi_service_equivalencia.py`); en CI es obligatorio.
"""

from __future__ import annotations

import os
from pathlib import Path

import polars as pl
import pytest

from app.repositories import analytics_sync as repo
from app.services.bi import competencia, precio
from app.services.bi import rubro as svc_rubro

IN_CI = os.getenv("CI", "").lower() in ("1", "true")
FIXTURE = Path(__file__).parent / "golden" / "fixture_analytics"


@pytest.fixture(scope="module", autouse=True)
def exigir_datos():
    try:
        repo.invalidar_cache_existencia()
        hay = repo.existe_tabla("competitors_by_market", usar_cache=False)
    except Exception as exc:  # noqa: BLE001
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos ({type(exc).__name__})")
    if not hay:
        if IN_CI:
            raise AssertionError("el esquema analytics no está materializado")
        pytest.skip("el esquema analytics no está materializado")


COMPETIDORES = pl.read_parquet(FIXTURE / "competitors_by_market.parquet")


def _competencia_en_polars(rubro: str) -> dict:
    """El cálculo de `_competencia_del_rubro` antes de pasar a SQL."""
    df = COMPETIDORES.filter(pl.col("RubroN2") == rubro)
    monto = float(df["monto_total"].sum())
    oc = int(df["n_oc"].sum())
    por_proveedor = (
        df.group_by("CodigoProveedor", maintain_order=True)
        .agg(
            pl.col("monto_total").sum().alias("monto"),
            pl.col("n_oc").sum().alias("oc"),
            pl.col("CodigoOrganismoPublico").n_unique().alias("compradores"),
            pl.col("NombreProveedor").first().alias("nombre"),
        )
        .with_columns(
            (pl.col("monto") / monto * 100).alias("share_pct"),
            (pl.col("oc") / max(oc, 1) * 100).alias("share_oc_pct"),
        )
        .sort(["monto", "CodigoProveedor"], descending=[True, False])
    )
    hhi = float(por_proveedor.select((pl.col("share_pct") ** 2).sum()).item())
    return {
        "n_proveedores": por_proveedor.height,
        "n_compradores": df["CodigoOrganismoPublico"].n_unique(),
        "monto_clp": monto,
        "n_oc": oc,
        "hhi": round(hhi),
        "share_top5_pct": round(float(por_proveedor.head(5)["share_pct"].sum()), 1),
        "lideres": [
            {
                "nombre": r["nombre"],
                "share_pct": round(r["share_pct"], 2),
                "share_oc_pct": round(r["share_oc_pct"], 2),
                "n_oc": int(r["oc"]),
                "n_compradores": int(r["compradores"]),
            }
            for r in por_proveedor.head(svc_rubro.TOP).iter_rows(named=True)
        ],
    }


RUBROS = (
    COMPETIDORES.group_by("RubroN2")
    .len()
    .sort(["len", "RubroN2"], descending=[True, False])
    .head(8)["RubroN2"]
    .to_list()
)


@pytest.mark.parametrize("rubro", RUBROS)
def test_la_competencia_del_rubro_en_sql_es_la_de_polars(rubro):
    obtenido = svc_rubro._competencia_del_rubro(rubro)
    esperado = _competencia_en_polars(rubro)

    assert obtenido.pop("disponible") is True
    obtenido.pop("tipo_mercado")
    assert obtenido["monto_clp"] == pytest.approx(esperado.pop("monto_clp"))
    obtenido.pop("monto_clp")
    assert obtenido == esperado


def test_hay_rubros_que_comparar():
    # Guarda: sin rubros, el test parametrizado no compararía nada.
    assert len(RUBROS) >= 5


ORGANISMOS = COMPETIDORES["CodigoOrganismoPublico"].unique().sort().head(6).to_list()


@pytest.mark.parametrize("organismo", ORGANISMOS)
def test_los_competidores_del_organismo_salen_del_agregado(organismo):
    r = competencia.get_competidores(organismo, top_n=5)

    df = COMPETIDORES.filter(pl.col("CodigoOrganismoPublico") == organismo)
    por_proveedor = (
        df.group_by("CodigoProveedor")
        .agg(pl.col("monto_total").sum())
        .sort(["monto_total", "CodigoProveedor"], descending=[True, False])
    )
    total = por_proveedor["monto_total"].sum()
    esperado = [
        (row["CodigoProveedor"], pytest.approx(row["monto_total"] / total * 100))
        for row in por_proveedor.head(5).iter_rows(named=True)
    ]
    assert [(c["CodigoProveedor"], c["market_share_pct"]) for c in r["competidores"]] == esperado
    hhi = float(((por_proveedor["monto_total"] / total * 100) ** 2).sum())
    assert r["concentracion"][0]["hhi"] == pytest.approx(hhi)
    assert r["concentracion"][0]["n_proveedores"] == por_proveedor.height


def test_los_compradores_distintos_del_rubro_se_cuentan_en_sql():
    rubro = RUBROS[0]
    codigos = repo.distintos(
        "competitors_by_market", "CodigoOrganismoPublico", filtros={"RubroN2": rubro}
    )
    esperado = COMPETIDORES.filter(pl.col("RubroN2") == rubro)["CodigoOrganismoPublico"]
    assert sorted(codigos) == sorted(esperado.unique().to_list())


def test_el_desempate_por_texto_ordena_por_bytes_en_postgres():
    """`COLLATE "C"`, como Polars: con la intercalación de la base «Árboles»
    iría antes que «Bebidas», y con un LIMIT eso cambia qué filas entran."""
    bandas = pl.read_parquet(FIXTURE / "price_bands.parquet")
    organismo = (
        bandas.group_by("CodigoOrganismoPublico")
        .len()
        .sort(["len", "CodigoOrganismoPublico"], descending=[True, False])[
            "CodigoOrganismoPublico"
        ][0]
    )
    r = precio._load(
        "price_bands.parquet",
        filtros={"CodigoOrganismoPublico": organismo},
        orden="n_transacciones",
        desempate_texto="RubroN2",
        limite=5,
    )
    esperado = (
        bandas.filter(pl.col("CodigoOrganismoPublico") == organismo)
        .sort(["n_transacciones", "RubroN2"], descending=[True, False])
        .head(5)["RubroN2"]
        .to_list()
    )
    assert r["RubroN2"].to_list() == esperado


def test_contar_filas_cuenta_sin_traer():
    rubro = RUBROS[0]
    assert repo.contar_filas("competitors_by_market", filtros={"RubroN2": rubro}) == (
        COMPETIDORES.filter(pl.col("RubroN2") == rubro).height
    )


# ── La conversión a Polars infiere con todas las filas ───────────────────────


def test_una_columna_nula_en_las_primeras_cien_filas_no_revienta():
    """Polars infería el tipo con las 100 primeras filas: una columna nula ahí
    y con texto después lanzaba `ComputeError`, y el endpoint respondía 500."""
    filas = [{"codigo": i, "nombre": None} for i in range(150)] + [{"codigo": 150, "nombre": "X"}]

    df = repo._a_polars(filas)

    assert df.schema["nombre"] == pl.Utf8
    assert df["nombre"][-1] == "X"
