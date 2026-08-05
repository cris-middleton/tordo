import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class Postulacion(Base):
    """Licitación en seguimiento por una empresa."""

    __tablename__ = "postulaciones"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    empresa_id = Column(
        UUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    licitacion_id = Column(
        Integer(), ForeignKey("licitaciones.id", ondelete="CASCADE"), nullable=False, index=True
    )
    estado = Column(String(30), nullable=False, default="en_seguimiento")
    notas = Column(Text(), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    empresa = relationship("Empresa", back_populates="postulaciones")
    licitacion = relationship("Licitacion", back_populates="postulaciones")
    checklist = relationship(
        "ChecklistPostulacion", back_populates="postulacion", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "estado IN ('en_seguimiento', 'en_preparacion', 'enviada', 'adjudicada', 'no_adjudicada', 'descartada')",
            name="ck_postulaciones_estado",
        ),
        UniqueConstraint("empresa_id", "licitacion_id", name="uq_postulaciones"),
    )


class PlantillaChecklist(Base):
    """Plantilla de items de checklist por tipo de licitación."""

    __tablename__ = "plantillas_checklist"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tipo_licitacion = Column(String(10), nullable=False, index=True)
    nombre_item = Column(String(500), nullable=False)
    es_obligatorio = Column(Boolean(), nullable=False, default=True)
    orden = Column(SmallInteger(), nullable=False, default=0)
    activo = Column(Boolean(), nullable=False, default=True)


class ChecklistPostulacion(Base):
    """Item de checklist para una postulación específica."""

    __tablename__ = "checklist_postulacion"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    postulacion_id = Column(
        UUID(as_uuid=True),
        ForeignKey("postulaciones.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    descripcion = Column(String(500), nullable=False)
    es_obligatorio = Column(Boolean(), nullable=False, default=True)
    completado = Column(Boolean(), nullable=False, default=False)
    completado_at = Column(DateTime(timezone=True), nullable=True)
    documento_id = Column(
        UUID(as_uuid=True), ForeignKey("documentos_empresa.id", ondelete="SET NULL"), nullable=True
    )
    orden = Column(SmallInteger(), nullable=False, default=0)

    # Relationships
    postulacion = relationship("Postulacion", back_populates="checklist")
    documento = relationship("DocumentoEmpresa", back_populates="checklist_items")
