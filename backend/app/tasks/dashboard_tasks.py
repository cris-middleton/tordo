"""Daily TF-IDF match pre-computation for the operational home.

Runs at 06:00 SCL. For every empresa with a TFIDFPerfil, computes the
top-20 currently open licitaciones (TF-IDF semantic match) and upserts
them into dashboard_home_cache. The home endpoint reads from this cache
synchronously, so the home never calls BI live.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.celery_app import celery_app
from app.config import settings
from app.db import SyncSessionLocal
from app.models.dashboard_cache import DashboardHomeCache
from app.models.empresa import TFIDFPerfil
from app.models.licitacion import Licitacion

logger = logging.getLogger(__name__)


def _compute_matches_for_empresa(
    db, empresa_id, vector_bytes: bytes, top_n: int = 20
) -> list[dict[str, Any]]:
    """Score open licitaciones against the empresa's TF-IDF vector.

    Returns up to top_n match dicts ready for storage in dashboard_home_cache.
    Filters out licitaciones already closed (fecha_cierre <= now).
    """
    from app.services.tfidf_matcher import score_empresa_licitacion

    now = datetime.now(timezone.utc)
    licitaciones = (
        db.query(Licitacion)
        .filter(
            Licitacion.activo.is_(True),
            Licitacion.estado == "Publicada",
            Licitacion.fecha_cierre.isnot(None),
            Licitacion.fecha_cierre > now,
        )
        .all()
    )

    scored: list[tuple[float, Licitacion]] = []
    for lic in licitaciones:
        text = " ".join(filter(None, [lic.nombre or "", lic.descripcion or ""]))
        if not text.strip():
            continue
        score, _nivel = score_empresa_licitacion(vector_bytes, text)
        if score < 0.05:
            continue
        scored.append((score, lic))

    scored.sort(key=lambda t: t[0], reverse=True)
    out: list[dict[str, Any]] = []
    for score, lic in scored[:top_n]:
        score_int = max(0, min(100, int(round(score * 100))))
        out.append(
            {
                "codigo_externo": lic.codigo_externo,
                "nombre": lic.nombre,
                "organismo": lic.nombre_organismo or "",
                "monto_estimado": (
                    float(lic.monto_estimado) if lic.monto_estimado is not None else None
                ),
                "moneda": lic.moneda or "CLP",
                "fecha_cierre": (
                    lic.fecha_cierre.isoformat() if lic.fecha_cierre else None
                ),
                "score": score_int,
                "href": f"/dashboard/tenders/{lic.codigo_externo}",
            }
        )
    return out


@celery_app.task(name="app.tasks.dashboard_tasks.precompute_dashboard_matches")
def precompute_dashboard_matches() -> dict:
    """06:00 SCL daily: refresh dashboard_home_cache for every empresa with a TF-IDF profile."""
    if not settings.feature_tfidf:
        logger.info("[DashboardMatches] feature_tfidf disabled — skipping")
        return {"skipped": True}

    db = SyncSessionLocal()
    processed = 0
    skipped = 0
    failed = 0
    try:
        perfiles = db.query(TFIDFPerfil).all()
        for perfil in perfiles:
            try:
                matches = _compute_matches_for_empresa(
                    db, perfil.empresa_id, perfil.vector_bytes
                )
                cache = (
                    db.query(DashboardHomeCache)
                    .filter(DashboardHomeCache.empresa_id == perfil.empresa_id)
                    .one_or_none()
                )
                now = datetime.now(timezone.utc)
                if cache is None:
                    cache = DashboardHomeCache(
                        empresa_id=perfil.empresa_id,
                        matches=matches,
                        matches_count=len(matches),
                        cached_at=now,
                        updated_at=now,
                    )
                    db.add(cache)
                else:
                    cache.matches = matches
                    cache.matches_count = len(matches)
                    cache.cached_at = now
                    cache.updated_at = now
                processed += 1
            except Exception as exc:
                failed += 1
                logger.error(
                    "[DashboardMatches] empresa=%s failed: %s", perfil.empresa_id, exc
                )
        db.commit()
        logger.info(
            "[DashboardMatches] processed=%d skipped=%d failed=%d",
            processed,
            skipped,
            failed,
        )
        return {"processed": processed, "skipped": skipped, "failed": failed}
    except Exception as exc:
        db.rollback()
        logger.error("[DashboardMatches] fatal: %s", exc)
        raise
    finally:
        db.close()
