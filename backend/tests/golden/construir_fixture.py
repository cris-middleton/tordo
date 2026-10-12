"""Construye el fixture de analytics que hace correr el golden master en CI.

El problema
-----------
El golden master necesita el esquema `analytics` materializado. En CI está vacío,
así que el test se saltaba en silencio: 31 casos que verificaban `services/bi/` y
que **no corrían en ninguna parte automáticamente**. Un cambio a BI sólo estaba
verificado si alguien se acordaba de correr el golden en local.

Los datos completos no caben: 27 MB de parquets, 12,6 MB comprimidos, contra un
límite de 1 MB por archivo en el hook de pre-commit.

Qué hace
--------
Recorta cada parquet a las filas que el golden realmente consulta —los productos,
organismos, rubros, proveedores y sectores que aparecen en sus 31 casos— y
completa con una cabecera determinista para que las funciones de agregación
global (`get_resumen()`, `get_rubros()`) tengan algo que agregar.

Uso:

    cd backend && uv run --project .. python tests/golden/construir_fixture.py \
        --origen ~/personal/tordo/etl/data/analytics

Después hay que **recapturar el golden** contra el fixture: con menos filas, las
funciones de agregación global devuelven otros números.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import fixture_productos
import polars as pl

# Las claves que aparecen en los 31 casos de bi_golden.json. Si añades un caso
# con una clave nueva, agrégala aquí y reconstruye.
CLAVES = {
    "41122004",
    "90111802",
    "00000000",  # productos
    "7084",
    "115167",  # organismos
    "Válvulas electrónicas",
    "Suministros de oficina",  # rubros
    "2405-24-B226",
    "1620-1-LE26",  # licitaciones
    "1595644",
    "1997323",  # proveedores
    "Otros",
    "FFAA",  # sectores
}

# Bandas por producto: NO se recortan de la descarga. Son sintéticas y las
# escribe `fixture_productos.py` (con un código ONU que no existe, para no tocar
# la cascada de los casos del golden). Recortarlas de datos reales las cambiaría.
SINTETICAS = {"product_price_bands_L0.parquet", "product_price_bands_L0N.parquet"}

# Tope por tabla. Suficiente para que las agregaciones globales sean
# representativas sin que el fixture crezca.
TOPE = 400


def recortar(df: pl.DataFrame) -> pl.DataFrame:
    """Filas que tocan alguna clave del golden, más una cabecera determinista."""
    textos = [c for c, t in zip(df.columns, df.dtypes, strict=False) if t == pl.Utf8]

    if textos:
        condicion = None
        for col in textos:
            actual = pl.col(col).is_in(list(CLAVES))
            condicion = actual if condicion is None else (condicion | actual)
        relevantes = df.filter(condicion)
    else:
        relevantes = df.head(0)

    # El orden importa: sin él, dos corridas sobre el mismo parquet podrían dar
    # cabeceras distintas y el golden dejaría de ser reproducible.
    resto = df.sort(by=df.columns).head(TOPE)
    return pl.concat([relevantes, resto]).unique(keep="first")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--origen", required=True, type=Path)
    ap.add_argument("--destino", type=Path, default=Path(__file__).parent / "fixture_analytics")
    args = ap.parse_args()

    if args.destino.exists():
        shutil.rmtree(args.destino)
    args.destino.mkdir(parents=True)

    total = 0
    for parquet in sorted(args.origen.glob("*.parquet")):
        if parquet.name in SINTETICAS:
            continue
        try:
            df = pl.read_parquet(parquet)
        except Exception as exc:  # noqa: BLE001
            print(f"  {parquet.name}: ilegible ({exc}) — se omite")
            continue
        recorte = recortar(df)
        salida = args.destino / parquet.name
        recorte.write_parquet(salida, compression="zstd")
        tam = salida.stat().st_size
        total += tam
        print(f"  {parquet.name:44} {len(df):>7} → {len(recorte):>5} filas  {tam / 1024:>7.0f} KB")

    print(f"\ntotal: {total / 1024 / 1024:.2f} MB")
    fixture_productos.main(args.destino)


if __name__ == "__main__":
    main()
