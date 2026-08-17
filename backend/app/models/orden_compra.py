from sqlalchemy import (
    Boolean,
    Column,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class OrdenCompra(Base):
    """Model for purchase orders (Órdenes de Compra)"""

    __tablename__ = "ordenes_compra"
    __table_args__ = (
        # El job de competidores (07:15) filtra por RUT normalizado, una vez
        # por competidor vigilado. Un índice normal sobre `rut_proveedor` no
        # sirve para eso: comparar contra una expresión en el WHERE
        # (`regexp_replace(upper(rut_proveedor), ...)`) lo inutiliza y el
        # filtro pasa a ser un recorrido completo de la tabla más grande del
        # sistema. `rut_proveedor_norm` es una columna GENERADA —igual que
        # `licitaciones.nombre_norm`— justamente para poder indexarla en
        # crudo: Alembic compara mal los índices por expresión, y con
        # `alembic check` bloqueante eso sería deriva perpetua.
        Index("ix_ordenes_compra_rut_proveedor_norm", "rut_proveedor_norm"),
        {"comment": "Órdenes de compra de Mercado Público (listado diario)"},
    )

    id = Column(Integer, primary_key=True)

    # Identifiers
    codigo_oc = Column(String(100), unique=True, nullable=False)
    codigo_licitacion = Column(String(100), index=True)  # Link to licitacion if exists

    # Basic information
    nombre = Column(String(500), nullable=False)
    descripcion = Column(Text)

    # Dates
    fecha_publicacion = Column(DateTime(timezone=True), nullable=False, index=True)
    fecha_aceptacion = Column(DateTime(timezone=True))
    fecha_entrega = Column(DateTime(timezone=True))
    fecha_estimada_entrega = Column(DateTime(timezone=True))

    # Financial information
    monto_total = Column(Numeric(15, 2), nullable=False)
    monto_neto = Column(Numeric(15, 2))
    monto_iva = Column(Numeric(15, 2))
    moneda = Column(String(10), default="CLP")

    # Status
    estado = Column(String(50), index=True)

    # El `Tipo` que devuelve la API (§3.1 del diccionario de datos). Se guarda
    # tal cual y además se traduce a `tipo_convocatoria`: el código crudo permite
    # reinterpretarlo si ChileCompra añade valores, y la traducción es lo que
    # consulta el producto.
    tipo_oc = Column(
        String(10),
        index=True,
        comment="Código de tipo de OC de Mercado Público. 9=Convenio Marco, 2=Trato Directo.",
    )
    tipo_convocatoria = Column(
        String(30),
        index=True,
        comment=(
            "Mecanismo de compra deducido de `tipo_oc`. NULL cuando el tipo sólo "
            "describe cómo se emitió la orden (1=Automática, 8=Sin emisión automática)."
        ),
    )
    estado_proveedor = Column(String(50))

    # Organization
    codigo_organismo = Column(String(50), index=True)
    nombre_organismo = Column(String(500))
    rut_organismo = Column(String(20))
    organismo_id = Column(Integer, ForeignKey("buyer_organizations.id"), nullable=True)
    organismo = relationship(
        "BuyerOrganization", back_populates="ordenes_compra", foreign_keys=[organismo_id]
    )

    # Supplier information
    codigo_proveedor = Column(String(50), index=True)
    nombre_proveedor = Column(String(500))
    # Indexado porque es la ÚNICA forma de traducir el RUT de una empresa al
    # `CodigoProveedor` con el que analytics identifica al proveedor. Sin índice
    # esa traducción es un recorrido secuencial de la tabla más grande del
    # sistema, y ocurre en la carga de la pantalla de BI.
    rut_proveedor = Column(String(20), index=True)
    # Columna GENERADA: mismos dígitos y K que `CompetidorSeguido.rut_norm`
    # (sin puntos, guion ni espacios, en mayúsculas), calculada por Postgres a
    # partir de `rut_proveedor`. `upper` y `regexp_replace` son IMMUTABLE en
    # Postgres —a diferencia de `unaccent`, que necesita el envoltorio
    # `inmutable_unaccent`—, así que se usan tal cual. El índice normal va
    # sobre esta columna, no sobre una expresión: es lo que permite que el job
    # de competidores compare por igualdad en vez de recorrer la tabla entera.
    rut_proveedor_norm = Column(
        String(20),
        Computed("regexp_replace(upper(rut_proveedor), '[^0-9K]', '', 'g')", persisted=True),
        comment="`rut_proveedor` sin puntos, guion ni espacios. Sostiene el seguimiento de competidores.",
    )
    proveedor_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    proveedor = relationship(
        "Supplier", back_populates="ordenes_compra", foreign_keys=[proveedor_id]
    )

    # Location
    region = Column(String(100))
    comuna = Column(String(100))

    # Additional data
    informacion_adicional = Column(JSONB)
    items = Column(JSONB)  # List of items/products

    # Metadata
    url_oc = Column(String(500))
    url_acta = Column(String(500))

    # ETL metadata
    fecha_extraccion = Column(DateTime(timezone=True), server_default=func.now())
    fecha_actualizacion = Column(DateTime(timezone=True), onupdate=func.now())
    activo = Column(Boolean, default=True)

    # Relationships to detailed info and history
    detalle = relationship(
        "OrdenCompraDetalle",
        back_populates="orden_compra",
        uselist=False,
        cascade="all, delete-orphan",
    )
    historial = relationship(
        "OrdenCompraHistorial", back_populates="orden_compra", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<OrdenCompra(codigo_oc='{self.codigo_oc}', nombre='{self.nombre}')>"
