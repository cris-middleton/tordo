"""Vigilancia de precios: referencia y suscripciones.

Por qué hacen falta dos tablas
------------------------------
Los datos de precio ya existen: `analytics.product_price_bands_l1` tiene la
mediana por producto. Lo que faltaba era el **disparador**, y faltaba por una
razón concreta: **esa tabla se reemplaza entera** en cada materialización (swap
atómico). Después de recalcularla no queda con qué comparar, así que un cambio
de precio es invisible por construcción.

`precio_referencia` guarda el último valor conocido. Es lo único que convierte
«aquí está el precio» en «el precio subió un 18 %».

`suscripcion_precio` dice a quién le importa. Sin ella habría que alertar de los
23 000 productos del catálogo a todo el mundo, que es lo mismo que no alertar.
"""

from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db import Base

#: De dónde salen los precios. L1 es el nivel más específico —producto por
#: organismo— y se agrega a producto: es la mediana que muestra la pantalla de
#: BI. Vive aquí, y no en el servicio, porque también la consultan el
#: repositorio y los tests: tres sitios copiando el nombre es un sitio donde se
#: desincroniza.
TABLA_BANDAS = "analytics.product_price_bands_l1"

#: Variación mínima, en porcentaje, para que un cambio se considere noticia.
#: Por debajo de esto el ruido del muestreo domina: la mediana de un producto
#: con pocas órdenes se mueve sola de una semana a otra.
UMBRAL_POR_DEFECTO = 10.0

#: Por debajo de esta cantidad de órdenes, la mediana no es de fiar y no se
#: alerta. Es el mismo criterio de tamaño de muestra que usa el resto del BI.
MUESTRA_MINIMA = 5


class PrecioReferencia(Base):
    """El último precio conocido de un producto, para poder comparar.

    Una fila por producto y unidad de medida. **No es un histórico**: se
    actualiza en el sitio. Guardar una fila por materialización daría 23 000
    filas por corrida y nadie consultaría el 99 % de ellas; lo que el producto
    necesita es «cuánto cambió desde la última vez».
    """

    __tablename__ = "precio_referencia"
    __table_args__ = (
        UniqueConstraint(
            "codigo_producto", "unidad_medida", name="uq_precio_referencia_producto_unidad"
        ),
        {"comment": "Último precio mediano conocido por producto, para detectar cambios."},
    )

    id = Column(
        BigInteger,
        primary_key=True,
        comment="Identificador de la referencia. Hay una fila por producto y unidad.",
    )
    codigo_producto = Column(
        String(50), nullable=False, comment="Código ONU del producto genérico."
    )
    unidad_medida = Column(
        String(100),
        nullable=False,
        comment=(
            "Unidad en que se mide el precio. Va en la clave: el mismo producto "
            "en 'Unidad' y en 'Caja' tiene precios que no se pueden comparar."
        ),
    )
    p50 = Column(
        Numeric(15, 4), nullable=False, comment="Precio unitario mediano de la última corrida."
    )
    muestra = Column(
        Integer,
        nullable=False,
        comment="Órdenes que sostienen la mediana. Con pocas, el cambio es ruido.",
    )
    actualizado_en = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Cuándo se recalculó esta referencia.",
    )


class SuscripcionPrecio(Base):
    """A qué producto quiere que le avisen una empresa.

    La suscripción es de la EMPRESA y no del usuario: el precio de un insumo
    interesa a todo el equipo, y atarla a una persona haría que se perdiera
    cuando esa persona deja la cuenta.
    """

    __tablename__ = "suscripcion_precio"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id",
            "codigo_producto",
            "unidad_medida",
            name="uq_suscripcion_precio_empresa_producto",
        ),
        # El job recorre las suscripciones por producto para saber a quién
        # avisar; el índice es el que evita recorrer la tabla entera por cada
        # producto que cambió.
        Index("ix_suscripcion_precio_producto", "codigo_producto", "unidad_medida"),
        {"comment": "Productos cuyo precio vigila una empresa."},
    )

    id = Column(BigInteger, primary_key=True, comment="Identificador de la vigilancia.")
    empresa_id = Column(
        UUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Empresa que vigila el producto.",
    )
    codigo_producto = Column(String(50), nullable=False, comment="Código ONU del producto.")
    unidad_medida = Column(String(100), nullable=False, comment="Unidad de medida vigilada.")
    nombre_producto = Column(
        String(500),
        comment="Nombre legible, copiado al suscribirse para no unir con analytics al alertar.",
    )
    umbral_pct = Column(
        Float,
        nullable=False,
        server_default=str(UMBRAL_POR_DEFECTO),
        comment="Variación mínima en % para avisar. Por debajo, el ruido del muestreo domina.",
    )
    creada_en = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Cuándo se empezó a vigilar el producto.",
    )
