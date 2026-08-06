from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class LicitacionDetalle(Base):
    """Model for detailed information about licitaciones (updateable)"""

    __tablename__ = "licitaciones_detalle"

    id = Column(Integer, primary_key=True)

    # Foreign key to main licitacion
    licitacion_id = Column(Integer, ForeignKey("licitaciones.id"), unique=True, nullable=False)
    licitacion = relationship("Licitacion", back_populates="detalle")

    # Business key
    codigo_externo = Column(String(100), unique=True, nullable=False)

    # Update metadata
    fecha_primera_extraccion = Column(DateTime(timezone=True), server_default=func.now())
    fecha_ultima_actualizacion = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    numero_actualizaciones = Column(Integer, default=1)
    hash_contenido = Column(String(64), index=True)  # SHA256 hash of content

    # Complete detailed data (full API response)
    datos_completos = Column(JSONB)

    # Extracted specific fields for quick queries
    items = Column(JSONB)  # List of items/products with details
    documentos = Column(JSONB)  # List of documents
    participantes = Column(JSONB)  # List of participants/bidders
    etapas = Column(JSONB)  # Process stages
    adjuntos = Column(JSONB)  # Attachments

    # Current state fields (extracted from JSON for indexing)
    estado_actual = Column(String(50), index=True)
    fecha_cierre_real = Column(DateTime(timezone=True))
    fecha_adjudicacion = Column(DateTime(timezone=True))
    monto_adjudicado = Column(String(50))
    proveedor_adjudicado = Column(String(500))

    # Relationship to history
    historial = relationship(
        "LicitacionHistorial", back_populates="detalle", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<LicitacionDetalle(codigo_externo='{self.codigo_externo}', actualizaciones={self.numero_actualizaciones})>"
