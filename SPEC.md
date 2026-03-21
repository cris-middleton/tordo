# SPEC.md — TORDO v1.0
## Especificaciones Técnicas de Producto

> **Versión**: 1.0 · **Fecha**: Marzo 2026 · **Estado**: Aprobado para desarrollo  
> **Autor técnico**: Senior Software Architect  
> **Documento fuente de negocio**: tordo_plan_saas_v3.md (Marzo 2026)  
> **Changelog v1.0**: Reconstrucción completa desde LicitaFácil v2.2. Incorpora propuesta de
> valor TORDO (BI pre-postulación + compliance operativo), pipeline ETL de OC histórico desde
> ZIP masivo ChileCompra, ETL horario de licitaciones activas, motor de matching semántico
> TF-IDF, DuckDB embebido para queries analíticas, y todas las correcciones técnicas
> heredadas de LicitaFácil v2.2 (asyncpg, patrón Celery async/sync, idempotencia de alertas,
> timezone America/Santiago, python-magic, tenacity).
>
> **Nombre del producto**: "TORDO" se usa como **placeholder** en todo el código y la
> documentación. Usar una variable de entorno o constante centralizada (`APP_NAME`, `BRAND_NAME`)
> para facilitar el cambio posterior si corresponde.

---

## Tabla de Contenidos

