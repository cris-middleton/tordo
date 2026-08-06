from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class BuyerOrganization(Base):
    """Buyer organization model (Organismo Comprador)"""

    __tablename__ = "buyer_organizations"

    id = Column(Integer, primary_key=True)
    codigo_organismo = Column(String(50), unique=True, nullable=False)
    nombre = Column(String(500), nullable=False)
    nombre_corto = Column(String(200))
    rut = Column(String(20), index=True)

    # Contact information
    direccion = Column(Text)
    region = Column(String(100))
    comuna = Column(String(100))
    telefono = Column(String(50))
    email = Column(String(255))
    website = Column(String(500))

    # Additional info
    tipo_organismo = Column(String(100))  # e.g., "Ministerio", "Municipalidad"
    sector = Column(String(100))

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    activo = Column(Boolean, default=True)

    # Relationships
    licitaciones = relationship(
        "Licitacion", back_populates="organismo", foreign_keys="Licitacion.organismo_id"
    )
    ordenes_compra = relationship(
        "OrdenCompra", back_populates="organismo", foreign_keys="OrdenCompra.organismo_id"
    )

    def __repr__(self):
        return f"<BuyerOrganization(codigo='{self.codigo_organismo}', nombre='{self.nombre}')>"


class Supplier(Base):
    """Supplier model (Proveedor)"""

    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True)
    codigo_proveedor = Column(String(50), unique=True, nullable=False)
    nombre = Column(String(500), nullable=False)
    nombre_corto = Column(String(200))
    rut = Column(String(20), index=True)

    # Contact information
    direccion = Column(Text)
    region = Column(String(100))
    comuna = Column(String(100))
    telefono = Column(String(50))
    email = Column(String(255))
    website = Column(String(500))

    # Business information
    tipo_empresa = Column(String(100))  # e.g., "Sociedad Anónima", "Empresa Individual"
    rubro = Column(String(200))

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    activo = Column(Boolean, default=True)

    # Relationships
    ordenes_compra = relationship(
        "OrdenCompra", back_populates="proveedor", foreign_keys="OrdenCompra.proveedor_id"
    )

    def __repr__(self):
        return f"<Supplier(codigo='{self.codigo_proveedor}', nombre='{self.nombre}')>"
