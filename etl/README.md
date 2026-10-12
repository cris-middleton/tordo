# ETL

Ingesta de Mercado Público y análisis batch. La referencia viva es `CLAUDE.md`
(secciones «Comandos» y «ETL»); esto es sólo el mapa.

Todo se corre **desde la raíz del repo, como módulo** (`cd etl && python main.py`
falla con `No module named 'etl'`).

## Lo que corre solo: los dos cron (`etl/cron.py`)

```bash
uv run python -m etl.cron frecuente [--forzar]       # cada hora UTC; se autolimita
ETL_ALMACEN=disco uv run python -m etl.cron semanal  # R2 → descarga masiva → analytics → materializa → R2 → retención
```

- **`frecuente`**: licitaciones del día, Compra Ágil (API v2) y sus detalles; la
  primera del día barre además el día anterior y re-consulta resultados.
- **`semanal`**: descarga masiva de órdenes y licitaciones (parquets en R2),
  los módulos de `analytics/`, la materialización en el esquema `analytics` de
  Postgres y, al final, la retención del catálogo (`etl/retencion.py`).

## Qué guarda en Postgres

Sólo lo que se sirve hoy: `licitaciones` y `licitaciones_detalle` —Compra Ágil de
los últimos 30 días y nunca del mes anterior, licitaciones abiertas y cerradas
hasta hace 90— y las tablas de `analytics.*`. **Las órdenes de compra no se ingieren por la API**: salen de la
descarga masiva, que vive entera en R2. Todo payload pasa por
`analytics/personas.py` antes de guardarse (personas naturales fuera).

## A mano

```bash
uv run python -m etl.main --horario                                   # una pasada «horaria»
uv run python -m etl.main --fecha-desde 2026-09-01 --fecha-hasta 2026-09-01
uv run python -m etl.main --only-actualizar --detalles-limit 100      # re-pide detalles abiertos
uv run python -m etl.analytics.run_all [--modulo seasonality]
```

## Estructura

```
cron.py            los dos cron de Railway
main.py            pasos del pipeline de ingesta
retencion.py       qué se purga del catálogo y cuándo
almacen.py         sincronización de parquets con R2
extractors/        API clásica (licitaciones) y API v2 (Compra Ágil)
transformers/      del payload a filas
loaders/           carga a Postgres (database_loader_v2) y materialización
analytics/         módulos Polars, harness de evaluación
scripts/           descarga masiva y utilidades
```
