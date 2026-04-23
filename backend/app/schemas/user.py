from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    email: EmailStr
    username: str
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    notification_email: Optional[bool] = None
    notification_in_app: Optional[bool] = None
    notification_webhook: Optional[bool] = None
    notification_whatsapp: Optional[bool] = None
    webhook_url: Optional[str] = None
    onboarding_completed: Optional[bool] = None
    onboarding_step: Optional[int] = None
    plan_tier: Optional[str] = None
    whatsapp_number: Optional[str] = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    is_verified: bool
    notification_email: bool
    notification_in_app: bool
    notification_webhook: bool
    notification_whatsapp: bool = False
    plan_tier: str = "basico"
    subscription_status: str = "inactive"
    trial_ends_at: Optional[datetime] = None
    onboarding_completed: bool = False
    onboarding_step: int = 0
    webhook_url: Optional[str] = None
    whatsapp_number: Optional[str] = None
    has_google: bool = False  # derived: google_id is not None
    created_at: datetime
    last_login: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def model_validate(cls, obj, *args, **kwargs):
        # Inject has_google derived field from ORM object
        instance = super().model_validate(obj, *args, **kwargs)
        if hasattr(obj, "google_id"):
            instance.has_google = obj.google_id is not None
        return instance


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None

