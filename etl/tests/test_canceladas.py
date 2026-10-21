"""Una orden cancelada no compró nada: no sale en ninguna salida que sume o cuente.

Hasta octubre de 2026 sólo `sector_dashboard` las quitaba; el resto de analytics
las sumaba como compras —en precios, cuotas de mercado, series de tiempo y
diversificación de proveedores—. Ahora las quita `iter_oc_parquets`, una vez,
para todos. La excepción es `buyer_scoring`: su tasa de cancelación las cuenta.

El mercado sintético tiene un mercado vivo y uno entero de órdenes canceladas,
con su propio proveedor, rubro y producto y volumen de sobra para salir en todas
las tablas si se colara.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import polars as pl
import pytest

from etl.analytics import (
    buyer_scoring,
    competitor_analysis,
    data_loader,
    price_benchmarking,
    product_price_bands,
    provider_diversification,
    trend_analysis,
)

MESES = [(2025, m) for m in range(1, 13)] + [(2026, 1), (2026, 2)]
ORGANISMOS = [("1000", "HOSPITAL SINTETICO"), ("2000", "MUNICIPALIDAD SINTETICA")]
VIVOS = [(f"40000{i}", f"EMPRESA VIVA {i} SPA", f"77.{100 + i}.000-1") for i in range(6)]
CANCELADO = ("PROVCANCELADO", "PROVEEDORA DE LO CANCELADO SPA", "77.999.999-1")
#: Lo que delataría a una orden cancelada en una salida.
MARCAS = ("PROVCANCELADO", "Rubro anulado", "99999999", "anulado")
POR_MES_CANCELADAS = 10
#: Las salidas que suman o cuentan órdenes.
TABLAS = (
    "competitors_by_market",
    "price_bands",
    "time_series",
    "provider_diversification",
    "product_price_bands_L0",
    "product_price_bands_L0N",
    "product_price_bands_L1",
    "product_price_bands_L3",
)


def _linea(n, anio, mes, organismo, proveedor, estado, rubro, onu, espec, precio):
    org_cod, org_nom = organismo
    codigo, nombre, rut = proveedor
    dia = 1 + n % 27
    return {
        "Codigo": f"{org_cod}-{n}-SE{anio % 100}-{mes}",
        "Nombre": f"OC {espec}",
        "Tipo": "SE",
        "EsCompraAgil": "No",
        "Estado": estado,
        "FechaCreacion": date(anio, mes, dia).isoformat(),
        "FechaEnvio": date(anio, mes, dia).isoformat(),
        "FechaAceptacion": date(anio, mes, min(dia + 1, 28)).isoformat(),
        "MontoTotalOC": str(precio * 10),
        "TipoMonedaOC": "CLP",
        "MontoTotalOC_PesosChilenos": str(precio * 10),
        "CodigoOrganismoPublico": org_cod,
        "RutUnidadCompra": f"61.{org_cod}.000-1",
        "OrganismoPublico": org_nom,
        "sector": "Salud",
        "RegionUnidadCompra": "Región Metropolitana de Santiago",
        "RutSucursal": rut,
        "CodigoProveedor": codigo,
        "NombreProveedor": nombre,
        "codigoProductoONU": onu,
        "NombreroductoGenerico": espec,
        "RubroN1": "Suministros",
        "RubroN2": rubro,
        "RubroN3": espec,
        "EspecificacionComprador": espec,
        "cantidad": "10",
        "UnidadMedida": "Unidad",
        "monedaItem": "CLP",
        "precioNeto": str(precio),
        "totalLineaNeto": str(precio * 10),
        "PromedioCalificacion": "4,5",
        "CantidadEvaluacion": "1",
        "_periodo_archivo": f"{anio}-{mes}",
    }


def _mes(anio: int, mes: int) -> pl.DataFrame:
    filas = []
    n = 0
    for organismo in ORGANISMOS:
        for k in range(3):
            for proveedor in VIVOS:
                n += 1
                filas.append(
                    _linea(
                        n,
                        anio,
                        mes,
                        organismo,
                        proveedor,
                        "Recepcion Conforme",
                        "Papelería",
                        "44121700",
                        "lapiz pasta azul",
                        1_000 + 10 * k + n % 7,
                    )
                )
    # Un mercado entero de canceladas, sólo en el hospital.
    for k in range(POR_MES_CANCELADAS):
        n += 1
        filas.append(
            _linea(
                n,
                anio,
                mes,
                ORGANISMOS[0],
                CANCELADO,
                "Cancelacion solicitada" if k % 2 else "Cancelada",
                "Rubro anulado",
                "99999999",
                "servicio anulado especial",
                50_000 + 100 * k,
            )
        )
    return pl.DataFrame(filas)


def _textos(df: pl.DataFrame) -> str:
    return " ".join(
        str(v) for c in df.columns for v in df[c].cast(pl.Utf8, strict=False).drop_nulls()
    )


@pytest.fixture(scope="module")
def salidas(tmp_path_factory) -> dict[str, pl.DataFrame]:
    raiz: Path = tmp_path_factory.mktemp("canceladas")
    oc = raiz / "oc"
    oc.mkdir()
    for anio, mes in MESES:
        _mes(anio, mes).write_parquet(oc / f"{anio}-{mes}.parquet")

    modulos = (
        competitor_analysis,
        price_benchmarking,
        trend_analysis,
        provider_diversification,
        product_price_bands,
    )
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(data_loader, "OC_PARQUET_DIR", oc)
        mp.setattr(data_loader, "LIC_PARQUET_DIR", raiz / "lic")
        for modulo in modulos:
            mp.setattr(modulo, "OUTPUT_DIR", raiz)
            if hasattr(modulo, "OC_PARQUET_DIR"):
                mp.setattr(modulo, "OC_PARQUET_DIR", oc)
        for modulo in modulos:
            runner = next(getattr(modulo, f) for f in dir(modulo) if f.startswith("run_"))
            runner()
        metricas = buyer_scoring.build_oc_buyer_metrics()

    tablas = {p.stem: pl.read_parquet(p) for p in raiz.glob("*.parquet") if p.stem in TABLAS}
    return {**tablas, "buyer_payment_stats": metricas}


@pytest.mark.parametrize("tabla", TABLAS)
def test_ninguna_salida_cuenta_una_orden_cancelada(salidas, tabla):
    assert tabla in salidas, f"{tabla} no se generó: no probaría nada"
    df = salidas[tabla]
    texto = _textos(df)
    # El mercado vivo sí está: la ausencia de lo cancelado significa algo.
    assert len(df) > 0
    assert "Papelería" in texto or "44121700" in texto or "400000" in texto or "lapiz" in texto
    for marca in MARCAS:
        assert marca not in texto, f"{tabla} trae «{marca}»: una orden cancelada se coló"


def test_la_tasa_de_cancelacion_si_las_cuenta(salidas):
    stats = salidas["buyer_payment_stats"]
    hospital = stats.filter(pl.col("CodigoOrganismoPublico") == "1000").row(0, named=True)
    vivas_por_mes = 3 * len(VIVOS)
    total = len(MESES) * (vivas_por_mes + POR_MES_CANCELADAS)
    assert hospital["n_oc_estado"] == total
    assert hospital["n_canceladas"] == len(MESES) * POR_MES_CANCELADAS
    assert hospital["tasa_cancelacion"] == pytest.approx(
        POR_MES_CANCELADAS / (vivas_por_mes + POR_MES_CANCELADAS)
    )
    municipal = stats.filter(pl.col("CodigoOrganismoPublico") == "2000").row(0, named=True)
    assert municipal["tasa_cancelacion"] == 0
    # El volumen, en cambio, sólo cuenta lo que compró: es el `n_oc_total` que
    # muestra la ficha del comprador y el umbral para indexarla.
    assert hospital["n_oc_total"] == len(MESES) * vivas_por_mes


def test_una_orden_sin_estado_se_queda():
    """El filtro niega ANTES de rellenar los nulos: sin estado no se sabe que no comprara."""
    df = pl.DataFrame({"Codigo": ["a", "b", "c"], "Estado": ["Cancelada", None, "Aceptada"]})
    assert data_loader.sin_canceladas(df)["Codigo"].to_list() == ["b", "c"]


def test_quien_las_pide_las_recibe_y_quien_no_pide_el_estado_no_lo_recibe(tmp_path, monkeypatch):
    oc = tmp_path / "oc"
    oc.mkdir()
    _mes(2026, 1).write_parquet(oc / "2026-1.parquet")
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", oc)
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", tmp_path / "lic")

    ((_, sin),) = list(data_loader.iter_oc_parquets(columns=["Codigo", "CodigoProveedor"]))
    assert "Estado" not in sin.columns
    assert CANCELADO[0] not in sin["CodigoProveedor"].to_list()

    ((_, con),) = list(
        data_loader.iter_oc_parquets(columns=["Codigo", "CodigoProveedor"], canceladas=True)
    )
    assert "Estado" not in con.columns
    assert con["CodigoProveedor"].to_list().count(CANCELADO[0]) == POR_MES_CANCELADAS
