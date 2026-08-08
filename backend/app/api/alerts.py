from datetime import UTC, datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.plan_limits import check_alert_quota_dep
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.alert import Alert, AlertPreference, AlertStatus, AlertType
from app.models.user import User
from app.repositories import alertas as repo
from app.schemas.alert import (
    AlertListResponse,
    AlertPreferenceCreate,
    AlertPreferenceResponse,
    AlertPreferenceUpdate,
    AlertResponse,
    AlertUpdate,
)
from app.services.twilio_service import send_whatsapp_alert

router = APIRouter(prefix="/alerts", tags=["alerts"])

_NO_ENCONTRADA = "Alerta no encontrada"
_PREFERENCIA_NO_ENCONTRADA = "Preferencia de alerta no encontrada"


async def _alerta_mia(db: AsyncSession, alerta_id: int, usuario: User) -> Alert:
    """La alerta del usuario, o 404.

    Todo endpoint que toque una alerta pasa por aquí. El filtro por usuario vive
    en el repositorio, en un solo sitio: repetido en cada handler era la garantía
    de aislamiento más fácil de olvidar del backend.
    """
    alerta = await repo.obtener_alerta(db, alerta_id, usuario.id)
    if not alerta:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NO_ENCONTRADA)
    return alerta


async def _preferencia_mia(db: AsyncSession, preferencia_id: int, usuario: User) -> AlertPreference:
    preferencia = await repo.obtener_preferencia(db, preferencia_id, usuario.id)
    if not preferencia:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=_PREFERENCIA_NO_ENCONTRADA
        )
    return preferencia


# ── Preferencias ─────────────────────────────────────────────────────────────


@router.post(
    "/preferences", response_model=AlertPreferenceResponse, status_code=status.HTTP_201_CREATED
)
async def create_alert_preference(
    preference: AlertPreferenceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_alert_quota_dep),
):
    db_preference = AlertPreference(user_id=current_user.id, **preference.model_dump())
    db.add(db_preference)
    await db.commit()
    await db.refresh(db_preference)
    return db_preference


@router.get("/preferences", response_model=List[AlertPreferenceResponse])
async def list_alert_preferences(
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return await repo.listar_preferencias(db, current_user.id, solo_activas=active_only)


@router.get("/preferences/{preference_id}", response_model=AlertPreferenceResponse)
async def get_alert_preference(
    preference_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return await _preferencia_mia(db, preference_id, current_user)


@router.put("/preferences/{preference_id}", response_model=AlertPreferenceResponse)
async def update_alert_preference(
    preference_id: int,
    preference_update: AlertPreferenceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    preference = await _preferencia_mia(db, preference_id, current_user)
    for field, value in preference_update.model_dump(exclude_unset=True).items():
        setattr(preference, field, value)
    await db.commit()
    await db.refresh(preference)
    return preference


@router.delete("/preferences/{preference_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_preference(
    preference_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    preference = await _preferencia_mia(db, preference_id, current_user)
    await db.delete(preference)
    await db.commit()
    return None


# ── Alertas ──────────────────────────────────────────────────────────────────


@router.get("/", response_model=AlertListResponse)
async def list_alerts(
    skip: int = Query(0, ge=0, alias="offset"),
    limit: int = Query(20, ge=1, le=100, alias="limit"),
    status_filter: AlertStatus | None = Query(None, alias="status"),
    alert_type: AlertType | None = None,
    unread_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    items, total, unread_count = await repo.listar_alertas(
        db,
        current_user.id,
        estado=status_filter,
        tipo=alert_type,
        solo_no_leidas=unread_only,
        salto=skip,
        limite=limit,
    )
    pages = (total + limit - 1) // limit if limit > 0 else 0
    page = (skip // limit) + 1 if limit > 0 else 1
    return AlertListResponse(
        items=items, total=total, page=page, size=limit, pages=pages, unread_count=unread_count
    )


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return await _alerta_mia(db, alert_id, current_user)


@router.put("/{alert_id}", response_model=AlertResponse)
async def update_alert(
    alert_id: int,
    alert_update: AlertUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    alert = await _alerta_mia(db, alert_id, current_user)
    for field, value in alert_update.model_dump(exclude_unset=True).items():
        setattr(alert, field, value)
    # Marcarla como leída sella la hora, pero sólo la PRIMERA vez: releerla no
    # debería mover la fecha con la que se mide el tiempo de reacción.
    if alert_update.status == AlertStatus.READ and not alert.read_at:
        alert.read_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.post("/{alert_id}/read", response_model=AlertResponse)
async def mark_alert_as_read(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    alert = await _alerta_mia(db, alert_id, current_user)
    alert.status = AlertStatus.READ
    alert.read_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    alert = await _alerta_mia(db, alert_id, current_user)
    await db.delete(alert)
    await db.commit()
    return None


# ── Pruebas de canal ─────────────────────────────────────────────────────────


@router.post("/test")
async def send_test_alert(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # La clave lleva la hora: repetir la prueba dentro de la misma hora no crea
    # una alerta nueva, y al cambiar de hora sí. Es el mismo mecanismo de
    # idempotencia que usa el motor de alertas.
    ikey = f"onboarding_test_{current_user.id}_{datetime.now(UTC).strftime('%Y%m%d%H')}"
    existing = await repo.buscar_por_clave_idempotencia(db, ikey)
    if existing:
        return {"created": False, "alert_id": existing.id}
    alert = Alert(
        user_id=current_user.id,
        alert_type=AlertType.MATCHED_PREFERENCE,
        status=AlertStatus.SENT,
        entity_type="test",
        entity_id=0,
        title="¡Alertas activas! — Tu primera alerta está configurada",
        message=(
            "Recibirás notificaciones en la app cuando aparezcan licitaciones "
            "que coincidan con tus rubros y palabras clave."
        ),
        idempotency_key=ikey,
        notification_channels=["in_app"],
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return {"created": True, "alert_id": alert.id}


@router.post("/test-whatsapp")
async def send_test_whatsapp(
    current_user: User = Depends(get_current_active_user),
):
    """Manda un WhatsApp de prueba al número registrado del usuario.

    En desarrollo usa el sandbox de Twilio. Necesita `FEATURE_WHATSAPP=true` y
    credenciales válidas; sin ellas responde `sent: false` en vez de fallar.
    """
    if not current_user.whatsapp_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No tienes un número de WhatsApp registrado. Configúralo en Ajustes.",
        )

    message = (
        "Hola desde *TORDO* — tu número de WhatsApp está conectado correctamente.\n\n"
        "Recibirás alertas de licitaciones, plazos y documentos por este canal."
    )
    success = send_whatsapp_alert(current_user.whatsapp_number, message)

    return {
        "sent": success,
        "to": current_user.whatsapp_number,
        "live": bool(
            settings.feature_whatsapp and settings.twilio_account_sid and settings.twilio_auth_token
        ),
    }
