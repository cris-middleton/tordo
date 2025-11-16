from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db import Base


class OrdenCompraDetalle(Base):
    """Model for detailed information about órdenes de compra (updateable)"""
    __tablename__ = "ordenes_compra_detalle"

    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign key to main orden_compra
    orden_compra_id = Column(Integer, ForeignKey("ordenes_compra.id"), unique=True, nullable=False)
    orden_compra = relationship("OrdenCompra", back_populates="detalle")
    
    # Business key
    codigo_oc = Column(String(100), unique=True, index=True, nullable=False)
    
    # Update metadata
    fecha_primera_extraccion = Column(DateTime(timezone=True), server_default=func.now())
    fecha_ultima_actualizacion = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    numero_actualizaciones = Column(Integer, default=1)
    hash_contenido = Column(String(64), index=True)  # SHA256 hash of content
    
    # Complete detailed data (full API response)
    datos_completos = Column(JSON)
    
    # Extracted specific fields for quick queries
    items = Column(JSON)  # List of items/products with details
    documentos = Column(JSON)  # List of documents
    comprador_detalle = Column(JSON)  # Detailed buyer information
    proveedor_detalle = Column(JSON)  # Detailed supplier information
    
    # Current state fields (extracted from JSON for indexing)
    estado_actual = Column(String(50), index=True)
    estado_proveedor_actual = Column(String(50), index=True)
    fecha_aceptacion_real = Column(DateTime(timezone=True))
    fecha_entrega_real = Column(DateTime(timezone=True))
    fecha_recepcion_real = Column(DateTime(timezone=True))
    
    # Additional financial details
    monto_final = Column(Numeric(15, 2))
    
    # Relationship to history
    historial = relationship("OrdenCompraHistorial", back_populates="detalle", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<OrdenCompraDetalle(codigo_oc='{self.codigo_oc}', actualizaciones={self.numero_actualizaciones})>"

