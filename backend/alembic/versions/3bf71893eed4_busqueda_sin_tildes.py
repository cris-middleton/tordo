"""busqueda sin tildes

Revision ID: 3bf71893eed4
Revises: adcfd900e5f3
Create Date: 2026-08-07

En Chile se escribe sin tildes más veces que con ellas. Buscar "valvulas" no
encontraba "Válvulas", ni "construccion" a "construcción": la búsqueda fallaba en
el caso normal, no en el raro.

`inmutable_unaccent`, y por qué no basta `unaccent`
---------------------------------------------------
`unaccent(text)` está marcada STABLE, no IMMUTABLE, porque resuelve el
diccionario a través del `search_path`. Una columna generada y un índice exigen
IMMUTABLE, así que no se puede usar directamente.

La solución estándar es envolverla **pasando el diccionario explícito** como
`regdictionary`. Con el diccionario fijado, el resultado sí es determinista:
desaparece lo único que hacía a la función dependiente del entorno.

Esto no es marcar IMMUTABLE algo que no lo es. La salvedad real —y única— es que
si una actualización de PostgreSQL cambiara el archivo `unaccent.rules`, los
índices que dependen de esta función habría que reconstruirlos con `REINDEX`. Es
una advertencia conocida y documentada del propio proyecto, no un truco.

Dos columnas generadas, no un índice funcional
-----------------------------------------------
`nombre_norm` existe para colgar de ella el índice de trigramas. Podría hacerse
con un índice por expresión sobre `inmutable_unaccent(nombre)`, pero Alembic
compara mal los índices por expresión, y con `alembic check` ya bloqueante eso
sería deriva perpetua. Una columna generada más un índice normal se comparan sin
problema — comprobado.

Costo de aplicación
-------------------
`busqueda` se reconstruye (no se puede alterar la expresión de una columna
generada: hay que soltarla y volver a crearla) y `nombre_norm` es nueva, así que
la tabla se reescribe y los GIN se rebuilden. Igual que el resto de F4: se hace
ahora que no hay nadie usando el producto.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "3bf71893eed4"
down_revision: Union[str, None] = "adcfd900e5f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BUSQUEDA_CON_TILDES = (
    "to_tsvector('spanish', coalesce(nombre, '') || ' ' || coalesce(descripcion, ''))"
)
BUSQUEDA_SIN_TILDES = (
    "to_tsvector('spanish', inmutable_unaccent("
    "coalesce(nombre, '') || ' ' || coalesce(descripcion, '')))"
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")

    # El diccionario va explícito. Es lo que permite declararla IMMUTABLE sin
    # mentir: sin él, `unaccent` depende del search_path y sólo puede ser STABLE.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION inmutable_unaccent(text)
        RETURNS text
        LANGUAGE sql
        IMMUTABLE PARALLEL SAFE STRICT
        AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$
        """
    )

    op.execute("DROP INDEX IF EXISTS ix_licitaciones_busqueda")
    op.execute("DROP INDEX IF EXISTS ix_licitaciones_nombre_trgm")
    op.drop_column("licitaciones", "busqueda")

    op.add_column(
        "licitaciones",
        sa.Column(
            "busqueda",
            postgresql.TSVECTOR(),
            sa.Computed(BUSQUEDA_SIN_TILDES, persisted=True),
            nullable=True,
            comment="Vector de búsqueda generado desde nombre + descripcion, sin tildes.",
        ),
    )
    op.add_column(
        "licitaciones",
        sa.Column(
            "nombre_norm",
            sa.String(length=500),
            sa.Computed("inmutable_unaccent(nombre)", persisted=True),
            nullable=True,
            comment="`nombre` sin tildes. Sostiene la búsqueda por fragmento.",
        ),
    )

    op.execute("CREATE INDEX ix_licitaciones_busqueda ON licitaciones USING gin (busqueda)")
    op.execute(
        "CREATE INDEX ix_licitaciones_nombre_trgm ON licitaciones "
        "USING gin (nombre_norm gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_licitaciones_nombre_trgm")
    op.execute("DROP INDEX IF EXISTS ix_licitaciones_busqueda")
    op.drop_column("licitaciones", "nombre_norm")
    op.drop_column("licitaciones", "busqueda")

    op.add_column(
        "licitaciones",
        sa.Column(
            "busqueda",
            postgresql.TSVECTOR(),
            sa.Computed(BUSQUEDA_CON_TILDES, persisted=True),
            nullable=True,
            comment="Vector de búsqueda generado desde nombre + descripcion.",
        ),
    )
    op.execute("CREATE INDEX ix_licitaciones_busqueda ON licitaciones USING gin (busqueda)")
    op.execute(
        "CREATE INDEX ix_licitaciones_nombre_trgm ON licitaciones "
        "USING gin (nombre gin_trgm_ops)"
    )

    op.execute("DROP FUNCTION IF EXISTS inmutable_unaccent(text)")
    # La extensión no se elimina: puede haber otras cosas usándola.
