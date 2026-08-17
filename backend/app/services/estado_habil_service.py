"""
Estado hábil checker.

Downloads the proveedores hábiles CSV from ChileCompra's open-data portal,
looks up each registered empresa by RUT, and records any state changes.
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import UTC, datetime

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.models.alert import Alert, AlertStatus, AlertType
from app.models.empresa import Empresa, EstadoHabilLog
from app.services import notificaciones

logger = logging.getLogger(__name__)

MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB safety cap

# Possible estado values stored in our DB
ESTADO_HABIL = "habil"
ESTADO_INHABIL = "inhabil"
ESTADO_NO_ENCONTRADO = "no_encontrado"
ESTADO_DESCONOCIDO = "desconocido"


def _normalize_rut(rut: str) -> str:
    """Strip formatting: '12.345.678-9' → '12345678-9' → '123456789' (no hyphen)."""
    return rut.upper().replace(".", "").replace("-", "").replace(" ", "")


def _download_csv(url: str) -> list[dict]:
    """Fetch the estado hábil CSV and return rows as list of dicts."""
    resp = requests.get(url, timeout=60, stream=True)
    resp.raise_for_status()

    chunks: list[bytes] = []
    total = 0
    for chunk in resp.iter_content(chunk_size=8192):
        total += len(chunk)
        if total > MAX_FILE_BYTES:
            raise ValueError("Estado hábil CSV exceeds 50 MB safety limit")
        chunks.append(chunk)

    raw = b"".join(chunks)
    # Try common encodings
    for encoding in ("utf-8-sig", "latin-1", "cp1252"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("latin-1", errors="replace")

    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    return list(reader)


def _lookup_rut_in_rows(rows: list[dict], rut_normalizado: str) -> str:
    """
    Search for the empresa RUT in CSV rows.

    The ChileCompra CSV has column names that vary; we try common patterns.
    Returns 'habil', 'inhabil', or 'no_encontrado'.
    """
    rut_cols = {"rut", "rut_proveedor", "rutproveedor", "rut empresa"}
    estado_cols = {"estado", "estadohabil", "estado_habil", "habilitado"}

    for row in rows:
        # Find RUT column (case-insensitive)
        rut_val = None
        for key in row:
            if key.lower().strip() in rut_cols:
                rut_val = _normalize_rut(str(row[key]))
                break

        if rut_val != rut_normalizado:
            continue

        # Found the RUT — now determine estado
        for key in row:
            if key.lower().strip() in estado_cols:
                val = str(row[key]).lower().strip()
                if val in ("1", "true", "si", "sí", "habilitado", "habil", "hábil"):
                    return ESTADO_HABIL
                return ESTADO_INHABIL

        # RUT found but no estado column — assume hábil (listed = hábil)
        return ESTADO_HABIL

    return ESTADO_NO_ENCONTRADO


def _titulo_para(empresa: Empresa) -> str:
    if empresa.estado_habil == ESTADO_INHABIL:
        return f"{empresa.nombre_empresa} quedó inhábil"
    if empresa.estado_habil == ESTADO_HABIL:
        return f"{empresa.nombre_empresa} volvió a estar hábil"
    return f"No encontramos a {empresa.nombre_empresa} en el registro"


def _mensaje_para(empresa: Empresa) -> str:
    """El aviso, en las palabras de quien lo recibe.

    **Este mensaje decía**: «El estado hábil de X (RUT) cambió a 'inhabil'.» —
    el valor crudo de la columna, entre comillas, en el aviso más urgente que
    manda el producto (`Urgencia.INMEDIATA`). Además de leerse a máquina, no
    decía lo único que importa: que así no puedes ofertar.

    **Y no decimos por qué, porque no lo sabemos.** El CSV de proveedores
    hábiles de ChileCompra trae el RUT y el estado, nada más: ni la causa ni la
    fecha. Las causas posibles son varias —la tarifa anual del registro sin
    pagar, datos sin actualizar, deuda tributaria sobre 500 UTM o previsional
    de más de 12 meses, sanciones—, y sólo el proveedor las ve, en la sección
    «Habilidad» de su propia ficha. Nombrar una al azar manda a la persona a
    buscar donde probablemente no está el problema: se gasta el aviso y la
    próxima vez no lo lee. Se dice qué pasó, qué implica y dónde está la razón.
    """
    if empresa.estado_habil == ESTADO_INHABIL:
        return (
            f"{empresa.nombre_empresa} ({empresa.rut_empresa}) aparece inhábil en el "
            "Registro de Proveedores. Mientras siga así no puedes ofertar, aunque "
            "alcances a preparar la oferta. El motivo exacto sale en la sección "
            "«Habilidad» de tu ficha en Mercado Público — puede ser la tarifa anual "
            "del registro, datos por actualizar o una deuda tributaria o previsional."
        )
    if empresa.estado_habil == ESTADO_HABIL:
        return (
            f"{empresa.nombre_empresa} ({empresa.rut_empresa}) vuelve a estar hábil. "
            "Ya puedes ofertar."
        )
    return (
        f"{empresa.nombre_empresa} ({empresa.rut_empresa}) no aparece en la lista de "
        "proveedores hábiles que publica ChileCompra. Puede ser que el RUT esté mal "
        "escrito o que la empresa aún no esté inscrita en el Registro de Proveedores; "
        "sin esa inscripción no se puede ofertar."
    )


def _create_estado_habil_alert(empresa: Empresa, db: Session) -> list[Alert]:
    """Crea la alerta de cambio de estado hábil para cada miembro de la empresa.

    **La clave de idempotencia lleva el usuario dentro, y no lo llevaba.** Sin
    él, la clave era la misma para toda la empresa: el `autoflush` del segundo
    `query` encontraba la alerta del primer miembro y saltaba, así que en una
    empresa de cinco personas se enteraba una. Quedar inhábil es justo el aviso
    que no puede depender de quién esté mirando.
    """
    from app.models.empresa import EmpresaUsuario

    creadas: list[Alert] = []
    memberships = db.query(EmpresaUsuario).filter(EmpresaUsuario.empresa_id == empresa.id).all()
    for m in memberships:
        idempotency_key = (
            f"estado_habil_{empresa.id}_{empresa.estado_habil}_"
            f"{datetime.now(UTC).strftime('%Y%m%d')}_{m.user_id}"
        )
        # Skip if already sent today
        existing = db.query(Alert).filter(Alert.idempotency_key == idempotency_key).first()
        if existing:
            continue

        alert = Alert(
            user_id=m.user_id,
            alert_type=AlertType.ESTADO_HABIL_CAMBIO,
            status=AlertStatus.PENDING,
            entity_type="empresa",
            entity_id=0,
            title=_titulo_para(empresa),
            message=_mensaje_para(empresa),
            idempotency_key=idempotency_key,
            empresa_id=empresa.id,
            notification_channels=["in_app"],
        )
        db.add(alert)
        creadas.append(alert)
    return creadas


def run_estado_habil_check(db: Session) -> dict:
    """
    Main entry point for the periodic estado hábil check.

    Returns a summary dict with counts.
    """
    csv_url = settings.estado_habil_csv_url
    if not csv_url:
        logger.warning("ESTADO_HABIL_CSV_URL not configured — skipping check")
        return {"skipped": True, "reason": "csv_url_not_configured"}

    logger.info("Downloading estado hábil CSV from %s", csv_url)
    try:
        rows = _download_csv(csv_url)
    except Exception as exc:
        logger.error("Failed to download estado hábil CSV: %s", exc)
        return {"error": str(exc), "checked": 0, "changed": 0}

    logger.info("CSV has %d rows; checking registered empresas", len(rows))
    empresas = db.query(Empresa).filter(Empresa.activo.is_(True)).all()

    checked = 0
    changed = 0
    nuevas: list[Alert] = []
    for empresa in empresas:
        rut_norm = _normalize_rut(empresa.rut_empresa)
        new_state = _lookup_rut_in_rows(rows, rut_norm)
        checked += 1

        if new_state == empresa.estado_habil:
            continue  # no change

        changed += 1
        old_state = empresa.estado_habil
        logger.info(
            "Estado hábil change: %s %s → %s",
            empresa.rut_empresa,
            old_state,
            new_state,
        )

        # Persist log entry
        log_entry = EstadoHabilLog(
            empresa_id=empresa.id,
            rut_empresa=empresa.rut_empresa,
            estado_anterior=old_state,
            estado_nuevo=new_state,
            fuente="csv_datos_abiertos",
        )
        db.add(log_entry)

        # Update empresa
        empresa.estado_habil = new_state
        empresa.estado_habil_updated_at = datetime.now(UTC)

        # Create alerts for empresa users
        nuevas.extend(_create_estado_habil_alert(empresa, db))

    db.commit()
    # Quedar inhábil deja a la empresa fuera de todo lo que postule. Es de lo
    # poco que justifica un correo inmediato: enterarse al entrar a la
    # aplicación es enterarse cuando ya rechazaron la oferta.
    enviado = notificaciones.despachar_pendientes(db, [a.id for a in nuevas])
    logger.info(
        "Estado hábil check complete: checked=%d changed=%d notificadas=%d",
        checked,
        changed,
        enviado.get("inmediatas", 0),
    )
    return {"checked": checked, "changed": changed, **enviado}


def check_empresa_now(empresa_id, db: Session) -> dict:
    """
    On-demand estado hábil check for a single empresa (used during onboarding).

    Downloads the ChileCompra CSV, looks up the RUT, persists the result, and
    returns immediately.  Returns {"estado_habil": ..., "checked": True/False}.
    If the CSV is unavailable the current DB value is returned unchanged.
    """
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        return {"estado_habil": ESTADO_DESCONOCIDO, "error": "empresa_not_found"}

    csv_url = settings.estado_habil_csv_url
    if not csv_url:
        return {
            "estado_habil": empresa.estado_habil,
            "checked": False,
            "motivo": "ESTADO_HABIL_CSV_URL no configurado",
        }

    try:
        rows = _download_csv(csv_url)
    except Exception as exc:
        logger.warning("check_empresa_now: CSV download failed for %s — %s", empresa_id, exc)
        return {
            "estado_habil": empresa.estado_habil,
            "checked": False,
            "motivo": "No se pudo descargar el registro ChileCompra",
        }

    rut_norm = _normalize_rut(empresa.rut_empresa)
    new_state = _lookup_rut_in_rows(rows, rut_norm)
    old_state = empresa.estado_habil

    empresa.estado_habil = new_state
    empresa.estado_habil_updated_at = datetime.now(UTC)

    if new_state != old_state:
        log_entry = EstadoHabilLog(
            empresa_id=empresa.id,
            rut_empresa=empresa.rut_empresa,
            estado_anterior=old_state,
            estado_nuevo=new_state,
            fuente="onboarding",
        )
        db.add(log_entry)

    db.commit()
    return {
        "estado_habil": new_state,
        "rut_empresa": empresa.rut_empresa,
        "checked": True,
    }


def get_estado_habil_history(empresa_id: str, db: Session, limit: int = 30) -> list[EstadoHabilLog]:
    """Return the last `limit` estado hábil log entries for an empresa."""
    return (
        db.query(EstadoHabilLog)
        .filter(EstadoHabilLog.empresa_id == empresa_id)
        .order_by(EstadoHabilLog.checked_at.desc())
        .limit(limit)
        .all()
    )
