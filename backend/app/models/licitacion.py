from sqlalchemy import Column, Integer, String, DateTime, Numeric, Text, Boolean, JSON, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db import Base


class Licitacion(Base):
    """Model for public tenders (Licitaciones)"""
    __tablename__ = "licitaciones"

    id = Column(Integer, primary_key=True, index=True)
    
    # Identifiers
    codigo_externo = Column(String(100), unique=True, index=True, nullable=False)
    codigo_interno = Column(String(100), index=True)
    
    # Basic information
    nombre = Column(String(500), nullable=False)
    descripcion = Column(Text)
    
    # Dates
    fecha_publicacion = Column(DateTime(timezone=True), nullable=False, index=True)
    fecha_cierre = Column(DateTime(timezone=True))
    fecha_inicio = Column(DateTime(timezone=True))
    fecha_final = Column(DateTime(timezone=True))
    
    # Financial information
    monto_estimado = Column(Numeric(15, 2))
    monto_total = Column(Numeric(15, 2))
    moneda = Column(String(10), default="CLP")
    
    # Status and type
    estado = Column(String(50), index=True)
    tipo_licitacion = Column(String(100))
    tipo_moneda = Column(String(10))
    
    # Organization
    codigo_organismo = Column(String(50), index=True)
    nombre_organismo = Column(String(500))
    rut_organismo = Column(String(20))
    organismo_id = Column(Integer, ForeignKey("buyer_organizations.id"), nullable=True)
    organismo = relationship("BuyerOrganization", back_populates="licitaciones", foreign_keys=[organismo_id])
    
    # Location
    region = Column(String(100))
    comuna = Column(String(100))
    
    # Additional data
    informacion_adicional = Column(JSON)
    items = Column(JSON)  # List of items/products
    
    # Metadata
    url_acta = Column(String(500))
    url_licitacion = Column(String(500))
    
    # ETL metadata
    fecha_extraccion = Column(DateTime(timezone=True), server_default=func.now())
    fecha_actualizacion = Column(DateTime(timezone=True), onupdate=func.now())
    activo = Column(Boolean, default=True)
    
    # Relationships to detailed info and history
    detalle = relationship("LicitacionDetalle", back_populates="licitacion", uselist=False, cascade="all, delete-orphan")
    historial = relationship("LicitacionHistorial", back_populates="licitacion", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Licitacion(codigo_externo='{self.codigo_externo}', nombre='{self.nombre}')>"

