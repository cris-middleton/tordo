"""comentarios en las 23 tablas que no los tenian

Cierra el tramo de tablas del trinquete de convenciones
(`tests/test_convenciones_modelo.py`): pasa de 23 a 0. Las 295 columnas sin
comentario siguen en el baseline y sólo pueden encoger.

Es un producto de datos con 78 columnas por orden de compra; sin comentarios se
vuelve inusable en meses, y quien llegue después no tiene de dónde deducir qué
significa cada tabla.

Revision ID: f19cbdcd6aa9
Revises: 593d371cb8fe
Create Date: 2026-08-16 23:10:37.638094

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f19cbdcd6aa9'
down_revision: Union[str, None] = '593d371cb8fe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table_comment(
        'alert_preferences',
        'Filtros con los que un usuario acota qué licitaciones le avisan',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'alerts',
        'Avisos generados para un usuario. `idempotency_key` es única: evita duplicar el mismo aviso entre corridas',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'buyer_organizations',
        'Organismos compradores del Estado, identificados por su código de Mercado Público',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'categories',
        'Taxonomía CPV/UNSPSC. Ni licitaciones ni órdenes están clasificadas contra ella todavía',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'checklist_postulacion',
        'Items de checklist de una postulación concreta, copiados de la plantilla al crearla',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'documentos_empresa',
        'Documentos de la empresa guardados en S3, con su vencimiento para el aviso de caducidad',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'empresas',
        'Empresa proveedora registrada en TORDO. Dueña de la suscripción, el plan y las cuotas (ADR 0002)',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'empresas_usuario',
        'Membresía usuario ↔ empresa con su rol. Es la tabla que sostiene el aislamiento multi-tenant',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'estado_habil_log',
        'Historial de cambios de estado hábil en Mercado Público, una fila por transición detectada',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'licitaciones_detalle',
        'Campos extendidos de una licitación, que llegan en una segunda llamada a la API y se actualizan',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'licitaciones_historial',
        'Cambios detectados en una licitación a lo largo del tiempo, para poder mirar atrás',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'ordenes_compra_detalle',
        'Campos extendidos de una orden de compra, que llegan en una segunda llamada y se actualizan',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'ordenes_compra_historial',
        'Cambios detectados en una orden de compra a lo largo del tiempo',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'plantillas_checklist',
        'Items de checklist por tipo de licitación, de los que se copia cada postulación nueva',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'postulaciones',
        'Licitación en seguimiento por una empresa. Los seis estados del CHECK son las columnas del tablero y no son configurables: `adjudicada` es lo que cruza contra el ZIP de resultados',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'ref_forma_pago',
        'Catálogo de formas de pago de Mercado Público. El 98,7 % de las órdenes declara la misma, así que no sirve para segmentar',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'ref_tipo_despacho',
        'Catálogo de tipos de despacho de Mercado Público',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'ref_tipo_orden_compra',
        'Catálogo de tipos de orden de compra de Mercado Público (§3.1 del diccionario oficial). El tipo 9 es Convenio Marco',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'ref_unidad_monetaria',
        'Catálogo de monedas de Mercado Público',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'suppliers',
        'Proveedores de Mercado Público. `codigo_proveedor` es el identificador interno del portal, NO un RUT',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'task_failures',
        'Tareas de Celery que agotaron sus reintentos, para poder verlas y relanzarlas',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'tfidf_perfiles',
        'Vector TF-IDF serializado del perfil de una empresa, usado para el encaje semántico',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'users',
        'Cuentas de acceso. La suscripción y el plan NO viven aquí: pertenecen a la empresa (ADR 0002)',
        existing_comment=None,
        schema=None
    )


def downgrade() -> None:
    op.drop_table_comment(
        'users',
        existing_comment='Cuentas de acceso. La suscripción y el plan NO viven aquí: pertenecen a la empresa (ADR 0002)',
        schema=None
    )
    op.drop_table_comment(
        'tfidf_perfiles',
        existing_comment='Vector TF-IDF serializado del perfil de una empresa, usado para el encaje semántico',
        schema=None
    )
    op.drop_table_comment(
        'task_failures',
        existing_comment='Tareas de Celery que agotaron sus reintentos, para poder verlas y relanzarlas',
        schema=None
    )
    op.drop_table_comment(
        'suppliers',
        existing_comment='Proveedores de Mercado Público. `codigo_proveedor` es el identificador interno del portal, NO un RUT',
        schema=None
    )
    op.drop_table_comment(
        'ref_unidad_monetaria',
        existing_comment='Catálogo de monedas de Mercado Público',
        schema=None
    )
    op.drop_table_comment(
        'ref_tipo_orden_compra',
        existing_comment='Catálogo de tipos de orden de compra de Mercado Público (§3.1 del diccionario oficial). El tipo 9 es Convenio Marco',
        schema=None
    )
    op.drop_table_comment(
        'ref_tipo_despacho',
        existing_comment='Catálogo de tipos de despacho de Mercado Público',
        schema=None
    )
    op.drop_table_comment(
        'ref_forma_pago',
        existing_comment='Catálogo de formas de pago de Mercado Público. El 98,7 % de las órdenes declara la misma, así que no sirve para segmentar',
        schema=None
    )
    op.drop_table_comment(
        'postulaciones',
        existing_comment='Licitación en seguimiento por una empresa. Los seis estados del CHECK son las columnas del tablero y no son configurables: `adjudicada` es lo que cruza contra el ZIP de resultados',
        schema=None
    )
    op.drop_table_comment(
        'plantillas_checklist',
        existing_comment='Items de checklist por tipo de licitación, de los que se copia cada postulación nueva',
        schema=None
    )
    op.drop_table_comment(
        'ordenes_compra_historial',
        existing_comment='Cambios detectados en una orden de compra a lo largo del tiempo',
        schema=None
    )
    op.drop_table_comment(
        'ordenes_compra_detalle',
        existing_comment='Campos extendidos de una orden de compra, que llegan en una segunda llamada y se actualizan',
        schema=None
    )
    op.drop_table_comment(
        'licitaciones_historial',
        existing_comment='Cambios detectados en una licitación a lo largo del tiempo, para poder mirar atrás',
        schema=None
    )
    op.drop_table_comment(
        'licitaciones_detalle',
        existing_comment='Campos extendidos de una licitación, que llegan en una segunda llamada a la API y se actualizan',
        schema=None
    )
    op.drop_table_comment(
        'estado_habil_log',
        existing_comment='Historial de cambios de estado hábil en Mercado Público, una fila por transición detectada',
        schema=None
    )
    op.drop_table_comment(
        'empresas_usuario',
        existing_comment='Membresía usuario ↔ empresa con su rol. Es la tabla que sostiene el aislamiento multi-tenant',
        schema=None
    )
    op.drop_table_comment(
        'empresas',
        existing_comment='Empresa proveedora registrada en TORDO. Dueña de la suscripción, el plan y las cuotas (ADR 0002)',
        schema=None
    )
    op.drop_table_comment(
        'documentos_empresa',
        existing_comment='Documentos de la empresa guardados en S3, con su vencimiento para el aviso de caducidad',
        schema=None
    )
    op.drop_table_comment(
        'checklist_postulacion',
        existing_comment='Items de checklist de una postulación concreta, copiados de la plantilla al crearla',
        schema=None
    )
    op.drop_table_comment(
        'categories',
        existing_comment='Taxonomía CPV/UNSPSC. Ni licitaciones ni órdenes están clasificadas contra ella todavía',
        schema=None
    )
    op.drop_table_comment(
        'buyer_organizations',
        existing_comment='Organismos compradores del Estado, identificados por su código de Mercado Público',
        schema=None
    )
    op.drop_table_comment(
        'alerts',
        existing_comment='Avisos generados para un usuario. `idempotency_key` es única: evita duplicar el mismo aviso entre corridas',
        schema=None
    )
    op.drop_table_comment(
        'alert_preferences',
        existing_comment='Filtros con los que un usuario acota qué licitaciones le avisan',
        schema=None
    )
