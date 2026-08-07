"""busqueda indexada en licitaciones

Revision ID: adcfd900e5f3
Revises: 8241c5e956f1
Create Date: 2026-08-07

Cierra los dos puntos de rendimiento de §5.1: el listado hacía un recorrido
completo de la tabla y la búsqueda usaba `ILIKE '%término%'`, que ningún índice
puede servir porque el comodín va al principio.

Búsqueda
--------
Se añade `licitaciones.busqueda`, una columna **generada** con
`to_tsvector('spanish', nombre || descripcion)`. Generada y no mantenida por
trigger a propósito: Postgres la recalcula cuando cambia el texto, así que no hay
forma de que se desincronice ni código que recordar actualizar.

La configuración `spanish` aporta stemming ("servicios" encuentra "servicio") y
descarta palabras vacías. **No lleva unaccent**: exigiría marcar IMMUTABLE a mano
una función que depende de un diccionario, y mentirle a Postgres sobre eso es una
forma conocida de corromper un índice. La insensibilidad a tildes queda pendiente.

Además, un índice de trigramas sobre `nombre`, que es lo que permite que
`ILIKE '%frag%'` use un índice. **Sólo sobre `nombre`**: `descripcion` es texto
largo y sería el índice más caro de mantener en cada carga del ETL, y ahí lo que
se busca son palabras —que ya cubre el tsvector— no fragmentos.

Listado
-------
Tres índices **parciales**. La consulta del listado siempre lleva
`WHERE activo = true`, y un índice normal sobre una columna booleana casi siempre
verdadera no sirve para nada; puesto en el WHERE del índice, en cambio, lo hace
más pequeño y utilizable. El orden por defecto es `fecha_publicacion DESC`, así
que va como última columna: se filtra y se ordena en un solo recorrido.

`region` no tenía **ningún** índice y es filtro de primera línea en la UI.

No se añade uno para `codigo_organismo`: ya tiene su índice propio y es un filtro
menos frecuente; un bitmap scan sobre él es aceptable. Cada índice se paga en
cada carga horaria del ETL, así que se añaden los que la consulta justifica, no
todos los que se podrían.

Costo de aplicación
-------------------
`ADD COLUMN ... GENERATED` reescribe la tabla, y los GIN sobre texto tardan en
construirse. Como el resto de F4, se hace ahora que no hay nadie usando el
producto. Con tráfico habría que crear los índices con `CONCURRENTLY`, que no
puede ir dentro de la transacción de una migración.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "adcfd900e5f3"
down_revision: Union[str, None] = "8241c5e956f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # pg_trgm ya lo crea la migración 012 (esquema analytics); IF NOT EXISTS lo
    # hace seguro aquí por si esta base se construyó por otra vía.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.add_column(
        "licitaciones",
        sa.Column(
            "busqueda",
            postgresql.TSVECTOR(),
            sa.Computed(
                "to_tsvector('spanish', coalesce(nombre, '') || ' ' || coalesce(descripcion, ''))",
                persisted=True,
            ),
            nullable=True,
            comment="Vector de búsqueda generado desde nombre + descripcion.",
        ),
    )

    op.execute("CREATE INDEX ix_licitaciones_busqueda ON licitaciones USING gin (busqueda)")
    op.execute(
        "CREATE INDEX ix_licitaciones_nombre_trgm ON licitaciones "
        "USING gin (nombre gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_licitaciones_activas_fecha ON licitaciones "
        "(fecha_publicacion DESC) WHERE activo"
    )
    op.execute(
        "CREATE INDEX ix_licitaciones_estado_fecha ON licitaciones "
        "(estado, fecha_publicacion DESC) WHERE activo"
    )
    op.execute(
        "CREATE INDEX ix_licitaciones_region_fecha ON licitaciones "
        "(region, fecha_publicacion DESC) WHERE activo"
    )


def downgrade() -> None:
    for indice in (
        "ix_licitaciones_region_fecha",
        "ix_licitaciones_estado_fecha",
        "ix_licitaciones_activas_fecha",
        "ix_licitaciones_nombre_trgm",
        "ix_licitaciones_busqueda",
    ):
        op.execute(f"DROP INDEX IF EXISTS {indice}")
    op.drop_column("licitaciones", "busqueda")
    # pg_trgm no se elimina: la usa el esquema analytics.
