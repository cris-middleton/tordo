---
name: migracion-alembic
description: Usar SIEMPRE que haya que crear, modificar o revertir una migración de base de datos, o cuando se añada/cambie un modelo SQLAlchemy en backend/app/models/. Evita romper la cadena de down_revision, que ya se rompió una vez en este repo.
---

# Migraciones

## La regla

> **Siempre `make migrate-create MSG="descripción"`. Nunca `alembic revision` a mano.**

`alembic revision` directo genera IDs de revisión y cadenas de `down_revision` que no
respetan el estado del contenedor, y produce cabezas múltiples. **Ya pasó en este repo** —
`011_fix_alerttype_enum_uppercase` existe precisamente para reparar una divergencia entre el
enum del modelo y el de Postgres.

`alembic revision` está además bloqueado en `.claude/settings.json`.

## Flujo

```bash
# 1. El stack tiene que estar arriba: autogenerate compara contra la BD real
make dev-up-d

# 2. Modifica el modelo en backend/app/models/
#    Toda columna y tabla nueva lleva comment=

# 3. Genera la migración
make migrate-create MSG="agregar tipo_convocatoria a licitaciones"

# 4. LEE el archivo generado en backend/alembic/versions/.
#    Autogenerate se equivoca: no detecta renombres (los ve como drop+create,
#    que pierde datos), ni cambios de tipo en enums, ni índices con expresiones.

# 5. Aplica y verifica que revierta
make migrate
make downgrade
make migrate
```

**El paso 5 no es opcional.** CI corre `upgrade head` y `downgrade base` contra una base
vacía: una migración que no revierte no pasa.

## Lo que autogenerate NO detecta

| Caso | Qué hace autogenerate | Qué hay que hacer |
|---|---|---|
| Renombrar una columna | `drop_column` + `add_column` → **pierde los datos** | Reescribir a `op.alter_column(..., new_column_name=...)` |
| Añadir un valor a un enum de Postgres | nada | `op.execute("ALTER TYPE x ADD VALUE 'y'")` — y no corre dentro de una transacción |
| Cambiar `JSON` a `JSONB` | a veces nada | `op.alter_column(..., postgresql_using="col::jsonb")` |
| Índices con expresiones (`tsvector`, parciales) | nada | `op.execute("CREATE INDEX ...")` a mano |
| `server_default` en una tabla con filas | añade la columna `NOT NULL` sin default → falla | Añadir nullable → backfill → poner `NOT NULL` |

## Backfills

Una migración que toca millones de filas (`licitaciones`, `ordenes_compra`) **no se hace en
una sola sentencia**: bloquea la tabla. Por lotes:

```python
def upgrade():
    conn = op.get_bind()
    while True:
        res = conn.execute(sa.text("""
            UPDATE licitaciones SET nueva_col = ...
            WHERE id IN (SELECT id FROM licitaciones WHERE nueva_col IS NULL LIMIT 5000)
        """))
        if res.rowcount == 0:
            break
```

`fix/b1-backfill-por-lotes` en el historial del repo es el precedente.

## Comentarios de BD (obligatorio)

Toda tabla y columna nueva lleva `comment=`. Es un producto de datos con 78 columnas por
orden de compra; sin comentarios queda inusable en meses.

```python
nueva_col = Column(
    String(50),
    nullable=True,
    comment="Tipo de convocatoria en Mercado Público: licitacion | compra_agil | ...",
)
```

## Checklist

- [ ] Generada con `make migrate-create`, no a mano
- [ ] Leí el archivo generado y corregí lo que autogenerate no detecta
- [ ] `make migrate` && `make downgrade` && `make migrate` corren limpios
- [ ] Columnas y tablas nuevas con `comment=`
- [ ] Si toca una tabla grande, el backfill va por lotes
- [ ] `make migrate-status` muestra una sola cabeza
