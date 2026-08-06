from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class OrdenCompraHistorial(Base):
    """Model for tracking changes to órdenes de compra over time"""

    __tablename__ = "ordenes_compra_historial"

    id = Column(Integer, primary_key=True)

    # Foreign keys
    orden_compra_id = Column(Integer, ForeignKey("ordenes_compra.id"), nullable=False, index=True)
    orden_compra = relationship("OrdenCompra", back_populates="historial")

    orden_compra_detalle_id = Column(
        Integer, ForeignKey("ordenes_compra_detalle.id"), nullable=True, index=True
    )
    detalle = relationship("OrdenCompraDetalle", back_populates="historial")

    # Business key for reference
    codigo_oc = Column(String(100), index=True, nullable=False)

    # Change information
    tipo_cambio = Column(
        String(50), index=True
    )  # 'estado', 'entrega', 'aceptacion', 'documento_nuevo', etc.
    campo_modificado = Column(String(100))
    descripcion = Column(Text)  # Human-readable description

    # Values
    valor_anterior = Column(Text)
    valor_nuevo = Column(Text)

    # Metadata
    fecha_cambio = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    fecha_deteccion = Column(DateTime(timezone=True), server_default=func.now())

    # Optional: full snapshot at this point in time (for auditing)
    snapshot_completo = Column(JSONB)

    def __repr__(self):
        return f"<OrdenCompraHistorial(codigo='{self.codigo_oc}', tipo='{self.tipo_cambio}', fecha='{self.fecha_cambio}')>"
