# 0006 — Analytics servido desde Postgres, no desde parquet en proceso

**Estado**: Propuesta (F2) · **Fecha**: 2026-08-05

## Contexto
El ETL escribe ~20 parquets a disco (el L1 pesa 60 MB) y la API los carga en un dict a nivel
de módulo (`bi_service._cache`, TTL 24 h), más un modelo TF-IDF de 71 MB. Esto implica:

- Una copia por worker: con `gunicorn -w 4` el contenedor muere.
- Requiere sistema de archivos compartido entre ETL y API. **En Railway no existe** — la
  topología de producción son 6 servicios separados, así que el BI no puede funcionar ahí.
- Las consultas son scans lineales en Python sobre 722 000 filas, sin índice.
- Arranque en frío de decenas de segundos, con un pre-warm en background como parche.

## Decisión
El **cómputo batch sigue en Polars sobre parquet** (está validado y es rápido). Lo que cambia
es la **capa de servicio**: al final del batch, los resultados se materializan en tablas
Postgres indexadas vía `COPY`, y la API las consulta con SQLAlchemy como todo lo demás.

Regla derivada: **el proceso de la API es stateless.** No carga modelos, no cachea
DataFrames, no depende del filesystem en tiempo de request.

## Alternativas descartadas
- **DuckDB sobre parquet en R2**: correcto para consultas históricas ad-hoc en vivo, pero
  hoy los *outputs* son chicos (722 K bandas L1, 51 K L3, 97 K perfiles) y Postgres los sirve
  con índices sin añadir un datastore. Se reconsidera si aparece esa necesidad.
- **Dejarlo como está y escalar verticalmente**: no resuelve el problema de despliegue.

## Consecuencias
- Se elimina `_cache`, `prewarm_bi_artifacts` y el volumen `:ro` del compose.
- El TF-IDF sale del proceso de la API: job nocturno que precomputa a
  `match_empresa_licitacion`. Ya existe el precedente en
  `dashboard_tasks.precompute_dashboard_matches`.
- Se pueden eliminar los cuatro `subprocess.run` de Celery al ETL.
- Desaparece la razón que justificaba los imports diferidos.
