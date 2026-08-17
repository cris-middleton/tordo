import enum

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class AlertStatus(enum.StrEnum):
    """Status of an alert"""

    PENDING = "pending"
    SENT = "sent"
    READ = "read"
    ARCHIVED = "archived"


class AlertType(enum.StrEnum):
    """Type of alert"""

    NEW_TENDER = "new_tender"
    TENDER_UPDATE = "tender_update"
    NEW_ORDER = "new_order"
    ORDER_UPDATE = "order_update"
    MATCHED_PREFERENCE = "matched_preference"
    # Compliance / operational alerts (added Block 2)
    ESTADO_HABIL_CAMBIO = "estado_habil_cambio"
    DOCUMENTO_VENCIDO = "documento_vencido"
    PLAZO_48H = "plazo_48h"
    PLAZO_24H = "plazo_24h"
    NUEVA_LICITACION_MATCH = "nueva_licitacion_match"
    # El precio mediano de un producto vigilado se movió por encima del umbral.
    # Los datos de precio ya existían; lo que faltaba era poder compararlos con
    # los de la corrida anterior. Ver `app/models/precio.py`.
    CAMBIO_PRECIO = "cambio_precio"
    # Cómo terminó una licitación que la empresa seguía. Cierra el único tramo
    # del ciclo que estaba abierto: se avisaba de la oportunidad y no de su
    # resultado. Ver `services/resultados.py`.
    RESULTADO_LICITACION = "resultado_licitacion"
    # Un proveedor vigilado ganó una orden de compra. Ver `services/competidores.py`.
    COMPETIDOR_GANO = "competidor_gano"


class NotificationChannel(enum.StrEnum):
    """Notification channel"""

    EMAIL = "email"
    IN_APP = "in_app"
    # El webhook se queda aunque casi nadie lo use: cuesta cero mantenerlo y es
    # lo que sostiene el ángulo de integración con un ERP junto con la API
    # pública. WhatsApp se retiró — ver `services/notificaciones.py`.
    WEBHOOK = "webhook"


class Alert(Base):
    """Alert model for user notifications"""

    __tablename__ = "alerts"
    __table_args__ = {
        "comment": "Avisos generados para un usuario. `idempotency_key` es única: evita duplicar el mismo aviso entre corridas"
    }

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Alert details
    alert_type = Column(SQLEnum(AlertType), nullable=False, index=True)
    status = Column(SQLEnum(AlertStatus), default=AlertStatus.PENDING, index=True)

    # Related entity
    entity_type = Column(String(50), nullable=False)  # "licitacion" or "orden_compra"
    entity_id = Column(Integer, nullable=False, index=True)  # ID of the related entity

    # Alert content
    title = Column(String(500), nullable=False)
    message = Column(Text)
    # Python attribute renamed to avoid clash with SQLAlchemy's reserved `metadata`
    # — the DB column stays named `metadata` (original schema from migration 001).
    alert_metadata = Column("metadata", JSONB)

    # Notification tracking
    notification_channels = Column(JSONB)  # List of channels used: ["email", "in_app", "webhook"]
    sent_at = Column(DateTime(timezone=True))
    read_at = Column(DateTime(timezone=True))

    # Deduplication
    idempotency_key = Column(String(255), unique=True, nullable=True)

    # Empresa association (for compliance alerts)
    empresa_id = Column(
        UUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="alerts")

    def __repr__(self):
        return f"<Alert(user_id={self.user_id}, type='{self.alert_type}', status='{self.status}')>"


class AlertPreference(Base):
    """User alert preferences for matching"""

    __tablename__ = "alert_preferences"
    __table_args__ = {"comment": "Filtros con los que un usuario acota qué licitaciones le avisan"}

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Preference name
    name = Column(String(200), nullable=False)  # User-defined name for this preference

    # Matching criteria
    # Categories
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)

    # Organizations
    organismo_ids = Column(JSONB)  # List of organismo IDs to watch

    # Financial filters
    min_amount = Column(Integer, nullable=True)  # Minimum tender/order amount
    max_amount = Column(Integer, nullable=True)  # Maximum tender/order amount

    # Status filters
    estados = Column(JSONB)  # List of estados to watch: ["Publicada", "Cerrada"]

    # Region/Comuna filters
    regiones = Column(JSONB)  # List of regions to watch
    comunas = Column(JSONB)  # List of comunas to watch

    # Keywords
    keywords = Column(JSONB)  # List of keywords to search in nombre/descripcion

    # Notification settings
    notify_email = Column(Boolean, default=True)
    notify_in_app = Column(Boolean, default=True)
    notify_webhook = Column(Boolean, default=False)
    webhook_url = Column(String(500))  # Override user's default webhook

    # Status
    is_active = Column(Boolean, default=True)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="alert_preferences")
    category = relationship("Category", back_populates="alert_preferences")

    def __repr__(self):
        return f"<AlertPreference(user_id={self.user_id}, name='{self.name}', active={self.is_active})>"
