# Mapa de la documentación

**El problema que resuelve este índice**: doce documentos en un directorio no
dicen cuáles describen el sistema de hoy y cuáles son la foto de un martes de
abril. Y una documentación desfasada es peor que ninguna — la de hoy se lee con
desconfianza, y la de abril se cree.

Así que cada documento está clasificado, y **un documento nuevo sin clasificar
hace fallar `backend/tests/test_docs_indexadas.py`**. Es el mismo trinquete que
usa el resto del repo: la decisión la toma una persona, no el descuido.

| estado | qué significa |
|---|---|
| 🟢 **vivo** | Describe el sistema actual. **Si cambias el código y esto queda desfasado, se corrige en el mismo PR.** |
| 🟡 **histórico** | La foto de un momento. **No se actualiza** — se conserva por el razonamiento, no como referencia. |
| 🔵 **externo** | Documentación de terceros (ChileCompra). No la escribimos ni la mantenemos. |

---

## 🟢 Vivo

| documento | qué contiene | cuándo mirarlo |
|---|---|---|
| [`../CLAUDE.md`](../CLAUDE.md) | **El estado real del backend, el frontend y el ETL**, con las decisiones que el código no explica solo. Es el documento que más se actualiza. | Antes de tocar cualquier cosa |
| [`PIVOTE_PUBLICO_2026-10.md`](PIVOTE_PUBLICO_2026-10.md) | **El plan en curso**: TORDO pasa de SaaS a sitio público y gratuito. Las 20 decisiones, la arquitectura objetivo, costos, datos personales y el orden de los diez PR | Antes de cualquier paso del pivote — y para saber qué partes de este índice describen algo que se va a retirar |
| [`REDISENO_PUBLICO_2026-10.md`](REDISENO_PUBLICO_2026-10.md) | **El rediseño en curso**: por qué el sitio parece una app de pago, qué se aprendió de ~30 sitios comparables, la portada en torno a un buscador, `/buscar`, `/abierto` (API y MCP), una sola cáscara sin barra lateral, la tipografía (Newsreader + Public Sans + IBM Plex Mono), cómo abrir el código y el orden de los PR | Antes de tocar la portada, la navegación, la tipografía o los tokens de color |
| [`decisiones/`](decisiones/README.md) | **11 ADRs**: sólo Chile, suscripción por empresa, nombre, LLM/MCP, pasarela local, analytics en Postgres, no migrar a Supabase, MercadoPago, API versionada, extracción de bases y el sitio público sin cuentas (0011, que supersede a 0002, 0005 y 0008) | Antes de re-discutir algo que ya se decidió |
| [`DECLARACION_USO_DATOS.md`](DECLARACION_USO_DATOS.md) | **Bajo qué condiciones se usan los datos de ChileCompra**: la cita literal de la fuente (pie de cada página y primera línea de cada CSV), que ChileCompra no respalda el sitio, y por qué omitir a las personas naturales no es modificar el dato. Sustituye al PDF | Antes de tocar el pie, la exportación CSV o el enmascarado de personas |
| [`DESPLIEGUE.md`](DESPLIEGUE.md) | **Cómo se pone en producción**: Railway (API y dos cron), R2, Healthchecks, Sentry, Vercel, DNS y correo, como lista ordenada con una comprobación por paso; y qué medir tras la primera corrida | Al desplegar, y al cambiar una variable de entorno o un Dockerfile |
| [`API_PUBLICA.md`](API_PUBLICA.md) | Qué parte de la API es pública, límites, errores, el servidor MCP y **lo que no hay** | Para integrar desde fuera |

**La referencia de endpoints no está en ningún `.md`, y es deliberado**: se
genera del código y vive en `/docs`, `/redoc` y `/openapi.json`. Una lista de
endpoints escrita a mano se queda vieja sin que nada falle.

## 🟡 Histórico

Ninguno se actualiza. Se conservan porque contienen razonamiento que costó
producir — no porque describan el sistema de hoy.

