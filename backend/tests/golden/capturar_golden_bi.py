"""Captura la salida actual de bi_service como referencia (golden master).

Se ejecuta **con la implementación basada en parquets todavía en pie**, sobre los
datos reales del pipeline. El resultado es el contrato que la versión sobre
Postgres tiene que reproducir exactamente.

    cd backend
    ANALYTICS_DATA_PATH=../etl/data/analytics SECRET_KEY=x \
        uv run --project .. python tests/golden/capturar_golden_bi.py

No es un test: es la herramienta que genera el fichero contra el que testean
`test_bi_service_equivalencia.py`. Se vuelve a correr sólo si cambia el pipeline
y hay que rebasar la referencia a propósito.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.services import bi as bi_service  # noqa: E402

SALIDA = Path(__file__).parent / "bi_golden.json"


def _casos() -> list[tuple[str, dict]]:
    """Casos de prueba tomados de los datos reales, no inventados.

    Se leen los propios parquets para elegir claves que existen; con valores
    inventados todas las funciones devolverían "no disponible" y el golden no
    probaría nada.
    """
    import polars as pl

    from app.config import settings

    d = Path(settings.analytics_data_path)

    def _muestra(archivo: str, col: str, n: int = 2) -> list:
        ruta = d / archivo
        if not ruta.exists():
            return []
        df = pl.read_parquet(ruta)
        if col not in df.columns or df.is_empty():
            return []
        return [v for v in df[col].unique().head(n).to_list() if v is not None]

    productos = _muestra("product_price_bands_L1.parquet", "codigoProductoONU")
    organismos = _muestra("product_price_bands_L1.parquet", "CodigoOrganismoPublico")
    rubros = _muestra("competitors_by_market.parquet", "RubroN2")
    proveedores = _muestra("provider_diversification.parquet", "CodigoProveedor")
    externos = _muestra("window_classified.parquet", "CodigoExterno")
    sectores = _muestra("sector_dashboard.parquet", "sector")

    casos: list[tuple[str, dict]] = []

    for p in productos:
        casos.append(("get_precio_producto", {"codigo_producto": p}))
        if organismos:
            casos.append(
                ("get_precio_producto", {"codigo_producto": p, "organismo_id": organismos[0]})
            )
    # Caso negativo: producto inexistente debe seguir devolviendo lo mismo.
    casos.append(("get_precio_producto", {"codigo_producto": "00000000"}))

    for o in organismos:
        casos.append(("get_competidores", {"organismo_id": o}))
        casos.append(("get_comprador", {"organismo_id": o}))
        casos.append(("get_estacionalidad", {"organismo_id": o}))
        if rubros:
            casos.append(("get_competidores", {"organismo_id": o, "rubro": rubros[0]}))

    for r in rubros:
        casos.append(("get_oportunidades", {"rubro": r}))
        casos.append(("get_tendencia", {"rubro": r}))
        casos.append(("get_resumen", {"rubro": r}))

    for e in externos:
        casos.append(("get_ventana", {"codigo_externo": e}))
    for pr in proveedores:
        casos.append(("get_diversificacion", {"codigo_proveedor": pr}))
    for s in sectores:
        casos.append(("get_sector", {"sector": s}))

    casos.append(("get_descuento", {}))
    casos.append(("get_forecast_competidores", {}))
    casos.append(("get_rubros", {"limit": 20}))
    casos.append(("get_productos", {"q": "servicio"}))
    casos.append(("get_productos", {"q": "x"}))  # consulta corta → early return
    casos.append(("get_resumen", {}))

    return casos


def main() -> int:
    casos = _casos()
    if not casos:
        print("ERROR: no se pudieron construir casos — ¿están los parquets generados?")
        return 1

    golden = []
    for nombre, kwargs in casos:
        fn = getattr(bi_service, nombre, None)
        if fn is None:
            print(f"  omitido (no existe): {nombre}")
            continue
        try:
            resultado = fn(**kwargs)
            golden.append({"funcion": nombre, "kwargs": kwargs, "resultado": resultado})
        except Exception as exc:  # noqa: BLE001
            # También se captura el fallo: si hoy revienta, la versión nueva debe
            # reventar igual. Un cambio de excepción a resultado también es un cambio.
            golden.append(
                {
                    "funcion": nombre,
                    "kwargs": kwargs,
                    "excepcion": f"{type(exc).__name__}: {exc}",
                }
            )

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(golden, ensure_ascii=False, indent=1, default=str))
    con_datos = sum(
        1
        for g in golden
        if isinstance(g.get("resultado"), dict) and g["resultado"].get("disponible")
    )
    print(f"golden escrito: {SALIDA}")
    print(f"  {len(golden)} casos, {con_datos} con datos disponibles")
    return 0


if __name__ == "__main__":
    sys.exit(main())
