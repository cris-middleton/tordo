"""reconciliar modelos y migraciones

Revision ID: da5fb1e45066
Revises: e8a773910bb2
Create Date: 2026-08-06

Cierra la deriva entre los modelos y el esquema que producen las migraciones
(revisión §5.0), para que `alembic check` pueda pasar a bloqueante.

El cuerpo está escrito a mano. El esqueleto de autogenerate servía de inventario,
pero no de implementación: proponía DROP + CREATE de restricciones que aquí se
resuelven con un RENAME o con `USING INDEX`, sin reconstruir nada.

Por qué es CONDICIONAL
----------------------
`app/db/__init__.py` ahora fija una convención de nombres para las restricciones
únicas, y **Alembic se la pasa a `op.create_table`**. O sea: la convención cambia
retroactivamente lo que producen las migraciones YA ESCRITAS. Una base creada hoy
desde cero nace con `uq_licitaciones_codigo_externo`; una creada antes tiene
`licitaciones_codigo_externo_key`, que es el nombre que pone Postgres.

Las dos son válidas y hay que converger ambas al mismo sitio, así que cada
operación comprueba su estado antes de actuar. En una base recién creada esta
migración es casi un no-op; en la productiva hace el trabajo.

Es la misma razón por la que la baseline `000` es idempotente.

Qué hace
--------

1. **Una sola forma de declarar unicidad.** Convivían tres: restricción con
   nombre de Postgres, restricción con nombre propio (`uq_empresas_rut`) e índice
   único sin restricción (`ix_users_email`). Ahora todas son restricciones
   `uq_<tabla>_<columna>`.

   Los renombres son de catálogo: instantáneos, sin tocar datos. Las conversiones
   usan `ADD CONSTRAINT ... UNIQUE USING INDEX`, que **adopta** el índice
   existente en vez de construir otro — importante en tablas de millones de filas.

2. **Se eliminan hasta 11 índices duplicados.** Una restricción UNIQUE en
   Postgres ya crea su índice, así que un segundo índice sobre la misma columna
   es puro costo: disco y escritura en cada carga del ETL. Igual con `ix_*_id`
   sobre una clave primaria. `licitaciones` y `ordenes_compra` son las tablas
   grandes y tenían dos cada una.

3. **`alerts.empresa_id` pasa de SET NULL a CASCADE.** Es la única diferencia de
   esta migración que cambia comportamiento. El modelo declaraba CASCADE y la
   migración creó SET NULL. Gana CASCADE: una alerta de una empresa borrada no
   significa nada, y dejarla con `empresa_id` NULL la vuelve indistinguible de
   una alerta personal del usuario.

   Sin riesgo hoy: `empresa_id` no se consulta en ninguna parte del backend —
   no hay una sola referencia a `Alert.empresa_id`.

4. Dos índices de búsqueda por RUT que el modelo declaraba y la base no tenía,
   el renombre de un índice, y tres comentarios de columna.

Lo que NO hace
--------------
No toca `ix_empresas_usuario_empresa_id` ni `ix_empresas_usuario_user_id`.
Autogenerate proponía eliminarlos porque el modelo no los declaraba; son los que
sirven cada comprobación de pertenencia a empresa. Se corrigió el modelo para
declararlos, no la base para borrarlos.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "da5fb1e45066"
down_revision: Union[str, None] = "e8a773910bb2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Consultas al catálogo ────────────────────────────────────────────────────


def _existe_constraint(nombre: str) -> bool:
    return bool(
        op.get_bind()
        .execute(sa.text("SELECT 1 FROM pg_constraint WHERE conname = :n"), {"n": nombre})
        .scalar()
    )


def _existe_indice(nombre: str) -> bool:
    return bool(
        op.get_bind()
        .execute(
            sa.text("SELECT to_regclass(:n)"), {"n": f"public.{nombre}"}
        )
        .scalar()
    )


def _renombrar_constraint(tabla: str, desde: str, hacia: str) -> None:
    if _existe_constraint(desde) and not _existe_constraint(hacia):
        op.execute(f"ALTER TABLE {tabla} RENAME CONSTRAINT {desde} TO {hacia}")


def _indice_a_constraint(tabla: str, indice: str, restriccion: str) -> None:
    """`USING INDEX` adopta el índice: no se reconstruye nada."""
    if _existe_indice(indice) and not _existe_constraint(restriccion):
        op.execute(f"ALTER TABLE {tabla} ADD CONSTRAINT {restriccion} UNIQUE USING INDEX {indice}")


def _constraint_a_indice(tabla: str, restriccion: str, indice: str, columna: str) -> None:
    """Inverso del anterior: al soltar la restricción se va también su índice."""
    if _existe_constraint(restriccion) and not _existe_indice(indice):
        op.execute(f"ALTER TABLE {tabla} DROP CONSTRAINT {restriccion}")
        op.create_index(indice, tabla, [columna], unique=True)


# ── Inventario ───────────────────────────────────────────────────────────────

# (tabla, nombre que pone Postgres, nombre de la convención)
RENOMBRES: list[tuple[str, str, str]] = [
    ("buyer_organizations", "buyer_organizations_codigo_organismo_key", "uq_buyer_organizations_codigo_organismo"),
    ("categories", "categories_code_key", "uq_categories_code"),
    ("empresas", "uq_empresas_rut", "uq_empresas_rut_empresa"),
    ("licitaciones", "licitaciones_codigo_externo_key", "uq_licitaciones_codigo_externo"),
    ("licitaciones_detalle", "licitaciones_detalle_codigo_externo_key", "uq_licitaciones_detalle_codigo_externo"),
    ("licitaciones_detalle", "licitaciones_detalle_licitacion_id_key", "uq_licitaciones_detalle_licitacion_id"),
    ("ordenes_compra", "ordenes_compra_codigo_oc_key", "uq_ordenes_compra_codigo_oc"),
    ("ordenes_compra_detalle", "ordenes_compra_detalle_codigo_oc_key", "uq_ordenes_compra_detalle_codigo_oc"),
    ("ordenes_compra_detalle", "ordenes_compra_detalle_orden_compra_id_key", "uq_ordenes_compra_detalle_orden_compra_id"),
    ("suppliers", "suppliers_codigo_proveedor_key", "uq_suppliers_codigo_proveedor"),
    ("tfidf_perfiles", "tfidf_perfiles_empresa_id_key", "uq_tfidf_perfiles_empresa_id"),
]

# (tabla, índice único existente, restricción resultante, columna)
CONVERSIONES: list[tuple[str, str, str, str]] = [
    ("users", "ix_users_email", "uq_users_email", "email"),
    ("users", "ix_users_username", "uq_users_username", "username"),
    ("users", "ix_users_google_id", "uq_users_google_id", "google_id"),
    ("ref_forma_pago", "ix_ref_forma_pago_codigo", "uq_ref_forma_pago_codigo", "codigo"),
    ("ref_tipo_despacho", "ix_ref_tipo_despacho_codigo", "uq_ref_tipo_despacho_codigo", "codigo"),
    ("ref_tipo_orden_compra", "ix_ref_tipo_orden_compra_codigo", "uq_ref_tipo_orden_compra_codigo", "codigo"),
    ("ref_unidad_monetaria", "ix_ref_unidad_monetaria_codigo", "uq_ref_unidad_monetaria_codigo", "codigo"),
]

# (tabla, índice, columna, era único) — duplican una restricción UNIQUE o una PK.
DUPLICADOS: list[tuple[str, str, str, bool]] = [
    ("buyer_organizations", "ix_buyer_organizations_codigo_organismo", "codigo_organismo", True),
    ("categories", "ix_categories_code", "code", True),
    ("empresas", "ix_empresas_rut_empresa", "rut_empresa", True),
    ("suppliers", "ix_suppliers_codigo_proveedor", "codigo_proveedor", True),
    ("licitaciones", "ix_licitaciones_codigo_externo", "codigo_externo", False),
    ("licitaciones_detalle", "ix_licitaciones_detalle_codigo_externo", "codigo_externo", False),
    ("ordenes_compra", "ix_ordenes_compra_codigo_oc", "codigo_oc", False),
    ("ordenes_compra_detalle", "ix_ordenes_compra_detalle_codigo_oc", "codigo_oc", False),
    # Duplican la clave primaria, que ya tiene su índice único.
    ("licitaciones", "ix_licitaciones_id", "id", False),
    ("ordenes_compra", "ix_ordenes_compra_id", "id", False),
    ("users", "ix_users_id", "id", False),
]

# Declarados en el modelo (`index=True` sobre `rut`) y ausentes de la base.
NUEVOS: list[tuple[str, str, str]] = [
    ("suppliers", "ix_suppliers_rut", "rut"),
    ("buyer_organizations", "ix_buyer_organizations_rut", "rut"),
]

# (columna, comentario del modelo, comentario anterior)
COMENTARIOS: list[tuple[str, str, str]] = [
    (
        "billing_customer_id",
        "ID del cliente en la pasarela. El formato depende del proveedor.",
        "ID del cliente en la pasarela de cobro. El formato depende del proveedor.",
    ),
    (
        "billing_subscription_id",
        "ID de la suscripción en la pasarela.",
        "ID de la suscripción en la pasarela de cobro.",
    ),
    (
        "billing_provider",
        "Pasarela que tiene la suscripción: stripe | mercadopago | khipu. "
        "NULL mientras no haya suscripción.",
        "Pasarela que tiene la suscripción de esta empresa: stripe | mercadopago | khipu. "
        "NULL mientras no haya suscripción.",
    ),
]

FK_ALERTS_VIEJA = "fk_alerts_empresa_id"
# El modelo declara la FK sin nombre, así que Postgres le pone el suyo.
FK_ALERTS_NUEVA = "alerts_empresa_id_fkey"


def upgrade() -> None:
    for tabla, viejo, nuevo in RENOMBRES:
        _renombrar_constraint(tabla, viejo, nuevo)

    for tabla, indice, restriccion, _columna in CONVERSIONES:
        _indice_a_constraint(tabla, indice, restriccion)

    for _tabla, indice, _columna, _unico in DUPLICADOS:
        op.execute(f"DROP INDEX IF EXISTS {indice}")

    for tabla, indice, columna in NUEVOS:
        if not _existe_indice(indice):
            op.create_index(indice, tabla, [columna])

    if _existe_indice("ix_plantillas_checklist_tipo"):
        op.execute(
            "ALTER INDEX ix_plantillas_checklist_tipo "
            "RENAME TO ix_plantillas_checklist_tipo_licitacion"
        )

    if _existe_constraint(FK_ALERTS_VIEJA):
        op.drop_constraint(FK_ALERTS_VIEJA, "alerts", type_="foreignkey")
    if not _existe_constraint(FK_ALERTS_NUEVA):
        op.create_foreign_key(
            None, "alerts", "empresas", ["empresa_id"], ["id"], ondelete="CASCADE"
        )

    for columna, del_modelo, _anterior in COMENTARIOS:
        op.execute(f"COMMENT ON COLUMN empresas.{columna} IS '{del_modelo}'")


def downgrade() -> None:
    for columna, _del_modelo, anterior in COMENTARIOS:
        op.execute(f"COMMENT ON COLUMN empresas.{columna} IS '{anterior}'")

    if _existe_constraint(FK_ALERTS_NUEVA):
        op.drop_constraint(FK_ALERTS_NUEVA, "alerts", type_="foreignkey")
    if not _existe_constraint(FK_ALERTS_VIEJA):
        op.create_foreign_key(
            FK_ALERTS_VIEJA, "alerts", "empresas", ["empresa_id"], ["id"], ondelete="SET NULL"
        )

    if _existe_indice("ix_plantillas_checklist_tipo_licitacion"):
        op.execute(
            "ALTER INDEX ix_plantillas_checklist_tipo_licitacion "
            "RENAME TO ix_plantillas_checklist_tipo"
        )

    for _tabla, indice, _columna in NUEVOS:
        op.execute(f"DROP INDEX IF EXISTS {indice}")

    for tabla, indice, columna, unico in DUPLICADOS:
        if not _existe_indice(indice):
            op.create_index(indice, tabla, [columna], unique=unico)

    for tabla, indice, restriccion, columna in CONVERSIONES:
        _constraint_a_indice(tabla, restriccion, indice, columna)

    for tabla, viejo, nuevo in RENOMBRES:
        _renombrar_constraint(tabla, nuevo, viejo)
