from sqlalchemy import Column, Integer, String

from app.db import Base


class TipoOrdenCompraRef(Base):
    __tablename__ = "ref_tipo_orden_compra"
    __table_args__ = {
        "comment": "Catálogo de tipos de orden de compra de Mercado Público (§3.1 del diccionario oficial). El tipo 9 es Convenio Marco"
    }
    id = Column(Integer, primary_key=True)
    codigo = Column(String(10), unique=True, nullable=False)
    abreviacion = Column(String(10), nullable=True)
    descripcion = Column(String(255), nullable=False)


class UnidadMonetariaRef(Base):
    __tablename__ = "ref_unidad_monetaria"
    __table_args__ = {"comment": "Catálogo de monedas de Mercado Público"}
    id = Column(Integer, primary_key=True)
    codigo = Column(String(10), unique=True, nullable=False)
    descripcion = Column(String(255), nullable=False)


class TipoDespachoRef(Base):
    __tablename__ = "ref_tipo_despacho"
    __table_args__ = {"comment": "Catálogo de tipos de despacho de Mercado Público"}
    id = Column(Integer, primary_key=True)
    codigo = Column(String(10), unique=True, nullable=False)
    descripcion = Column(String(255), nullable=False)


class FormaPagoRef(Base):
    __tablename__ = "ref_forma_pago"
    __table_args__ = {
        "comment": "Catálogo de formas de pago de Mercado Público. El 98,7 % de las órdenes declara la misma, así que no sirve para segmentar"
    }
    id = Column(Integer, primary_key=True)
    codigo = Column(String(10), unique=True, nullable=False)
    descripcion = Column(String(255), nullable=False)
