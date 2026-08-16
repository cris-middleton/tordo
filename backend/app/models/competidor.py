"""Competidores que una empresa vigila.

**El seguimiento es de la EMPRESA, no del usuario**, por el mismo motivo que la
vigilancia de precios: a quién le compra el Estado en tu rubro le interesa a todo
el equipo, y atarlo a una persona haría que se perdiera cuando esa persona deja
la cuenta.

`ultimo_visto_en` es lo que convierte «este proveedor existe» en «este proveedor
**acaba de** ganar algo». Sin esa marca, cada corrida volvería a avisar del
historial entero — que es exactamente el error que se cometió y se corrigió en la
vigilancia de precios.
"""

from __future__ import annotations

import re

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db import Base


def normalizar_rut(valor: str | None) -> str:
    """Sin puntos, sin guion, sin espacios y en mayúsculas.

    Se guarda normalizado **además** del texto original: los RUT llegan de
    ChileCompra con cualquier combinación de puntos y guion, y del usuario como
    él los escriba. Comparar las cadenas crudas no encuentra nada, y el
    seguimiento fallaría en silencio: nunca avisaría, sin decir por qué.
    """
    if not valor:
        return ""
    return re.sub(r"[^0-9K]", "", valor.upper())


class CompetidorSeguido(Base):
    """Un proveedor cuyas adjudicaciones quiere ver una empresa."""

    __tablename__ = "competidor_seguido"
    __table_args__ = (
        UniqueConstraint("empresa_id", "rut_norm", name="uq_competidor_seguido_empresa_rut"),
        # El job recorre las órdenes nuevas y busca sus proveedores aquí: sin
        # este índice, cada orden significaría un recorrido de la tabla.
        Index("ix_competidor_seguido_rut", "rut_norm"),
        {"comment": "Proveedores cuyas adjudicaciones vigila una empresa."},
    )

    id = Column(BigInteger, primary_key=True, comment="Identificador del seguimiento.")
    empresa_id = Column(
        UUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Empresa que vigila al competidor.",
    )
    rut = Column(String(20), nullable=False, comment="RUT tal como lo escribió el usuario.")
    rut_norm = Column(
        String(20),
        nullable=False,
        comment="RUT sin puntos ni guion. Es la clave de comparación con ChileCompra.",
    )
    nombre = Column(
        String(500),
        comment="Nombre legible del competidor, para no unir con proveedores al alertar.",
    )
    ultimo_visto_en = Column(
        DateTime(timezone=True),
        comment=(
            "Fecha de la última orden por la que ya se avisó. Es lo que separa "
            "«acaba de ganar» de «ha ganado alguna vez»: sin ella, la primera "
            "corrida avisaría del historial completo."
        ),
    )
    creada_en = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Cuándo se empezó a vigilar.",
    )
