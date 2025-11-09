from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from app.db import get_db
from app.models.user import User
from app.models.alert import Alert, AlertPreference, AlertStatus, AlertType
from app.core.security import get_current_active_user
from app.schemas.alert import (
    AlertPreferenceCreate,
    AlertPreferenceUpdate,
    AlertPreferenceResponse,
    AlertResponse,
    AlertListResponse,
    AlertUpdate,
)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


# Alert Preferences Endpoints
@router.post("/preferences", response_model=AlertPreferenceResponse, status_code=status.HTTP_201_CREATED)
async def create_alert_preference(
    preference: AlertPreferenceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new alert preference"""
    db_preference = AlertPreference(
        user_id=current_user.id,
        **preference.model_dump()
    )
    
    db.add(db_preference)
    db.commit()
    db.refresh(db_preference)
    
    return db_preference


@router.get("/preferences", response_model=List[AlertPreferenceResponse])
async def list_alert_preferences(
    active_only: bool = Query(True, description="Only return active preferences"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List user's alert preferences"""
    query = db.query(AlertPreference).filter(AlertPreference.user_id == current_user.id)
    
    if active_only:
        query = query.filter(AlertPreference.is_active == True)
    
    preferences = query.all()
    return preferences


@router.get("/preferences/{preference_id}", response_model=AlertPreferenceResponse)
async def get_alert_preference(
    preference_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get alert preference by ID"""
    preference = db.query(AlertPreference).filter(
        AlertPreference.id == preference_id,
        AlertPreference.user_id == current_user.id
    ).first()
    
    if not preference:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert preference not found"
        )
    
    return preference


@router.put("/preferences/{preference_id}", response_model=AlertPreferenceResponse)
async def update_alert_preference(
    preference_id: int,
    preference_update: AlertPreferenceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update alert preference"""
    preference = db.query(AlertPreference).filter(
        AlertPreference.id == preference_id,
        AlertPreference.user_id == current_user.id
    ).first()
    
    if not preference:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert preference not found"
        )
    
    update_data = preference_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(preference, field, value)
    
    db.commit()
    db.refresh(preference)
    
    return preference


@router.delete("/preferences/{preference_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_preference(
    preference_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete alert preference"""
    preference = db.query(AlertPreference).filter(
        AlertPreference.id == preference_id,
        AlertPreference.user_id == current_user.id
    ).first()
    
    if not preference:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert preference not found"
        )
    
    db.delete(preference)
    db.commit()
    
    return None


# Alerts Endpoints
@router.get("/", response_model=AlertListResponse)
async def list_alerts(
    skip: int = Query(0, ge=0, alias="offset"),
    limit: int = Query(20, ge=1, le=100, alias="limit"),
    status_filter: Optional[AlertStatus] = Query(None, alias="status"),
    alert_type: Optional[AlertType] = None,
    unread_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List user's alerts"""
    query = db.query(Alert).filter(Alert.user_id == current_user.id)
    
    if status_filter:
        query = query.filter(Alert.status == status_filter)
    if alert_type:
        query = query.filter(Alert.alert_type == alert_type)
    if unread_only:
        query = query.filter(Alert.status != AlertStatus.READ)
    
    # Get total count
    total = query.count()
    
    # Get unread count
    unread_count = db.query(Alert).filter(
        Alert.user_id == current_user.id,
        Alert.status != AlertStatus.READ
    ).count()
    
    # Apply pagination
    items = query.order_by(Alert.created_at.desc()).offset(skip).limit(limit).all()
    
    # Calculate pages
    pages = (total + limit - 1) // limit if limit > 0 else 0
    page = (skip // limit) + 1 if limit > 0 else 1
    
    return AlertListResponse(
        items=items,
        total=total,
        page=page,
        size=limit,
        pages=pages,
        unread_count=unread_count,
    )


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get alert by ID"""
    alert = db.query(Alert).filter(
        Alert.id == alert_id,
        Alert.user_id == current_user.id
    ).first()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found"
        )
    
    return alert


@router.put("/{alert_id}", response_model=AlertResponse)
async def update_alert(
    alert_id: int,
    alert_update: AlertUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update alert (e.g., mark as read)"""
    alert = db.query(Alert).filter(
        Alert.id == alert_id,
        Alert.user_id == current_user.id
    ).first()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found"
        )
    
    update_data = alert_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(alert, field, value)
    
    # If marking as read, set read_at timestamp
    if alert_update.status == AlertStatus.READ and not alert.read_at:
        from datetime import datetime
        alert.read_at = datetime.utcnow()
    
    db.commit()
    db.refresh(alert)
    
    return alert


@router.post("/{alert_id}/read", response_model=AlertResponse)
async def mark_alert_as_read(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Mark alert as read"""
    alert = db.query(Alert).filter(
        Alert.id == alert_id,
        Alert.user_id == current_user.id
    ).first()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found"
        )
    
    from datetime import datetime
    alert.status = AlertStatus.READ
    alert.read_at = datetime.utcnow()
    
    db.commit()
    db.refresh(alert)
    
    return alert


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete alert"""
    alert = db.query(Alert).filter(
        Alert.id == alert_id,
        Alert.user_id == current_user.id
    ).first()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found"
        )
    
    db.delete(alert)
    db.commit()
    
    return None

