"""Composer for GET /api/dashboard/home payload.

Single-roundtrip aggregator that reads from Postulacion, Licitacion, Alert,
DocumentoEmpresa, Empresa, and dashboard_home_cache. All heavy lifting (TF-IDF
matching) is pre-computed by the precompute_dashboard_matches Celery task.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.alert import Alert, AlertStatus, AlertType
from app.models.empresa import DocumentoEmpresa, Empresa
from app.models.licitacion import Licitacion
from app.models.postulacion import ChecklistPostulacion, Postulacion
from app.schemas.dashboard_home import UrgenciaItem


def _hours_label(delta: timedelta) -> str:
    total_seconds = int(delta.total_seconds())
    if total_seconds < 0:
        return "vencido"
    hours = total_seconds // 3600
    if hours < 72:
        return f"{hours}h"
    days = hours // 24
    return f"{days}d"


def _severity_for_hours(hours: float) -> str:
    if hours < 48:
        return "rojo"
    if hours < 168:  # 7 days
        return "naranja"
    return "amarillo"


async def _checklist_completion(db: AsyncSession, postulacion_id: UUID) -> Optional[float]:
    """Return % of completed mandatory checklist items, or None if no checklist."""
    rows = (
        await db.execute(
            select(ChecklistPostulacion).where(
                ChecklistPostulacion.postulacion_id == postulacion_id,
                ChecklistPostulacion.es_obligatorio.is_(True),
            )
        )
    ).scalars().all()
    if not rows:
        return None
    done = sum(1 for r in rows if r.completado)
    return done / len(rows)


async def compose_urgencias(
    db: AsyncSession, user_id: int, empresa_id: UUID
) -> list[UrgenciaItem]:
    """Compose the urgency list from 4 sources, sorted by severity then time."""
    items: list[tuple[int, datetime, UrgenciaItem]] = []
    now = datetime.now(timezone.utc)
    today = date.today()

    # ── 1. Postulaciones with fecha_cierre in the next 7 days ────────────────
    cutoff = now + timedelta(days=7)
    rows = (
        await db.execute(
            select(Postulacion, Licitacion)
            .join(Licitacion, Postulacion.licitacion_id == Licitacion.id)
            .where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.estado.in_(("en_seguimiento", "en_preparacion")),
                Licitacion.fecha_cierre.isnot(None),
                Licitacion.fecha_cierre > now,
                Licitacion.fecha_cierre <= cutoff,
            )
        )
    ).all()
    for postulacion, licitacion in rows:
        delta = licitacion.fecha_cierre - now
        hours = delta.total_seconds() / 3600
        severidad = _severity_for_hours(hours)
        completion = await _checklist_completion(db, postulacion.id)
        subtitulo_parts = [
            f"Cierre {licitacion.fecha_cierre.astimezone().strftime('%d %b %H:%M')}"
        ]
        if completion is not None:
            subtitulo_parts.append(f"Checklist {int(completion * 100)}%")
            cta_label = "Completar" if completion < 1 else "Postular"
        else:
            cta_label = (
                "Postular" if postulacion.estado == "en_seguimiento" else "Completar"
            )
        item = UrgenciaItem(
            id=f"postulacion_{postulacion.id}",
            tipo="postulacion_cierre",
            severidad=severidad,
            tiempo_label=_hours_label(delta),
            titulo=f"{licitacion.codigo_externo} {licitacion.nombre[:80]}",
            subtitulo=" · ".join(subtitulo_parts),
            cta_label=cta_label,
            cta_href=f"/dashboard/postulaciones/{postulacion.id}",
        )
        sev_rank = {"rojo": 0, "naranja": 1, "amarillo": 2}[severidad]
        items.append((sev_rank, licitacion.fecha_cierre, item))

    # ── 2. Documentos vencen en próximos 30 días ─────────────────────────────
    doc_cutoff = today + timedelta(days=30)
    docs = (
        await db.execute(
            select(DocumentoEmpresa).where(
                DocumentoEmpresa.empresa_id == empresa_id,
                DocumentoEmpresa.eliminado.is_(False),
                DocumentoEmpresa.fecha_vencimiento.isnot(None),
                DocumentoEmpresa.fecha_vencimiento >= today,
                DocumentoEmpresa.fecha_vencimiento <= doc_cutoff,
            )
        )
    ).scalars().all()
    for doc in docs:
        days_left = (doc.fecha_vencimiento - today).days
        if days_left < 7:
            severidad = "rojo"
            cta_label = "Subir nuevo"
        else:
            severidad = "naranja"
            cta_label = "Renovar"
        sev_rank = {"rojo": 0, "naranja": 1, "amarillo": 2}[severidad]
        item = UrgenciaItem(
            id=f"documento_{doc.id}",
            tipo="documento_vence",
            severidad=severidad,
            tiempo_label=f"{days_left}d",
            titulo=f"Documento: {doc.nombre}",
            subtitulo=(
                f"Vence el {doc.fecha_vencimiento.strftime('%d %b')} · "
                f"Quedan {days_left} días"
            ),
            cta_label=cta_label,
            cta_href="/dashboard/documentos",
        )
        items.append(
            (
                sev_rank,
                datetime.combine(doc.fecha_vencimiento, datetime.min.time()).replace(
                    tzinfo=timezone.utc
                ),
                item,
            )
        )

    # ── 3. Empresa estado_habil != 'habil' ───────────────────────────────────
    empresa = (
        await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    ).scalar_one_or_none()
    if empresa and empresa.estado_habil != "habil":
        ts = empresa.estado_habil_updated_at
        ts_label = ts.strftime("%d %b") if ts else "fecha desconocida"
        item = UrgenciaItem(
            id=f"estado_{empresa.id}",
            tipo="estado_inhabil",
            severidad="amarillo",
            tiempo_label="—",
            titulo=f"Estado {empresa.estado_habil} desde {ts_label}",
            subtitulo="Revisa deudas en Tesorería para volver a hábil",
            cta_label="Ver detalle",
            cta_href="/dashboard/empresa",
        )
        items.append((2, datetime.max.replace(tzinfo=timezone.utc), item))

    # ── 4. Unread NUEVA_LICITACION_MATCH alerts (last 5 days) ────────────────
    cutoff_alert = now - timedelta(days=5)
    alerts = (
        await db.execute(
            select(Alert).where(
                Alert.user_id == user_id,
                Alert.alert_type == AlertType.NUEVA_LICITACION_MATCH,
                Alert.status != AlertStatus.READ,
                Alert.created_at >= cutoff_alert,
            )
        )
    ).scalars().all()
    for alert in alerts:
        delta = now - alert.created_at
        days_old = max(int(delta.total_seconds() // 86400), 0)
        item = UrgenciaItem(
            id=f"alert_{alert.id}",
            tipo="match_alto",
            severidad="naranja",
            tiempo_label=f"{days_old}d",
            titulo=alert.title,
            subtitulo=alert.message[:120] if alert.message else "Match nuevo de alto score",
            cta_label="Revisar",
            cta_href=f"/dashboard/tenders/{alert.entity_id}",
        )
        items.append((1, alert.created_at, item))

    items.sort(key=lambda t: (t[0], t[1]))
    return [it for _, _, it in items[:5]]
