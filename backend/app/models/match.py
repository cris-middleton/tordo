"""Encaje precomputado entre una empresa y una licitación.

Sustituye a `dashboard_home_cache`, que guardaba el top-20 de cada empresa como
un blob JSON con los datos de la licitación **copiados dentro**. Eso tenía dos
problemas:

- **Mentía en cuanto la licitación cambiaba.** El nombre, el monto y la fecha de
  cierre eran una foto de las 06:00; si el ETL actualizaba la licitación, la
  portada seguía mostrando lo viejo hasta la corrida siguiente.
- **Sólo servía a la portada.** Cualquier otra pantalla que quisiera "cuánto
  encaja esto con mi empresa" tenía que recalcularlo en tiempo de request, y eso
  significa cargar el modelo TF-IDF (~105 MB) dentro del proceso de la API.

Una fila por par (empresa, licitación) con el score y nada más: los datos de la
licitación se leen de `licitaciones` con un join, así que siempre están al día.
"""

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db import Base


class MatchEmpresaLicitacion(Base):
    """Score de encaje TF-IDF, recalculado por el job nocturno."""

    __tablename__ = "match_empresa_licitacion"
    __table_args__ = (
        # Las consultas son siempre "el top de ESTA empresa": la empresa filtra y
        # el score ordena. Con el índice en ese orden, Postgres resuelve las dos
        # cosas sin ordenar en memoria.
        #
        # SIN `postgresql_ops={"score": "DESC"}`: eso lo convierte en un índice
        # por expresión, y alembic los compara mal — con `alembic check`
        # bloqueante es deriva perpetua (lo rechazó al primer intento). No hace
        # falta: Postgres recorre un b-tree hacia atrás igual de bien, y el DESC
        # en el índice sólo importa cuando se ordena por varias columnas en
        # direcciones distintas.
        Index("ix_match_empresa_score", "empresa_id", "score"),
        {"comment": "Encaje precomputado empresa × licitación (TF-IDF)."},
    )

    empresa_id = Column(
        UUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        primary_key=True,
        comment="Empresa cuyo perfil se comparó.",
    )
    licitacion_id = Column(
        Integer,
        ForeignKey("licitaciones.id", ondelete="CASCADE"),
        primary_key=True,
        comment="Licitación puntuada.",
    )
    score = Column(
        SmallInteger,
        nullable=False,
        comment="Similitud coseno en 0-100. Se guarda entero: la precisión decimal no se usa.",
    )
    nivel = Column(
        String(20),
        nullable=False,
        comment="alto | medio | bajo | sin_encaje. Se guarda para no repetir los umbrales en SQL.",
    )
    calculado_en = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Cuándo lo calculó el job. Es lo que la portada muestra como 'actualizado'.",
    )
