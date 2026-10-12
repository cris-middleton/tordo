"""Bandas de precio por producto y búsqueda de productos.

El fallback jerárquico es el núcleo del BI: devuelve un rango con dispersión y
tamaño de muestra, no un promedio.

    L0  firma del producto + organismo + unidad   ← el mismo producto
    L0N firma del producto + unidad (nacional)    ← el mismo producto
    L1  categoría UNSPSC + organismo + unidad
    L2  categoría UNSPSC + sector + unidad
    L3  categoría UNSPSC + unidad (nacional)
    L4  rubro + organismo (contexto general)

**L0 va primero y no es un nivel más.** De L1 hacia abajo se agrupa por
`codigoProductoONU`, que es una categoría del catálogo UNSPSC: en los datos
reales, una sola categoría en un solo hospital y un solo mes contiene artículos
que difieren en cinco órdenes de magnitud. L0 agrupa por la firma de
`EspecificacionComprador`, que sí identifica el artículo. Ver
`etl/analytics/normalizacion.py`.

**Si el parquet de L0 no existe, el comportamiento es exactamente el de antes.**
No es casualidad ni cortesía: es lo que permite que el golden master —cuyo
fixture se capturó sin ese nivel— siga fijando el contrato de L1→L4 sin cambios.

Parte de `app.services.bi`, que reemplaza al antiguo `bi_service.py` de 1.476
líneas. El contrato hacia los endpoints lo fija el golden master en
`backend/tests/golden/bi_golden.json`.
"""

from __future__ import annotations

import logging

from app.services.bi._base import _load, periodo_de

logger = logging.getLogger(__name__)

#: Cuántos productos distintos devuelve L0 como máximo. Una categoría UNSPSC
#: amplia puede tener cientos en un mismo comprador; la pantalla muestra los que
#: tienen más respaldo, no todos.
MAX_PRODUCTOS_L0 = 12


