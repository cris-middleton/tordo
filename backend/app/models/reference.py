from sqlalchemy import Column, Integer, String

from app.db import Base


class TipoOrdenCompraRef(Base):
    __tablename__ = "ref_tipo_orden_compra"
    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(10), unique=True, nullable=False, index=True)
    abreviacion = Column(String(10), nullable=True)
    descripcion = Column(String(255), nullable=False)


class UnidadMonetariaRef(Base):
    __tablename__ = "ref_unidad_monetaria"
    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(10), unique=True, nullable=False, index=True)
    descripcion = Column(String(255), nullable=False)


class TipoDespachoRef(Base):
    __tablename__ = "ref_tipo_despacho"
    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(10), unique=True, nullable=False, index=True)
    descripcion = Column(String(255), nullable=False)


class FormaPagoRef(Base):
    __tablename__ = "ref_forma_pago"
    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(10), unique=True, nullable=False, index=True)
    descripcion = Column(String(255), nullable=False)
