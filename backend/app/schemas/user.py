from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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
    recibe_informe_semanal: bool | None = None
    webhook_url: str | None = None
    onboarding_completed: bool | None = None
    onboarding_step: int | None = None
    whatsapp_number: str | None = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    is_verified: bool
    notification_email: bool
    notification_in_app: bool
    notification_webhook: bool
    notification_whatsapp: bool = False
    recibe_informe_semanal: bool = True
    # El plan y el trial NO se exponen aquí: son de la empresa, no del usuario
    # (ADR 0002). El frontend los obtiene de /api/billing/status.
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
    # El refresco viaja en el cuerpo, no en una cookie que ponga el backend: quien
    # lo guarda es el proxy de Next en una cookie httpOnly, así que el navegador
    # nunca lo ve. Ver F5.
    refresh_token: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChange(BaseModel):
    """Estaba declarado dentro de `api/auth.py`. Los schemas van aquí (CLAUDE.md)."""

    current_password: str
    new_password: str


class PasswordResetRequest(BaseModel):
    """Petición de enlace de recuperación."""

    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Canje del enlace por una contraseña nueva."""

    token: str
    new_password: str = Field(min_length=8)


class TokenData(BaseModel):
    user_id: int | None = None
