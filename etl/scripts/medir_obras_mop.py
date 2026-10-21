"""
¿Cuántas obras del MOP tienen orden de compra en la descarga masiva?

Obras Públicas suma en las órdenes de compra mucho menos que la cifra oficial de
ChileCompra (0,75 contra 3,09 billones en 2025). Este script lo mide: cruza las
licitaciones de Obras Públicas adjudicadas en un año con las órdenes de compra de
la descarga masiva, y separa las licitaciones de OBRA (tipos O1 y O2) del resto y
el MOP de MINVU y los SERVIU.

Una licitación «tiene orden» si alguna orden la nombra: en `CodigoLicitacion` o
en su `Nombre` («ORDEN DE COMPRA DESDE 1151-5-O125»). Las licitaciones de obra
de MINVU y las demás del MOP sirven de control: si el cruce no encontrara las
órdenes que existen, también ahí saldría bajo.

Baja la descarga pública de ChileCompra mes a mes, se queda con un resumen por
orden y por licitación en `--trabajo` y borra cada ZIP al terminar con él: los
36 meses de órdenes son ~3,6 GB y no hace falta guardarlos. Lo ya resumido no se
vuelve a bajar.

**No pasa por `data_loader`** porque no lee consolidados: lee los ZIP de la
descarga. Tampoco lo necesita: no lee ninguna columna del proveedor, y del texto
libre sólo saca códigos de licitación. Lo que imprime son conteos y sumas.

Uso, desde la raíz:
  uv run python -m etl.scripts.medir_obras_mop
  uv run python -m etl.scripts.medir_obras_mop --anio 2024 --trabajo /tmp/obras
"""

from __future__ import annotations

import argparse
import io
import logging
import os
import zipfile
from pathlib import Path

import polars as pl

from etl.analytics.data_loader import (
    ESTADOS_CANCELADOS,
    con_monto_saneado,
    con_numeros,
    con_vacios,
)
from etl.scripts.descargar_datos_masivos import BASE_URLS, descargar_zip, generar_periodos

logger = logging.getLogger("medir_obras_mop")

SECTOR = "Obras Públicas"
TIPOS_DE_OBRA = ("O1", "O2")
#: Un código de licitación: «1151-5-O125», «5048-96-O224».
PATRON_CODIGO = r"\d+-\d+-[A-Z][A-Z0-9]\d{2}"

COLUMNAS_OC = [
    "Codigo",
    "Nombre",
    "CodigoLicitacion",
    "sector",
    "Estado",
    "TipoMonedaOC",
    "MontoTotalOC",
    "MontoTotalOC_PesosChilenos",
    "monedaItem",
    "OrganismoPublico",
]
COLUMNAS_LIC = [
    "CodigoExterno",
    "sector",
    "NombreOrganismo",
    "Tipo",
    "FechaAdjudicacion",
    "Monto Estimado Adjudicado",
    "Oferta seleccionada",
]


def leer_zip(ruta: Path, columnas: list[str]) -> pl.DataFrame:
    """El CSV del ZIP, todo como texto y sólo con las columnas pedidas."""
    with zipfile.ZipFile(ruta) as zf:
        crudo = zf.read(zf.namelist()[0])
    try:
        texto = crudo.decode("utf-8")
    except UnicodeDecodeError:
        texto = crudo.decode("latin-1")
    del crudo
    return pl.read_csv(
        io.BytesIO(texto.encode("utf-8")),
        separator=";",
        infer_schema_length=0,
        truncate_ragged_lines=True,
        ignore_errors=True,
        columns=columnas,
    )


def resumir_ordenes(df: pl.DataFrame, archivo: str) -> pl.DataFrame:
    """Una fila por orden: sector, monto saneado y los códigos de licitación que nombra."""
    df = con_monto_saneado(con_numeros(con_vacios(df)))
    codigos = pl.concat_list(
        pl.col("CodigoLicitacion").str.to_uppercase().str.extract_all(PATRON_CODIGO),
        pl.col("Nombre").str.to_uppercase().str.extract_all(PATRON_CODIGO),
    )
    return (
        df.with_columns(codigos.alias("codigos"))
        .group_by("Codigo")
        .agg(
            pl.first("sector"),
            pl.first("Estado"),
            pl.first("MontoTotalOC_PesosChilenos").alias("monto"),
            pl.col("codigos").flatten().unique().drop_nulls(),
        )
        .with_columns(pl.lit(archivo).alias("archivo"))
    )


def resumir_licitaciones(df: pl.DataFrame) -> pl.DataFrame:
    """Una fila por licitación adjudicada de Obras Públicas, con su monto adjudicado."""
    return (
        df.filter((pl.col("sector") == SECTOR) & (pl.col("Oferta seleccionada") == "Seleccionada"))
        .with_columns(
            pl.col("Monto Estimado Adjudicado")
            .str.replace(",", ".", literal=True)
            .cast(pl.Float64, strict=False)
            .alias("adjudicado")
        )
        .group_by("CodigoExterno")
        .agg(
            pl.first("NombreOrganismo"),
            pl.first("Tipo"),
            pl.first("FechaAdjudicacion"),
            pl.first("adjudicado"),
        )
    )


