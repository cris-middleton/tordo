"""marca de re-consulta de resultados

`licitaciones.resultado_consultado_en`: cuándo preguntó por última vez el cron
`frecuente` por la adjudicación de una licitación ya cerrada (paso 5b del
pivote público). La re-consulta tiene tope diario; sin esta marca, las que la
API devuelve sin novedad se volverían a pedir cada día y el tope no llegaría
nunca a las demás. Nullable y sin default: añadirla no reescribe la tabla.

Revision ID: a31934181077
Revises: 08c6653fd4dc
Create Date: 2026-10-11 21:00:27.301734

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a31934181077'
down_revision: Union[str, None] = '08c6653fd4dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('licitaciones', sa.Column('resultado_consultado_en', sa.DateTime(timezone=True), nullable=True, comment='Última vez que el cron re-consultó la licitación ya cerrada buscando su adjudicación. NULL = nunca. Rota la cola de la re-consulta.'))


def downgrade() -> None:
    op.drop_column('licitaciones', 'resultado_consultado_en')
