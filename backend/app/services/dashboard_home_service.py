"""Composer for GET /api/dashboard/home payload.

Single-roundtrip aggregator that reads from Postulacion, Licitacion, Alert,
DocumentoEmpresa, Empresa, and dashboard_home_cache. All heavy lifting (TF-IDF
matching) lo precomputa la tarea Celery `precompute_dashboard_matches` en
`match_empresa_licitacion`.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tiempo import hoy_chile
from app.models.alert import Alert, AlertStatus, AlertType
from app.models.empresa import DocumentoEmpresa, Empresa
from app.models.licitacion import Licitacion
from app.models.postulacion import ChecklistPostulacion, Postulacion
from app.repositories import matches as repo_matches
from app.schemas.dashboard_home import (
    MatchItem,
    PipelineCounts,
    ResumenStats,
    TrendStats,
    UrgenciaItem,
)

# Qué decir cuando el estado impide ofertar. Sin causa inventada: de la
# inhabilidad no sabemos el motivo (ver `services/estado_habil_service.py`).
AVISOS_ESTADO = {
    "no_encontrado": (
        "Tu RUT no figura en el Registro de Proveedores",
        "Sin inscripción no puedes ofertar. Revisa el RUT o inscríbete en Mercado Público",
    ),
    "inhabil": (
        "Tu empresa figura inhábil",
        "No puedes ofertar hasta resolverlo. El motivo está en «Habilidad», en tu ficha de Mercado Público",
    ),
}


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


def _ensure_utc(dt: datetime) -> datetime:
    """Coerce a possibly-naive datetime into tz-aware UTC.

    SQLAlchemy + SQLite returns naive datetimes for TIMESTAMPTZ columns; in
    production Postgres they arrive tz-aware. Normalize at source boundaries
    so `now - dt` arithmetic and `(sev_rank, dt)` sort tuples never mix.
    """
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


async def _checklist_completion(db: AsyncSession, postulacion_id: UUID) -> float | None:
    """Return % of completed mandatory checklist items, or None if no checklist."""
    rows = (
        (
            await db.execute(
                select(ChecklistPostulacion).where(
                    ChecklistPostulacion.postulacion_id == postulacion_id,
                    ChecklistPostulacion.es_obligatorio.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        return None
    done = sum(1 for r in rows if r.completado)
    return done / len(rows)


async def compose_urgencias(db: AsyncSession, user_id: int, empresa_id: UUID) -> list[UrgenciaItem]:
    """Compose the urgency list from 4 sources, sorted by severity then time."""
    items: list[tuple[int, datetime, UrgenciaItem]] = []
    now = datetime.now(UTC)
    today = hoy_chile()

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
        delta = _ensure_utc(licitacion.fecha_cierre) - now
        hours = delta.total_seconds() / 3600
        severidad = _severity_for_hours(hours)
        completion = await _checklist_completion(db, postulacion.id)
        subtitulo_parts = [f"Cierre {licitacion.fecha_cierre.astimezone().strftime('%d %b %H:%M')}"]
        if completion is not None:
            subtitulo_parts.append(f"Checklist {int(completion * 100)}%")
            cta_label = "Completar" if completion < 1 else "Postular"
        else:
            cta_label = "Postular" if postulacion.estado == "en_seguimiento" else "Completar"
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
        items.append((sev_rank, _ensure_utc(licitacion.fecha_cierre), item))

    # ── 2. Documentos vencen en próximos 30 días ─────────────────────────────
    doc_cutoff = today + timedelta(days=30)
    docs = (
        (
            await db.execute(
                select(DocumentoEmpresa).where(
                    DocumentoEmpresa.empresa_id == empresa_id,
                    DocumentoEmpresa.eliminado.is_(False),
                    DocumentoEmpresa.fecha_vencimiento.isnot(None),
                    DocumentoEmpresa.fecha_vencimiento >= today,
                    DocumentoEmpresa.fecha_vencimiento <= doc_cutoff,
                )
            )
        )
        .scalars()
        .all()
    )
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
                f"Vence el {doc.fecha_vencimiento.strftime('%d %b')} · Quedan {days_left} días"
            ),
            cta_label=cta_label,
            cta_href="/dashboard/documentos",
        )
        items.append(
            (
                sev_rank,
                datetime.combine(doc.fecha_vencimiento, datetime.min.time()).replace(tzinfo=UTC),
                item,
            )
        )

    # ── 3. Empresa estado_habil != 'habil' ───────────────────────────────────
    empresa = (
        await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    ).scalar_one_or_none()
    # Sólo lo que impide ofertar. Antes entraba todo lo que no fuera `habil`,
    # incluido `desconocido` —«todavía no lo sabemos»—, así que la primera tarea
    # de toda empresa nueva era «Estado desconocido desde fecha desconocida:
    # revisa deudas en Tesorería»: una alarma sobre nada, con una causa inventada.
    if empresa and empresa.estado_habil in AVISOS_ESTADO:
        titulo, subtitulo = AVISOS_ESTADO[empresa.estado_habil]
        item = UrgenciaItem(
            id=f"estado_{empresa.id}",
            tipo="estado_inhabil",
            severidad="amarillo",
            tiempo_label="—",
            titulo=titulo,
            subtitulo=subtitulo,
            cta_label="Ver detalle",
            cta_href="/dashboard/empresa",
        )
        items.append((2, datetime.max.replace(tzinfo=UTC), item))

    # ── 4. Unread NUEVA_LICITACION_MATCH alerts (last 5 days) ────────────────
    cutoff_alert = now - timedelta(days=5)
    alerts = (
        (
            await db.execute(
                select(Alert).where(
                    Alert.user_id == user_id,
                    Alert.alert_type == AlertType.NUEVA_LICITACION_MATCH,
                    Alert.status != AlertStatus.READ,
                    Alert.created_at >= cutoff_alert,
                )
            )
        )
        .scalars()
        .all()
    )
    for alert in alerts:
        created_at = _ensure_utc(alert.created_at)
        delta = now - created_at
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
        items.append((1, created_at, item))

    items.sort(key=lambda t: (t[0], t[1]))
    return [it for _, _, it in items[:5]]


PIPELINE_ESTADOS = (
    "en_seguimiento",
    "en_preparacion",
    "enviada",
    "adjudicada",
    "no_adjudicada",
)


async def compose_pipeline(db: AsyncSession, empresa_id: UUID) -> PipelineCounts:
    """Counts per estado over the last 90 days + tasa de adjudicación."""
    cutoff = datetime.now(UTC) - timedelta(days=90)
    rows = (
        await db.execute(
            select(Postulacion.estado, func.count(Postulacion.id))
            .where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.created_at >= cutoff,
                Postulacion.estado.in_(PIPELINE_ESTADOS),
            )
            .group_by(Postulacion.estado)
        )
    ).all()
    counts = dict.fromkeys(PIPELINE_ESTADOS, 0)
    for estado, n in rows:
        counts[estado] = n
    decididas = counts["adjudicada"] + counts["no_adjudicada"]
    tasa = (counts["adjudicada"] / decididas) if decididas >= 3 else None
    return PipelineCounts(
        en_seguimiento=counts["en_seguimiento"],
        en_preparacion=counts["en_preparacion"],
        enviada=counts["enviada"],
        adjudicada=counts["adjudicada"],
        no_adjudicada=counts["no_adjudicada"],
        tasa_adjudicacion_90d=round(tasa, 4) if tasa is not None else None,
        decididas_90d=decididas,
    )


async def compose_resumen(db: AsyncSession, user_id: int, empresa_id: UUID) -> ResumenStats:
    """Counts used by the narrative template + secondary KPIs."""
    now = datetime.now(UTC)
    today = hoy_chile()
    week_ago = now - timedelta(days=7)
    cutoff_72h = now + timedelta(hours=72)
    month_start = today.replace(day=1)
    month_start_dt = datetime.combine(month_start, datetime.min.time()).replace(tzinfo=UTC)

    matches_week = (
        await db.execute(
            select(func.count(Alert.id)).where(
                Alert.user_id == user_id,
                Alert.alert_type == AlertType.NUEVA_LICITACION_MATCH,
                Alert.created_at >= week_ago,
            )
        )
    ).scalar() or 0

    postulaciones_72h = (
        await db.execute(
            select(func.count(Postulacion.id))
            .join(Licitacion, Postulacion.licitacion_id == Licitacion.id)
            .where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.estado.in_(("en_seguimiento", "en_preparacion")),
                Licitacion.fecha_cierre.isnot(None),
                Licitacion.fecha_cierre > now,
                Licitacion.fecha_cierre <= cutoff_72h,
            )
        )
    ).scalar() or 0

    postulaciones_activas = (
        await db.execute(
            select(func.count(Postulacion.id)).where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.estado.in_(("en_seguimiento", "en_preparacion", "enviada")),
            )
        )
    ).scalar() or 0

    docs_30d = (
        await db.execute(
            select(func.count(DocumentoEmpresa.id)).where(
                DocumentoEmpresa.empresa_id == empresa_id,
                DocumentoEmpresa.eliminado.is_(False),
                DocumentoEmpresa.fecha_vencimiento.isnot(None),
                DocumentoEmpresa.fecha_vencimiento >= today,
                DocumentoEmpresa.fecha_vencimiento <= today + timedelta(days=30),
            )
        )
    ).scalar() or 0

    docs_7d = (
        await db.execute(
            select(func.count(DocumentoEmpresa.id)).where(
                DocumentoEmpresa.empresa_id == empresa_id,
                DocumentoEmpresa.eliminado.is_(False),
                DocumentoEmpresa.fecha_vencimiento.isnot(None),
                DocumentoEmpresa.fecha_vencimiento >= today,
                DocumentoEmpresa.fecha_vencimiento <= today + timedelta(days=7),
            )
        )
    ).scalar() or 0

    adjudicaciones_mes = (
        await db.execute(
            select(func.count(Postulacion.id)).where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.estado == "adjudicada",
                Postulacion.created_at >= month_start_dt,
            )
        )
    ).scalar() or 0

    enviadas_mes = (
        await db.execute(
            select(func.count(Postulacion.id)).where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.estado == "enviada",
                Postulacion.created_at >= month_start_dt,
            )
        )
    ).scalar() or 0

    return ResumenStats(
        matches_semana=int(matches_week),
        matches_72h=0,
        postulaciones_activas=int(postulaciones_activas),
        postulaciones_cierran_72h=int(postulaciones_72h),
        docs_por_vencer_30d=int(docs_30d),
        docs_por_vencer_7d=int(docs_7d),
        adjudicaciones_mes=int(adjudicaciones_mes),
        enviadas_mes=int(enviadas_mes),
    )


async def _tasa_window(
    db: AsyncSession, empresa_id: UUID, start: datetime, end: datetime
) -> float | None:
    rows = (
        (
            await db.execute(
                select(Postulacion.estado).where(
                    Postulacion.empresa_id == empresa_id,
                    Postulacion.created_at >= start,
                    Postulacion.created_at < end,
                    Postulacion.estado.in_(("adjudicada", "no_adjudicada")),
                )
            )
        )
        .scalars()
        .all()
    )
    if len(rows) < 3:
        return None
    decididas = len(rows)
    adjudicadas = sum(1 for e in rows if e == "adjudicada")
    return round(adjudicadas / decididas, 4)


async def compose_trend(db: AsyncSession, empresa_id: UUID) -> TrendStats:
    """7-bucket weekly histogram + tasa change. Disabled if <30 days history."""
    earliest = (
        await db.execute(
            select(func.min(Postulacion.created_at)).where(Postulacion.empresa_id == empresa_id)
        )
    ).scalar()
    if earliest is None:
        return TrendStats(disponible=False)

    now = datetime.now(UTC)
    earliest_utc = _ensure_utc(earliest)
    if (now - earliest_utc).days < 30:
        return TrendStats(disponible=False)

    buckets: list[int] = []
    for i in range(6, -1, -1):
        start = now - timedelta(days=(i + 1) * 7)
        end = now - timedelta(days=i * 7)
        n = (
            await db.execute(
                select(func.count(Postulacion.id)).where(
                    Postulacion.empresa_id == empresa_id,
                    Postulacion.estado == "enviada",
                    Postulacion.created_at >= start,
                    Postulacion.created_at < end,
                )
            )
        ).scalar() or 0
        buckets.append(int(n))

    tasa_cur = await _tasa_window(db, empresa_id, now - timedelta(days=30), now)
    tasa_prev = await _tasa_window(
        db, empresa_id, now - timedelta(days=60), now - timedelta(days=30)
    )

    return TrendStats(
        disponible=True,
        postulaciones_semana=buckets,
        tasa_adjudicacion_actual=tasa_cur,
        tasa_adjudicacion_anterior=tasa_prev,
        delta_enviadas_pp=buckets[-1] - buckets[-2] if len(buckets) >= 2 else None,
    )


async def load_matches(
    db: AsyncSession, empresa_id: UUID
) -> tuple[list[MatchItem], datetime | None, int]:
    """El encaje precomputado, unido a la licitación para que no esté rancio.

    Antes leía un blob JSON de `dashboard_home_cache` con el nombre, el monto y
    la fecha de cierre COPIADOS dentro. Eran una foto de las 06:00: si el ETL
    actualizaba la licitación durante el día, la portada seguía mostrando lo
    viejo. Ahora esos campos salen de `licitaciones` en el propio join.
    """
    filas, calculado_en = await repo_matches.top_licitaciones(db, empresa_id, limite=20)

    items = [
        MatchItem(
            codigo_externo=lic.codigo_externo,
            nombre=lic.nombre,
            organismo=lic.nombre_organismo or "",
            monto_estimado=(float(lic.monto_estimado) if lic.monto_estimado is not None else None),
            moneda=lic.moneda or "CLP",
            fecha_cierre=lic.fecha_cierre,
            score=int(m.score),
            href=f"/dashboard/tenders/{lic.codigo_externo}",
        )
        for lic, m in filas
    ]
    return items, _ensure_utc(calculado_en) if calculado_en else None, len(items)
