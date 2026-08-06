import uuid
from datetime import date

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class Empresa(Base):
    """Empresa proveedora registrada en TORDO."""

    __tablename__ = "empresas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rut_empresa = Column(String(12), unique=True, nullable=False)
    nombre_empresa = Column(String(255), nullable=False)
    rubros_cpv = Column(ARRAY(Text()), nullable=True)
    regiones = Column(ARRAY(Text()), nullable=True)
    activo = Column(Boolean(), nullable=False, default=True)
    estado_habil = Column(String(20), nullable=False, default="desconocido")
    estado_habil_updated_at = Column(DateTime(timezone=True), nullable=True)

    # ── Suscripción ──────────────────────────────────────────────────────────
    # La suscripción pertenece a la EMPRESA, no al usuario: los usuarios son
    # asientos. Ver docs/decisiones/0002-suscripcion-por-empresa.md.
    plan_tier = Column(
        String(20),
        nullable=False,
        default="basico",
        server_default="basico",
        comment="Plan contratado: basico | pyme | pro | enterprise",
    )
    subscription_status = Column(
        String(20),
        nullable=False,
        default="inactive",
        server_default="inactive",
        comment="Estado de la suscripción: inactive | trialing | active | past_due | canceled",
    )
    billing_provider = Column(
        String(30),
        nullable=True,
        index=True,
        comment=(
            "Pasarela que tiene la suscripción: stripe | mercadopago | khipu. "
            "NULL mientras no haya suscripción."
        ),
    )
    billing_customer_id = Column(
        String(255),
        nullable=True,
        index=True,
        comment="ID del cliente en la pasarela. El formato depende del proveedor.",
    )
    billing_subscription_id = Column(
        String(255), nullable=True, comment="ID de la suscripción en la pasarela."
    )
    trial_ends_at = Column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
        comment="Fin del reverse-trial. Se fija al crear la empresa, no al registrarse el usuario",
    )
    trial_reminder_day7_sent_at = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Cuándo se envió el recordatorio de trial del día 7",
    )
    trial_reminder_day12_sent_at = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Cuándo se envió el recordatorio de trial del día 12",
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    usuarios = relationship(
        "EmpresaUsuario", back_populates="empresa", cascade="all, delete-orphan"
    )
    documentos = relationship(
        "DocumentoEmpresa", back_populates="empresa", cascade="all, delete-orphan"
    )
    estado_habil_logs = relationship(
        "EstadoHabilLog", back_populates="empresa", cascade="all, delete-orphan"
    )
    postulaciones = relationship(
        "Postulacion", back_populates="empresa", cascade="all, delete-orphan"
    )
    tfidf_perfil = relationship(
        "TFIDFPerfil", back_populates="empresa", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "estado_habil IN ('habil', 'inhabil', 'no_encontrado', 'desconocido')",
            name="ck_empresas_estado_habil",
        ),
    )

    def __repr__(self) -> str:
        return f"<Empresa(rut='{self.rut_empresa}', nombre='{self.nombre_empresa}')>"


class EmpresaUsuario(Base):
    """M2M: usuarios ↔ empresas con rol."""

    __tablename__ = "empresas_usuario"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Ambos índices existen en la base y son los que sirven CADA comprobación de
    # pertenencia a empresa (app/api/deps.py). Declararlos aquí no es cosmético:
    # sin ellos en el modelo, autogenerate propone eliminarlos.
    user_id = Column(
        Integer(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    empresa_id = Column(
        UUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rol = Column(String(20), nullable=False, default="owner")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="empresas")
    empresa = relationship("Empresa", back_populates="usuarios")

    __table_args__ = (
        CheckConstraint("rol IN ('owner', 'admin', 'viewer')", name="ck_empresas_usuario_rol"),
        UniqueConstraint("user_id", "empresa_id", name="uq_empresas_usuario"),
    )


class DocumentoEmpresa(Base):
    """Documento de una empresa almacenado en S3."""

    __tablename__ = "documentos_empresa"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    empresa_id = Column(
        UUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nombre = Column(String(255), nullable=False)
    tipo_documento = Column(String(50), nullable=False)
    s3_key = Column(String(500), nullable=False)
    s3_bucket = Column(String(100), nullable=False)
    mime_type = Column(String(100), nullable=True)
    tamano_bytes = Column(BigInteger(), nullable=True)
    fecha_emision = Column(Date(), nullable=True)
    fecha_vencimiento = Column(Date(), nullable=True, index=True)
    eliminado = Column(Boolean(), nullable=False, default=False)

    @property
    def esta_vigente(self) -> bool:
        """True si el documento no tiene fecha de vencimiento o aún no venció."""
        return self.fecha_vencimiento is None or self.fecha_vencimiento >= date.today()

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    empresa = relationship("Empresa", back_populates="documentos")
    checklist_items = relationship("ChecklistPostulacion", back_populates="documento")

    __table_args__ = (CheckConstraint("tamano_bytes <= 26214400", name="ck_documentos_tamano"),)


class EstadoHabilLog(Base):
    """Historial de cambios de estado hábil por empresa."""

    __tablename__ = "estado_habil_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    empresa_id = Column(
        UUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rut_empresa = Column(String(12), nullable=False)
    estado_anterior = Column(String(20), nullable=True)
    estado_nuevo = Column(String(20), nullable=False)
    fuente = Column(String(50), nullable=True, default="csv_datos_abiertos")
    checked_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    empresa = relationship("Empresa", back_populates="estado_habil_logs")


class TFIDFPerfil(Base):
    """Perfil TF-IDF serializado para matching semántico."""

    __tablename__ = "tfidf_perfiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    empresa_id = Column(
        UUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    vector_bytes = Column(LargeBinary(), nullable=False)
    rubros_usados = Column(ARRAY(Text()), nullable=True)
    modelo_version = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    empresa = relationship("Empresa", back_populates="tfidf_perfil")
