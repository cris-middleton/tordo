"""Escribe las bandas por producto (L0/L0N) SINTÉTICAS del fixture de analytics.

El fixture del golden master se recortó de datos reales antes de que existieran
los niveles de producto, así que no trae `product_price_bands_L0N` ni `_L0`. Las
páginas públicas de producto (paso 10 del pivote) y sus E2E las necesitan.

**Son inventadas a propósito, no recortadas de la descarga**: firmas que no
existen («… prueba») y un código ONU que tampoco (`99999901`). Con un código real
la cascada de `/bi/precio` encontraría L0/L0N antes que L1 en los casos del
golden y cambiaría su resultado; con éste, ningún caso del golden lo toca y no
hace falta recapturar.

Qué cubren:

- `guante nitrilo prueba` — **indexable**, con dos unidades (caja y unidad) y
  dos compradores en L0.
- `resma papel prueba` — **no indexable** (n < 10): página con `noindex`.
- `jabon liquido prueba` / `jabón líquido prueba` — **colisión de slug**: gana
  la de más compras (sin tilde, 30 contra 12).
- `cloro tableta prueba` — **no indexable por ser de un solo comprador**: 40
  compras y predictibilidad alta, pero todas de un organismo. Es el precio de
  su contrato, no uno de mercado (`indexables.MIN_COMPRADORES_PRODUCTO`).

Cada banda nacional trae `compradores` y `cuota_mayor`, como las del ETL.
La `descripcion` es la de un comprador que escribe el producto en mayúsculas y
con artículos: el título de la ficha sale de ahí, no de la firma.

Los compradores de L0 son códigos que sí están en el fixture (con perfil y con
mercado), para que los enlaces producto → comprador lleven a una página que
existe. Los nombres son inventados.

Uso (desde `backend/`):

    uv run --project .. python tests/golden/fixture_productos.py
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import polars as pl

DESTINO = Path(__file__).resolve().parent / "fixture_analytics"

CODIGO_ONU = "99999901"
VENTANA = {"ventana_desde": date(2025, 4, 1), "ventana_hasta": date(2026, 3, 31)}
COMPRADORES = {"111875": "ORGANISMO DE PRUEBA A", "113812": "ORGANISMO DE PRUEBA B"}


def _banda(
    firma: str,
    unidad: str,
    n: int,
    predictibilidad: str,
    p50: float,
    *,
    descripcion: str,
    compradores: int = 6,
    cuota_mayor: float = 0.25,
) -> dict:
    qcd = {"alta": 0.1, "media": 0.3, "baja": 0.6}[predictibilidad]
    return {
        "firma_producto": firma,
        "UnidadMedida": unidad,
        "n": n,
        "p10": p50 * 0.7,
        "p25": p50 * 0.85,
        "p50": p50,
        "p75": p50 * 1.15,
        "p90": p50 * 1.3,
        "pu_mean": p50,
        "pu_std": p50 * 0.2,
        "pu_min": p50 * 0.5,
        "pu_max": p50 * 1.6,
        "cv": 0.2,
        "ratio_iqr": 0.3,
        "qcd": qcd,
        "nivel": 0,
        "confianza": min(1.0, n / 50),
        "predictibilidad": predictibilidad,
        "codigoProductoONU": CODIGO_ONU,
        # Con la P perdida, como viene del pipeline (etl/loaders/analytics_catalog.py).
        "NombreroductoGenerico": "Producto de prueba",
        "descripcion": descripcion,
        "compradores": compradores,
        "cuota_mayor": cuota_mayor,
        **VENTANA,
    }


GUANTE = "GUANTE DE NITRILO PRUEBA"
JABON = "JABON LIQUIDO PRUEBA"

NACIONAL = [
    _banda("guante nitrilo prueba", "caja", 60, "alta", 9_000.0, descripcion=GUANTE),
    _banda("guante nitrilo prueba", "unidad", 25, "media", 90.0, descripcion=GUANTE),
    _banda("resma papel prueba", "resma", 4, "alta", 4_500.0, descripcion="RESMA PAPEL PRUEBA"),
    _banda("jabon liquido prueba", "litro", 30, "alta", 2_000.0, descripcion=JABON),
    _banda(
        "jabón líquido prueba", "litro", 12, "media", 2_100.0, descripcion="JABÓN LÍQUIDO PRUEBA"
    ),
    _banda(
        "cloro tableta prueba",
        "unidad",
        40,
        "alta",
        300.0,
        descripcion="CLORO EN TABLETA PRUEBA",
        compradores=1,
        cuota_mayor=1.0,
    ),
]

POR_COMPRADOR = [
    {
        **_banda("guante nitrilo prueba", "caja", 40, "alta", 8_800.0, descripcion=GUANTE),
        "codigo": "111875",
    },
    {
        **_banda("guante nitrilo prueba", "unidad", 12, "media", 95.0, descripcion=GUANTE),
        "codigo": "113812",
    },
    {
        **_banda("jabon liquido prueba", "litro", 15, "alta", 1_950.0, descripcion=JABON),
        "codigo": "111875",
    },
]
for _fila in POR_COMPRADOR:
    _fila["CodigoOrganismoPublico"] = _fila.pop("codigo")
    _fila["OrganismoPublico"] = COMPRADORES[_fila["CodigoOrganismoPublico"]]


def main(destino: Path = DESTINO) -> None:
    pl.DataFrame(NACIONAL).with_columns(pl.col("n").cast(pl.UInt32)).write_parquet(
        destino / "product_price_bands_L0N.parquet"
    )
    l0 = pl.DataFrame(POR_COMPRADOR).with_columns(pl.col("n").cast(pl.UInt32))
    # L0 es por comprador: no lleva cuántos compradores tiene detrás.
    columnas = ["firma_producto", "CodigoOrganismoPublico", "OrganismoPublico"] + [
        c for c in NACIONAL[0] if c not in ("firma_producto", "compradores", "cuota_mayor")
    ]
    l0.select(columnas).write_parquet(destino / "product_price_bands_L0.parquet")


if __name__ == "__main__":
    main()
