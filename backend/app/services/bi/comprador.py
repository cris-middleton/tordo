"""Perfil del organismo comprador: score, riesgo, pagos y transparencia.

Parte de `app.services.bi`, que reemplaza al antiguo `bi_service.py` de 1.476
líneas. El contrato hacia los endpoints no cambia: lo fija el golden master en
`backend/tests/golden/bi_golden.json`.
"""

from __future__ import annotations

import logging

from app.services.bi._base import _load

logger = logging.getLogger(__name__)


def get_comprador(organismo_id: str) -> dict:
    """
    Buyer profile: payment behaviour, risk flags, and overall score.
    Combines buyer_scores + buyer_risk_flags + buyer_payment_stats.
    """
    score_df = _load("buyer_scores.parquet")
    flags_df = _load("buyer_risk_flags.parquet")
    payment_df = _load("buyer_payment_stats.parquet")

    if score_df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    mask_score = score_df["CodigoOrganismoPublico"].cast(str) == str(organismo_id)
    score_rows = score_df.filter(mask_score)
    if score_rows.is_empty():
        return {"disponible": False, "motivo": "organismo no encontrado en histórico"}

    score = score_rows.row(0, named=True)

    flags: dict = {}
    if flags_df is not None:
        mask_f = flags_df["CodigoOrganismoPublico"].cast(str) == str(organismo_id)
        f_rows = flags_df.filter(mask_f)
        if not f_rows.is_empty():
            flags = f_rows.row(0, named=True)

    payment: dict = {}
    if payment_df is not None:
        mask_p = payment_df["CodigoOrganismoPublico"].cast(str) == str(organismo_id)
        p_rows = payment_df.filter(mask_p)
        if not p_rows.is_empty():
            payment = p_rows.row(0, named=True)

    # ── Transparency index ────────────────────────────────────────────────────
    transp_df = _load("buyer_transparency.parquet")
    transp: dict = {}
    if transp_df is not None:
        # buyer_transparency uses CodigoOrganismo (from LIC data); buyer_scores uses
        # CodigoOrganismoPublico (from OC data).  Try both column names.
        id_col = (
            "CodigoOrganismo"
            if "CodigoOrganismo" in transp_df.columns
            else "CodigoOrganismoPublico"
        )
        t_rows = transp_df.filter(transp_df[id_col].cast(str) == str(organismo_id))
        if not t_rows.is_empty():
            transp = t_rows.row(0, named=True)

    return {
        "disponible": True,
        "organismo_id": organismo_id,
        "nombre": score.get("NombreOrganismo"),
        "buyer_score": score.get("buyer_score"),
        "clasificacion": score.get("clasificacion"),
        "pago": {
            "mediana_dias_pago": score.get("mediana_dias_pago"),
            "p75_dias_pago": score.get("p75_dias_pago"),
            "p90_dias_pago": score.get("p90_dias_pago"),
            "tasa_aceptacion": score.get("tasa_aceptacion"),
            "tasa_cancelacion": score.get("tasa_cancelacion"),
            "tasa_adjudicacion": score.get("tasa_adjudicacion"),
        },
        "scores_detalle": {
            "velocidad_pago": score.get("score_velocidad_pago"),
            "tasa_aceptacion": score.get("score_tasa_aceptacion"),
            "no_cancelacion": score.get("score_tasa_no_cancelacion"),
            "adjudicacion": score.get("score_tasa_adjudicacion"),
            "regularidad": score.get("score_regularidad"),
            "volumen": score.get("score_volumen"),
            "satisfaccion": score.get("score_satisfaccion"),
        },
        "risk_flags": {
            "n_flags": flags.get("n_flags", 0),
            "pago_lento": flags.get("flag_pago_lento", False),
            "pago_impredecible": flags.get("flag_pago_impredecible", False),
            "cancelaciones": flags.get("flag_cancelaciones", False),
            "licitaciones_fallidas": flags.get("flag_licitaciones_fallidas", False),
            "baja_calificacion": flags.get("flag_baja_calificacion", False),
            "compras_irregulares": flags.get("flag_compras_irregulares", False),
        },
        "volumen": {
            "n_oc_total": payment.get("n_oc_total") or score.get("n_oc_total"),
            "n_meses_activo": score.get("n_meses_activo"),
            "prom_calificacion": score.get("prom_calificacion"),
            "prom_oferentes": score.get("prom_oferentes"),
        },
        "transparencia": {
            "transparencia_score": transp.get("transparencia_score"),
            "clasificacion": transp.get("clasificacion"),
            "pct_trato_directo": transp.get("pct_trato_directo"),
            "tasa_fracaso": transp.get("tasa_fracaso"),
            "hhi": transp.get("hhi"),
            "n_lic_total": transp.get("n_lic_total"),
        }
        if transp
        else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Composite panel (single call for tender detail view)
# ─────────────────────────────────────────────────────────────────────────────