1. [Propuesta de Valor y Gap Analysis](#1-propuesta-de-valor-y-gap-analysis)
2. [Decisión de Dispositivo: Mobile vs. Desktop](#2-decisión-de-dispositivo)
3. [Arquitectura de Sistema](#3-arquitectura-de-sistema)
4. [Fuentes de Datos — Referencia Validada](#4-fuentes-de-datos--referencia-validada)
5. [Stack Tecnológico Validado](#5-stack-tecnológico-validado)
6. [Modelo de Datos](#6-modelo-de-datos)
7. [Seguridad y Cumplimiento](#7-seguridad-y-cumplimiento)
8. [Roadmap de Desarrollo](#8-roadmap-de-desarrollo)
9. [Estándares de Calidad y Arquitectura](#9-estándares-de-calidad-y-arquitectura)
10. [Política de Datos, Backups y Cuotas](#10-política-de-datos-backups-y-cuotas)

---

## 1. Propuesta de Valor y Gap Analysis

### Concepto

**TORDO** es un SaaS B2B para PYMES proveedoras del Estado chileno que resuelve dos problemas
complementarios:

1. **Inteligencia pre-postulación** — saber si vale la pena licitar, a qué precio, y quién
   compite, antes de invertir tiempo en preparar una oferta.
2. **Compliance operativo** — no perder plazos, saber qué documentos cargar, y no quedar
   inhábil.

> **Propuesta central**: *"TORDO es el único que te dice si tu oferta va a ganar antes de
> enviarla, y te asegura que no sea rechazada por forma."*

### 1.1 Posicionamiento Competitivo

| Dimensión | LicitaLab | Lici.cl | Licify.cl | **TORDO (objetivo)** |
|---|---|---|---|---|
| JTBD principal | Analizar mercado con IA | Automatizar postulación | Buscar licitaciones rápido | **Decidir si postular + ejecutar sin errores** |
| Usuario objetivo | Analista / equipo comercial | PYME que quiere cero esfuerzo | Usuario casual | **Dueño PYME sin área dedicada** |
| Precio | USD 85–200+/mes | Sin precio público | Freemium básico | **USD 0–55/mes** |
| BI histórico (OC) | Orientado a análisis general | No | No | **78 campos/OC — orientado a decisión táctica** |
| Checklist de anexos | No (genérico en PRO) | No | No | **Sí — por tipo L1/LE/LP** |
| Monitor estado hábil | No prioritario | No | No | **Sí — alerta diaria por RUT** |
| Matching semántico | LLM pesado (LIA) | No | No | **TF-IDF sobre historial OC (sin LLM)** |

### 1.2 Jobs to Be Done (JTBD) por Segmento

| Segmento ICP | JTBD | Urgencia | ARPU |
|---|---|---|---|
| **PYMES core** (1–50 emp., 1–15 lic/mes, sin área dedicada) | "Quiero saber si conviene postular a esta licitación sin dedicar 4 horas a investigar" | **ALTA** | USD 25/mes |
| **PYMES analíticas** (>15 lic/mes, orientadas a BI) | "Quiero ganar más licitaciones con la misma inversión de tiempo" | **ALTA** | USD 55/mes |
| **Gremios** (Cámara Comercio, Construcción, TI) | "Quiero ofrecer un beneficio tangible y diferenciado a mis socios" | MEDIA | USD 150+/mes |

### 1.3 Componentes REUTILIZABLES de LicitaFácil

| Componente | Archivo(s) | Justificación |
|---|---|---|
| **ETL Pipeline base** | `etl/extractors/`, `etl/transformers/`, `etl/loaders/` | El pipeline de ingesta de licitaciones es válido. Extender con pipeline OC histórico y cron horario. |
| **FastAPI Backend** | `backend/app/main.py`, `config.py`, `celery_app.py` | Monolito modular. Reutilizar al 100%. |
| **Sistema JWT Auth** | `backend/app/core/security.py` | Sólido. Agregar Google OAuth. |
| **Email Notifications** | `backend/app/core/email.py` | Reutilizable. Extender con plantillas de alertas de BI y oportunidades. |
| **Celery + Redis** | `backend/app/tasks/`, `docker-compose.yml` | Arquitectura de jobs periódicos correcta. Agregar crons horarios. |
| **Alert Engine core** | `backend/app/services/alert_engine.py` | Motor de matching existe. Extender con matching semántico TF-IDF. |
| **Tabla `licitaciones`** | `backend/app/models/` | Modelo válido con campos API oficial. Mantener. |
| **Tabla `alert_preferences`** | `backend/app/models/` | CPV/keyword/región matching reutilizable. |
| **Next.js App Router shell** | `frontend/app/layout.tsx`, `AuthContext.tsx` | Reutilizable. |
| **Docker Compose** | `infra/docker-compose.yml` | Extender con DuckDB volume y servicios nuevos. |
| **Migrations Alembic** | `backend/alembic/` | Mantener historial. Agregar nuevas versiones. |
| **Tabla `users`** | `backend/app/models/` | Base válida. Necesita extensión. |

### 1.4 Componentes que DEBEN SER MODIFICADOS

| Componente | Cambio Requerido | Prioridad |
|---|---|---|
| **Dashboard UI** | Rediseñar centrado en BI pre-postulación. Widget principal: "¿Conviene postular?" con benchmarking de precio, competidores y checklist. | P0 |
| **Alert Engine** | Agregar tipos: `NUEVA_LICITACION_MATCH`, `OPORTUNIDAD_HISTORICA`, `PLAZO_CIERRE_48H`, `PLAZO_CIERRE_24H`, `ESTADO_HABIL_CAMBIO`, `DOCUMENTO_VENCIDO`. **Agregar idempotency_key.** | P0 |
| **ETL Licitaciones** | Cambiar de cron diario a **cron horario** para licitaciones activas (detección de nuevas + actualización de estado). Ver sección 4. | P0 |
| **ETL nuevo: ZIP OC Histórico** | Pipeline mensual: descarga ZIP desde `datos-abiertos.chilecompra.cl/descargas`, parsea 78 columnas, carga en tabla `ordenes_compra`. Core del diferenciador de BI. | P0 |
| **Matching Semántico** | Nuevo servicio `TFIDFMatcher`: entrena sobre títulos históricos OC, sugiere licitaciones similares al perfil del proveedor. | P0 |
| **Modelo `users`** | Agregar `rut_empresa`, `nombre_empresa`, `plan_tier`, `rubros_cpv`, `regiones`. | P0 |
| **Celery Beat Schedule** | Agregar cron `*/60 min` para ETL de licitaciones activas. Mantener `America/Santiago` en todos los crons. | P0 |
| **Página de onboarding** | 5 pasos: RUT → estado hábil → rubros CPV → oportunidades (BI demo) → primera alerta. Target: < 10 minutos. | P0 |
| **`core/database.py`** | Configurar connection pool explícito con `asyncpg`. Agregar acceso a DuckDB para queries analíticas. | P0 |
| **Modelo `alerts`** | Extender `alert_type` enum. **Agregar columna `idempotency_key` UNIQUE.** | P0 |

### 1.5 Componentes que DEBEN SER DESCARTADOS

| Componente | Motivo |
|---|---|
| **Analytics page** (`/dashboard/analytics`) | Reemplazada por el BI de BI pre-postulación (más accionable). Proteger con `ANALYTICS_ENABLED=false`. |
| **`licitaciones_detalle` y `ordenes_compra_detalle` (blobs JSON)** | Sobrecarga. Deprecar. Los datos se normalizan en tablas estructuradas. |
| **`useDashboardCollections` (localStorage)** | Reemplazar por tabla `postulaciones` en DB. |
| **Tabla `buyer_organizations`** | No necesaria para el flujo PYME-proveedor. |
| **Tablas `ref_*` de lookup** | Consolidar en `ref_catalogos`. |
| **`pypdf2`** | **CRÍTICO**: deprecado con CVEs. Reemplazar por `pypdf==4.2.0`. |
| **ETL de Órdenes de Compra legacy (post-adjudicación)** | Reemplazado por el nuevo pipeline de ZIP masivo histórico orientado a BI. |

---

## 2. Decisión de Dispositivo

### Veredicto: **Desktop First con Diseño Responsivo + PWA en v3**

El flujo de trabajo de TORDO implica acciones que son naturalmente desktop:

- **Consulta de BI pre-postulación**: el usuario compara precios históricos, analiza competidores y toma una decisión de negocio frente a una pantalla amplia.
- **Completar checklist de anexos**: formulario con múltiples ítems y adjuntos de documentos.
- **Carga de documentos**: archivos descargados del SII, escaneados, PDFs de bases técnicas.

**¿Dónde SÍ aplica mobile?**

- **Consumo de alertas**: "nueva licitación que calza con tu perfil" o "cambio de estado hábil" vía WhatsApp y email.
- **Revisar el score de una oportunidad**: vista de solo lectura del BI resumen.
- **Ver próximos plazos**: calendario de deadlines.

El stack actual (Next.js + Tailwind CSS responsive) soporta esto sin cambio de paradigma. La PWA va en v3.

---

## 3. Arquitectura de Sistema

### 3.1 Diagrama Lógico de Módulos

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        FUENTES EXTERNAS VALIDADAS                         │
│                                                                           │
│  ┌────────────────────────────────────┐  ┌────────────────────────────┐  │
│  │  API Mercado Público (ACTIVA)      │  │  Datos Abiertos ChileCompra│  │
│  │  api.mercadopublico.cl/            │  │  datos-abiertos.           │  │
│  │  servicios/v1/publico/             │  │  chilecompra.cl/descargas  │  │
│  │  licitaciones.json                 │  │                            │  │
│  │  ?estado=activa&ticket=XXX         │  │  · ZIP OC mensual (78 col) │  │
│  │  ?fecha=DDMMYYYY&ticket=XXX        │  │  · ZIP Licitaciones mens.  │  │
│  │                                    │  │  · CSV Estado Hábil diario │  │
│  │  Cron HORARIO para activas         │  │  URL directa al navegador  │  │
│  │  Cron DIARIO para nuevas por fecha │  │  (sin autenticación)       │  │
│  └───────────────┬────────────────────┘  └──────────────┬─────────────┘  │
└──────────────────┼────────────────────────────────────  ┼────────────────┘
                   │                                       │
                   ▼                                       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           CAPA ETL (Python)                               │
│                                                                           │
│  ┌──────────────────────────┐  ┌────────────────────────────────────┐    │
│  │  LicitacionExtractor     │  │  OCHistoricoExtractor (NUEVO/CORE) │    │
│  │  · Cron horario:         │  │  · Cron mensual (día 2 del mes)    │    │
│  │    GET ?estado=activa    │  │  · Descarga ZIP desde              │    │
│  │    → actualizar estado   │  │    datos-abiertos.chilecompra.cl/  │    │
│  │    → detectar nuevas     │  │    descargas                       │    │
│  │    → trigger alertas     │  │  · Parsea 78 columnas              │    │
│  │  · Cron diario (02:00):  │  │  · Upsert en tabla ordenes_compra  │    │
│  │    GET ?fecha=DDMMYYYY   │  │  · Trigger: reentrenar TF-IDF      │    │
│  │  · Retry x3 + backoff    │  │  · Carga incremental (no recarga)  │    │
│  └──────────────┬───────────┘  └──────────────────┬─────────────────┘    │
│                 │                                  │                      │
│  ┌──────────────┴──────────┐   ┌──────────────────┴─────────────────┐    │
│  │  EstadoHabilExtractor   │   │  TFIDFMatchingService (NUEVO/CORE) │    │
│  │  · Cron cada 6h         │   │  · Entrena sobre títulos OC hist.  │    │
│  │  · Descarga CSV desde   │   │  · Genera vectores por proveedor   │    │
│  │    datos-abiertos.      │   │  · Match con licitaciones activas  │    │
│  │    chilecompra.cl/      │   │  · Score de similitud coseno       │    │
│  │    descargas            │   │  · Reentrenamiento tras nuevo ZIP  │    │
│  └──────────────┬──────────┘   └──────────────────┬─────────────────┘    │
│                 └─────────────────────┬────────────┘                      │
│                                       ▼                                   │
│                        ┌─────────────────────────┐                        │
│                        │  DatabaseLoader          │                        │
│                        │  PostgreSQL upsert       │                        │
│                        │  DuckDB append (OC hist) │                        │
│                        │  + DLQ en task_failures  │                        │
│                        └─────────────────────────┘                        │
└───────────────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                  BASE DE DATOS (PostgreSQL 15 + DuckDB)                   │
│                                                                           │
│  PostgreSQL (transaccional):                                              │
│  licitaciones         empresas_usuario     estado_habil_log               │
│  documentos_empresa   checklist_postulacion alertas (+ idempotency_key)   │
│  users                alert_preferences    plantillas_checklist           │
│  task_failures        postulaciones        tfidf_perfiles                 │
│                                                                           │
│  DuckDB embebido (analítico — queries BI):                                │
│  ordenes_compra (78 cols, millones de filas, histórico desde 2010)        │
└──────────────────────────────┬────────────────────────────────────────────┘
                               │
             ┌─────────────────┼──────────────────────┐
             ▼                 ▼                        ▼
┌──────────────────┐  ┌─────────────────────┐  ┌──────────────────────────┐
│  BACKEND API     │  │  MOTOR DE ALERTAS   │  │  SERVICIO DE             │
│  (FastAPI)       │  │  (Celery Beat)      │  │  NOTIFICACIONES          │
│                  │  │  TZ: America/       │  │                          │
│  /api/auth       │  │  Santiago           │  │  Email (SES/SMTP)        │
│  /api/tenders    │  │                     │  │  WhatsApp (Twilio WABA)  │
│  /api/empresa    │  │  etl_licitaciones   │  │  In-app                  │
│  /api/bi         │  │  (hourly — activas) │  │                          │
│  /api/checklist  │  │  etl_licitaciones   │  │  Fallback: email si      │
│  /api/documents  │  │  (02:00 — nuevas)   │  │  WhatsApp falla          │
│  /api/alerts     │  │  etl_oc_zip         │  │                          │
│  /api/billing    │  │  (mensual día 2)    │  │                          │
│                  │  │  check_estado_habil │  │                          │
│                  │  │  (6h)               │  │                          │
│                  │  │  send_deadlines     │  │                          │
│                  │  │  (09:00 SCL)        │  │                          │
│                  │  │  reentrenar_tfidf   │  │                          │
│                  │  │  (post-ZIP)         │  │                          │
│                  │  │  watchdog (30min)   │  │                          │
└────────┬─────────┘  └─────────────────────┘  └──────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js 14)                             │
│                                                                           │
│  /onboarding      → 5 pasos (RUT → estado → rubros → BI demo → alerta)  │
│  /dashboard       → Score oportunidades + próximos plazos + BI rápido   │
│  /licitaciones    → Lista filtrada + matching semántico + checklist badge │
│  /licitaciones/   → Detalle + benchmarking precio + competidores         │
│  [codigo]           + checklist de anexos + documentos                   │
│  /bi              → BI pre-postulación: precios históricos, competidores │
│  /documentos      → Repositorio de documentos de la empresa              │
│  /alertas         → Inbox de notificaciones + oportunidades              │
│  /configuracion   → Perfil empresa + notificaciones + billing            │
└───────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Flujo de Datos Principal

```
[Cron */60 min — SCL] → ETL consulta API licitaciones activas
                        GET licitaciones.json?estado=activa&ticket=XXX
                      → Compara con estado previo en PostgreSQL
                      → Si estado cambió → actualizar + generar alerta update
                      → Si es licitación nueva → upsert + trigger matching
                      → matching_service.match_nueva_licitacion(licitacion)
                      → Para cada empresa con perfil matching:
                          → crear alerta NUEVA_LICITACION_MATCH con idempotency_key
                          → Celery task: enviar email + WhatsApp

[Cron 02:00 SCL]      → ETL extrae licitaciones del día anterior por fecha
                        GET licitaciones.json?fecha=DDMMYYYY&ticket=XXX
                      → Upsert en PostgreSQL (clave: CodigoExterno UNIQUE)
                      → Consistencia y backfill (no depende solo del cron horario)

[Cron día 2 del mes]  → ETL descarga ZIP mensual OC desde:
                        https://datos-abiertos.chilecompra.cl/descargas
                        (URL directa, sin autenticación — GET estándar)
                      → Parsea 78 columnas, normaliza tipos
                      → Append incremental en DuckDB (ordenes_compra)
                      → Trigger: reentrenar modelo TF-IDF con corpus actualizado
                      → Actualizar tfidf_perfiles para todos los usuarios activos

[Cron 06:00 SCL]      → ETL descarga CSV estado hábil desde:
                        https://datos-abiertos.chilecompra.cl/descargas
                      → Para cada empresa registrada: buscar RUT en CSV
                      → Si cambió → alerta ESTADO_HABIL_CAMBIO
                      → idempotency_key = sha256(empresa_id+tipo+fecha)

[Cron 09:00 SCL]      → Revisar postulaciones activas
                      → Si fecha_cierre - hoy <= 2 días → alerta PLAZO_48H
                      → Si fecha_cierre - hoy <= 1 día  → alerta PLAZO_24H
                      → Idempotency_key previene duplicados en reintentos

[Cron 09:30 SCL]      → Revisar documentos con fecha_vencimiento próxima
                      → Si vence en <= 30 días → alerta DOCUMENTO_POR_VENCER

[Cron */30 min]       → Watchdog: verificar que tasks críticas corrieron
                      → Si etl_licitaciones_horario no ejecutó en 90 min → alerta ops

[Usuario web — BI]    → GET /api/bi/benchmarking?licitacion_id=X&empresa_id=Y
                      → DuckDB query: precios históricos por organismo + rubro
                      → GET /api/bi/competidores?rubro=X&organismo=Y
                      → DuckDB query: top proveedores adjudicados
                      → GET /api/bi/matching?empresa_id=X
                      → TF-IDF cosine similarity sobre perfil del proveedor

[Usuario web — Docs]  → Upload documento → S3 (presigned URL)
                      → Metadata en tabla documentos_empresa
                      → Si tiene fecha_vigencia → crear reminder en scheduler
```

### 3.3 Resiliencia y Observabilidad

#### Estrategia de resiliencia

| Componente | Estrategia de fallo | Fallback |
|---|---|---|
| API Mercado Público (cron horario) | Retry x3, backoff exponencial (4s → 60s) | Log + skip ciclo; compensar en cron diario 02:00 |
| API Mercado Público (cron diario) | Retry x3, backoff exponencial | ZIP mensual de datos-abiertos.chilecompra.cl/descargas |
| ZIP OC mensual (datos-abiertos) | Retry x2, wait 30 min | Mantener último histórico; alerta interna a ops |
| CSV Estado Hábil | Retry x2, circuit breaker | Mantener último estado conocido en DB + alerta ops |
| DuckDB queries lentas | Timeout 30s | Respuesta parcial con datos de los últimos 12 meses |
| Twilio WhatsApp | Retry x1 | Degradar silenciosamente a email |
| Amazon SES | Retry x3 | Log en DB + visible en dashboard como alerta no enviada |
| Stripe | No reintentar en webhooks propios | Stripe reintenta automáticamente hasta 3 días |

#### Política de Dead Letter Queue (DLQ)

```sql
CREATE TABLE task_failures (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_name   VARCHAR(255) NOT NULL,
    task_args   JSONB,
    error_msg   TEXT,
    failed_at   TIMESTAMPTZ DEFAULT NOW(),
    resolved    BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_task_failures_unresolved ON task_failures(failed_at DESC)
    WHERE resolved = FALSE;
```

#### Niveles de alerta operacional

| Evento | Canal | SLA respuesta |
|---|---|---|
| ETL horario no ejecutó en 90 minutos | Email ops | 2h |
| ETL diario no ejecutó en 25 horas | Email ops | 4h |
| ZIP OC no descargado el día 2 del mes | Email ops | 4h |
| `check_estado_habil` falló > 10% empresas | Slack/Email | 2h |
| Error rate API > 5% en 15 minutos | PagerDuty/Email | 30min |
| DuckDB query > 30s (percentil 95) | Slack | 1h |
| DB connections > 80% del pool | Slack | 1h |

#### Métricas mínimas a exponer

```python
METRICAS = {
    "etl_licitaciones_hourly_processed": "Gauge — validar cron horario",
    "etl_licitaciones_nuevas_detected":  "Counter — nuevas licitaciones detectadas",
    "etl_oc_zip_rows_loaded":            "Gauge — filas OC cargadas por mes",
    "tfidf_retraining_duration_seconds": "Histogram — detectar degradación",
    "bi_query_duration_ms":              "Histogram — SLA de queries DuckDB",
    "alerts_sent_total":                 "Counter — validar que el sistema envía",
    "estado_habil_checks_failed":        "Counter — detectar degradación extractor",
    "checklist_completion_rate":         "Histogram — engagement de producto",
    "document_upload_size_bytes":        "Histogram — detectar abuso",
    "api_mp_response_time_ms":           "Histogram — SLA API externa",
    "celery_task_duration_seconds":      "Histogram — detectar tasks lentas",
}
```

---

## 4. Fuentes de Datos — Referencia Validada

> **Esta sección documenta las fuentes de datos reales, validadas y accesibles sin
> autenticación desde datos-abiertos.chilecompra.cl/descargas.**

### 4.1 Descarga de Datos Abiertos — URL Directa (VALIDADA)

**Portal**: `https://datos-abiertos.chilecompra.cl/descargas`

Todas las descargas son accesibles vía GET estándar sin autenticación. Los ETL pueden
descargar directamente con `httpx` o `requests` apuntando a la URL del archivo.

| Dataset | Frecuencia | Formato | Uso en TORDO |
|---|---|---|---|
| **Órdenes de Compra (ZIP mensual)** | Mensual | ZIP → CSV, 78 col | Core del BI histórico |
| **Licitaciones (ZIP mensual)** | Mensual | ZIP → CSV | Backfill y consistencia |
| **Proveedores Hábiles (CSV diario)** | Diaria | CSV | Monitor estado hábil |

**Ejemplo URL ZIP OC mensual**:
`https://transparenciachc.blob.core.windows.net/oc/[Año]-[Mes].zip`
(Ejemplo marzo 2026: `https://transparenciachc.blob.core.windows.net/oc/2026-3.zip`)

### 4.2 API de Licitaciones — Cron Horario (ACTIVAS) + Diario (NUEVAS)

**Base URL**: `http://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json`

#### 4.2.1 Modo Horario — Actualización de Licitaciones Activas

```
GET licitaciones.json?estado=activa&ticket={TICKET}
```

Objetivo: detectar cambios de estado en licitaciones ya conocidas (suspendida, prorrogada,
cerrada anticipadamente) y detectar licitaciones nuevas que acaben de publicarse.
Frecuencia: cada 60 minutos.

**Lógica de detección de cambios**:

```python
async def process_hourly_update(licitaciones_api: list[dict]) -> dict:
    """
    Para cada licitación en la respuesta:
    - Si CodigoExterno no existe en DB → nueva → upsert + trigger match
    - Si existe y CodigoEstado cambió → actualizar + generar alerta update
    - Si existe y no cambió → skip (no-op)
    Retorna: {"nuevas": N, "actualizadas": N, "sin_cambio": N}
    """
```

#### 4.2.2 Modo Diario — Ingesta por Fecha (Backfill y Consistencia)

```
GET licitaciones.json?fecha=DDMMYYYY&ticket={TICKET}
```

Objetivo: capturar con certeza todas las licitaciones publicadas el día anterior,
incluyendo las que pudieron no aparecer en los crons horarios por ventanas de
publicación o timeouts. Ejecuta a las 02:00 AM Santiago.

#### 4.2.3 Mapeo de campos API → Tabla `licitaciones`

| Campo API (JSON path) | Campo DB | Tipo DB | Notas |
|---|---|---|---|
| `Listado[].CodigoExterno` | `codigo_externo` | VARCHAR(100) UNIQUE | Clave de deduplicación |
| `Listado[].Nombre` | `titulo` | VARCHAR(255) | |
| `Listado[].CodigoEstado` | `codigo_estado` | INTEGER | Ver tabla 4.2.4 |
| `Listado[].Estado` | `estado` | VARCHAR(510) | Texto del estado |
| `Listado[].Fechas.FechaCierre` | `fecha_cierre` | TIMESTAMPTZ | **Indexada — crítica para alertas** |
| `Listado[].Fechas.FechaPublicacion` | `fecha_publicacion` | TIMESTAMPTZ | |
| `Listado[].Fechas.FechaAdjudicacion` | `fecha_adjudicacion` | TIMESTAMPTZ | |
| `Listado[].Tipo` | `tipo` | VARCHAR(10) | L1, LE, LP, LQ, LR, LS, etc. |
| `Listado[].MontoEstimado` | `monto_estimado` | NUMERIC(15,2) | |
| `Listado[].Moneda` | `moneda` | VARCHAR(10) | CLP, CLF, USD, UTM, EUR |
| `Listado[].Comprador.NombreOrganismo` | `organismo_nombre` | VARCHAR(510) | |
| `Listado[].Comprador.RegionUnidad` | `region` | VARCHAR(510) | Para filtros de alerta |
| `Listado[].Items.Listado[].CodigoCategoria` | `categorias_unspsc` | TEXT[] | Array — para matching CPV |
| `Listado[].Descripcion` | `descripcion` | TEXT | |
| `Listado[].DiasCierreLicitacion` | `dias_cierre` | INTEGER | |
| `Listado[].ExtensionPlazo` | `extension_plazo` | BOOLEAN | |

#### 4.2.4 Códigos de Estado de Licitación

| CodigoEstado | Descripción |
|---|---|
| 5 | Publicada |
| 6 | Cerrada |
| 7 | Desierta |
| 8 | Adjudicada |
| 9 | Revocada |
| 18 | Suspendida |

### 4.3 ZIP Masivo de Órdenes de Compra — Core del BI

> **El BI pre-postulación de TORDO se construye sobre el archivo ZIP mensual de OC de
> datos-abiertos.chilecompra.cl. 78 campos por transacción. Disponible gratis. Histórico
> desde 2010.**

#### 4.3.1 Campos clave del ZIP OC (78 columnas totales)

| Campo CSV | Campo DB (`ordenes_compra`) | Tipo | Uso en BI |
|---|---|---|---|
| `CodigoOC` | `codigo_oc` | VARCHAR(100) UNIQUE | Deduplicación |
| `FechaCreacion` | `fecha_creacion` | DATE | Estacionalidad por organismo |
| `NombreOrganismo` / `CodigoOrganismo` | `organismo_nombre` / `organismo_codigo` | VARCHAR | Filtro BI por comprador |
| `RubroN1` / `RubroN2` / `RubroN3` | `rubro_n1` / `rubro_n2` / `rubro_n3` | VARCHAR | Clasificación jerárquica de categoria |
| `CodigoCategoria` (UNSPSC) | `categoria_unspsc` | VARCHAR | Matching CPV |
| `NombreProductoGenerico` | `nombre_producto` | VARCHAR | TF-IDF corpus |
| `Descripcion` | `descripcion` | TEXT | TF-IDF corpus |
| `MontoTotalOC` | `monto_total` | NUMERIC(15,2) | Benchmarking de precios |
| `Moneda` | `moneda` | VARCHAR(10) | Normalización a CLP |
| `NombreProveedor` / `RutProveedor` | `proveedor_nombre` / `proveedor_rut` | VARCHAR | Mapa de competidores |
| `TipoOC` | `tipo_oc` | VARCHAR | SE, AG, CM, TD |
| `RegionUnidad` | `region` | VARCHAR | Filtro geográfico BI |

#### 4.3.2 Estrategia de ingesta incremental

```python
# etl/extractors/oc_zip_extractor.py

import httpx, zipfile, io, csv
from tenacity import retry, stop_after_attempt, wait_exponential
from datetime import date
import duckdb

OC_ZIP_URL_TEMPLATE = (
    "https://transparenciachc.blob.core.windows.net/oc/{year}-{month}.zip"
)

class OCZipExtractor:

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=30, max=300),
        reraise=True
    )
    async def download_and_load(self, year: int, month: int, duck: duckdb.DuckDBPyConnection):
        """
        Descarga el ZIP mensual de OC desde datos-abiertos.chilecompra.cl/descargas,
        parsea el CSV interno y hace append incremental en DuckDB.
        Solo inserta filas cuyo CodigoOC no exista aún (ON CONFLICT DO NOTHING).
        """
        url = OC_ZIP_URL_TEMPLATE.format(year=year, month=month)
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            csv_name = next(n for n in zf.namelist() if n.endswith(".csv"))
            raw_csv = zf.read(csv_name).decode("latin-1")

        # Carga vía DuckDB directamente desde CSV en memoria — muy rápido
        duck.execute("""
            INSERT OR IGNORE INTO ordenes_compra
            SELECT * FROM read_csv_auto(?)
        """, [raw_csv])

        logger.info("oc_zip_cargado", year=year, month=month,
                    rows=duck.execute("SELECT changes()").fetchone()[0])

    async def load_historical_range(
        self, start: date, end: date, duck: duckdb.DuckDBPyConnection
    ):
        """Carga masiva del histórico — ejecutar una sola vez en setup inicial."""
        current = date(start.year, start.month, 1)
        while current <= end:
            try:
                await self.download_and_load(current.year, current.month, duck)
            except Exception as e:
                logger.warning("oc_zip_mes_fallido", year=current.year,
                               month=current.month, error=str(e))
            current = date(current.year + (current.month // 12),
                          (current.month % 12) + 1, 1)
```

### 4.4 CSV de Estado Hábil — Estrategia Validada

**Fuente**: `https://datos-abiertos.chilecompra.cl/descargas` (CSV proveedores hábiles)  
**Frecuencia**: Descarga diaria a las 06:00 AM Santiago. Sin autenticación.

```python
# etl/extractors/estado_habil_extractor.py

class EstadoHabilExtractor:

    @retry(stop=stop_after_attempt(2),
           wait=wait_exponential(multiplier=1, min=30, max=300), reraise=True)
    async def download_csv(self) -> dict[str, dict]:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(settings.DATOS_ABIERTOS_CSV_URL)
            response.raise_for_status()

        proveedores = {}
        reader = csv.DictReader(io.StringIO(response.text))
        for row in reader:
            rut = self._normalizar_rut(row.get("rut", ""))
            if rut:
                proveedores[rut] = {
                    "estado": "habil" if row.get("estado","").lower() == "hábil"
                              else "inhabil",
                    "nombre": row.get("nombre", ""),
                    "fecha_modificacion": row.get("fecha_modificacion"),
                }
        return proveedores

    def _normalizar_rut(self, rut: str) -> str:
        rut = rut.upper().replace(".", "").strip()
        if "-" not in rut and len(rut) > 1:
            rut = rut[:-1] + "-" + rut[-1]
        return rut

    async def fetch_with_fallback(self) -> dict[str, dict]:
        try:
            return await self.download_csv()
        except Exception as e:
            logger.error("csv_estado_habil_failed", error=str(e))
            await send_ops_alert(f"⚠️ CSV estado hábil no disponible: {e}")
            return {}
```

---

## 5. Stack Tecnológico Validado

### 5.1 Tabla de Compatibilidad

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| **API Backend** | FastAPI | 0.104.1 | Async nativo |
| **ORM** | SQLAlchemy | 2.0.23 | Async con asyncpg |
| **DB Driver (sync)** | psycopg2-binary | 2.9.9 | Para Alembic (migraciones) |
| **DB Driver (async)** | asyncpg | 0.29.0 | **CRÍTICO — requerido por create_async_engine** |
| **DB Transaccional** | PostgreSQL | 15 | JSONB, pg_trgm, full-text |
| **DB Analítico (BI)** | DuckDB | 0.10.x | **NUEVO — queries OC históricas, embebido en backend** |
| **Migraciones** | Alembic | 1.12.1 | Continúa usando psycopg2 sync |
| **Task Queue** | Celery + Redis | 5.3.4 + 7 | `timezone=America/Santiago` |
| **Validación** | Pydantic v2 | 2.5.0 | Validación de RUT chileno |
| **Auth** | python-jose + bcrypt | — | + Google OAuth con authlib |
| **HTTP Client** | httpx | 0.25.2 | Async — descarga ZIPs y CSV |
| **Retry/Resiliencia** | tenacity | 8.2.3 | Backend Y ETL |
| **Matching Semántico** | scikit-learn | 1.4.x | **NUEVO — TF-IDF + cosine similarity** |
| **Rate Limiting** | slowapi | 0.1.9 | Proteger endpoints BI (costosos) |
| **Logging** | structlog | 24.x | Backend + ETL |
| **PDF validation** | pypdf | 4.2.0 | Reemplaza pypdf2 (deprecado + CVEs) |
| **File type detection** | python-magic | 0.4.27 | Validar magic bytes de uploads |
| **Email** | aiosmtplib | 3.0.1 | Migrar a SES cuando MRR > USD 1K/mes |
| **Frontend** | Next.js 14 | 14.x | App Router + SSR |
| **UI** | Tailwind CSS | 3.3.6 | Responsive, Desktop First |
| **Charts** | Recharts | 2.12.7 | Histogramas de precios históricos, mapa competidores |
| **Forms** | react-hook-form | 7.48.0 | Checklist con validación dinámica |
| **Dates** | date-fns | 2.30.0 | Siempre `America/Santiago` |
| **Infra** | Docker Compose | — | + DuckDB volume, MinIO, Flower |

### 5.2 Dependencias Nuevas — Backend (`backend/requirements.txt`)

```txt
# Almacenamiento de documentos
boto3==1.34.0

# Driver async SQLAlchemy — CRÍTICO: sin esto create_async_engine falla
asyncpg==0.29.0

# Base de datos analítica embebida — queries BI sobre OC histórico
duckdb==0.10.0

# Motor de matching semántico
scikit-learn==1.4.0
scipy==1.12.0

# OAuth
authlib==1.3.0

# Pagos
stripe==7.0.0

# Upload multipart
python-multipart==0.0.9

# Validación PDFs — pypdf2 DEPRECADO con CVEs. Usar pypdf.
pypdf==4.2.0

# Validación imágenes
Pillow==10.2.0

# Validación magic bytes (tipo real de archivo)
python-magic==0.4.27

# Resiliencia y retry
tenacity==8.2.3

# Rate limiting
slowapi==0.1.9

# Logging estructurado
structlog==24.1.0

# Monitoreo Celery
flower==2.0.1
```

### 5.3 Dependencias Nuevas — ETL (`etl/requirements.txt`)

```txt
# Resiliencia y retry
tenacity==8.2.3

# DuckDB para carga incremental de ZIPs
duckdb==0.10.0

# El resto ya existe: httpx, structlog, etc.
```

### 5.4 Dependencias Nuevas — Frontend (`frontend/package.json`)

```json
{
  "@stripe/stripe-js": "^3.0.0",
  "@stripe/react-stripe-js": "^2.0.0",
  "react-dropzone": "^14.0.0",
  "@tanstack/react-query": "^5.0.0",
  "react-hot-toast": "^2.4.0"
}
```

### 5.5 Configuración de Connection Pool — Backend (`backend/app/core/database.py`)

```python
# backend/app/core/database.py
#
# ARQUITECTURA DUAL DE DRIVERS:
# - psycopg2 (sync): Alembic migraciones únicamente
# - asyncpg (async): FastAPI y todo el código runtime
#
# REGLA: pool_size × workers_total < límite conexiones PostgreSQL
# Supabase free tier: 60 conexiones máximo
# 2 FastAPI workers + 2 Celery workers: pool_size=5 → 4×5=20 conexiones (seguro)

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import duckdb
from app.core.config import settings

# PostgreSQL — transaccional
# DATABASE_URL debe usar driver asyncpg:
# postgresql+asyncpg://user:pass@host:5432/db
engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
    echo=settings.DEBUG,
)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession,
    expire_on_commit=False, autocommit=False, autoflush=False,
)

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

# DuckDB — analítico (queries BI sobre OC histórico)
# Archivo persistido en volumen Docker. Solo lectura en API; escritura solo desde ETL.
_duck_conn: duckdb.DuckDBPyConnection | None = None

def get_duck() -> duckdb.DuckDBPyConnection:
    global _duck_conn
    if _duck_conn is None:
        _duck_conn = duckdb.connect(settings.DUCKDB_PATH, read_only=True)
    return _duck_conn
```

### 5.6 Configuración Celery — Timezone + Cron Horario

```python
# backend/app/celery_app.py

celery_app.conf.update(
    # CRÍTICO: timezone Chile. Sin esto los crons corren en UTC.
    timezone="America/Santiago",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_annotations={
        "*": {"on_failure": register_task_failure}
    },

    beat_schedule={
        # NUEVO: actualización horaria de licitaciones activas
        "etl-licitaciones-horario": {
            "task": "tasks.etl.run_licitaciones_activas_update",
            "schedule": crontab(minute=0),   # cada hora, en punto
        },
        # Backfill diario por fecha (consistencia)
        "etl-licitaciones-diario": {
            "task": "tasks.etl.run_licitaciones_diario",
            "schedule": crontab(hour=2, minute=0),   # 02:00 AM Santiago
        },
        # NUEVO: descarga ZIP OC mensual (día 2 del mes, 03:00 AM)
        "etl-oc-zip-mensual": {
            "task": "tasks.etl.run_oc_zip_mensual",
            "schedule": crontab(hour=3, minute=0, day_of_month=2),
        },
        # Estado hábil cada 6 horas
        "check-estado-habil": {
            "task": "tasks.alerts.check_estado_habil_all_users",
            "schedule": crontab(minute=0, hour="*/6"),
        },
        # Recordatorios de plazos
        "send-deadline-reminders": {
            "task": "tasks.alerts.send_deadline_reminders",
            "schedule": crontab(hour=9, minute=0),     # 09:00 AM Santiago
        },
        # Vencimiento de documentos
        "check-document-expiry": {
            "task": "tasks.alerts.check_document_expiry",
            "schedule": crontab(hour=9, minute=30),    # 09:30 AM Santiago
        },
        # Watchdog
        "watchdog": {
            "task": "tasks.monitoring.watchdog_check",
            "schedule": crontab(minute="*/30"),
        },
    },
)
```

### 5.7 Docker Compose — Servicios Nuevos

```yaml
# Agregar a infra/docker-compose.yml

  # S3-compatible local para desarrollo
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
        mc alias set local http://minio:9000 minioadmin minioadmin;
        mc mb local/tordo-documentos --ignore-existing;
        mc anonymous set none local/tordo-documentos;
      "

  # UI monitoreo Celery
  flower:
    image: mher/flower:2.0
    ports:
      - "5555:5555"
    environment:
      CELERY_BROKER_URL: ${REDIS_URL}
      FLOWER_BASIC_AUTH: admin:${FLOWER_PASSWORD}
    depends_on:
      - redis
    command: celery flower

volumes:
  minio_data:
  duckdb_data:    # Volumen persistente para el archivo DuckDB de OC histórico
```

**Variable de entorno para DuckDB**:
```bash
DUCKDB_PATH=/data/duckdb/tordo_oc.db
```

Montar el volumen `duckdb_data` en `/data/duckdb/` tanto en el contenedor `backend`
como en el contenedor `worker` (Celery). El ETL escribe; la API solo lee.

### 5.8 Servicios Cloud

| Servicio | Proveedor | Uso | Costo est. MVP |
|---|---|---|---|
| **Almacenamiento documentos** | AWS S3 o Cloudflare R2 | PDFs y docs de empresa | USD 5/mes |
| **Email** | Amazon SES | Alertas y recordatorios | USD 2/mes |
| **WhatsApp** | Twilio WABA | Alertas críticas (nueva oportunidad, estado hábil) | USD 10/mes |
| **Pagos** | Stripe | Suscripciones recurrentes | % por transacción |
| **Pagos Chile** | Transbank Webpay | Pago único local (Fase 5b, post-MVP) | % por transacción |
| **Monitoreo** | Sentry (free tier) | Error tracking backend + frontend | USD 0/mes |
| **Celery UI** | Flower | Monitoreo de tasks | USD 0 (self-hosted) |
| **Deploy MVP** | Railway o Render | Backend + Worker + ETL | USD 25/mes |
| **Frontend** | Vercel (free tier) | Next.js + SSR landing page | USD 0/mes |
| **DB** | Supabase (free → pro) | PostgreSQL 15 | USD 0–25/mes |

> **Nota WhatsApp WABA**: La aprobación de Meta toma **4 a 8 semanas**.
> **Iniciar el proceso en la Semana 0**, en paralelo con el desarrollo.

---

## 6. Modelo de Datos

### 6.1 Cambios al Esquema Existente

#### 6.1.1 Tabla `users` — MODIFICAR

```sql
ALTER TABLE users
  ADD COLUMN plan_tier              VARCHAR(20) NOT NULL DEFAULT 'basico'
                                    CHECK (plan_tier IN ('basico', 'pyme', 'pro', 'gremio')),
  ADD COLUMN stripe_customer_id     VARCHAR(255),
  ADD COLUMN stripe_subscription_id VARCHAR(255),
  ADD COLUMN onboarding_completed   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN onboarding_step        SMALLINT NOT NULL DEFAULT 0;
```

#### 6.1.2 Tabla `licitaciones` — ACTUALIZAR campos e índices

```sql
ALTER TABLE licitaciones
  ADD COLUMN IF NOT EXISTS codigo_externo      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS codigo_estado       INTEGER,
  ADD COLUMN IF NOT EXISTS tipo                VARCHAR(10),
  ADD COLUMN IF NOT EXISTS codigo_tipo         INTEGER,
  ADD COLUMN IF NOT EXISTS moneda              VARCHAR(10) DEFAULT 'CLP',
  ADD COLUMN IF NOT EXISTS organismo_codigo    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS organismo_nombre    VARCHAR(510),
  ADD COLUMN IF NOT EXISTS region              VARCHAR(510),
  ADD COLUMN IF NOT EXISTS categorias_unspsc   TEXT[],
  ADD COLUMN IF NOT EXISTS dias_cierre         INTEGER,
  ADD COLUMN IF NOT EXISTS extension_plazo     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_adjudicacion  TIMESTAMPTZ,
  -- NUEVO: timestamp de la última vez que el cron horario actualizó esta fila
  ADD COLUMN IF NOT EXISTS ultima_revision_horaria TIMESTAMPTZ;

-- Constraint de deduplicación
ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_codigo_externo_unique UNIQUE (codigo_externo);

-- Índices críticos
CREATE INDEX IF NOT EXISTS idx_licitaciones_fecha_cierre   ON licitaciones(fecha_cierre);
CREATE INDEX IF NOT EXISTS idx_licitaciones_estado         ON licitaciones(codigo_estado);
CREATE INDEX IF NOT EXISTS idx_licitaciones_tipo           ON licitaciones(tipo);
CREATE INDEX IF NOT EXISTS idx_licitaciones_region         ON licitaciones(region);
CREATE INDEX IF NOT EXISTS idx_licitaciones_categorias     ON licitaciones USING gin(categorias_unspsc);
-- NUEVO: índice para el cron horario (solo licitaciones activas)
CREATE INDEX IF NOT EXISTS idx_licitaciones_activas        ON licitaciones(codigo_estado)
    WHERE codigo_estado = 5;
```

#### 6.1.3 Tabla `alerts` — AGREGAR idempotency_key y nuevos tipos

```sql
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas_usuario(id);

ALTER TABLE alerts
  ADD CONSTRAINT alerts_idempotency_key_unique UNIQUE (idempotency_key);

ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_alert_type_check;
ALTER TABLE alerts
  ADD CONSTRAINT alerts_alert_type_check
  CHECK (alert_type IN (
      'nueva_licitacion_match',
      'licitacion_estado_cambio',
      'oportunidad_historica',
      'estado_habil_cambio',
      'plazo_cierre_48h',
      'plazo_cierre_24h',
      'documento_por_vencer',
      'documento_vencido'
  ));
```

### 6.2 Tablas NUEVAS

#### 6.2.1 `empresas_usuario`

```sql
CREATE TABLE empresas_usuario (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rut_empresa     VARCHAR(12) NOT NULL,
    nombre_empresa  VARCHAR(255) NOT NULL,
    razon_social    VARCHAR(255),
    rubros_cpv      TEXT[],     -- Códigos UNSPSC del proveedor
    regiones        TEXT[],
    email_contacto  VARCHAR(255),
    telefono        VARCHAR(20),
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    estado_habil    VARCHAR(20) NOT NULL DEFAULT 'desconocido'
                    CHECK (estado_habil IN ('habil', 'inhabil', 'no_encontrado', 'desconocido')),
    estado_habil_updated_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, rut_empresa)
);

CREATE INDEX idx_empresas_rut    ON empresas_usuario(rut_empresa);
CREATE INDEX idx_empresas_user   ON empresas_usuario(user_id);
CREATE INDEX idx_empresas_activo ON empresas_usuario(activo) WHERE activo = TRUE;
```

#### 6.2.2 `estado_habil_log`

```sql
CREATE TABLE estado_habil_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas_usuario(id) ON DELETE CASCADE,
    rut_empresa     VARCHAR(12) NOT NULL,
    estado_anterior VARCHAR(20),
    estado_nuevo    VARCHAR(20) NOT NULL,
    fuente          VARCHAR(50) DEFAULT 'csv_datos_abiertos',
    raw_response    JSONB,
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_estado_habil_empresa ON estado_habil_log(empresa_id, checked_at DESC);
```

#### 6.2.3 `documentos_empresa`

```sql
CREATE TABLE documentos_empresa (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas_usuario(id) ON DELETE CASCADE,
    nombre          VARCHAR(255) NOT NULL,
    tipo_documento  VARCHAR(50) NOT NULL
                    CHECK (tipo_documento IN (
                        'patente_comercial', 'cert_deuda_tributaria',
                        'cert_deuda_laboral', 'declaracion_jurada',
                        'cert_experiencia', 'cert_vigencia_sociedad',
                        'balance', 'otro'
                    )),
    s3_key          VARCHAR(500) NOT NULL,
    s3_bucket       VARCHAR(100) NOT NULL,
    mime_type       VARCHAR(100)
                    CHECK (mime_type IN (
                        'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
                    )),
    tamano_bytes    BIGINT CHECK (tamano_bytes <= 26214400),
    fecha_emision   DATE,
    fecha_vencimiento DATE,
    esta_vigente    BOOLEAN GENERATED ALWAYS AS (
                        fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE
                    ) STORED,
    eliminado       BOOLEAN NOT NULL DEFAULT FALSE,
    eliminado_at    TIMESTAMPTZ,
    notas           TEXT,
    uploaded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_docs_empresa     ON documentos_empresa(empresa_id) WHERE eliminado = FALSE;
CREATE INDEX idx_docs_vencimiento ON documentos_empresa(fecha_vencimiento)
    WHERE fecha_vencimiento IS NOT NULL AND eliminado = FALSE;
```

#### 6.2.4 `postulaciones`

```sql
CREATE TABLE postulaciones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas_usuario(id) ON DELETE CASCADE,
    licitacion_id   UUID NOT NULL REFERENCES licitaciones(id),
    estado          VARCHAR(30) NOT NULL DEFAULT 'en_seguimiento'
                    CHECK (estado IN (
                        'en_seguimiento', 'en_preparacion', 'enviada',
                        'adjudicada', 'no_adjudicada', 'descartada'
                    )),
    notas           TEXT,
    recordatorio_activo BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(empresa_id, licitacion_id)
);

CREATE INDEX idx_postulaciones_empresa ON postulaciones(empresa_id);
CREATE INDEX idx_postulaciones_activas ON postulaciones(empresa_id, estado)
    WHERE estado IN ('en_seguimiento', 'en_preparacion');
```

#### 6.2.5 `checklist_postulacion`

```sql
CREATE TABLE checklist_postulacion (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    postulacion_id  UUID NOT NULL REFERENCES postulaciones(id) ON DELETE CASCADE,
    descripcion     VARCHAR(500) NOT NULL,
    es_obligatorio  BOOLEAN NOT NULL DEFAULT TRUE,
    completado      BOOLEAN NOT NULL DEFAULT FALSE,
    completado_at   TIMESTAMPTZ,
    completado_by   UUID REFERENCES users(id),
    documento_id    UUID REFERENCES documentos_empresa(id),
    orden           SMALLINT NOT NULL DEFAULT 0,
    notas           TEXT
);

CREATE INDEX idx_checklist_postulacion ON checklist_postulacion(postulacion_id);
```

#### 6.2.6 `plantillas_checklist`

```sql
CREATE TABLE plantillas_checklist (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_licitacion VARCHAR(10) NOT NULL
                    CHECK (tipo_licitacion IN (
                        'L1', 'LE', 'LP', 'LQ', 'LR', 'LS',
                        'E2', 'CO', 'B2', 'H2', 'I2', 'GENERICO'
                    )),
    nombre_item     VARCHAR(500) NOT NULL,
    descripcion     TEXT,
    es_obligatorio  BOOLEAN NOT NULL DEFAULT TRUE,
    orden           SMALLINT NOT NULL DEFAULT 0,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    aplica_si_monto_mayor NUMERIC(15, 2),
    aplica_si_unspsc TEXT[],
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plantillas_tipo ON plantillas_checklist(tipo_licitacion, activo)
    WHERE activo = TRUE;
```

#### 6.2.7 `tfidf_perfiles` — Matching Semántico

```sql
-- Almacena el vector TF-IDF serializado por empresa para matching rápido.
-- El modelo se reentrena tras cada carga mensual de ZIP OC.
CREATE TABLE tfidf_perfiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas_usuario(id) ON DELETE CASCADE UNIQUE,
    vector_bytes    BYTEA NOT NULL,        -- numpy array serializado con pickle/joblib
    rubros_usados   TEXT[],
    modelo_version  VARCHAR(50) NOT NULL,  -- hash del corpus de entrenamiento
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 6.2.8 `task_failures` — Dead Letter Queue

```sql
CREATE TABLE task_failures (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_name   VARCHAR(255) NOT NULL,
    task_args   JSONB,
    error_msg   TEXT,
    failed_at   TIMESTAMPTZ DEFAULT NOW(),
    resolved    BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_task_failures_unresolved ON task_failures(failed_at DESC)
    WHERE resolved = FALSE;
```

#### 6.2.9 `ordenes_compra` — Tabla DuckDB (no PostgreSQL)

> **Esta tabla vive en DuckDB** (`DUCKDB_PATH`), no en PostgreSQL. El acceso de escritura
> es exclusivo del ETL (Celery worker). El backend API la accede en modo read-only para
> queries de BI.

```sql
-- Crear en DuckDB al inicializar el volumen (etl/setup_duckdb.py)
CREATE TABLE IF NOT EXISTS ordenes_compra (
    codigo_oc           VARCHAR PRIMARY KEY,
    fecha_creacion      DATE,
    organismo_nombre    VARCHAR,
    organismo_codigo    VARCHAR,
    region              VARCHAR,
    rubro_n1            VARCHAR,
    rubro_n2            VARCHAR,
    rubro_n3            VARCHAR,
    categoria_unspsc    VARCHAR,
    nombre_producto     VARCHAR,
    descripcion         VARCHAR,
    monto_total         DECIMAL(15, 2),
    moneda              VARCHAR(10),
    proveedor_nombre    VARCHAR,
    proveedor_rut       VARCHAR,
    tipo_oc             VARCHAR(10),   -- SE, AG, CM, TD
    anio                INTEGER,       -- columna derivada para particionado
    mes                 INTEGER        -- columna derivada para particionado
);

-- Índices DuckDB (columnar — muy rápidos en scans analíticos)
CREATE INDEX IF NOT EXISTS idx_oc_organismo   ON ordenes_compra(organismo_codigo);
CREATE INDEX IF NOT EXISTS idx_oc_rubro       ON ordenes_compra(rubro_n2);
CREATE INDEX IF NOT EXISTS idx_oc_proveedor   ON ordenes_compra(proveedor_rut);
CREATE INDEX IF NOT EXISTS idx_oc_fecha       ON ordenes_compra(fecha_creacion);
```

### 6.3 Diagrama Entidad-Relación

```
users (1) ──────────────────────────── (N) empresas_usuario
                                               │
               ┌───────────────────────────────┼──────────────────────┐
               │                              │                       │
               ▼                              ▼                       ▼
   estado_habil_log             documentos_empresa             postulaciones
                                                                      │
                                                         ┌────────────┤
                                                         │            │
                                                         ▼            ▼
                                            checklist_postulacion  licitaciones
                                                                   (tabla existente
                                                                    + campos API)

empresas_usuario (1) ── (1) tfidf_perfiles

users (1) ──── (N) alert_preferences
users (1) ──── (N) alerts (+ idempotency_key)
               task_failures (DLQ global)

DuckDB (separado):
ordenes_compra   ← ZIP masivo mensual (78 cols, histórico 2010–presente)
                 ← Queries BI vía /api/bi/*
```

---

## 7. Seguridad y Cumplimiento

### 7.1 Manejo de Documentos Sensibles

```python
# backend/app/services/document_service.py

from pathlib import PurePosixPath
import hashlib, magic
from fastapi import HTTPException

class DocumentService:

    ALLOWED_MIME_TYPES = {
        "application/pdf", "image/jpeg", "image/png", "image/webp",
    }
    MAX_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB

    def generate_upload_url(self, empresa_id: str, filename: str,
                            content_type: str) -> dict:
        if content_type not in self.ALLOWED_MIME_TYPES:
            raise HTTPException(400, f"Tipo no permitido: {content_type}")

        safe_filename = hashlib.sha256(filename.encode()).hexdigest()[:16]
        s3_key = f"empresas/{empresa_id}/docs/{uuid4()}/{safe_filename}"

        url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': settings.S3_BUCKET, 'Key': s3_key,
                'ContentType': content_type,
                'ServerSideEncryption': 'AES256',
                'ContentLengthRange': (1, self.MAX_SIZE_BYTES),
            },
            ExpiresIn=300
        )
        return {"upload_url": url, "s3_key": s3_key}

    def _validate_s3_key_ownership(self, s3_key: str, empresa_id: str) -> None:
        """CRÍTICO: No usar assert (desactivable con -O). Validación explícita."""
        expected_prefix = f"empresas/{empresa_id}/"
        normalized = str(PurePosixPath(s3_key))
        if not normalized.startswith(expected_prefix):
            raise HTTPException(403, "Acceso denegado")

    def validate_file_magic_bytes(self, file_bytes: bytes, claimed_mime: str) -> bool:
        detected = magic.from_buffer(file_bytes[:2048], mime=True)
        return detected == claimed_mime
```

### 7.2 Autenticación y Autorización por Plan

```python
PLAN_ORDER = ['basico', 'pyme', 'pro', 'gremio', 'admin']

# Restricciones por plan:
# basico:   5 alertas activas/mes, sin upload docs, sin checklist, BI limitado (1 query/día)
# pyme:     ilimitado, 1 empresa, BI completo (benchmarking + competidores)
# pro:      ilimitado, hasta 3 empresas, + matching semántico avanzado
# gremio:   ilimitado, hasta 20 empresas, tablero multi-empresa + reportes sectoriales
```

### 7.3 Stripe Webhook — Verificación de Firma

```python
@router.post("/billing/webhook")
async def stripe_webhook(request: Request):
    """CRÍTICO: Sin verificación de firma cualquier actor puede escalar su plan."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(400, "Missing stripe-signature")
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError as e:
        raise HTTPException(400, "Invalid signature")

    if event["type"] == "customer.subscription.updated":
        await billing_service.update_plan_tier(event["data"]["object"])
    elif event["type"] == "customer.subscription.deleted":
        await billing_service.downgrade_to_basico(event["data"]["object"])

    return {"received": True}
```

### 7.4 Idempotencia de Alertas

```python
class AlertService:

    async def create_alert_idempotent(
        self, db: AsyncSession, empresa_id: str,
        alert_type: str, context_date: date, metadata: dict = None
    ) -> bool:
        key_content = f"{empresa_id}:{alert_type}:{context_date.isoformat()}"
        idempotency_key = hashlib.sha256(key_content.encode()).hexdigest()

        stmt = insert(Alert).values(
            empresa_id=empresa_id, alert_type=alert_type,
            idempotency_key=idempotency_key, metadata=metadata or {},
        ).on_conflict_do_nothing(index_elements=["idempotency_key"])

        result = await db.execute(stmt)
        return result.rowcount > 0
```

### 7.5 Rate Limiting — Endpoints BI (queries DuckDB son costosas)

```python
@router.get("/bi/benchmarking")
@limiter.limit("20/minute")
async def get_benchmarking(licitacion_id: str, empresa_id: str, request: Request):
    ...

@router.get("/bi/competidores")
@limiter.limit("20/minute")
async def get_competidores(rubro: str, organismo: str, request: Request):
    ...

@router.post("/documentos/upload-url")
@limiter.limit("20/minute")
async def get_upload_url(request: Request):
    ...
```

### 7.6 Protección de Datos (Ley 19.628 Chile)

- **RUT de empresa**: No loggear en texto plano. Solo IDs y metadata en logs.
- **Exportación**: `GET /api/empresa/export` para exportar todos los datos del usuario.
- **Eliminación**: `DELETE /api/empresa` — cascada + activar S3 lifecycle.
- **Retención**: Documentos eliminados 90 días después de cancelar cuenta.

---

## 8. Roadmap de Desarrollo

### Principio rector: **Strangler Fig Pattern + Validación antes de construir**

> **Antes de escribir código de BI**: completar el Hito 0 de validación técnica (ver abajo).
> Un concierge MVP manual (DuckDB local + reporte manual) debe preceder al desarrollo del
> pipeline automatizado.

---

### Hito 0 — Validación Técnica y Concierge MVP (Semana 0–1, OBLIGATORIO)

**Objetivo**: Validar que los datos históricos son accionables antes de comprometer 10 semanas de desarrollo.

- [ ] **0.1** Descargar los ZIPs OC del último año desde `datos-abiertos.chilecompra.cl/descargas`. Cargar en DuckDB local. Ejecutar:
  ```sql
  SELECT organismo_nombre, rubro_n2,
         STDDEV(monto_total) / AVG(monto_total) AS coef_variacion,
         COUNT(*) AS n
  FROM ordenes_compra
  GROUP BY organismo_nombre, rubro_n2
  HAVING COUNT(*) > 3
  ORDER BY coef_variacion ASC;
  ```
  **Go/No-Go**: Si ≥30% de combinaciones organismo-rubro tienen CV < 40%, el precio de corte es predecible y el BI tiene valor real.
- [ ] **0.2** Descargar CSV estado hábil. Parsear 3 RUTs de empresas conocidas. Validar estructura, encodings. Documentar en `docs/data_discovery.md`.
- [ ] **0.3** Concierge MVP manual: seleccionar 5 PYMES en un rubro específico. Entregar manualmente cada semana: reporte de competidores + benchmarking de precios + lista de licitaciones abiertas matching. Cobrar USD 20/mes desde el primer mes. **Go/No-Go**: 3/5 pagan mes 2 sin incentivo adicional.
- [ ] **0.4** Crear rama `v1-tordo` desde `main`.
- [ ] **0.5** Desactivar en `docker-compose.yml` ETL de órdenes de compra legacy.
- [ ] **0.6** Ocultar `/dashboard/analytics` con `ANALYTICS_ENABLED=false`.
- [ ] **0.7** **Reemplazar `pypdf2` por `pypdf==4.2.0`**.
- [ ] **0.8** Agregar dependencias backend: `asyncpg`, `duckdb`, `scikit-learn`, `scipy`, `boto3`, `authlib`, `stripe`, `slowapi`, `tenacity`, `structlog`, `python-magic`, `flower`.
- [ ] **0.9** Agregar `tenacity`, `duckdb` a `etl/requirements.txt`.
- [ ] **0.10** Agregar servicios `minio`, `minio-init`, `flower` y volumen `duckdb_data` a `docker-compose.yml`.
- [ ] **0.11** **Iniciar proceso de aprobación de WhatsApp WABA** (toma 4–8 semanas).
- [ ] **0.12** Actualizar `celery_app.py`: `timezone=America/Santiago`, `task_acks_late=True`, agregar cron horario de licitaciones y cron mensual ZIP OC.
- [ ] **0.13** Crear/actualizar `core/database.py` con pool config, `create_async_engine` y `get_duck()`.
- [ ] **0.14** Crear `etl/setup_duckdb.py` para inicializar el schema DuckDB en el volumen.
- [ ] **0.15** Agregar tabla `task_failures` como primera migración Alembic.
- [ ] **0.16** Actualizar `.env.example` (ver sección 9.6).

---

### Fase 1 — Pipeline BI Histórico + Dashboard (Semanas 2–4) · 12 días

**Objetivo**: El core diferenciador de BI funciona con datos reales. Primera demo accionable.

- [ ] **1.1** `OCZipExtractor`: descarga ZIP mensual de OC, parsea 78 col, carga en DuckDB.
- [ ] **1.2** Carga histórica inicial: último año (12 ZIPs). Documentar tiempo de ejecución.
- [ ] **1.3** `BIService.benchmarking_precios(organismo_codigo, rubro_n2, fecha_desde)` — query DuckDB: rango percentil 25–75 de montos, n transacciones.
- [ ] **1.4** `BIService.mapa_competidores(rubro_n2, organismo_codigo)` — query DuckDB: top proveedores adjudicados.
- [ ] **1.5** `TFIDFMatcher`: entrenamiento inicial sobre corpus de `nombre_producto` + `descripcion` de OC. Serializar modelo en `tfidf_perfiles`.
- [ ] **1.6** Crear `backend/app/api/bi.py`:
  - `GET /api/bi/benchmarking?licitacion_id=X` — retorna rango de precios históricos.
  - `GET /api/bi/competidores?rubro=X&organismo=Y` — retorna top competidores.
  - `GET /api/bi/matching?empresa_id=X` — retorna licitaciones similares al perfil.
- [ ] **1.7** Celery task `run_oc_zip_mensual` con patrón `asyncio.run()`.
- [ ] **1.8** Frontend — Panel `/bi`: histograma de precios + tabla de competidores + score de oportunidad (v1 simple: alineación de precio).
- [ ] **1.9** Frontend — Widget de BI en `/licitaciones/[codigo]`: "Este organismo paga entre $X–$Y por este tipo de servicio."

---

### Fase 2 — ETL Horario + Motor de Alertas (Semanas 4–5) · 8 días

**Objetivo**: Los usuarios reciben alertas de nuevas oportunidades en < 2 horas desde la publicación.

- [ ] **2.1** `LicitacionExtractor.fetch_activas()` — GET con `?estado=activa`. Lógica de detección de cambios vs. PostgreSQL.
- [ ] **2.2** Celery task `run_licitaciones_activas_update` — cron horario. Patrón `asyncio.run()`.
- [ ] **2.3** Trigger post-detección: `MatchingService.match_nueva_licitacion(licitacion)` — compara categorías CPV y TF-IDF con perfiles de empresas registradas.
- [ ] **2.4** `AlertService.create_alert_idempotent()` para tipo `nueva_licitacion_match`.
- [ ] **2.5** Tests: verificar que el cron horario no genera alertas duplicadas en reintentos Celery.
- [ ] **2.6** Watchdog task: verificar que `run_licitaciones_activas_update` ejecutó en los últimos 90 minutos.

---

### Fase 3 — Empresa, Estado Hábil y Documentos (Semanas 5–7) · 10 días

- [ ] **3.1** Migración Alembic: `empresas_usuario`, `estado_habil_log`, `documentos_empresa`, `tfidf_perfiles`. Columnas nuevas en `licitaciones` y `alerts`.
- [ ] **3.2** `backend/app/api/empresas.py`: CRUD empresa con validación de RUT.
- [ ] **3.3** `EstadoHabilExtractor` + Celery task `check_estado_habil_all_users`.
- [ ] **3.4** `DocumentService` con `generate_upload_url()` y `_validate_s3_key_ownership()` explícita.
- [ ] **3.5** Celery task `check_document_expiry` (09:30 AM Santiago).
- [ ] **3.6** Frontend — Widget `<EstadoHabilBadge>` + página `/documentos`.

---

### Fase 4 — Checklist de Postulaciones (Semanas 7–8) · 8 días

- [ ] **4.1** Migración: `postulaciones`, `checklist_postulacion`, `plantillas_checklist`.
- [ ] **4.2** Poblar `plantillas_checklist` con datos reales por tipo (L1/LE/LP). **Requiere input de analista de licitaciones.**
- [ ] **4.3** `ChecklistService.generate_from_template()`.
- [ ] **4.4** `backend/app/api/postulaciones.py`.
- [ ] **4.5** Celery task `send_deadline_reminders` (09:00 AM Santiago).
- [ ] **4.6** Frontend — Detalle de licitación: botón "Analizar con TORDO", checklist con progress bar.

---

### Fase 5 — Dashboard, Onboarding y Billing (Semanas 8–10) · 10 días

- [ ] **5.1** Dashboard: widget "¿Conviene postular?" (benchmarking quick-view) → próximos plazos → estado hábil → alertas.
- [ ] **5.2** Flujo `/onboarding` 5 pasos: RUT → estado hábil → rubros CPV → demo BI → primera alerta.
- [ ] **5.3** Redirect a `/onboarding` si `onboarding_completed=false` al login.
- [ ] **5.4** Stripe: productos Básico (free), PYME (USD 25), Pro (USD 55), Gremio (USD 150).
- [ ] **5.5** `backend/app/api/billing.py` con webhook verificado por firma.
- [ ] **5.6** Middleware de plan en endpoints BI (query count limit para plan Básico).
- [ ] **5.7** Transbank Webpay (Fase 5b, post-MVP).

---

### Fase 6 — Google OAuth + WhatsApp (Semana 11) · 4 días

> **Prerequisito**: proceso WABA iniciado en Semana 0.

- [ ] **6.1** Google OAuth con `authlib`.
- [ ] **6.2** Twilio WABA para alertas críticas (nueva oportunidad, estado hábil).
- [ ] **6.3** Fallback automático a email.

---

### Resumen del Roadmap

```
Semana 0–1:  [HITO 0] Validación datos + Concierge MVP + Setup técnico + iniciar WABA
Semana 2–4:  [FASE 1] Pipeline BI histórico ZIP OC + TF-IDF + Dashboard BI
Semana 4–5:  [FASE 2] ETL horario licitaciones activas + Motor de alertas
Semana 5–7:  [FASE 3] Empresa + Estado Hábil + Documentos
Semana 7–8:  [FASE 4] Checklist de Postulaciones
Semana 8–10: [FASE 5] Dashboard final + Onboarding + Billing Stripe
Semana 11:   [FASE 6] Google OAuth + WhatsApp
─────────────────────────────────────────────────────────────────
Total: ~11 semanas · ~55 días de desarrollo
Con 1 dev full-stack senior: ~3 meses
```

---

## 9. Estándares de Calidad y Arquitectura

### 9.1 Arquitectura: Monolito Modular

```
backend/app/
├── api/           → Solo llama a Services. Sin lógica de negocio.
├── services/      → Lógica de negocio
│                    bi_service.py (DuckDB queries)
│                    tfidf_matcher.py (matching semántico)
│                    alert_engine.py, alert_service.py (idempotency)
│                    document_service.py, checklist_service.py
│                    estado_habil_service.py
├── models/        → SQLAlchemy ORM. Sin lógica de negocio.
├── schemas/       → DTOs Pydantic. Separados de modelos ORM.
├── tasks/         → Workers Celery. Solo invocan Services.
│                    etl_tasks.py (horario + diario + mensual ZIP)
│                    alert_tasks.py (estado hábil, plazos, documentos)
│                    matching_tasks.py (reentrenamiento TF-IDF)
│                    monitoring_tasks.py (watchdog)
└── core/          → Infraestructura transversal
                     database.py (asyncpg pool + DuckDB get_duck)
                     security.py, email.py, config.py
                     metrics.py, logging_config.py
```

**Regla de dependencias**: `api → services → models`. Nunca al revés.

### 9.2 Patrón Correcto para Celery Tasks con Código Async

> **CRÍTICO — BUG COMÚN**: Las Celery tasks son `def` síncronas. Usar `await` dentro de un
> `def` task lanza `RuntimeError: no running event loop`. El patrón correcto es `asyncio.run()`.

```python
# backend/app/tasks/etl_tasks.py

@celery_app.task(
    bind=True, max_retries=3, default_retry_delay=300,
    acks_late=True, on_failure=register_task_failure
)
def run_licitaciones_activas_update(self):
    """
    Task SÍNCRONA. Envuelve código async con asyncio.run().
    Ejecuta cada hora. Detecta nuevas licitaciones y cambios de estado.
    """
    try:
        result = asyncio.run(_licitaciones_activas_async())
        logger.info("licitaciones_horario_ok", **result)
    except Exception as exc:
        logger.error("licitaciones_horario_failed", error=str(exc))
        raise self.retry(exc=exc)


async def _licitaciones_activas_async() -> dict:
    extractor = LicitacionExtractor()
    licitaciones_api = await extractor.fetch_activas()

    nuevas = actualizadas = 0
    async with AsyncSessionLocal() as db:
        for raw in licitaciones_api:
            data = extractor.transform_api_to_db(raw)
            existing = await db.execute(
                select(Licitacion).where(
                    Licitacion.codigo_externo == data["codigo_externo"]
                )
            )
            row = existing.scalar_one_or_none()

            if row is None:
                # Nueva licitación
                nueva = Licitacion(**data,
                                   ultima_revision_horaria=datetime.utcnow())
                db.add(nueva)
                await db.flush()
                await matching_service.match_nueva_licitacion(db, nueva)
                nuevas += 1
            elif row.codigo_estado != data.get("codigo_estado"):
                # Cambio de estado
                row.codigo_estado = data["codigo_estado"]
                row.ultima_revision_horaria = datetime.utcnow()
                await alert_service.create_alert_idempotent(
                    db, empresa_id=None,
                    alert_type="licitacion_estado_cambio",
                    context_date=date.today(),
                    metadata={"codigo_externo": data["codigo_externo"],
                              "nuevo_estado": data["codigo_estado"]}
                )
                actualizadas += 1
        await db.commit()

    redis_client.set("last_run:etl_licitaciones_horario", time.time(), ex=7200)
    return {"nuevas": nuevas, "actualizadas": actualizadas,
            "total_api": len(licitaciones_api)}


@celery_app.task(bind=True, acks_late=True, on_failure=register_task_failure)
def run_oc_zip_mensual(self):
    """Descarga ZIP OC del mes anterior y lo carga en DuckDB."""
    try:
        today = date.today()
        mes_anterior = date(today.year, today.month - 1 if today.month > 1
                           else 12, 1)
        asyncio.run(_oc_zip_async(mes_anterior.year, mes_anterior.month))
    except Exception as exc:
        raise self.retry(exc=exc)


async def _oc_zip_async(year: int, month: int):
    duck = duckdb.connect(settings.DUCKDB_PATH)
    extractor = OCZipExtractor()
    await extractor.download_and_load(year, month, duck)
    duck.close()
    # Reentrenar TF-IDF con corpus actualizado
    await tfidf_matcher.reentrenar_todos_los_perfiles()
```

**Aplicar el mismo patrón** a `check_estado_habil_all_users`, `send_deadline_reminders`,
`check_document_expiry` y `reentrenar_tfidf`.

### 9.3 Motor de Matching Semántico TF-IDF

```python
# backend/app/services/tfidf_matcher.py

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import joblib, io, duckdb

class TFIDFMatcher:
    """
    Entrena sobre corpus de títulos históricos de OC.
    Sin LLM — TF-IDF + cosine similarity resuelve el 80% del matching
    semántico sin costo de modelo. Upgrade a sentence-transformers en v2.
    """

    async def reentrenar_todos_los_perfiles(self):
        """Reentrenar tras cada carga mensual de ZIP OC."""
        duck = duckdb.connect(settings.DUCKDB_PATH, read_only=True)
        corpus = duck.execute("""
            SELECT nombre_producto || ' ' || COALESCE(descripcion, '') AS texto,
                   rubro_n2
            FROM ordenes_compra
            WHERE fecha_creacion >= CURRENT_DATE - INTERVAL '24 months'
        """).fetchall()
        duck.close()

        textos = [row[0] for row in corpus]
        vectorizer = TfidfVectorizer(
            max_features=50_000, ngram_range=(1, 2),
            min_df=2, strip_accents="unicode"
        )
        matrix = vectorizer.fit_transform(textos)

        model_version = hashlib.md5(
            str(len(textos)).encode()
        ).hexdigest()[:12]

        async with AsyncSessionLocal() as db:
            empresas = await db.execute(
                select(EmpresaUsuario).where(EmpresaUsuario.activo == True)
            )
            for empresa in empresas.scalars():
                perfil_texto = " ".join(empresa.rubros_cpv or [])
                if not perfil_texto:
                    continue
                perfil_vector = vectorizer.transform([perfil_texto])
                vector_bytes = io.BytesIO()
                joblib.dump(perfil_vector, vector_bytes)

                await db.merge(TFIDFPerfil(
                    empresa_id=empresa.id,
                    vector_bytes=vector_bytes.getvalue(),
                    modelo_version=model_version,
                    rubros_usados=empresa.rubros_cpv,
                ))
            await db.commit()

    async def match_nueva_licitacion(
        self, db: AsyncSession, licitacion: Licitacion
    ) -> list[str]:
        """
        Retorna lista de empresa_ids cuyo perfil TF-IDF tiene
        cosine similarity > 0.15 con el texto de la nueva licitación.
        """
        vectorizer = self._get_cached_vectorizer()
        texto_lic = f"{licitacion.titulo} {licitacion.descripcion or ''}"
        lic_vector = vectorizer.transform([texto_lic])

        perfiles = await db.execute(select(TFIDFPerfil))
        matches = []
        for perfil in perfiles.scalars():
            empresa_vector = joblib.load(io.BytesIO(perfil.vector_bytes))
            score = cosine_similarity(lic_vector, empresa_vector)[0][0]
            if score > 0.15:
                matches.append(str(perfil.empresa_id))
        return matches
```

### 9.4 Queries BI — DuckDB

```python
# backend/app/services/bi_service.py

class BIService:

    def get_benchmarking_precios(
        self, organismo_codigo: str, rubro_n2: str,
        meses_historico: int = 24
    ) -> dict:
        """
        Retorna rango percentil 25–75 de precios históricos para el par
        organismo + rubro. < 50ms en DuckDB para millones de filas.
        """
        duck = get_duck()  # read-only connection
        result = duck.execute("""
            SELECT
                PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY monto_total) AS p25,
                PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY monto_total) AS mediana,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY monto_total) AS p75,
                AVG(monto_total)  AS promedio,
                COUNT(*)          AS n_transacciones,
                MIN(fecha_creacion) AS desde,
                MAX(fecha_creacion) AS hasta
            FROM ordenes_compra
            WHERE organismo_codigo = ?
              AND rubro_n2 = ?
              AND fecha_creacion >= CURRENT_DATE - INTERVAL ? MONTH
              AND monto_total > 0
        """, [organismo_codigo, rubro_n2, meses_historico]).fetchone()

        return {
            "p25": result[0], "mediana": result[1], "p75": result[2],
            "promedio": result[3], "n": result[4],
            "periodo": {"desde": str(result[5]), "hasta": str(result[6])}
        }

    def get_competidores(
        self, rubro_n2: str, organismo_codigo: str = None,
        top_n: int = 10, meses: int = 12
    ) -> list[dict]:
        """Top proveedores adjudicados en el rubro (+ organismo opcional)."""
        duck = get_duck()
        filtro_org = "AND organismo_codigo = ?" if organismo_codigo else ""
        params = [rubro_n2, meses] + ([organismo_codigo] if organismo_codigo else []) + [top_n]

        rows = duck.execute(f"""
            SELECT proveedor_nombre, proveedor_rut,
                   COUNT(*) AS n_oc,
                   SUM(monto_total) AS monto_total,
                   COUNT(DISTINCT organismo_codigo) AS n_organismos
            FROM ordenes_compra
            WHERE rubro_n2 = ?
              AND fecha_creacion >= CURRENT_DATE - INTERVAL ? MONTH
              {filtro_org}
            GROUP BY proveedor_nombre, proveedor_rut
            ORDER BY n_oc DESC
            LIMIT ?
        """, params).fetchall()

        return [
            {"nombre": r[0], "rut": r[1], "n_oc": r[2],
             "monto_total": r[3], "n_organismos": r[4]}
            for r in rows
        ]
```

### 9.5 ETL con Retry y Fallback

```python
# etl/extractors/licitacion_extractor.py

class LicitacionExtractor:

    API_BASE = "http://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json"

    @retry(stop=stop_after_attempt(3),
           wait=wait_exponential(multiplier=1, min=4, max=60), reraise=True)
    async def fetch_activas(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                self.API_BASE,
                params={"estado": "activa",
                        "ticket": settings.MERCADOPUBLICO_API_TICKET}
            )
            response.raise_for_status()
            return response.json().get("Listado", [])

    @retry(stop=stop_after_attempt(3),
           wait=wait_exponential(multiplier=1, min=4, max=60), reraise=True)
    async def fetch_by_date(self, fecha: date) -> list[dict]:
        fecha_str = fecha.strftime("%d%m%Y")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                self.API_BASE,
                params={"fecha": fecha_str,
                        "ticket": settings.MERCADOPUBLICO_API_TICKET}
            )
            response.raise_for_status()
            return response.json().get("Listado", [])

    def transform_api_to_db(self, raw: dict) -> dict:
        return {
            "codigo_externo":    raw.get("CodigoExterno"),
            "titulo":            raw.get("Nombre"),
            "codigo_estado":     raw.get("CodigoEstado"),
            "estado":            raw.get("Estado"),
            "tipo":              raw.get("Tipo"),
            "monto_estimado":    raw.get("MontoEstimado"),
            "moneda":            raw.get("Moneda", "CLP"),
            "organismo_codigo":  raw.get("Comprador", {}).get("CodigoOrganismo"),
            "organismo_nombre":  raw.get("Comprador", {}).get("NombreOrganismo"),
            "region":            raw.get("Comprador", {}).get("RegionUnidad"),
            "fecha_cierre":      self._parse_dt(
                                    raw.get("Fechas", {}).get("FechaCierre")),
            "fecha_publicacion": self._parse_dt(
                                    raw.get("Fechas", {}).get("FechaPublicacion")),
            "dias_cierre":       raw.get("DiasCierreLicitacion"),
            "extension_plazo":   bool(raw.get("ExtensionPlazo", 0)),
            "categorias_unspsc": [
                item.get("CodigoCategoria")
                for item in raw.get("Items", {}).get("Listado", [])
                if item.get("CodigoCategoria")
            ],
        }
```

### 9.6 Variables de Entorno (`.env.example`)

```bash
# === DATABASE ===
# CRÍTICO: +asyncpg para runtime async. Alembic usa DATABASE_URL_SYNC (sin +asyncpg).
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/tordo
DATABASE_URL_SYNC=postgresql://user:pass@localhost:5432/tordo

# DuckDB — archivo persistido en volumen Docker
DUCKDB_PATH=/data/duckdb/tordo_oc.db

# === AUTH ===
SECRET_KEY=change-me-in-production-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# === GOOGLE OAUTH ===
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# === REDIS / CELERY ===
REDIS_URL=redis://localhost:6379/0

# === S3 / DOCUMENTOS ===
S3_BUCKET=tordo-documentos
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
# Para desarrollo local con MinIO:
S3_ENDPOINT_URL=http://localhost:9000

# === STRIPE ===
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PYME=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_GREMIO=price_...

# === NOTIFICACIONES ===
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=alertas@tordo.cl
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# === ETL — API MERCADO PÚBLICO ===
MERCADOPUBLICO_API_TICKET=

# === ETL — DATOS ABIERTOS CHILECOMPRA ===
# URL directa — sin autenticación. Apunta al portal de descargas.
DATOS_ABIERTOS_BASE_URL=https://datos-abiertos.chilecompra.cl/descargas
DATOS_ABIERTOS_CSV_HABILES_URL=https://datos-abiertos.chilecompra.cl/descargas
OC_ZIP_URL_TEMPLATE=https://transparenciachc.blob.core.windows.net/oc/{year}-{month}.zip

# === FLOWER ===
FLOWER_PASSWORD=change-me

# === APP ===
# Nombre del producto — PLACEHOLDER hasta que se defina el nombre comercial final
APP_NAME=TORDO
CORS_ORIGINS=http://localhost:3000,https://tordo.cl
DEBUG=false
ANALYTICS_ENABLED=false
```

### 9.7 Testing Mínimo para Production-Ready

| Tipo | Cobertura mínima | Herramienta |
|---|---|---|
| Unit tests (BIService) | Queries DuckDB con fixtures de OC | pytest + duckdb in-memory |
| Unit tests (TFIDFMatcher) | Matching con corpus pequeño sintético | pytest + scikit-learn |
| Integration tests (API BI) | `/api/bi/benchmarking`, `/api/bi/competidores` | pytest + httpx |
| ETL tests — ZIP OC | Parseo de ZIP real con 100 filas de fixture | pytest |
| ETL tests — CSV estado hábil | Parseo con fixture real | pytest |
| ETL tests — cron horario | Detección de nuevas vs. actualizadas | pytest + mock API |
| Celery async pattern | `asyncio.run()` envuelve código async | pytest + celery test mode |
| Alert idempotency | Reintentos no generan duplicados | pytest + celery test mode |
| Frontend E2E | Flujo onboarding + BI demo | Playwright |

---

## 10. Política de Datos, Backups y Cuotas

### 10.1 Backups

| Parámetro | MVP | > USD 3K MRR |
|---|---|---|
| PostgreSQL | Snapshot diario (Supabase Pro), 7 días | Cada 6h, 30 días |
| DuckDB | Backup diario del archivo `.db` a S3 | Backup cada 6h |
| Test de restauración | Mensual a staging | Quincenal |
| RTO objetivo | 4 horas | 2 horas |

### 10.2 S3 Lifecycle Policies

```json
{
  "Rules": [
    {
      "ID": "delete-cancelled-users-docs",
      "Status": "Enabled",
      "Filter": { "Prefix": "empresas/cancelled/" },
      "Expiration": { "Days": 90 }
    },
    {
      "ID": "delete-soft-deleted-docs",
      "Status": "Enabled",
      "Filter": { "Tag": { "Key": "soft-deleted", "Value": "true" } },
      "Expiration": { "Days": 30 }
    },
    {
      "ID": "archive-old-docs",
      "Status": "Enabled",
      "Filter": { "Prefix": "empresas/" },
      "Transitions": [
        { "Days": 365, "StorageClass": "STANDARD_IA" },
        { "Days": 730, "StorageClass": "GLACIER" }
      ]
    }
  ]
}
```

### 10.3 Cuotas por Plan

| Plan | Docs máx. | Tamaño máx./doc | Almacenamiento | Alertas activas | Queries BI/día |
|---|---|---|---|---|---|
| Básico | 5 | 5 MB | 25 MB | 5 | 3 |
| PYME | 50 | 25 MB | 500 MB | Ilimitadas | 50 |
| Pro | 200 | 25 MB | 2 GB | Ilimitadas | Ilimitadas |
| Gremio | 1.000 | 25 MB | 10 GB | Ilimitadas | Ilimitadas |

### 10.4 Comportamiento cuando Plan Básico supera límites

- La alerta/query **se bloquea** con estado `bloqueada_por_plan`.
- En el dashboard, banner: *"Has alcanzado tu límite del plan Básico. Actualiza para continuar."*
- Si hace upgrade, las alertas bloqueadas pendientes se procesan inmediatamente.

Este comportamiento convierte el límite en un punto de conversión, no en una pérdida silenciosa.

---

## Apéndice A: Resumen Ejecutivo para el Desarrollador

> **Si solo lees una página de este documento, que sea esta.**

**Lo que tienes hoy**: Un SaaS funcional para buscar y monitorear licitaciones (LicitaFácil v2.2). Stack correcto, código limpio.

**Lo que debes construir**: TORDO — un "sistema de inteligencia pre-postulación + backoffice de cumplimiento" para PYMES. El cambio no es de stack sino de *qué problema resuelve*: de "descubrir oportunidades" a "decidir si postular y no cometer errores de forma".

**Los 3 diferenciadores reales de TORDO**:

1. **BI pre-postulación sobre ZIP masivo OC** — "Este organismo paga entre $2.5M–$4M por este servicio. Tu cotización de $5M queda fuera de rango." Datos de `datos-abiertos.chilecompra.cl/descargas`, 78 col/OC, gratis, histórico desde 2010. Sin esto TORDO no tiene moat.
2. **Matching semántico TF-IDF** — sugiere licitaciones similares al perfil histórico del proveedor. Sin LLM. Corre en el backend con scikit-learn.
3. **Alertas de nueva oportunidad en < 2 horas** — cron horario contra API de licitaciones activas, matching con perfil CPV + TF-IDF, WhatsApp/email inmediato.

**No construyas primero**: checklist de documentos, estado hábil como feature principal, IA de chat. El BI es el moat — va primero.

**Antes de escribir código**: Hito 0 es obligatorio. Descargar ZIPs del último año, cargar en DuckDB local, generar un reporte manual de competidores + benchmarking para 5 PYMES, cobrar USD 20/mes. Si 3/5 pagan el mes 2, construir. Si no, reformular.

**El cron horario de licitaciones** (`*/60 min`) detecta nuevas publicaciones y cambios de estado. El cron diario (02:00 AM) hace backfill por fecha para consistencia.

**El cron mensual de ZIP OC** (día 2 del mes, 03:00 AM) descarga el mes anterior desde `datos-abiertos.chilecompra.cl/descargas` vía GET directo y lo appenda en DuckDB. Tras la carga, reentrenar el modelo TF-IDF.

**Los horarios de Celery son en hora Santiago** (`America/Santiago`), no UTC.

**El patrón de Celery async es `asyncio.run(_async_fn())`**, nunca `await` en un `def` task.

**`DATABASE_URL` necesita `+asyncpg`**: `postgresql+asyncpg://...`

**DuckDB es de solo lectura en la API**; solo el worker ETL escribe. Ambos comparten el mismo volumen Docker.

**Nombre del producto**: "TORDO" es un **placeholder** hasta que se defina el nombre comercial final. Usar `APP_NAME` en todos los emails, títulos y mensajes.

---

## Apéndice B: Log de Cambios LicitaFácil v2.2 → TORDO v1.0

| # | Tipo | Descripción | Sección |
|---|---|---|---|
| C1 | CAMBIO CORE | Nueva propuesta de valor: BI pre-postulación (ZIP OC 78 col) como diferenciador principal | 1, 3, 6 |
| C2 | CAMBIO CORE | Pipeline ETL ZIP OC mensual desde datos-abiertos.chilecompra.cl/descargas | 4.3, 8 Fase 1 |
| C3 | CAMBIO CORE | DuckDB embebido para queries analíticas sobre OC histórico | 5, 6.2.9 |
| C4 | CAMBIO CORE | Motor de matching semántico TF-IDF (sin LLM) | 5, 6.2.7, 9.3 |
| C5 | CAMBIO CORE | ETL horario de licitaciones activas (cada 60 min) + detección de nuevas | 3.2, 4.2, 5.6, 9.2 |
| C6 | CAMBIO | Planes renombrados: free→Básico, pyme→PYME, pro→Pro, contador→Gremio | 7.2, 10.3 |
| C7 | CAMBIO | Dashboard centrado en BI pre-postulación, no en estado hábil | 1.4, 8 Fase 5 |
| C8 | CAMBIO | Roadmap reordenado: BI histórico primero, compliance segundo | 8 |
| C9 | MEJORA | Hito 0 de validación técnica (DuckDB local + concierge MVP) como prerequisito | 8 |
| H1 | HEREDADO | asyncpg requerido por create_async_engine | 5.2 |
| H2 | HEREDADO | Patrón asyncio.run() en Celery tasks | 9.2 |
| H3 | HEREDADO | Idempotency_key en alertas | 6.1.3, 7.4 |
| H4 | HEREDADO | timezone=America/Santiago en Celery | 5.6 |
| H5 | HEREDADO | pypdf==4.2.0 (reemplaza pypdf2 deprecado) | 1.5 |
| H6 | HEREDADO | Stripe webhook con verificación de firma | 7.3 |
| H7 | HEREDADO | python-magic para validación de magic bytes | 7.1 |
| H8 | HEREDADO | tenacity en ETL y backend | 5.2, 9.5 |
| H9 | HEREDADO | MinIO + Flower en docker-compose | 5.7 |
| H10 | HEREDADO | Validación explícita de ownership S3 (sin assert) | 7.1 |

---

*TORDO SPEC.md v1.0 · Marzo 2026 · Confidencial*  
*Propuesta de valor: BI pre-postulación accionable + compliance operativo para PYMES proveedoras del Estado chileno*  
*Fuente de datos core: ZIP masivo OC de datos-abiertos.chilecompra.cl/descargas (78 col, histórico desde 2010)*