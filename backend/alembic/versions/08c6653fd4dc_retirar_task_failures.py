"""retirar task_failures

`task_failures` era la cola de fallos de las tareas de Celery, y quien la leía
era el `watchdog` de cada 30 minutos. Celery se va con el paso 5 del pivote
público (docs/PIVOTE_PUBLICO_2026-10.md §3.1): las corridas las hacen dos cron de
Railway, y una corrida fallida la avisa el latido de Healthchecks.io
(`etl/cron.py`), no una tabla que alguien tendría que mirar.

El `downgrade` recrea el ESQUEMA vacío. Existe porque CI exige
`upgrade → downgrade → upgrade` limpio.

Revision ID: 08c6653fd4dc
Revises: 3d73beca994e
Create Date: 2026-10-11 20:52:33.640189

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '08c6653fd4dc'
down_revision: Union[str, None] = '3d73beca994e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # El índice parcial cae con la tabla.
    op.drop_table('task_failures')


def downgrade() -> None:
    # Esquema reflejado de una base en 3d73beca994e.
    op.create_table('task_failures',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), autoincrement=False, nullable=False),
    sa.Column('task_name', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('task_args', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('error_msg', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('failed_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('resolved', sa.BOOLEAN(), server_default=sa.text('false'), autoincrement=False, nullable=False),
    sa.Column('resolved_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('task_failures_pkey')),
    comment='Tareas de Celery que agotaron sus reintentos, para poder verlas y relanzarlas'
    )
    op.create_index(op.f('ix_task_failures_unresolved'), 'task_failures', ['failed_at'], unique=False, postgresql_where='(resolved = false)')
