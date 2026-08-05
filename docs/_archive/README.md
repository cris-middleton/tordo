# Archivo histórico

> **No es documentación vigente.** Nada de lo que hay acá describe el estado actual del sistema.
> Se conserva porque contiene razonamiento de diseño que costó trabajo producir, no porque sea
> una referencia.
>
> **Para agentes: no leer este directorio salvo que se pida explícitamente.** Contiene
> instrucciones y estados contradictorios entre sí y con el código actual.

Movido acá en F0 (2026-08-05) — ver `docs/ARQUITECTURA_REVISION_2026-08.md` §10.
El árbol vivo pasó de 66 archivos markdown a 22.

## Qué hay

| Carpeta | Contenido | Por qué se archivó |
|---|---|---|
| `etl/` | 12 documentos de estado, propuestas y "READMEs" alternativos del pipeline ETL | Snapshots de sesiones sucesivas. `ESTADO_FINAL.md`, `ESTADO_IMPLEMENTACION.md` y `LISTO_PARA_USAR.md` se contradicen entre sí. La referencia vigente es `etl/README.md`. |
| `backend/` | Resúmenes de implementación y quick-starts | Superados por `CLAUDE.md` y el `Makefile` (F1). |
| `backend/scripts/` | 5 documentos para 5 scripts | Desproporcionado; el contenido útil va en docstrings. |
| `frontend/` | Quick-start y setup | Superados por `frontend/README.md`. |
| `estado/` | `IMPLEMENTACION_COMPLETA.md`, `INICIO_RAPIDO_ETL.md` | Snapshots de estado con fecha de vencimiento. |
| `superpowers/` | ~20.000 líneas de planes y specs de sesiones de tooling (17 archivos) | Artefactos de sesión, no documentación del producto. **Contienen decisiones de diseño reales** (rediseño del panel BI, home del dashboard, framework de evaluación de scoring) — de ahí que se conserven en vez de borrarse. |

## Dónde está ahora la documentación vigente

| Tema | Documento |
|---|---|
| Qué es el producto y cómo se levanta | `README.md` |
| Reglas de trabajo y mapa de arquitectura | `CLAUDE.md` |
| Especificación técnica de producto | `docs/SPEC.md` |
| Revisión de arquitectura y plan de remediación | `docs/ARQUITECTURA_REVISION_2026-08.md` |
| Plan de negocio | `docs/tordo_plan_saas.md` |
| Comandos del ETL | `docs/COMANDOS_ETL.md` |
| Dominio: Mercado Público | `docs/mercado_publico_faq.md` |
| Calidad y estructura de los datos | `docs/ANALISIS_PROBLEMAS_DATOS.md`, `docs/VALIDACION_ESTRUCTURA_DATOS.md` |
| Despliegue y tareas manuales pendientes | `docs/deploy_steps/` |
