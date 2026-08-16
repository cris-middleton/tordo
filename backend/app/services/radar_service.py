"""
Radar semanal — detecta 3 movimientos relevantes para una empresa cada lunes.

Movimientos detectados (MVP):
1. nueva_licitacion: licitación abierta con score TF-IDF alto creada en últimos 7 días
2. oportunidad_top: rubro de la empresa con score de oportunidad alto (Panel BI)
3. comprador_activo: top comprador por monto en rubros de la empresa, últimos 7 días

Si algún movimiento no se puede calcular, se omite — el radar tiene 1-3 items.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.empresa import Empresa, TFIDFPerfil
from app.models.licitacion import Licitacion
from app.services import bi as bi_service
from app.services import tfidf_matcher

logger = logging.getLogger(__name__)


def _semana_lunes_iso(now: datetime | None = None) -> str:
    """Lunes de la semana actual en ISO date (YYYY-MM-DD)."""
    n = now or datetime.now(UTC)
    monday = n - timedelta(days=n.weekday())
    return monday.date().isoformat()


def compute_radar_for_empresa(db: Session, empresa_id: UUID) -> dict:
    """Calcula el radar semanal para una empresa. Retorna dict listo para serializar."""
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        return {"disponible": False, "motivo": "empresa no encontrada"}

    perfil = db.query(TFIDFPerfil).filter(TFIDFPerfil.empresa_id == empresa_id).first()
    rubros: list[str] = (perfil.rubros_usados or []) if perfil else []
    if not rubros and empresa.rubros_cpv:
        rubros = empresa.rubros_cpv[:3]

    movimientos: list[dict] = []

    # ── 1. Nueva licitación de score alto (últimos 7 días) ─────────────────
    try:
        if perfil and perfil.vector_bytes and tfidf_matcher.is_available():
            since = datetime.now(UTC) - timedelta(days=7)
            recent_lics = (
                db.query(Licitacion)
                .filter(
                    Licitacion.estado == "publicada",
                    Licitacion.fecha_publicacion >= since,
                )
                .limit(200)
                .all()
            )
            best = None
            best_score = 0.0
            for lic in recent_lics:
                texto = (lic.nombre or "") + " " + (lic.descripcion or "")
                if len(texto.strip()) < 10:
                    continue
                try:
                    score, _ = tfidf_matcher.score_empresa_licitacion(perfil.vector_bytes, texto)
                except Exception:
                    continue
                if score > best_score and score >= 0.25:
                    best = lic
                    best_score = score
            if best:
                movimientos.append(
                    {
                        "tipo": "nueva_licitacion",
                        "titulo": f"Nueva licitación con encaje alto ({int(best_score * 100)}%)",
                        "detalle": (best.nombre or "")[:140],
                        "accion_url": f"/dashboard/tenders/{best.codigo_externo}"
                        if best.codigo_externo
                        else None,
                    }
                )
    except Exception as exc:
        logger.warning("radar.nueva_licitacion failed for %s: %s", empresa_id, exc)

    # ── 2. Oportunidad top en un rubro de la empresa ─────────────────────────
    try:
        if rubros:
            for rubro in rubros[:3]:
                opp = bi_service.get_oportunidades(
                    organismo_id=None, rubro=rubro, min_score=6.0, limit=1
                )
                if opp.get("disponible") and opp.get("oportunidades"):
                    top = opp["oportunidades"][0]
                    score = top.get("opportunity_score", 0)
                    nombre_org = (
                        top.get("NombreOrganismo")
                        or f"organismo {top.get('CodigoOrganismoPublico', '')}"
                    )
                    movimientos.append(
                        {
                            "tipo": "oportunidad_top",
                            "titulo": f"Oportunidad destacada en {rubro}",
                            "detalle": f"{nombre_org} — score {score:.1f}/10",
                            "accion_url": f"/dashboard/bi?rubro={rubro}",
                        }
                    )
                    break
    except Exception as exc:
        logger.warning("radar.oportunidad_top failed for %s: %s", empresa_id, exc)

    # ── 3. Comprador activo (resumen del rubro principal) ────────────────────
    try:
        if rubros:
            primer_rubro = rubros[0]
            resumen = bi_service.get_resumen(primer_rubro)
            if resumen.get("disponible") and resumen.get("top_comprador"):
                tc = resumen["top_comprador"]
                if tc.get("nombre"):
                    movimientos.append(
                        {
                            "tipo": "comprador_activo",
                            "titulo": f"Comprador más activo en {primer_rubro}",
                            # Se quitó «paga en ~N días»: ese dato medía la
                            # aceptación de la orden, no el pago, y con la
                            # mediana real en 1,4 días el radar decía «paga en
                            # ~1 día».
                            "detalle": (
                                f"{tc['nombre']}"
                                + (
                                    f" — {tc['n_oc_total']:,} órdenes en el histórico".replace(
                                        ",", "."
                                    )
                                    if tc.get("n_oc_total")
                                    else ""
                                )
                            ),
                            "accion_url": f"/dashboard/bi?rubro={primer_rubro}",
                        }
                    )
    except Exception as exc:
        logger.warning("radar.comprador_activo failed for %s: %s", empresa_id, exc)

    if not movimientos:
        return {
            "disponible": False,
            "empresa_id": str(empresa_id),
            "empresa_nombre": empresa.nombre_empresa,
            "semana_inicio": _semana_lunes_iso(),
            "motivo": "sin movimientos relevantes esta semana",
        }

    return {
        "disponible": True,
        "empresa_id": str(empresa_id),
        "empresa_nombre": empresa.nombre_empresa,
        "semana_inicio": _semana_lunes_iso(),
        "movimientos": movimientos[:3],
    }