def get_precio_producto(
    codigo_producto: str,
    organismo_id: str | None = None,
    unidad_medida: str | None = None,
) -> dict:
    """
    Price bands for a given product (codigoProductoONU).

    Hierarchical fallback L1 → L2 → L3:
      L1 (producto + organismo + unidad): most specific, requires organismo_id.
      L2 (producto + sector + unidad): sector fallback when organismo has no data.
      L3 (producto + unidad nacional): national fallback of last resort.

    Returns p10/p25/p50/p75/p90, confidence, sample count, and nivel_usado.
    """
    # ETL writes the column as "NombreroductoGenerico" (missing 'P' — historical typo).
    # COLS lists use the typo'd name so _sel finds it; _to_dicts renames to the
    # canonical API name "NombreProductoGenerico" before Pydantic serialisation.
    COLS_L0 = [
        "firma_producto",
        "descripcion",
        "codigoProductoONU",
        "NombreroductoGenerico",
        "CodigoOrganismoPublico",
        "OrganismoPublico",
        "UnidadMedida",
        "p10",
        "p25",
        "p50",
        "p75",
        "p90",
        "pu_mean",
        "cv",
        "qcd",
        "predictibilidad",
        "confianza",
        "n",
    ]
    COLS_L1 = [
        "codigoProductoONU",
        "NombreroductoGenerico",
        "CodigoOrganismoPublico",
        "OrganismoPublico",
        "UnidadMedida",
        "p10",
        "p25",
        "p50",
        "p75",
        "p90",
        "pu_mean",
        "cv",
        "qcd",
        "predictibilidad",
        "confianza",
        "n",
    ]
    COLS_L2 = [
        "codigoProductoONU",
        "NombreroductoGenerico",
        "sector",
        "UnidadMedida",
        "p10",
        "p25",
        "p50",
        "p75",
        "p90",
        "pu_mean",
        "cv",
        "qcd",
        "predictibilidad",
        "confianza",
        "n",
    ]
    COLS_L3 = [
        "codigoProductoONU",
        "NombreroductoGenerico",
        "UnidadMedida",
        "p10",
        "p25",
        "p50",
        "p75",
        "p90",
        "pu_mean",
        "cv",
        "qcd",
        "predictibilidad",
        "confianza",
        "n",
    ]
    COLS_L0N = [c for c in COLS_L0 if c not in ("CodigoOrganismoPublico", "OrganismoPublico")]

    def _sel(df, cols):
        return [c for c in cols if c in df.columns]

    def _to_dicts(df, cols):
        selected = df.select(_sel(df, cols))
        if "NombreroductoGenerico" in selected.columns:
            selected = selected.rename({"NombreroductoGenerico": "NombreProductoGenerico"})
        return selected.to_dicts()

    def _unit_mask(df):
        if unidad_medida:
            return df["UnidadMedida"] == unidad_medida
        return None

    def _mejores(df, tope: int = MAX_PRODUCTOS_L0):
        """Los productos con más respaldo primero, y sólo los primeros.

        Se desempata por la firma, que es única dentro del grupo: sin el
        desempate, dos productos con la misma `n` alternarían el orden entre
        llamadas y la pantalla parecería inestable sin que cambiara el dato.
        """
        columnas = ["n"] + (["firma_producto"] if "firma_producto" in df.columns else [])
        return df.sort(columnas, descending=[True] + [False] * (len(columnas) - 1)).head(tope)

    def _filtros(**kv) -> dict:
        """Descarta las claves sin valor.

        En el repositorio un valor None significa `IS NULL`, no "no filtrar":
        incluirlo sin querer devolvería cero filas.
        """
        return {k: v for k, v in kv.items() if v is not None}

    # ── Level 0: el mismo producto, este comprador ───────────────────────────
    #
    # Devuelve VARIAS filas: dentro de una categoría UNSPSC hay varios productos
    # reales, y enseñarlos por separado es justamente la mejora. El contrato ya
    # admite una lista (`resultado`), así que no hay cambio de forma.
    #
    # Se ordena por muestra descendente y se corta: una categoría amplia puede
    # tener cientos de productos y la pantalla no los quiere todos. El corte va
    # aquí y no en el endpoint para que la cuota de BI cubra siempre lo mismo.
    if organismo_id:
        df0 = _load(
            "product_price_bands_L0.parquet",
            filtros=_filtros(
                codigoProductoONU=str(codigo_producto),
                CodigoOrganismoPublico=str(organismo_id),
                UnidadMedida=unidad_medida,
            ),
        )
        if df0 is not None and "firma_producto" in df0.columns:
            mask = (df0["codigoProductoONU"].cast(str) == str(codigo_producto)) & (
                df0["CodigoOrganismoPublico"].cast(str) == str(organismo_id)
            )
            um = _unit_mask(df0)
            if um is not None:
                mask = mask & um
            rows = df0.filter(mask)
            if not rows.is_empty():
                rows = _mejores(rows)
                return {
                    "disponible": True,
                    "codigo_producto": codigo_producto,
                    "resultado": _to_dicts(rows, COLS_L0),
                    "total_registros": len(rows),
                    "nivel_usado": "L0",
                    "periodo": periodo_de(df0),
                    "fallback": False,
                }

    # ── Level 0N: el mismo producto, cualquier comprador ─────────────────────
    df0n = _load(
        "product_price_bands_L0N.parquet",
        filtros=_filtros(codigoProductoONU=str(codigo_producto), UnidadMedida=unidad_medida),
    )
    if df0n is not None and "firma_producto" in df0n.columns:
        mask = df0n["codigoProductoONU"].cast(str) == str(codigo_producto)
        um = _unit_mask(df0n)
        if um is not None:
            mask = mask & um
        rows = df0n.filter(mask)
        if not rows.is_empty():
            rows = _mejores(rows)
            return {
                "disponible": True,
                "codigo_producto": codigo_producto,
                "resultado": _to_dicts(rows, COLS_L0N),
                "total_registros": len(rows),
                "nivel_usado": "L0N",
                "periodo": periodo_de(df0n),
                "fallback": True,
                "fallback_motivo": (
                    "sin datos de este comprador para estos productos — referencia nacional "
                    "del mismo producto"
                ),
            }

    # ── Level 1: producto + organismo ────────────────────────────────────────
    if organismo_id:
        df1 = _load(
            "product_price_bands_L1.parquet",
            filtros=_filtros(
                codigoProductoONU=str(codigo_producto),
                CodigoOrganismoPublico=str(organismo_id),
                UnidadMedida=unidad_medida,
            ),
        )
        if df1 is not None:
            mask = (df1["codigoProductoONU"].cast(str) == str(codigo_producto)) & (
                df1["CodigoOrganismoPublico"].cast(str) == str(organismo_id)
            )
            um = _unit_mask(df1)
            if um is not None:
                mask = mask & um
            rows = df1.filter(mask)
            if not rows.is_empty():
                return {
                    "disponible": True,
                    "codigo_producto": codigo_producto,
                    "resultado": _to_dicts(rows, COLS_L1),
                    "total_registros": len(rows),
                    "nivel_usado": "L1",
                    "periodo": periodo_de(df1),
                    "fallback": False,
                }

    # ── Level 2: producto + sector ───────────────────────────────────────────
    df2 = _load(
        "product_price_bands_L2.parquet",
        filtros=_filtros(codigoProductoONU=str(codigo_producto), UnidadMedida=unidad_medida),
    )
    if df2 is not None:
        mask = df2["codigoProductoONU"].cast(str) == str(codigo_producto)
        um = _unit_mask(df2)
        if um is not None:
            mask = mask & um
        rows = df2.filter(mask)
        if not rows.is_empty():
            return {
                "disponible": True,
                "codigo_producto": codigo_producto,
                "resultado": _to_dicts(rows, COLS_L2),
                "total_registros": len(rows),
                "nivel_usado": "L2",
                "periodo": periodo_de(df2),
                "fallback": True,
                "fallback_motivo": "sin datos del organismo específico — referencia por sector",
            }

    # ── Level 3: producto nacional ───────────────────────────────────────────
    df3 = _load(
        "product_price_bands_L3.parquet",
        filtros=_filtros(codigoProductoONU=str(codigo_producto), UnidadMedida=unidad_medida),
    )
    if df3 is not None:
        mask = df3["codigoProductoONU"].cast(str) == str(codigo_producto)
        um = _unit_mask(df3)
        if um is not None:
            mask = mask & um
        rows = df3.filter(mask)
        if not rows.is_empty():
            return {
                "disponible": True,
                "codigo_producto": codigo_producto,
                "resultado": _to_dicts(rows, COLS_L3),
                "total_registros": len(rows),
                "nivel_usado": "L3",
                "periodo": periodo_de(df3),
                "fallback": True,
                "fallback_motivo": "sin datos por organismo ni sector — referencia nacional",
            }

    # ── Level 4: organismo-level price bands (general context) ───────────────
    if organismo_id:
        df4 = _load("price_bands.parquet", filtros={"CodigoOrganismoPublico": str(organismo_id)})
        if df4 is not None:
            mask4 = df4["CodigoOrganismoPublico"].cast(str) == str(organismo_id)
            rows4 = df4.filter(mask4).head(5)
            if not rows4.is_empty():
                # Map price_bands columns to PrecioBanda layout
                mapped = []
                for r in rows4.to_dicts():
                    mapped.append(
                        {
                            "p10": r.get("p10"),
                            "p25": r.get("p25"),
                            "p50": r.get("precio_mediana"),
                            "p75": r.get("p75"),
                            "p90": r.get("p90"),
                            "pu_mean": r.get("precio_promedio"),
                            "cv": r.get("coef_variacion"),
                            "NombreProductoGenerico": r.get("RubroN2"),
                            "n": r.get("n_transacciones"),
                            # Esta tabla es organismo × rubro, sin dimensión de
                            # unidad: no hay una `UnidadMedida` que reportar (a
                            # diferencia de L0-L3, que sí la traen — ver
                            # PrecioBanda.UnidadMedida).
                            "UnidadMedida": r.get("UnidadMedida"),
                            # `precio_predecible` es un booleano (CV < 0.4), no el
                            # score continuo 0-1 que `confianza` es en L0-L3 (media
                            # geométrica de muestra y QCD — ver
                            # etl/analytics/product_price_bands.py). Meter el
                            # booleano en esa escala sería inventar un número, no
                            # traducir uno — y el esquema ya advierte que ESTE MISMO
                            # bug (un string donde el schema declara float) tumbó el
                            # endpoint entero una vez (ver el comentario en
                            # schemas/bi.py junto a `confianza`). `cv`, dos líneas
                            # más arriba, sigue disponible para quien quiera la
                            # dispersión real; `nivel_usado` ("L4") ya dice que esto
                            # es una referencia general del organismo, no del
                            # producto — no hace falta que `confianza` cargue
                            # también esa aspereza.
                            "confianza": None,
                        }
                    )
                return {
                    "disponible": True,
                    "codigo_producto": codigo_producto,
                    "resultado": mapped,
                    "total_registros": len(mapped),
                    "nivel_usado": "L4",
                    "periodo": periodo_de(df4),
                    "fallback": True,
                    "fallback_motivo": "sin datos por producto — referencia general del organismo por rubro",
                }

    return {"disponible": False, "motivo": "producto no encontrado en histórico (L1+L2+L3+L4)"}


