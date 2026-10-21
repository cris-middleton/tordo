"""Comentarios en todas las columnas y claves bigint en licitaciones.

La deuda de convenciones que quedaba (`tests/convenciones_baseline.json`): 43
columnas sin `comment=` y dos claves `integer` en tablas de ingesta, que por
convención son `BigInteger` (crecen sin techo: el upsert del ETL gasta un valor
de la secuencia en cada intento, también cuando la fila ya existía).

Reescribe `licitaciones` y `licitaciones_detalle` una vez cada una; las dos
tienen retención (`etl/retencion.py`), así que son acotadas.

Revision ID: e8e7e0f3f5e5
Revises: 94f54e8e1fdf
Create Date: 2026-10-21 01:59:57.591179

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e8e7e0f3f5e5'
down_revision: Union[str, None] = '94f54e8e1fdf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Los tipos primero, en una sola reescritura por tabla. La secuencia también:
    # una `serial` es `AS integer`, con tope 2.147.483.647, y sin cambiarla la
    # columna bigint seguiría topando ahí.
    op.execute("ALTER TABLE licitaciones ALTER COLUMN id TYPE bigint")
    op.execute("ALTER SEQUENCE licitaciones_id_seq AS bigint")
    op.execute(
        "ALTER TABLE licitaciones_detalle "
        "ALTER COLUMN id TYPE bigint, ALTER COLUMN licitacion_id TYPE bigint"
    )
    op.execute("ALTER SEQUENCE licitaciones_detalle_id_seq AS bigint")
    op.alter_column('licitaciones', 'id',
               existing_type=sa.INTEGER(),
               comment='Identificador interno de la fila (secuencia). La clave de negocio es codigo_externo.',
               existing_nullable=False,
               autoincrement=True)
    op.alter_column('licitaciones', 'codigo_externo',
               existing_type=sa.VARCHAR(length=100),
               comment='Código de Mercado Público (p. ej. 1057401-1-LP24). Clave de negocio.',
               existing_nullable=False)
    op.alter_column('licitaciones', 'codigo_interno',
               existing_type=sa.VARCHAR(length=100),
               comment='`CodigoInterno` del payload de la API, si viene.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'nombre',
               existing_type=sa.VARCHAR(length=500),
               comment='Nombre como lo publica el comprador.',
               existing_nullable=False)
    op.alter_column('licitaciones', 'descripcion',
               existing_type=sa.TEXT(),
               comment='Descripción libre del comprador (`Descripcion` o `Detalle` del payload).',
               existing_nullable=True)
    op.alter_column('licitaciones', 'fecha_publicacion',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment='Publicación (hora de Chile). Si el payload no la trae, el momento de la ingesta.',
               existing_nullable=False)
    op.alter_column('licitaciones', 'fecha_cierre',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment='Cierre de la recepción de ofertas (hora de Chile).',
               existing_nullable=True)
    op.alter_column('licitaciones', 'fecha_inicio',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment='`FechaInicio` del payload, si viene.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'fecha_final',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment='`FechaFinal` del payload, si viene.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'monto_estimado',
               existing_type=sa.NUMERIC(precision=15, scale=2),
               comment='Monto estimado en `moneda` (`MontoEstimado`; si falta, `MontoTotal`). NULL si no se publicó.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'monto_total',
               existing_type=sa.NUMERIC(precision=15, scale=2),
               comment='`MontoTotal` del payload de la API, si viene.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'moneda',
               existing_type=sa.VARCHAR(length=10),
               comment='Moneda de los montos (`Moneda`; CLP si no viene).',
               existing_nullable=True,
               existing_server_default=sa.text("'CLP'::character varying"))
    op.alter_column('licitaciones', 'estado',
               existing_type=sa.VARCHAR(length=50),
               comment='Estado según el listado de Mercado Público (Publicada, Cerrada, Adjudicada…).',
               existing_nullable=True)
    op.alter_column('licitaciones', 'tipo_licitacion',
               existing_type=sa.VARCHAR(length=100),
               comment='Tipo de licitación de Mercado Público (L1, LE, LP…).',
               existing_nullable=True)
    op.alter_column('licitaciones', 'tipo_moneda',
               existing_type=sa.VARCHAR(length=10),
               comment='`TipoMoneda` del payload (CLP si no viene).',
               existing_nullable=True)
    op.alter_column('licitaciones', 'codigo_organismo',
               existing_type=sa.VARCHAR(length=50),
               comment='Código del organismo comprador. NULL en Compra Ágil, que sólo trae el RUT.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'nombre_organismo',
               existing_type=sa.VARCHAR(length=500),
               comment='Nombre del organismo comprador.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'rut_organismo',
               existing_type=sa.VARCHAR(length=20),
               comment='RUT del organismo o de la unidad compradora.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'region',
               existing_type=sa.VARCHAR(length=100),
               comment='Región del comprador, como la escribe Mercado Público.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'comuna',
               existing_type=sa.VARCHAR(length=100),
               comment='Comuna del comprador, si el payload la trae.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'informacion_adicional',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment='Resto del payload sin columna propia, ya sin datos de personas naturales.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'items',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment='Ítems pedidos, del listado o copiados del detalle.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'url_acta',
               existing_type=sa.VARCHAR(length=500),
               comment='`UrlActa` del payload, si viene.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'url_licitacion',
               existing_type=sa.VARCHAR(length=500),
               comment='Enlace a la ficha en Mercado Público, si el payload lo trae.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'fecha_extraccion',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment='Primera vez que el ETL guardó la fila.',
               existing_nullable=True,
               existing_server_default=sa.text('now()'))
    op.alter_column('licitaciones', 'fecha_actualizacion',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment='Última vez que el ETL cambió la fila. NULL si nunca.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'activo',
               existing_type=sa.BOOLEAN(),
               comment='FALSE si Mercado Público la retiró. Toda consulta filtra por activo.',
               existing_nullable=True,
               existing_server_default=sa.text('true'))
    op.alter_column('licitaciones_detalle', 'id',
               existing_type=sa.INTEGER(),
               comment='Identificador interno de la fila (secuencia).',
               existing_nullable=False,
               autoincrement=True)
    op.alter_column('licitaciones_detalle', 'licitacion_id',
               existing_type=sa.INTEGER(),
               comment='La licitación de la que es detalle (una a una).',
               existing_nullable=False)
    op.alter_column('licitaciones_detalle', 'codigo_externo',
               existing_type=sa.VARCHAR(length=100),
               comment='Código de Mercado Público, el mismo que en licitaciones.',
               existing_nullable=False)
    op.alter_column('licitaciones_detalle', 'fecha_primera_extraccion',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment='Primera vez que el ETL guardó el detalle.',
               existing_nullable=True,
               existing_server_default=sa.text('now()'))
    op.alter_column('licitaciones_detalle', 'fecha_ultima_actualizacion',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment='Última vez que el ETL cambió el detalle.',
               existing_nullable=True,
               existing_server_default=sa.text('now()'))
    op.alter_column('licitaciones_detalle', 'numero_actualizaciones',
               existing_type=sa.INTEGER(),
               comment='Veces que el detalle cambió, contando la primera carga.',
               existing_nullable=True,
               existing_server_default=sa.text('1'))
    op.alter_column('licitaciones_detalle', 'hash_contenido',
               existing_type=sa.VARCHAR(length=64),
               comment='SHA-256 del detalle ya sin personas naturales. Decide si cambió.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'items',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment='Ítems del detalle, con su código de producto.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'documentos',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment='`Adjuntos` o `Documentos` del detalle, si la API los trae.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'etapas',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment='`Etapas` del detalle, si la API las trae.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'adjuntos',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment='Sin uso: los adjuntos se guardan en `documentos`. Siempre NULL.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'estado_actual',
               existing_type=sa.VARCHAR(length=50),
               comment='Estado según el detalle. Manda sobre licitaciones.estado en el ETL.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'fecha_cierre_real',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment='Sin uso: ningún paso del ETL la escribe. Siempre NULL.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'fecha_adjudicacion',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment='Fecha de adjudicación según el detalle.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'monto_adjudicado',
               existing_type=sa.VARCHAR(length=50),
               comment='Suma adjudicada en pesos, como texto sin separadores.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'proveedor_adjudicado',
               existing_type=sa.VARCHAR(length=500),
               comment='Empresas adjudicadas, «NOMBRE (RUT)»; «Persona natural» sin nombrarla.',
               existing_nullable=True)


def downgrade() -> None:
    op.alter_column('licitaciones_detalle', 'proveedor_adjudicado',
               existing_type=sa.VARCHAR(length=500),
               comment=None,
               existing_comment='Empresas adjudicadas, «NOMBRE (RUT)»; «Persona natural» sin nombrarla.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'monto_adjudicado',
               existing_type=sa.VARCHAR(length=50),
               comment=None,
               existing_comment='Suma adjudicada en pesos, como texto sin separadores.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'fecha_adjudicacion',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment=None,
               existing_comment='Fecha de adjudicación según el detalle.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'fecha_cierre_real',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment=None,
               existing_comment='Sin uso: ningún paso del ETL la escribe. Siempre NULL.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'estado_actual',
               existing_type=sa.VARCHAR(length=50),
               comment=None,
               existing_comment='Estado según el detalle. Manda sobre licitaciones.estado en el ETL.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'adjuntos',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment=None,
               existing_comment='Sin uso: los adjuntos se guardan en `documentos`. Siempre NULL.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'etapas',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment=None,
               existing_comment='`Etapas` del detalle, si la API las trae.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'documentos',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment=None,
               existing_comment='`Adjuntos` o `Documentos` del detalle, si la API los trae.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'items',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment=None,
               existing_comment='Ítems del detalle, con su código de producto.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'hash_contenido',
               existing_type=sa.VARCHAR(length=64),
               comment=None,
               existing_comment='SHA-256 del detalle ya sin personas naturales. Decide si cambió.',
               existing_nullable=True)
    op.alter_column('licitaciones_detalle', 'numero_actualizaciones',
               existing_type=sa.INTEGER(),
               comment=None,
               existing_comment='Veces que el detalle cambió, contando la primera carga.',
               existing_nullable=True,
               existing_server_default=sa.text('1'))
    op.alter_column('licitaciones_detalle', 'fecha_ultima_actualizacion',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment=None,
               existing_comment='Última vez que el ETL cambió el detalle.',
               existing_nullable=True,
               existing_server_default=sa.text('now()'))
    op.alter_column('licitaciones_detalle', 'fecha_primera_extraccion',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment=None,
               existing_comment='Primera vez que el ETL guardó el detalle.',
               existing_nullable=True,
               existing_server_default=sa.text('now()'))
    op.alter_column('licitaciones_detalle', 'codigo_externo',
               existing_type=sa.VARCHAR(length=100),
               comment=None,
               existing_comment='Código de Mercado Público, el mismo que en licitaciones.',
               existing_nullable=False)
    op.alter_column('licitaciones_detalle', 'licitacion_id',
               existing_type=sa.BigInteger(),
               comment=None,
               existing_comment='La licitación de la que es detalle (una a una).',
               existing_nullable=False)
    op.alter_column('licitaciones_detalle', 'id',
               existing_type=sa.BigInteger(),
               comment=None,
               existing_comment='Identificador interno de la fila (secuencia).',
               existing_nullable=False,
               autoincrement=True)
    op.alter_column('licitaciones', 'activo',
               existing_type=sa.BOOLEAN(),
               comment=None,
               existing_comment='FALSE si Mercado Público la retiró. Toda consulta filtra por activo.',
               existing_nullable=True,
               existing_server_default=sa.text('true'))
    op.alter_column('licitaciones', 'fecha_actualizacion',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment=None,
               existing_comment='Última vez que el ETL cambió la fila. NULL si nunca.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'fecha_extraccion',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment=None,
               existing_comment='Primera vez que el ETL guardó la fila.',
               existing_nullable=True,
               existing_server_default=sa.text('now()'))
    op.alter_column('licitaciones', 'url_licitacion',
               existing_type=sa.VARCHAR(length=500),
               comment=None,
               existing_comment='Enlace a la ficha en Mercado Público, si el payload lo trae.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'url_acta',
               existing_type=sa.VARCHAR(length=500),
               comment=None,
               existing_comment='`UrlActa` del payload, si viene.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'items',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment=None,
               existing_comment='Ítems pedidos, del listado o copiados del detalle.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'informacion_adicional',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment=None,
               existing_comment='Resto del payload sin columna propia, ya sin datos de personas naturales.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'comuna',
               existing_type=sa.VARCHAR(length=100),
               comment=None,
               existing_comment='Comuna del comprador, si el payload la trae.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'region',
               existing_type=sa.VARCHAR(length=100),
               comment=None,
               existing_comment='Región del comprador, como la escribe Mercado Público.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'rut_organismo',
               existing_type=sa.VARCHAR(length=20),
               comment=None,
               existing_comment='RUT del organismo o de la unidad compradora.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'nombre_organismo',
               existing_type=sa.VARCHAR(length=500),
               comment=None,
               existing_comment='Nombre del organismo comprador.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'codigo_organismo',
               existing_type=sa.VARCHAR(length=50),
               comment=None,
               existing_comment='Código del organismo comprador. NULL en Compra Ágil, que sólo trae el RUT.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'tipo_moneda',
               existing_type=sa.VARCHAR(length=10),
               comment=None,
               existing_comment='`TipoMoneda` del payload (CLP si no viene).',
               existing_nullable=True)
    op.alter_column('licitaciones', 'tipo_licitacion',
               existing_type=sa.VARCHAR(length=100),
               comment=None,
               existing_comment='Tipo de licitación de Mercado Público (L1, LE, LP…).',
               existing_nullable=True)
    op.alter_column('licitaciones', 'estado',
               existing_type=sa.VARCHAR(length=50),
               comment=None,
               existing_comment='Estado según el listado de Mercado Público (Publicada, Cerrada, Adjudicada…).',
               existing_nullable=True)
    op.alter_column('licitaciones', 'moneda',
               existing_type=sa.VARCHAR(length=10),
               comment=None,
               existing_comment='Moneda de los montos (`Moneda`; CLP si no viene).',
               existing_nullable=True,
               existing_server_default=sa.text("'CLP'::character varying"))
    op.alter_column('licitaciones', 'monto_total',
               existing_type=sa.NUMERIC(precision=15, scale=2),
               comment=None,
               existing_comment='`MontoTotal` del payload de la API, si viene.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'monto_estimado',
               existing_type=sa.NUMERIC(precision=15, scale=2),
               comment=None,
               existing_comment='Monto estimado en `moneda` (`MontoEstimado`; si falta, `MontoTotal`). NULL si no se publicó.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'fecha_final',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment=None,
               existing_comment='`FechaFinal` del payload, si viene.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'fecha_inicio',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment=None,
               existing_comment='`FechaInicio` del payload, si viene.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'fecha_cierre',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment=None,
               existing_comment='Cierre de la recepción de ofertas (hora de Chile).',
               existing_nullable=True)
    op.alter_column('licitaciones', 'fecha_publicacion',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment=None,
               existing_comment='Publicación (hora de Chile). Si el payload no la trae, el momento de la ingesta.',
               existing_nullable=False)
    op.alter_column('licitaciones', 'descripcion',
               existing_type=sa.TEXT(),
               comment=None,
               existing_comment='Descripción libre del comprador (`Descripcion` o `Detalle` del payload).',
               existing_nullable=True)
    op.alter_column('licitaciones', 'nombre',
               existing_type=sa.VARCHAR(length=500),
               comment=None,
               existing_comment='Nombre como lo publica el comprador.',
               existing_nullable=False)
    op.alter_column('licitaciones', 'codigo_interno',
               existing_type=sa.VARCHAR(length=100),
               comment=None,
               existing_comment='`CodigoInterno` del payload de la API, si viene.',
               existing_nullable=True)
    op.alter_column('licitaciones', 'codigo_externo',
               existing_type=sa.VARCHAR(length=100),
               comment=None,
               existing_comment='Código de Mercado Público (p. ej. 1057401-1-LP24). Clave de negocio.',
               existing_nullable=False)
    op.alter_column('licitaciones', 'id',
               existing_type=sa.BigInteger(),
               comment=None,
               existing_comment='Identificador interno de la fila (secuencia). La clave de negocio es codigo_externo.',
               existing_nullable=False,
               autoincrement=True)
    op.execute("ALTER SEQUENCE licitaciones_detalle_id_seq AS integer")
    op.execute(
        "ALTER TABLE licitaciones_detalle "
        "ALTER COLUMN id TYPE integer, ALTER COLUMN licitacion_id TYPE integer"
    )
    op.execute("ALTER SEQUENCE licitaciones_id_seq AS integer")
    op.execute("ALTER TABLE licitaciones ALTER COLUMN id TYPE integer")
