"""Palabras sin raíz para la búsqueda del catálogo.

`busqueda` es un tsvector con el stemmer español, que reduce «mesa» y «meses» a
la misma raíz `mes`: buscar «mesa» traía toda licitación que dijera «12 meses».
`busqueda_palabras` guarda las mismas palabras con la configuración `simple`
(sin raíz), y `coincide_termino` exige que cada palabra del término empiece
alguna de ellas (o su singular).

Columna generada: añadirla reescribe `licitaciones` una vez (la tabla tiene
retención, así que es acotada). Sin índice: sólo filtra lo que ya encontró el
GIN de `busqueda`.

Revision ID: 94f54e8e1fdf
Revises: e3afe71ab019
Create Date: 2026-10-21 01:44:53.569475

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '94f54e8e1fdf'
down_revision: Union[str, None] = 'e3afe71ab019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('licitaciones', sa.Column('busqueda_palabras', postgresql.TSVECTOR(), sa.Computed("to_tsvector('simple', inmutable_unaccent(coalesce(nombre, '') || ' ' || coalesce(descripcion, '')))", persisted=True), nullable=True, comment='Palabras de nombre + descripcion sin tildes y sin raíz (simple).'))


def downgrade() -> None:
    op.drop_column('licitaciones', 'busqueda_palabras')
