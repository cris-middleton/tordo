from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class LicitacionDetalle(Base):
    """Model for detailed information about licitaciones (updateable)"""

    __tablename__ = "licitaciones_detalle"
    __table_args__ = {
        "comment": "Campos extendidos de una licitación, que llegan en una segunda llamada a la API y se actualizan"
    }

    id = Column(
        BigInteger, primary_key=True, comment="Identificador interno de la fila (secuencia)."
    )

    # Foreign key to main licitacion
    licitacion_id = Column(
        BigInteger,
        ForeignKey("licitaciones.id"),
        unique=True,
        nullable=False,
        comment="La licitación de la que es detalle (una a una).",
    )
    licitacion = relationship("Licitacion", back_populates="detalle")

    # Business key
    codigo_externo = Column(
        String(100),
        unique=True,
        nullable=False,
        comment="Código de Mercado Público, el mismo que en licitaciones.",
    )

    # Update metadata
    fecha_primera_extraccion = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        comment="Primera vez que el ETL guardó el detalle.",
    )
    fecha_ultima_actualizacion = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        comment="Última vez que el ETL cambió el detalle.",
    )
    numero_actualizaciones = Column(
        Integer, default=1, comment="Veces que el detalle cambió, contando la primera carga."
    )
    hash_contenido = Column(
        String(64),
        index=True,
        comment="SHA-256 del detalle ya sin personas naturales. Decide si cambió.",
    )

    # Extracted specific fields for quick queries
    items = Column(JSONB, comment="Ítems del detalle, con su código de producto.")
    documentos = Column(JSONB, comment="`Adjuntos` o `Documentos` del detalle, si la API los trae.")
    etapas = Column(JSONB, comment="`Etapas` del detalle, si la API las trae.")
    adjuntos = Column(
        JSONB, comment="Sin uso: los adjuntos se guardan en `documentos`. Siempre NULL."
    )

    # Current state fields (extracted from JSON for indexing)
    estado_actual = Column(
        String(50),
        index=True,
        comment="Estado según el detalle. Manda sobre licitaciones.estado en el ETL.",
    )
    fecha_cierre_real = Column(
        DateTime(timezone=True), comment="Sin uso: ningún paso del ETL la escribe. Siempre NULL."
    )
    fecha_adjudicacion = Column(
        DateTime(timezone=True), comment="Fecha de adjudicación según el detalle."
    )
    monto_adjudicado = Column(
        String(50), comment="Suma adjudicada en pesos, como texto sin separadores."
    )
    proveedor_adjudicado = Column(
        String(500),
        comment="Empresas adjudicadas, «NOMBRE (RUT)»; «Persona natural» sin nombrarla.",
    )

    def __repr__(self):
        return f"<LicitacionDetalle(codigo_externo='{self.codigo_externo}', actualizaciones={self.numero_actualizaciones})>"