| documento | de cuándo | por qué se conserva |
|---|---|---|
| [`ARQUITECTURA_REVISION_2026-08.md`](ARQUITECTURA_REVISION_2026-08.md) | 2026-08-05 | La revisión que originó las fases F0–F6 del SaaS y su cierre. **Anterior al pivote**; sus puntos de deuda y aplazados conservan el razonamiento |
| [`SPEC.md`](SPEC.md) | 2026-03 | La especificación del SaaS (cuentas, planes, alertas). **Anterior al pivote** |
| [`tordo_plan_saas.md`](tordo_plan_saas.md) | 2026-03 | El plan de negocio del SaaS: segmento, precios, competencia. **Anterior al pivote** |
| [`mercado_publico_faq.md`](mercado_publico_faq.md) | sin fecha | Un resumen de cómo funciona Mercado Público, **de origen no trazable y con cifras sin verificar** (traía marcas de cita rotas). Útil como vocabulario; para montos y requisitos, ChileCompra |
| [`COMPETENCIA_KAPTOR_2026-08.md`](COMPETENCIA_KAPTOR_2026-08.md) | 2026-08-15 | El análisis de kaptor.cl función por función contra el código, y el plan de respuesta que salió de él. Kaptor publica ~1 release al día: su columna envejece rápido, el razonamiento no |
| [`BRECHA_PRODUCTO_2026-08.md`](BRECHA_PRODUCTO_2026-08.md) | 2026-08-07 | La lectura del código contra el plan de negocio que ordenó las prioridades de F6 |
| [`ANALISIS_PROBLEMAS_DATOS.md`](ANALISIS_PROBLEMAS_DATOS.md) | 2026-04 | Los problemas de estructura de datos que encontró y **que ya están corregidos** |
| [`VALIDACION_ESTRUCTURA_DATOS.md`](VALIDACION_ESTRUCTURA_DATOS.md) | 2026-04 | La validación de `Listado[0]` y timezone contra la API de Mercado Público |
| [`tordo_analytics_bi_dashboard_plan_v3.md`](tordo_analytics_bi_dashboard_plan_v3.md) | 2026-03 | El plan del que salió el módulo de BI |
| [`COMANDOS_ETL.md`](COMANDOS_ETL.md) | 2026-04 | Referencia de comandos del ETL. **Los vigentes están en `CLAUDE.md`** |
| [`deploy_steps/railway_deployment_guide.md`](deploy_steps/railway_deployment_guide.md) y [`tareas_manuales.md`](deploy_steps/tareas_manuales.md) | hasta 2026-10 | El despliegue del SaaS (Celery, Redis, MinIO, Next en Railway). **Sustituidas por la guía de despliegue** (en «Vivo», arriba) |
| [`deploy_steps/fase_*.md`](deploy_steps/) | 2026 | El roadmap original de implementación, anterior a la revisión de arquitectura |
| [`_archive/`](_archive/README.md) | hasta F0 | 44 documentos retirados en la limpieza de F0. Tiene su propia advertencia |

## 🔵 Referencia externa

| documento | qué es |
|---|---|
| `Documentación API Mercado Publico - Licitaciones.pdf` | Diccionario de datos oficial de ChileCompra. **Es la fuente cuando hay dudas sobre un campo** — se usó para decidir el [ADR 0010](decisiones/0010-extraccion-de-bases-con-llm.md) |
| `Documentación API de Mercado Público - Órdenes de Compra.pdf` | Ídem, para órdenes de compra |
| `Declaración de Uso de Datos Oficiales.pdf` | La versión de la etapa SaaS de la declaración. **La vigente es [`DECLARACION_USO_DATOS.md`](DECLARACION_USO_DATOS.md)**; el PDF se conserva como registro |

## Dónde va cada cosa

Si dudas dónde documentar algo:

- **Cómo funciona el sistema hoy** → `CLAUDE.md`.
- **Por qué se eligió A y no B**, y es una decisión que alguien re-discutiría →
  un ADR en `decisiones/`. Se numeran en orden y se indexan en su README.
- **Lo que ve quien integra desde fuera** → `API_PUBLICA.md`, y lo que sea
  referencia de endpoints, en los docstrings (van al OpenAPI).
- **Por qué el código está así y no de otra forma** → un comentario junto al
  código. Es lo que sobrevive al refactor; un documento aparte, no.