def get_productos(q: str, limit: int = 20) -> dict:
    """
    Busca productos por nombre en product_price_bands_L3.
    Retorna lista de {codigo, nombre, n} ordenada por frecuencia (n).
    """
    import polars as pl

    if not q or len(q.strip()) < 2:
        return {"disponible": True, "resultados": []}

    df = _load("product_price_bands_L3.parquet")
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    # El nombre en el parquet está como NombreroductoGenerico (sin 'P' — typo histórico)
    nombre_col = None
    for c in ("NombreroductoGenerico", "NombreProductoGenerico"):
        if c in df.columns:
            nombre_col = c
            break
    if nombre_col is None:
        return {"disponible": False, "motivo": "columna de nombre no encontrada"}

    q_norm = q.strip().lower()
    # Filtrar por contains, case-insensitive
    matches = (
        df.filter(pl.col(nombre_col).str.to_lowercase().str.contains(q_norm, literal=True))
        .select(["codigoProductoONU", pl.col(nombre_col).alias("nombre"), "n"])
        .unique(subset=["codigoProductoONU"])
        # Mismo motivo que en get_rubros: con `head(limit)` el empate en `n`
        # decide qué productos entran. Se desempata por código, que es único.
        .sort(["n", "codigoProductoONU"], descending=[True, False])
        .head(limit)
    )

    return {
        "disponible": True,
        "resultados": matches.to_dicts(),
        "total": len(matches),
    }
