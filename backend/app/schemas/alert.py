from pydantic import BaseModel, ConfigDict, HttpUrl, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.alert import AlertStatus, AlertType, NotificationChannel


class AlertPreferenceBase(BaseModel):
    name: str
    category_id: Optional[int] = None
    organismo_ids: Optional[List[int]] = None
    min_amount: Optional[int] = None
    max_amount: Optional[int] = None
    estados: Optional[List[str]] = None
    regiones: Optional[List[str]] = None
    comunas: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    notify_email: bool = True
    notify_in_app: bool = True
    notify_webhook: bool = False
    webhook_url: Optional[str] = None


class AlertPreferenceCreate(AlertPreferenceBase):
    pass


class AlertPreferenceUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    organismo_ids: Optional[List[int]] = None
    min_amount: Optional[int] = None
    max_amount: Optional[int] = None
    estados: Optional[List[str]] = None
    regiones: Optional[List[str]] = None
    comunas: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    notify_email: Optional[bool] = None
    notify_in_app: Optional[bool] = None
    notify_webhook: Optional[bool] = None
    webhook_url: Optional[str] = None
    is_active: Optional[bool] = None


class AlertPreferenceResponse(AlertPreferenceBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


class AlertResponse(BaseModel):
    id: int
    user_id: int
    alert_type: AlertType
    status: AlertStatus
    entity_type: str
    entity_id: int
    title: str
    message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = Field(None, alias='alert_metadata')  # Maps from alert_metadata in model
    notification_channels: Optional[List[str]] = None
    sent_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class AlertListResponse(BaseModel):
    items: List[AlertResponse]
    total: int
    page: int
    size: int
    pages: int
    unread_count: int


class AlertUpdate(BaseModel):
    status: Optional[AlertStatus] = None
    read_at: Optional[datetime] = None