def cruzar(licitaciones: pl.DataFrame, ordenes: pl.DataFrame, anio: str) -> pl.DataFrame:
    """Licitaciones adjudicadas en `anio`, por ministerio y clase, con y sin orden."""
    nombradas = (
        ordenes.select("codigos")
        .explode("codigos")
        .drop_nulls()
        .unique()
        .rename({"codigos": "codigo"})
    )
    return (
        licitaciones.filter(pl.col("FechaAdjudicacion").str.starts_with(anio))
        .with_columns(
            pl.when(pl.col("NombreOrganismo").str.to_uppercase().str.contains("VIVIENDA|SERVIU"))
            .then(pl.lit("MINVU y SERVIU"))
            .otherwise(pl.lit("MOP"))
            .alias("ministerio"),
            pl.when(pl.col("Tipo").is_in(TIPOS_DE_OBRA))
            .then(pl.lit("obra"))
            .otherwise(pl.lit("otra"))
            .alias("clase"),
            pl.col("CodigoExterno")
            .str.to_uppercase()
            .is_in(nombradas["codigo"])
            .alias("con_orden"),
        )
        .group_by("ministerio", "clase")
        .agg(
            pl.len().alias("licitaciones"),
            (pl.col("con_orden").mean() * 100).round(0).alias("pct_con_orden"),
            (pl.col("adjudicado").sum() / 1e12).round(2).alias("adjudicado_billones"),
            (pl.col("adjudicado").filter(~pl.col("con_orden")).sum() / 1e12)
            .round(2)
            .alias("sin_orden_billones"),
        )
        .sort("ministerio", "clase")
    )


def monto_del_sector(ordenes: pl.DataFrame, anio: str) -> float:
    """Lo que suma Obras Públicas en las órdenes de `anio`, como `sector_dashboard`."""
    del_anio = ordenes.filter(
        pl.col("archivo").str.starts_with(f"{anio}-")
        & (pl.col("sector") == SECTOR)
        & ~pl.col("Estado").is_in(ESTADOS_CANCELADOS)
    )
    return float(del_anio["monto"].sum() or 0) / 1e12


def resumir_meses(tipo: str, desde: str, hasta: str, trabajo: Path) -> pl.DataFrame:
    """Baja y resume cada mes que falte; devuelve todos los resúmenes juntos."""
    destino = trabajo / tipo
    destino.mkdir(parents=True, exist_ok=True)
    for anio, mes in generar_periodos(desde, hasta):
        nombre = f"{anio}-{mes}"
        resumen = destino / f"{nombre}.parquet"
        if resumen.exists():
            continue
        zip_ = trabajo / f"{tipo}-{nombre}.zip"
        if not descargar_zip(f"{BASE_URLS[tipo]}/{nombre}.zip", zip_):
            logger.warning("No hay %s %s", tipo, nombre)
            continue
        try:
            if tipo == "oc":
                resumir_ordenes(leer_zip(zip_, COLUMNAS_OC), nombre).write_parquet(resumen)
            else:
                resumir_licitaciones(leer_zip(zip_, COLUMNAS_LIC)).write_parquet(resumen)
        finally:
            zip_.unlink(missing_ok=True)
        logger.info("Resumido %s %s", tipo, nombre)
    return pl.read_parquet(destino / "*.parquet")


def main() -> None:
    raiz = Path(os.environ.get("ETL_DATA_DIR") or Path(__file__).resolve().parents[1] / "data")
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--anio", default="2025", help="año de adjudicación y de las órdenes")
    parser.add_argument("--oc-desde", default="2023-11", help="primer mes de órdenes")
    parser.add_argument("--oc-hasta", default="2026-10", help="último mes de órdenes")
    parser.add_argument("--lic-desde", default="2023-01", help="primer mes de licitaciones")
    parser.add_argument("--lic-hasta", default="2026-06", help="último mes de licitaciones")
    parser.add_argument("--trabajo", type=Path, default=raiz / "obras_mop")
    args = parser.parse_args()

    ordenes = resumir_meses("oc", args.oc_desde, args.oc_hasta, args.trabajo)
    licitaciones = resumir_meses("lic", args.lic_desde, args.lic_hasta, args.trabajo).unique(
        subset=["CodigoExterno"], keep="first"
    )
    tabla = cruzar(licitaciones, ordenes, args.anio)
    en_ordenes = monto_del_sector(ordenes, args.anio)
    obras_mop_sin_orden = tabla.filter(
        (pl.col("ministerio") == "MOP") & (pl.col("clase") == "obra")
    )["sin_orden_billones"].sum()

    pl.Config.set_tbl_rows(20)
    pl.Config.set_tbl_width_chars(160)
    print(f"\nLicitaciones de {SECTOR} adjudicadas en {args.anio}:")
    print(tabla)
    print(f"\n{SECTOR} en las órdenes de {args.anio}: {en_ordenes:.2f} billones")
    print(f"Obras del MOP adjudicadas sin orden: {obras_mop_sin_orden:.2f} billones")
    print(f"Suma: {en_ordenes + obras_mop_sin_orden:.2f} billones")


if __name__ == "__main__":
    main()
