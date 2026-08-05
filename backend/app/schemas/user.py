from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class UserBase(BaseModel):
    email: EmailStr
    username: str
    full_name: str | None = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    username: str | None = None
    full_name: str | None = None
    notification_email: bool | None = None
    notification_in_app: bool | None = None
    notification_webhook: bool | None = None
    notification_whatsapp: bool | None = None
    webhook_url: str | None = None
    onboarding_completed: bool | None = None
    onboarding_step: int | None = None
    plan_tier: str | None = None
    whatsapp_number: str | None = None


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
    trial_ends_at: datetime | None = None
    onboarding_completed: bool = False
    onboarding_step: int = 0
    webhook_url: str | None = None
    whatsapp_number: str | None = None
    has_google: bool = False  # derived: google_id is not None
    created_at: datetime
    last_login: datetime | None = None

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
    user_id: int | None = None
