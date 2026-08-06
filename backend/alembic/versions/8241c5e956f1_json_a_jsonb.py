"""json a jsonb

Revision ID: 8241c5e956f1
Revises: da5fb1e45066
Create Date: 2026-08-06

Convierte las 26 columnas `JSON` a `JSONB` (revisión §5.1).

`JSON` en Postgres guarda **el texto tal cual** y lo reparsea en cada lectura.
`JSONB` guarda una forma binaria ya parseada: se lee más rápido, ocupa menos, y
—lo que importa a futuro— **se puede indexar**. Con `JSON` no hay índice posible,
así que cualquier consulta por contenido obliga a leer la tabla entera.

Lo que se pierde: `JSONB` no conserva el orden de las claves ni las claves
duplicadas, y normaliza los espacios. Aquí son cargas de la API de Mercado
Público que se leen como diccionario, así que da igual.

Sin índices GIN, a propósito
----------------------------
La revisión pedía «JSONB + GIN donde se consulte». Hoy **ninguna de estas columnas
se consulta por contenido en SQL** — se leen enteras y se procesan en Python o en
Polars. Un GIN sobre una columna que nadie filtra sólo cuesta escritura en cada
carga del ETL. Se añadirán cuando haya una consulta que los use.

AVISO OPERATIVO
---------------
`ALTER COLUMN ... TYPE jsonb` **reescribe la tabla** y toma un lock
ACCESS EXCLUSIVE mientras dura. En `licitaciones_detalle`,
`ordenes_compra_detalle` y las dos de historial —que guardan las cargas completas
de la API— puede tardar.

Se hace **ahora justamente porque todavía no hay nadie usando el producto**. Con
clientes conectados habría que hacerlo columna a columna y fuera de horario, o
con una columna nueva y copia por lotes. Es el mismo razonamiento que llevó a
renombrar los identificadores de cobro antes de tener suscripciones vivas.
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "8241c5e956f1"
down_revision: Union[str, None] = "da5fb1e45066"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (tabla, columna) — derivadas de los modelos, no transcritas a mano.
COLUMNAS: list[tuple[str, str]] = [
    ("alert_preferences", "organismo_ids"),
    ("alert_preferences", "estados"),
    ("alert_preferences", "regiones"),
    ("alert_preferences", "comunas"),
    ("alert_preferences", "keywords"),
    ("alerts", "notification_channels"),
    ("alerts", "metadata"),
    ("dashboard_home_cache", "matches"),
    ("licitaciones", "informacion_adicional"),
    ("licitaciones", "items"),
    ("licitaciones_detalle", "datos_completos"),
    ("licitaciones_detalle", "items"),
    ("licitaciones_detalle", "documentos"),
    ("licitaciones_detalle", "participantes"),
    ("licitaciones_detalle", "etapas"),
    ("licitaciones_detalle", "adjuntos"),
    ("licitaciones_historial", "snapshot_completo"),
    ("ordenes_compra", "informacion_adicional"),
    ("ordenes_compra", "items"),
    ("ordenes_compra_detalle", "datos_completos"),
    ("ordenes_compra_detalle", "items"),
    ("ordenes_compra_detalle", "documentos"),
    ("ordenes_compra_detalle", "comprador_detalle"),
    ("ordenes_compra_detalle", "proveedor_detalle"),
    ("ordenes_compra_historial", "snapshot_completo"),
    ("task_failures", "task_args"),
]


def upgrade() -> None:
    for tabla, columna in COLUMNAS:
        # El USING es obligatorio: Postgres no convierte json→jsonb solo.
        op.execute(
            f'ALTER TABLE {tabla} ALTER COLUMN "{columna}" TYPE jsonb '
            f'USING "{columna}"::jsonb'
        )


def downgrade() -> None:
    # Reversible en el tipo, no en el contenido: lo que vuelve a `json` es el
    # texto que genera jsonb, con las claves normalizadas y reordenadas. No hay
    # forma de recuperar el original — es la razón por la que este cambio se hace
    # antes de que los datos importen.
    for tabla, columna in COLUMNAS:
        op.execute(
            f'ALTER TABLE {tabla} ALTER COLUMN "{columna}" TYPE json '
            f'USING "{columna}"::json'
        )
