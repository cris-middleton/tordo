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
| [`REDISENO_PUBLICO_2026-10.md`](REDISENO_PUBLICO_2026-10.md) | **El rediseño, en vigor salvo tres partes**: por qué el sitio parecía una app de pago, qué se aprendió de ~30 sitios comparables, `/buscar`, `/abierto` (API y MCP), una sola cáscara sin barra lateral, cómo abrir el código y el orden de los PR. Su §5 (tipografía y color), §6.3 (portada) y §6.6 (`GET /publico/portada`) están **sustituidas** por `IDENTIDAD_Y_PORTADA_2026-10.md` | Antes de tocar la navegación, `/buscar`, `/abierto` o abrir el código; para la portada, la tipografía o el color, el documento de al lado |
| [`VOZ.md`](VOZ.md) | **Cómo escribe el sitio** (desde el 2026-10-21): la voz de PixelFrame más la del newsletter de Fintual, seis reglas, lo que suena a máquina, el vocabulario fijo y ejemplos de antes y después. Sustituye a la §6.1 de la identidad | Antes de escribir o tocar cualquier texto visible |
| [`IDENTIDAD_Y_PORTADA_2026-10.md`](IDENTIDAD_Y_PORTADA_2026-10.md) | **En vigor salvo la estructura de la portada y la voz**: la identidad visual (Libre Franklin y Public Sans desde el 2026-10-21, fondo blanco, el pájaro en la cabecera, tokens de dato). La voz de los textos (§6.1) la sustituye `VOZ.md`. Su §3.1, §3.3 y el panel oscuro de §5 están **sustituidos** por `PORTADA_V7_Y_NOTAS_2026-10.md`. Sustituye a §5, §6.3 y §6.6 del rediseño | Antes de tocar la portada, la tipografía, los tokens de color o un texto del sitio |
| [`PORTADA_V7_Y_NOTAS_2026-10.md`](PORTADA_V7_Y_NOTAS_2026-10.md) | **En vigor salvo la composición de la portada y el pie**: la escala de espacios y el contenedor único, las lecturas con su pie de método, las notas de datos (`/notas`) y la firma del autor (`AUTOR_NOMBRE`). La composición de la portada (§3.1, §3.7: dos lecturas a la derecha del buscador) y el pie de cuatro columnas (§6) están **sustituidos** por la portada de gráficos y el pie de una fila de octubre de 2026, descritos en `CLAUDE.md` | Antes de tocar la portada, el espaciado, el pie del sitio o una nota de datos |
| [`GUIA_GRAFICOS.md`](GUIA_GRAFICOS.md) | **Cómo se dibuja un gráfico aquí**: reglas que fija `__tests__/guia-graficos.test.tsx` (tokens `dato`/`dato-tenue`, sin leyendas ni adornos, texto de 12 px, dibujo `aria-hidden` con los valores en texto, escala logarítmica declarada) y criterios que se revisan leyendo, con sus fuentes (Datawrapper, Urban Institute, Royal Statistical Society, FT). Lista la deuda: Recharts en `/mercado` | Antes de tocar o dibujar un gráfico |
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
| [`mercado_publico_faq.md`](mercado_publico_faq.md) | sin fecha | Un resumen de cómo funciona Mercado Público, **de origen no trazable y con cifras sin verificar** (traía marcas de cita rotas). Útil como vocabulario; para montos y requisitos, ChileCompra |
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
| Documentación de la API de Mercado Público (licitaciones y órdenes de compra) | El diccionario de datos oficial de ChileCompra. **Es la fuente cuando hay dudas sobre un campo** — se usó para decidir el [ADR 0010](decisiones/0010-extraccion-de-bases-con-llm.md). Lo publica ChileCompra en <https://api.mercadopublico.cl>; **no se versiona aquí**, porque es un documento de un tercero |
| Declaración de Uso de Datos Oficiales de ChileCompra | La versión de la etapa SaaS de la declaración, que tampoco se versiona. **La vigente es [`DECLARACION_USO_DATOS.md`](DECLARACION_USO_DATOS.md)** |

Los PDF de ChileCompra, el plan de negocio del SaaS (`tordo_plan_saas`) y el análisis de un
competidor (`COMPETENCIA_KAPTOR_2026-08.md`) se retiraron del repositorio antes de publicarlo
(rediseño 7, decisión D3): documentos de terceros con sus propios derechos, y el plan y el
análisis de una etapa cerrada. Los documentos que los citan conservan la cita como registro.

## Dónde va cada cosa

Si dudas dónde documentar algo:

- **Cómo funciona el sistema hoy** → `CLAUDE.md`.
- **Por qué se eligió A y no B**, y es una decisión que alguien re-discutiría →
  un ADR en `decisiones/`. Se numeran en orden y se indexan en su README.
- **Lo que ve quien integra desde fuera** → `API_PUBLICA.md`, y lo que sea
  referencia de endpoints, en los docstrings (van al OpenAPI).
- **Por qué el código está así y no de otra forma** → un comentario junto al
  código. Es lo que sobrevive al refactor; un documento aparte, no.
