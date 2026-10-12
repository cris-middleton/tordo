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


def _banda(firma: str, unidad: str, n: int, predictibilidad: str, p50: float) -> dict:
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
        "descripcion": f"{firma.upper()} (DESCRIPCION DE PRUEBA)",
        **VENTANA,
    }


NACIONAL = [
    _banda("guante nitrilo prueba", "caja", 60, "alta", 9_000.0),
    _banda("guante nitrilo prueba", "unidad", 25, "media", 90.0),
    _banda("resma papel prueba", "resma", 4, "alta", 4_500.0),
    _banda("jabon liquido prueba", "litro", 30, "alta", 2_000.0),
    _banda("jabón líquido prueba", "litro", 12, "media", 2_100.0),
]

POR_COMPRADOR = [
    {**_banda("guante nitrilo prueba", "caja", 40, "alta", 8_800.0), "codigo": "111875"},
    {**_banda("guante nitrilo prueba", "unidad", 12, "media", 95.0), "codigo": "113812"},
    {**_banda("jabon liquido prueba", "litro", 15, "alta", 1_950.0), "codigo": "111875"},
]
for _fila in POR_COMPRADOR:
    _fila["CodigoOrganismoPublico"] = _fila.pop("codigo")
    _fila["OrganismoPublico"] = COMPRADORES[_fila["CodigoOrganismoPublico"]]


def main(destino: Path = DESTINO) -> None:
    pl.DataFrame(NACIONAL).with_columns(pl.col("n").cast(pl.UInt32)).write_parquet(
        destino / "product_price_bands_L0N.parquet"
    )
    l0 = pl.DataFrame(POR_COMPRADOR).with_columns(pl.col("n").cast(pl.UInt32))
    columnas = ["firma_producto", "CodigoOrganismoPublico", "OrganismoPublico"] + [
        c for c in NACIONAL[0] if c != "firma_producto"
    ]
    l0.select(columnas).write_parquet(destino / "product_price_bands_L0.parquet")


if __name__ == "__main__":
    main()
