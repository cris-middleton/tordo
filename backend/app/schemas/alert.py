from datetime import datetime
from typing import Any, Dict, List

from pydantic import BaseModel, ConfigDict, Field

from app.models.alert import AlertStatus, AlertType


class AlertPreferenceBase(BaseModel):
    name: str
    category_id: int | None = None
    organismo_ids: List[int] | None = None
    min_amount: int | None = None
    max_amount: int | None = None
    estados: List[str] | None = None
    regiones: List[str] | None = None
    comunas: List[str] | None = None
    keywords: List[str] | None = None
    notify_email: bool = True
    notify_in_app: bool = True
    notify_webhook: bool = False
    webhook_url: str | None = None


class AlertPreferenceCreate(AlertPreferenceBase):
    pass


class AlertPreferenceUpdate(BaseModel):
    name: str | None = None
    category_id: int | None = None
    organismo_ids: List[int] | None = None
    min_amount: int | None = None
    max_amount: int | None = None
    estados: List[str] | None = None
    regiones: List[str] | None = None
    comunas: List[str] | None = None
    keywords: List[str] | None = None
    notify_email: bool | None = None
    notify_in_app: bool | None = None
    notify_webhook: bool | None = None
    webhook_url: str | None = None
    is_active: bool | None = None


class AlertPreferenceResponse(AlertPreferenceBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AlertResponse(BaseModel):
    id: int
    user_id: int
    alert_type: AlertType
    status: AlertStatus
    entity_type: str
    entity_id: int
    title: str
    message: str | None = None
    metadata: Dict[str, Any] | None = Field(
        None, alias="alert_metadata"
    )  # Maps from alert_metadata in model
    notification_channels: List[str] | None = None
    sent_at: datetime | None = None
    read_at: datetime | None = None
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
    status: AlertStatus | None = None
    read_at: datetime | None = None
