"""Panel de una licitación: agrega precio, competidores, comprador y ventana en
una sola respuesta para la vista de decisión.

Parte de `app.services.bi`, que reemplaza al antiguo `bi_service.py` de 1.476
líneas. El contrato hacia los endpoints no cambia: lo fija el golden master en
`backend/tests/golden/bi_golden.json`.
"""

from __future__ import annotations

import logging

from app.services.bi.competencia import get_competidores
from app.services.bi.comprador import get_comprador
from app.services.bi.precio import get_precio_producto
from app.services.bi.temporal import get_ventana

logger = logging.getLogger(__name__)


def get_licitacion_panel(
    codigo_externo: str,
    organismo_id: str | None = None,
    product_codes: list | None = None,
) -> dict:
    """
    Composite BI snapshot for the licitación detail page.

    Aggregates: comprador score + transparencia, ventana de preparación,
    top-5 competidores del organismo (todos sus rubros), and per-product price
    fallback bands (L0→L4; sin organismo, L0N→L3).
    Returns a single dict matching the LicitacionBIPanel schema.
    """
    # ── Comprador ─────────────────────────────────────────────────────────────
    if organismo_id:
        full = get_comprador(organismo_id)
        tramitacion = full.get("tramitacion") or {}
        flags = full.get("risk_flags") or {}
        comprador: dict = {
            "disponible": full["disponible"],
            "nombre": full.get("nombre"),
            "buyer_score": full.get("buyer_score"),
            "clasificacion": full.get("clasificacion"),
            "mediana_dias_aceptacion": tramitacion.get("mediana_dias_aceptacion"),
            "tasa_adjudicacion": tramitacion.get("tasa_adjudicacion"),
            "n_flags": flags.get("n_flags", 0),
            "transparencia": full.get("transparencia"),
            "motivo": full.get("motivo"),
        }
    else:
        comprador = {"disponible": False, "motivo": "organismo_id no disponible", "n_flags": 0}

    # ── Ventana ───────────────────────────────────────────────────────────────
    v = get_ventana(codigo_externo)
    ventana: dict = {
        "disponible": v["disponible"],
        "alerta_ventana_corta": v.get("alerta_ventana_corta"),
        "presion_score": v.get("presion_score"),
        "clasificacion_ventana": v.get("clasificacion_ventana"),
        "pct_del_tipico": v.get("pct_del_tipico"),
        "window_days": v.get("window_days"),
        "motivo": v.get("motivo"),
    }

    # ── Competidores (top 5) ──────────────────────────────────────────────────
    #
    # Sin rubro a propósito: los de TODO lo que compra el organismo, agregados
    # por proveedor, con su cuota sobre ese total y el HHI de esas cuotas (ver
    # `get_competidores`). La licitación no trae un `RubroN2`: el rubro sale de
    # las órdenes de compra y sus ítems traen sólo la categoría UNSPSC. Antes
    # esto mezclaba los primeros de cinco rubros cualesquiera, cada uno con la
    # cuota de su rubro, bajo «parte de lo que compra este organismo».
    if organismo_id:
        c = get_competidores(organismo_id, top_n=5)
        conc = (c.get("concentracion") or [{}])[0]
        competidores: dict = {
            "disponible": c["disponible"],
            "top5": (c.get("competidores") or [])[:5],
            "hhi": conc.get("hhi"),
            "tipo_mercado": conc.get("tipo_mercado"),
            "motivo": c.get("motivo"),
        }
    else:
        competidores = {"disponible": False, "motivo": "organismo_id no disponible"}

    # ── Precios (L0→L4 por producto) ─────────────────────────────────────────
    #
    # Sin organismo también: la Compra Ágil trae sólo el RUT del comprador y no
    # su código, y exigirlo dejaba sin precios a la mitad del catálogo. L0N, L2 y
    # L3 no necesitan comprador; `get_precio_producto` se salta L0, L1 y L4.
    precios: list = []
    if product_codes:
        seen: set = set()
        for code in product_codes:
            if code in seen or len(precios) >= 5:
                break
            seen.add(code)
            p = get_precio_producto(code, organismo_id)
            if p["disponible"] and p.get("resultado"):
                first = p["resultado"][0]
                precios.append(
                    {
                        "disponible": True,
                        "codigo_producto": code,
                        "nivel_usado": p.get("nivel_usado"),
                        "fallback": p.get("fallback", False),
                        "p10": first.get("p10"),
                        "p25": first.get("p25"),
                        "p50": first.get("p50"),
                        "p75": first.get("p75"),
                        "p90": first.get("p90"),
                        "confianza": first.get("confianza"),
                        "n": first.get("n"),
                    }
                )
            else:
                precios.append({"disponible": False, "codigo_producto": code})

    return {
        "codigo_externo": codigo_externo,
        "organismo_id": organismo_id,
        "comprador": comprador,
        "ventana": ventana,
        "competidores": competidores,
        "precios": precios,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Paso D — extended BI API
# ─────────────────────────────────────────────────────────────────────────────
