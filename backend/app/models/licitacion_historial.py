from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db import Base


class LicitacionHistorial(Base):
    """Model for tracking changes to licitaciones over time"""
    __tablename__ = "licitaciones_historial"

    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign keys
    licitacion_id = Column(Integer, ForeignKey("licitaciones.id"), nullable=False, index=True)
    licitacion = relationship("Licitacion", back_populates="historial")
    
    licitacion_detalle_id = Column(Integer, ForeignKey("licitaciones_detalle.id"), nullable=True, index=True)
    detalle = relationship("LicitacionDetalle", back_populates="historial")
    
    # Business key for reference
    codigo_externo = Column(String(100), index=True, nullable=False)
    
    # Change information
    tipo_cambio = Column(String(50), index=True)  # 'estado', 'monto', 'fecha', 'documento_nuevo', etc.
    campo_modificado = Column(String(100))
    descripcion = Column(Text)  # Human-readable description
    
    # Values
    valor_anterior = Column(Text)
    valor_nuevo = Column(Text)
    
    # Metadata
    fecha_cambio = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    fecha_deteccion = Column(DateTime(timezone=True), server_default=func.now())
    
    # Optional: full snapshot at this point in time (for auditing)
    snapshot_completo = Column(JSON)
    
    def __repr__(self):
        return f"<LicitacionHistorial(codigo='{self.codigo_externo}', tipo='{self.tipo_cambio}', fecha='{self.fecha_cambio}')>"

