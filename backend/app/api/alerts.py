from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from app.db import get_db
from app.models.user import User
from app.models.alert import Alert, AlertPreference, AlertStatus, AlertType
from app.core.security import get_current_active_user
from app.core.plan_limits import check_alert_quota_dep
from app.schemas.alert import (
    AlertPreferenceCreate,
    AlertPreferenceUpdate,
    AlertPreferenceResponse,
    AlertResponse,
    AlertListResponse,
    AlertUpdate,
)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.post("/preferences", response_model=AlertPreferenceResponse, status_code=status.HTTP_201_CREATED)
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
    stmt = select(AlertPreference).where(AlertPreference.user_id == current_user.id)
    if active_only:
        stmt = stmt.where(AlertPreference.is_active == True)
    return (await db.execute(stmt)).scalars().all()


@router.get("/preferences/{preference_id}", response_model=AlertPreferenceResponse)
async def get_alert_preference(
    preference_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    preference = (
        await db.execute(
            select(AlertPreference).where(
                AlertPreference.id == preference_id, AlertPreference.user_id == current_user.id
            )
        )
    ).scalar_one_or_none()
    if not preference:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert preference not found")
    return preference


@router.put("/preferences/{preference_id}", response_model=AlertPreferenceResponse)
async def update_alert_preference(
    preference_id: int,
    preference_update: AlertPreferenceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    preference = (
        await db.execute(
            select(AlertPreference).where(
                AlertPreference.id == preference_id, AlertPreference.user_id == current_user.id
            )
        )
    ).scalar_one_or_none()
    if not preference:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert preference not found")
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
    preference = (
        await db.execute(
            select(AlertPreference).where(
                AlertPreference.id == preference_id, AlertPreference.user_id == current_user.id
            )
        )
    ).scalar_one_or_none()
    if not preference:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert preference not found")
    await db.delete(preference)
    await db.commit()
    return None


@router.get("/", response_model=AlertListResponse)
async def list_alerts(
    skip: int = Query(0, ge=0, alias="offset"),
    limit: int = Query(20, ge=1, le=100, alias="limit"),
    status_filter: Optional[AlertStatus] = Query(None, alias="status"),
    alert_type: Optional[AlertType] = None,
    unread_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    stmt = select(Alert).where(Alert.user_id == current_user.id)
    if status_filter:
        stmt = stmt.where(Alert.status == status_filter)
    if alert_type:
        stmt = stmt.where(Alert.alert_type == alert_type)
    if unread_only:
        stmt = stmt.where(Alert.status != AlertStatus.READ)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    unread_count = (
        await db.execute(
            select(func.count(Alert.id)).where(
                Alert.user_id == current_user.id, Alert.status != AlertStatus.READ
            )
        )
    ).scalar() or 0

    items = (
        await db.execute(stmt.order_by(Alert.created_at.desc()).offset(skip).limit(limit))
    ).scalars().all()

    pages = (total + limit - 1) // limit if limit > 0 else 0
    page = (skip // limit) + 1 if limit > 0 else 1
    return AlertListResponse(items=items, total=total, page=page, size=limit, pages=pages, unread_count=unread_count)


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    alert = (
        await db.execute(
            select(Alert).where(Alert.id == alert_id, Alert.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return alert


@router.put("/{alert_id}", response_model=AlertResponse)
async def update_alert(
    alert_id: int,
    alert_update: AlertUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    alert = (
        await db.execute(
            select(Alert).where(Alert.id == alert_id, Alert.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    for field, value in alert_update.model_dump(exclude_unset=True).items():
        setattr(alert, field, value)
    if alert_update.status == AlertStatus.READ and not alert.read_at:
        from datetime import datetime
        alert.read_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.post("/{alert_id}/read", response_model=AlertResponse)
async def mark_alert_as_read(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    alert = (
        await db.execute(
            select(Alert).where(Alert.id == alert_id, Alert.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    from datetime import datetime
    alert.status = AlertStatus.READ
    alert.read_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.post("/test")
async def send_test_alert(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from datetime import datetime, timezone
    ikey = f"onboarding_test_{current_user.id}_{datetime.now(timezone.utc).strftime('%Y%m%d%H')}"
    existing = (await db.execute(select(Alert).where(Alert.idempotency_key == ikey))).scalar_one_or_none()
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


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    alert = (
        await db.execute(
            select(Alert).where(Alert.id == alert_id, Alert.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    await db.delete(alert)
    await db.commit()
    return None
