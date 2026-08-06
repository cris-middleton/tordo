from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class User(Base):
    """User model for authentication and user management"""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))

    # User status
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)

    # Preferences
    notification_email = Column(Boolean, default=True)
    notification_in_app = Column(Boolean, default=True)
    notification_webhook = Column(Boolean, default=False)
    notification_whatsapp = Column(Boolean, default=False)
    webhook_url = Column(String(500))

    # La suscripción y el trial NO viven aquí: pertenecen a la empresa.
    # Un usuario es un asiento, no una cuenta de facturación.
    # Ver docs/decisiones/0002-suscripcion-por-empresa.md.

    # OAuth
    google_id = Column(String(100), unique=True, nullable=True, index=True)

    # WhatsApp notifications
    whatsapp_number = Column(String(20), nullable=True)

    # Onboarding
    onboarding_completed = Column(Boolean, default=False, nullable=False)
    onboarding_step = Column(Integer, default=0, nullable=False)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True))

    # Relationships
    alerts = relationship("Alert", back_populates="user", cascade="all, delete-orphan")
    alert_preferences = relationship(
        "AlertPreference", back_populates="user", cascade="all, delete-orphan"
    )
    empresas = relationship("EmpresaUsuario", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User(email='{self.email}', username='{self.username}')>"
