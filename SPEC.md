# SPEC.md — TORDO v1.1
## Especificaciones Técnicas de Producto

> **Versión**: 1.1 · **Fecha**: Marzo 2026 · **Estado**: Aprobado para desarrollo
> **Autor técnico**: Senior Software Architect
> **Documento fuente de negocio**: tordo_plan_saas_v3.md (Marzo 2026)
>
> **Changelog v1.1** (desde v1.0):
> - Arquitectura analítica corregida: DuckDB reemplazado por **Polars + Parquet** como
>   motor batch de analytics. 15 módulos de analytics construidos y validados.
> - URLs de descarga corregidas: `oc-da/` y `lic-da/` (no `oc/`).
> - Hito 0 actualizado con resultados reales de validación (CV < 40 % falla a nivel
>   rubro, pero bandas de precio producto+organismo cubren 46.6 % del mercado).
> - TF-IDF rediseñado: modelo standalone con sparse matrix (.npz) sobre 97K proveedores.
> - Datos LIC elevados a fuente de datos equivalente a OC (alimentan 5+ módulos).
> - Nuevo módulo de BI pre-postulación documentado con 15 indicadores.
> - Roadmap actualizado: pipeline analytics ya construido; falta integración API.
>
> **Nombre del producto**: "TORDO" se usa como **placeholder**. Usar `APP_NAME` / `BRAND_NAME`
> para facilitar cambio posterior.

---

## Tabla de Contenidos

1. [Propuesta de Valor y Gap Analysis](#1-propuesta-de-valor-y-gap-analysis)
2. [Decisión de Dispositivo: Mobile vs. Desktop](#2-decisión-de-dispositivo)
3. [Arquitectura de Sistema](#3-arquitectura-de-sistema)
4. [Fuentes de Datos — Referencia Validada](#4-fuentes-de-datos--referencia-validada)
5. [Stack Tecnológico Validado](#5-stack-tecnológico-validado)
6. [Modelo de Datos](#6-modelo-de-datos)
7. [Seguridad y Cumplimiento](#7-seguridad-y-cumplimiento)
8. [Pipeline de Analytics — Módulos BI](#8-pipeline-de-analytics--módulos-bi)
9. [Roadmap de Desarrollo](#9-roadmap-de-desarrollo)
10. [Estándares de Calidad y Arquitectura](#10-estándares-de-calidad-y-arquitectura)
11. [Política de Datos, Backups y Cuotas](#11-política-de-datos-backups-y-cuotas)

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

### 1.3 Validación de Datos — Resultados Reales (Hito 0 completado)

> **El Hito 0 de validación técnica fue completado sobre datos reales 2018–2026.**
> Los resultados corrigen las hipótesis iniciales del plan de negocio.

**Test original**: "Si ≥30 % de combinaciones organismo-rubro tienen CV < 40 %, el precio
de corte es predecible y el BI tiene valor real."

**Resultado**: **FALLA a nivel rubro** — solo 4.8 % de pares organismo-rubro tienen CV < 40 %.
A nivel de rubro, los precios son demasiado dispersos para hacer predicciones útiles.

**Pero**: A nivel de **producto específico + organismo + unidad de medida**, el 46.6 % de
las combinaciones tienen un ratio IQR ≤ 3×. Es decir: "este hospital compra este reactivo
a $800–$1,200 por unidad" es una afirmación útil y confiable para casi la mitad del mercado.

**Replanteamiento del BI**: El valor no está en "predecir el precio exacto" sino en
"dar un rango de referencia por producto y comprador". Este reencuadre guía toda la
arquitectura analítica.

| Indicador validado | Valor | Implicación |
|---|---|---|
| Bandas de precio L1 (producto+organismo+unidad) | 722K bandas, 73K con confianza ≥ 0.5 | Core del BI: "Este hospital paga $X–$Y por este producto" |
| Bandas de precio L3 (producto nacional) | 51K bandas | Fallback útil cuando no hay datos del organismo |
| Mercados con concentración HHI | 46 % concentrados, 34 % competitivos | Señal de oportunidad real para nuevos entrantes |
| Proveedores con perfil TF-IDF | 97K con corpus textual | Matching semántico funciona a escala |
| Sectores evaluados | 9 sectores, Salud = $45.8T CLP | Los sectores son suficientemente distintos para segmentar |
| Organismos con buyer score | 1,303 evaluados | Scoring de compradores diferencia calidad de clientes |

### 1.4 Componentes REUTILIZABLES de LicitaFácil

| Componente | Archivo(s) | Justificación |
|---|---|---|
| **FastAPI Backend** | `backend/app/main.py`, `config.py`, `celery_app.py` | Monolito modular. Reutilizar al 100%. |
| **Sistema JWT Auth** | `backend/app/core/security.py` | Sólido. Agregar Google OAuth. |
| **Email Notifications** | `backend/app/core/email.py` | Reutilizable. Extender con plantillas de alertas BI. |
| **Celery + Redis** | `backend/app/tasks/`, `docker-compose.yml` | Arquitectura de jobs periódicos correcta. |
| **Alert Engine core** | `backend/app/services/alert_engine.py` | Motor de matching existe. Extender con TF-IDF. |
| **Next.js App Router shell** | `frontend/app/layout.tsx`, `AuthContext.tsx` | Reutilizable. |
| **Docker Compose** | `infra/docker-compose.yml` | Extender con nuevos servicios. |
| **Migrations Alembic** | `backend/alembic/` | Mantener historial. |

### 1.5 Componentes que DEBEN SER MODIFICADOS

| Componente | Cambio Requerido | Prioridad |
|---|---|---|
| **Dashboard UI** | Rediseñar centrado en BI pre-postulación. Widget principal: "¿Conviene postular?" con benchmarking + competidores + checklist. | P0 |
| **Alert Engine** | Agregar tipos: `NUEVA_LICITACION_MATCH`, `OPORTUNIDAD_HISTORICA`, `PLAZO_CIERRE_48H`, `PLAZO_CIERRE_24H`, `ESTADO_HABIL_CAMBIO`, `DOCUMENTO_VENCIDO`. **Agregar idempotency_key.** | P0 |
| **ETL Licitaciones** | Cambiar de cron diario a **cron horario** para licitaciones activas. | P0 |
| **ETL nuevo: Descarga masiva OC + LIC** | Pipeline de descarga bulk desde blob storage de ChileCompra → consolidación en parquets mensuales → analytics batch con Polars. | P0 |
| **Matching Semántico** | Servicio `TFIDFMatcher`: entrena sobre historial OC, sugiere licitaciones similares al perfil del proveedor. | P0 |
| **Modelo `users`** | Agregar `rut_empresa`, `nombre_empresa`, `plan_tier`, `rubros_cpv`, `regiones`. | P0 |
| **`core/database.py`** | Configurar connection pool explícito con `asyncpg`. | P0 |
| **Modelo `alerts`** | Extender `alert_type` enum. **Agregar columna `idempotency_key` UNIQUE.** | P0 |

### 1.6 Componentes que DEBEN SER DESCARTADOS

| Componente | Motivo |
|---|---|
| **Analytics page** (`/dashboard/analytics`) | Reemplazada por BI pre-postulación. Proteger con `ANALYTICS_ENABLED=false`. |
| **`licitaciones_detalle` y `ordenes_compra_detalle` (blobs JSON)** | Deprecar. Los datos se normalizan en parquets. |
| **`useDashboardCollections` (localStorage)** | Reemplazar por tabla `postulaciones` en DB. |
| **`pypdf2`** | **CRÍTICO**: deprecado con CVEs. Reemplazar por `pypdf==4.2.0`. |

---

## 2. Decisión de Dispositivo

### Veredicto: **Desktop First con Diseño Responsivo + PWA en v3**

El flujo de trabajo de TORDO implica acciones naturalmente desktop:

- **Consulta de BI pre-postulación**: comparar precios históricos, analizar competidores.
- **Completar checklist de anexos**: formulario con múltiples ítems y adjuntos.
- **Carga de documentos**: archivos del SII, PDFs de bases técnicas.

**¿Dónde SÍ aplica mobile?**

- **Consumo de alertas**: vía WhatsApp y email.
- **Revisar score de una oportunidad**: vista de solo lectura.
- **Ver próximos plazos**: calendario de deadlines.

El stack (Next.js + Tailwind CSS responsive) lo soporta sin cambio. PWA va en v3.

---

## 3. Arquitectura de Sistema

### 3.1 Diagrama Lógico de Módulos

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        FUENTES EXTERNAS VALIDADAS                         │
│                                                                           │
│  ┌────────────────────────────────────┐  ┌────────────────────────────┐  │
│  │  API Mercado Público (ACTIVA)      │  │  Blob Storage ChileCompra  │  │
│  │  api.mercadopublico.cl/            │  │  transparenciachc.blob.    │  │
│  │  servicios/v1/publico/             │  │  core.windows.net/         │  │
│  │  licitaciones.json                 │  │                            │  │
│  │  ?estado=activa&ticket=XXX         │  │  · /oc-da/{Y}-{M}.zip     │  │
│  │  ?fecha=DDMMYYYY&ticket=XXX        │  │  · /lic-da/{Y}-{M}.zip    │  │
│  │                                    │  │  · CSV Estado Hábil diario │  │
│  │  Cron HORARIO para activas         │  │  (sin autenticación)       │  │
│  │  Cron DIARIO para nuevas por fecha │  │                            │  │
│  └───────────────┬────────────────────┘  └──────────────┬─────────────┘  │
└──────────────────┼──────────────────────────────────────┼────────────────┘
                   │                                       │
                   ▼                                       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     CAPA ETL + ANALYTICS (Python + Polars)                │
│                                                                           │
│  ┌──────────────────────────┐  ┌────────────────────────────────────┐    │
│  │  LicitacionExtractor     │  │  Descarga Masiva OC + LIC          │    │
│  │  · Cron horario:         │  │  descargar_datos_masivos.py         │    │
│  │    GET ?estado=activa    │  │  · Descarga ZIPs OC y LIC desde     │    │
│  │    → detectar nuevas     │  │    blob storage ChileCompra         │    │
│  │    → trigger alertas     │  │  · Consolida en parquets mensuales  │    │
│  │  · Cron diario (02:00):  │  │    etl/data/consolidated/oc/*.pqt   │    │
│  │    GET ?fecha=DDMMYYYY   │  │    etl/data/consolidated/lic/*.pqt  │    │
│  │  · Retry x3 + backoff    │  │  · 78 columnas OC, ~30 cols LIC    │    │
│  └──────────────┬───────────┘  └──────────────────┬─────────────────┘    │
│                 │                                  │                      │
│  ┌──────────────┴──────────────────────────────────┴─────────────────┐   │
│  │               ANALYTICS PIPELINE (Polars batch)                    │   │
│  │                                                                    │   │
│  │  15 módulos — map-reduce sobre parquets mensuales.                │   │
│  │  Output: etl/data/analytics/*.parquet                              │   │
│  │                                                                    │   │
│  │  Precio:        product_price_bands (L1/L2/L3), price_benchmarking│   │
│  │  Competencia:   competitor_analysis, competitor_predictor           │   │
│  │  Compradores:   buyer_scoring, buyer_transparency                  │   │
│  │  Mercado:       seasonality, trend_analysis, sector_intelligence   │   │
│  │  Matching:      tfidf_matcher, word_clustering                     │   │
│  │  Decisión:      opportunity_scorer, discount_optimizer             │   │
│  │  Operacional:   preparation_window, provider_diversification       │   │
│  │                                                                    │   │
│  │  Ejecutar: python -m etl.analytics.run_all                        │   │
│  │  Individual: python -m etl.analytics.run_all --modulo <nombre>    │   │
│  └────────────────────────────────────────────┬──────────────────────┘   │
│                                                │                         │
│  ┌──────────────┐                              │                         │
│  │  EstadoHabil │                              │                         │
│  │  Extractor   │                              │                         │
│  │  · Cron 6h   │                              │                         │
│  │  · CSV diario│                              │                         │
│  └──────┬───────┘                              │                         │
│         └─────────────────────┬────────────────┘                         │
└───────────────────────────────┼──────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     ALMACENAMIENTO DUAL                                   │
│                                                                           │
│  PostgreSQL 15 (transaccional):                                          │
│  users, empresas_usuario, licitaciones, alertas (+ idempotency_key),     │
│  alert_preferences, estado_habil_log, documentos_empresa,                │
│  checklist_postulacion, postulaciones, tfidf_perfiles, task_failures     │
│                                                                           │
│  Parquet Files (analítico — BI):                                         │
│  etl/data/consolidated/oc/*.parquet   — OC histórico por mes (78 cols)   │
│  etl/data/consolidated/lic/*.parquet  — LIC histórico por mes            │
│  etl/data/analytics/*.parquet         — outputs de analytics pipeline    │
│  etl/data/analytics/tfidf_*.joblib    — modelo TF-IDF serializado        │
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
│  /api/alerts     │  │  check_estado_habil │  │                          │
│  /api/billing    │  │  (6h)               │  │                          │
│                  │  │  analytics_refresh   │  │                          │
│  Lee parquets de │  │  (semanal o mensual) │  │                          │
│  analytics/ vía  │  │  watchdog (30min)   │  │                          │
│  BIService       │  │                     │  │                          │
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
│  [codigo]           + checklist de anexos + ventana de preparación        │
│  /bi              → BI pre-postulación: precios, competidores, tendencias│
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
                      → Si es nueva → upsert + trigger matching TF-IDF
                      → Si estado cambió → actualizar + generar alerta
                      → matching_service.match_nueva_licitacion(licitacion)
                      → crear alerta NUEVA_LICITACION_MATCH con idempotency_key

[Cron 02:00 SCL]      → ETL extrae licitaciones del día anterior por fecha
                      → Upsert en PostgreSQL (clave: CodigoExterno UNIQUE)

[Cron mensual]        → Descarga ZIP mensual OC + LIC desde:
                        https://transparenciachc.blob.core.windows.net/oc-da/{Y}-{M}.zip
                        https://transparenciachc.blob.core.windows.net/lic-da/{Y}-{M}.zip
                      → Consolida en parquets mensuales (Polars)
                      → Ejecuta pipeline analytics (15 módulos)
                      → Outputs en etl/data/analytics/*.parquet
                      → BIService recarga datos actualizados

[Cron 06:00 SCL]      → ETL descarga CSV estado hábil
                      → Para cada empresa registrada: buscar RUT en CSV
                      → Si cambió → alerta ESTADO_HABIL_CAMBIO

[Cron 09:00 SCL]      → Revisar postulaciones activas
                      → Si fecha_cierre - hoy <= 2 días → alerta PLAZO_48H
                      → Si fecha_cierre - hoy <= 1 día  → alerta PLAZO_24H

[Cron 09:30 SCL]      → Revisar documentos con fecha_vencimiento próxima

[Cron */30 min]       → Watchdog: verificar que tasks críticas corrieron

[Usuario web — BI]    → GET /api/bi/benchmarking?producto=X&organismo=Y
                      → BIService lee product_price_bands_L1.parquet
                      → GET /api/bi/competidores?rubro=X&organismo=Y
                      → BIService lee competitors_by_market.parquet
                      → GET /api/bi/matching?empresa_id=X
                      → TF-IDF cosine similarity con modelo pre-entrenado
                      → GET /api/bi/oportunidad?licitacion_id=X
                      → BIService combina: precio + competencia + ventana + tendencia
```

### 3.3 Resiliencia y Observabilidad

#### Estrategia de resiliencia

| Componente | Estrategia de fallo | Fallback |
|---|---|---|
| API Mercado Público (cron horario) | Retry x3, backoff exponencial (4s → 60s) | Log + skip ciclo; compensar en cron diario 02:00 |
| API Mercado Público (cron diario) | Retry x3, backoff exponencial | ZIP mensual de blob storage |
| ZIP OC/LIC mensual | Retry x2, wait 30 min | Mantener último histórico; alerta a ops |
| CSV Estado Hábil | Retry x2, circuit breaker | Mantener último estado en DB + alerta ops |
| Analytics pipeline | Log + continuar siguiente módulo | Datos anteriores siguen disponibles |
| Twilio WhatsApp | Retry x1 | Degradar a email |
| Amazon SES | Retry x3 | Log en DB + visible en dashboard |

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

#### Métricas mínimas a exponer

```python
METRICAS = {
    "etl_licitaciones_hourly_processed": "Gauge — validar cron horario",
    "etl_licitaciones_nuevas_detected":  "Counter — nuevas licitaciones detectadas",
    "analytics_pipeline_duration_s":     "Gauge — duración del pipeline batch",
    "analytics_modules_completed":       "Counter — módulos completados por ejecución",
    "bi_query_duration_ms":              "Histogram — SLA de queries BI",
    "alerts_sent_total":                 "Counter — validar que el sistema envía",
    "estado_habil_checks_failed":        "Counter — detectar degradación",
    "tfidf_retraining_duration_seconds": "Histogram — detectar degradación",
}
```

---

## 4. Fuentes de Datos — Referencia Validada

### 4.1 Descarga de Datos Abiertos — URLs Validadas

**Blob storage**: `https://transparenciachc.blob.core.windows.net/`

Todas las descargas son accesibles vía GET sin autenticación. Los meses NO tienen zero-padding
(`2024-3.zip`, no `2024-03.zip`).

| Dataset | URL pattern | Frecuencia | Uso en TORDO |
|---|---|---|---|
| **Órdenes de Compra (ZIP)** | `/oc-da/{year}-{month}.zip` | Mensual | Core BI: bandas de precio, competidores, TF-IDF |
| **Licitaciones (ZIP)** | `/lic-da/{year}-{month}.zip` | Mensual | Descuento óptimo, predictor competidores, transparencia, ventanas |
| **Proveedores Hábiles (CSV)** | Portal datos-abiertos | Diaria | Monitor estado hábil |

**Script de descarga**: `etl/scripts/descargar_datos_masivos.py`
```bash
# Descargar y consolidar todo
python etl/scripts/descargar_datos_masivos.py --tipo ambos --year-min 2018

# Solo OC
python etl/scripts/descargar_datos_masivos.py --tipo oc --year-min 2018

# Solo descarga (sin consolidar)
python etl/scripts/descargar_datos_masivos.py --tipo ambos --solo-descarga
```

**Output**: Parquets mensuales en:
- `etl/data/consolidated/oc/{year}-{month}.parquet` — 78 columnas por OC
- `etl/data/consolidated/lic/{year}-{month}.parquet` — ~30 columnas por licitación

### 4.2 API de Licitaciones — Cron Horario (ACTIVAS) + Diario (NUEVAS)

**Base URL**: `http://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json`

#### 4.2.1 Modo Horario — Actualización de Licitaciones Activas

```
GET licitaciones.json?estado=activa&ticket={TICKET}
```

Objetivo: detectar cambios de estado y nuevas licitaciones. Cada 60 minutos.

#### 4.2.2 Modo Diario — Ingesta por Fecha (Backfill)

```
GET licitaciones.json?fecha=DDMMYYYY&ticket={TICKET}
```

Ejecuta a las 02:00 AM Santiago. Captura licitaciones que pudieron no aparecer en crons horarios.

#### 4.2.3 Mapeo de campos API → Tabla `licitaciones`

| Campo API | Campo DB | Tipo DB |
|---|---|---|
| `Listado[].CodigoExterno` | `codigo_externo` | VARCHAR(100) UNIQUE |
| `Listado[].Nombre` | `titulo` | VARCHAR(255) |
| `Listado[].CodigoEstado` | `codigo_estado` | INTEGER |
| `Listado[].Tipo` | `tipo` | VARCHAR(10) |
| `Listado[].MontoEstimado` | `monto_estimado` | NUMERIC(15,2) |
| `Listado[].Moneda` | `moneda` | VARCHAR(10) |
| `Listado[].Comprador.NombreOrganismo` | `organismo_nombre` | VARCHAR(510) |
| `Listado[].Comprador.RegionUnidad` | `region` | VARCHAR(510) |
| `Listado[].Items.Listado[].CodigoCategoria` | `categorias_unspsc` | TEXT[] |
| `Listado[].Fechas.FechaCierre` | `fecha_cierre` | TIMESTAMPTZ |
| `Listado[].Fechas.FechaPublicacion` | `fecha_publicacion` | TIMESTAMPTZ |

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

> **78 campos por transacción. Disponible gratis. Histórico desde 2007.**

#### Campos clave del ZIP OC usados en analytics

| Campo CSV (original) | Uso en analytics |
|---|---|
| `codigoProductoONU` | Agrupar bandas de precio por producto |
| `NombreroductoGenerico` | TF-IDF corpus, clustering |
| `CodigoOrganismoPublico` / `OrganismoPublico` | Bandas L1, buyer scoring |
| `CodigoProveedor` / `NombreProveedor` | Competidores, diversificación |
| `MontoTotalOC_PesosChilenos` | Precio benchmarking, tendencias |
| `precioNeto` / `cantidad` / `UnidadMedida` | Precio unitario → bandas de producto |
| `RubroN1` / `RubroN2` / `RubroN3` | Segmentación por categoría |
| `sector` | Inteligencia sectorial |
| `RegionUnidadCompra` | Cobertura geográfica |
| `FechaEnvio` / `FechaAceptacion` | Velocidad de pago (buyer scoring) |
| `Estado` | Tasa aceptación/cancelación |

### 4.4 ZIP Masivo de Licitaciones — Fuente Complementaria

> **Elevada a fuente de datos de primera clase en v1.1. Alimenta 5 módulos analytics.**

| Campo CSV (original) | Uso en analytics |
|---|---|
| `CodigoExterno` | Deduplicación de licitaciones |
| `CodigoTipo` | LE/LP/LQ/LR/LS/TD — segmentación de ventanas y descuentos |
| `NumeroOferentes` | Predictor de competidores |
| `MontoEstimado` / `MontoLineaAdjudica` | Cálculo de descuento óptimo |
| `FechaCreacion` / `FechaCierre` | Clasificador de ventana de preparación |
| `Estado` | Tasa adjudicación, tasa fracaso |
| `CodigoOrganismo` / `sector` | Transparencia del comprador |
| `CodigoProveedor` | HHI concentración de adjudicaciones |

### 4.5 CSV de Estado Hábil

**Fuente**: Portal datos abiertos ChileCompra (CSV proveedores hábiles)
**Frecuencia**: Descarga diaria a las 06:00 AM Santiago. Sin autenticación.

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
| **Analytics Engine** | Polars | ≥ 1.0.0 | **Reemplaza DuckDB para batch analytics** |
| **Data Format** | Apache Parquet | via pyarrow 14.0.1 | Almacenamiento columnar para OC/LIC/analytics |
| **Migraciones** | Alembic | 1.12.1 | Continúa usando psycopg2 sync |
| **Task Queue** | Celery + Redis | 5.3.4 + 7 | `timezone=America/Santiago` |
| **Validación** | Pydantic v2 | 2.5.0 | Validación de RUT chileno |
| **Auth** | python-jose + bcrypt | — | + Google OAuth con authlib |
| **HTTP Client** | httpx | 0.25.2 | Async — descarga ZIPs y CSV |
| **Retry/Resiliencia** | tenacity | 8.2.3 | Backend Y ETL |
| **Matching Semántico** | scikit-learn | ≥ 1.3.0 | TF-IDF + cosine similarity |
| **ML auxiliar** | scipy | ≥ 1.11.0 | Log-normal model para precios |
| **Serialización ML** | joblib | ≥ 1.3.0 | Serializar modelo TF-IDF |
| **Rate Limiting** | slowapi | 0.1.9 | Proteger endpoints BI |
| **PDF validation** | pypdf | 4.2.0 | Reemplaza pypdf2 (deprecado + CVEs) |
| **File type detection** | python-magic | 0.4.27 | Validar magic bytes |
| **Frontend** | Next.js 14 | 14.x | App Router + SSR |
| **UI** | Tailwind CSS | 3.3.6 | Responsive, Desktop First |
| **Charts** | Recharts | 2.12.7 | Histogramas precios, mapa competidores |
| **Infra** | Docker Compose | — | MinIO, Flower |

> **Nota sobre DuckDB**: v1.0 del SPEC planeaba DuckDB embebido como motor de queries BI.
> En la implementación, Polars demostró ser superior para el caso de uso real: batch analytics
> sobre parquets mensuales con schema drift entre años. DuckDB queda como opción futura para
> queries ad-hoc en la API si se necesitan consultas que no cubren los analytics pre-computados.

### 5.2 Dependencias — ETL + Analytics (`etl/requirements.txt`)

```txt
polars>=1.0.0
pyarrow==14.0.1
scikit-learn>=1.3.0
scipy>=1.11.0
joblib>=1.3.0
httpx>=0.25.0
tenacity>=8.2.0
```

### 5.3 Dependencias — Backend (`backend/requirements.txt`)

```txt
asyncpg==0.29.0
boto3==1.34.0
scikit-learn==1.4.0
scipy==1.12.0
authlib==1.3.0
stripe==7.0.0
python-multipart==0.0.9
pypdf==4.2.0
Pillow==10.2.0
python-magic==0.4.27
tenacity==8.2.3
slowapi==0.1.9
structlog==24.1.0
flower==2.0.1
polars>=1.0.0         # Para leer analytics parquets en BIService
pyarrow==14.0.1
```

### 5.4 Configuración de Connection Pool — Backend

```python
# backend/app/core/database.py
#
# ARQUITECTURA DUAL DE DRIVERS:
# - psycopg2 (sync): Alembic migraciones únicamente
# - asyncpg (async): FastAPI y todo el código runtime
#
# REGLA: pool_size × workers_total < límite conexiones PostgreSQL

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,  # postgresql+asyncpg://...
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
```

### 5.5 Configuración Celery — Timezone + Crons

```python
celery_app.conf.update(
    timezone="America/Santiago",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_annotations={"*": {"on_failure": register_task_failure}},

    beat_schedule={
        "etl-licitaciones-horario": {
            "task": "tasks.etl.run_licitaciones_activas_update",
            "schedule": crontab(minute=0),
        },
        "etl-licitaciones-diario": {
            "task": "tasks.etl.run_licitaciones_diario",
            "schedule": crontab(hour=2, minute=0),
        },
        "check-estado-habil": {
            "task": "tasks.alerts.check_estado_habil_all_users",
            "schedule": crontab(minute=0, hour="*/6"),
        },
        "send-deadline-reminders": {
            "task": "tasks.alerts.send_deadline_reminders",
            "schedule": crontab(hour=9, minute=0),
        },
        "check-document-expiry": {
            "task": "tasks.alerts.check_document_expiry",
            "schedule": crontab(hour=9, minute=30),
        },
        "watchdog": {
            "task": "tasks.monitoring.watchdog_check",
            "schedule": crontab(minute="*/30"),
        },
    },
)
```

> **Analytics refresh** no es un cron beat — se ejecuta manualmente o con un task dedicado
> tras la descarga mensual de nuevos ZIPs:
> `python -m etl.analytics.run_all`

---

## 6. Modelo de Datos

### 6.1 Tabla `users` — MODIFICAR

```sql
ALTER TABLE users
  ADD COLUMN plan_tier              VARCHAR(20) NOT NULL DEFAULT 'basico'
                                    CHECK (plan_tier IN ('basico', 'pyme', 'pro', 'gremio')),
  ADD COLUMN stripe_customer_id     VARCHAR(255),
  ADD COLUMN stripe_subscription_id VARCHAR(255),
  ADD COLUMN onboarding_completed   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN onboarding_step        SMALLINT NOT NULL DEFAULT 0;
```

### 6.2 Tabla `licitaciones` — ACTUALIZAR

```sql
ALTER TABLE licitaciones
  ADD COLUMN IF NOT EXISTS codigo_externo      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS codigo_estado       INTEGER,
  ADD COLUMN IF NOT EXISTS tipo                VARCHAR(10),
  ADD COLUMN IF NOT EXISTS moneda              VARCHAR(10) DEFAULT 'CLP',
  ADD COLUMN IF NOT EXISTS organismo_codigo    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS organismo_nombre    VARCHAR(510),
  ADD COLUMN IF NOT EXISTS region              VARCHAR(510),
  ADD COLUMN IF NOT EXISTS categorias_unspsc   TEXT[],
  ADD COLUMN IF NOT EXISTS dias_cierre         INTEGER,
  ADD COLUMN IF NOT EXISTS fecha_adjudicacion  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultima_revision_horaria TIMESTAMPTZ;

ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_codigo_externo_unique UNIQUE (codigo_externo);

CREATE INDEX IF NOT EXISTS idx_licitaciones_fecha_cierre ON licitaciones(fecha_cierre);
CREATE INDEX IF NOT EXISTS idx_licitaciones_activas      ON licitaciones(codigo_estado)
    WHERE codigo_estado = 5;
```

### 6.3 Tabla `alerts` — AGREGAR idempotency_key

```sql
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas_usuario(id);

ALTER TABLE alerts
  ADD CONSTRAINT alerts_idempotency_key_unique UNIQUE (idempotency_key);
```

### 6.4 Tablas NUEVAS

#### `empresas_usuario`

```sql
CREATE TABLE empresas_usuario (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rut_empresa     VARCHAR(12) NOT NULL,
    nombre_empresa  VARCHAR(255) NOT NULL,
    rubros_cpv      TEXT[],
    regiones        TEXT[],
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    estado_habil    VARCHAR(20) NOT NULL DEFAULT 'desconocido'
                    CHECK (estado_habil IN ('habil', 'inhabil', 'no_encontrado', 'desconocido')),
    estado_habil_updated_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, rut_empresa)
);
```

#### `estado_habil_log`

```sql
CREATE TABLE estado_habil_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas_usuario(id) ON DELETE CASCADE,
    rut_empresa     VARCHAR(12) NOT NULL,
    estado_anterior VARCHAR(20),
    estado_nuevo    VARCHAR(20) NOT NULL,
    fuente          VARCHAR(50) DEFAULT 'csv_datos_abiertos',
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `documentos_empresa`

```sql
CREATE TABLE documentos_empresa (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas_usuario(id) ON DELETE CASCADE,
    nombre          VARCHAR(255) NOT NULL,
    tipo_documento  VARCHAR(50) NOT NULL,
    s3_key          VARCHAR(500) NOT NULL,
    s3_bucket       VARCHAR(100) NOT NULL,
    mime_type       VARCHAR(100),
    tamano_bytes    BIGINT CHECK (tamano_bytes <= 26214400),
    fecha_emision   DATE,
    fecha_vencimiento DATE,
    esta_vigente    BOOLEAN GENERATED ALWAYS AS (
                        fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE
                    ) STORED,
    eliminado       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `postulaciones`

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
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(empresa_id, licitacion_id)
);
```

#### `checklist_postulacion` y `plantillas_checklist`

```sql
CREATE TABLE plantillas_checklist (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_licitacion VARCHAR(10) NOT NULL,
    nombre_item     VARCHAR(500) NOT NULL,
    es_obligatorio  BOOLEAN NOT NULL DEFAULT TRUE,
    orden           SMALLINT NOT NULL DEFAULT 0,
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE checklist_postulacion (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    postulacion_id  UUID NOT NULL REFERENCES postulaciones(id) ON DELETE CASCADE,
    descripcion     VARCHAR(500) NOT NULL,
    es_obligatorio  BOOLEAN NOT NULL DEFAULT TRUE,
    completado      BOOLEAN NOT NULL DEFAULT FALSE,
    completado_at   TIMESTAMPTZ,
    documento_id    UUID REFERENCES documentos_empresa(id),
    orden           SMALLINT NOT NULL DEFAULT 0
);
```

#### `tfidf_perfiles`

```sql
CREATE TABLE tfidf_perfiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas_usuario(id) ON DELETE CASCADE UNIQUE,
    vector_bytes    BYTEA NOT NULL,
    rubros_usados   TEXT[],
    modelo_version  VARCHAR(50) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 6.5 Analytics Outputs (Parquet files)

> **Estos no son tablas de base de datos. Son archivos parquet pre-computados por el pipeline
> de analytics y leídos por el BIService de la API.**

| Archivo | Módulo fuente | Contenido | Filas (aprox.) |
|---|---|---|---|
| `product_price_bands_L1.parquet` | product_price_bands | Bandas producto+organismo+unidad | 722K |
| `product_price_bands_L2.parquet` | product_price_bands | Bandas producto+sector+unidad | 124K |
| `product_price_bands_L3.parquet` | product_price_bands | Bandas producto+unidad nacional | 51K |
| `product_price_coverage.parquet` | product_price_bands | Cobertura por producto | — |
| `competitors_by_market.parquet` | competitor_analysis | Share por proveedor en mercado | 4.2M |
| `market_concentration.parquet` | competitor_analysis | HHI por mercado | 168K |
| `buyer_scores.parquet` | buyer_scoring | Score 0–1 por organismo | 1.3K |
| `buyer_transparency.parquet` | buyer_transparency | Índice transparencia por organismo | — |
| `buyer_risk_flags.parquet` | buyer_scoring | Flags de riesgo por comprador | — |
| `seasonality_monthly.parquet` | seasonality | Volumen mensual por org+rubro | — |
| `seasonality_predictions.parquet` | seasonality | Predicciones 12 meses | — |
| `trend_markets.parquet` | trend_analysis | CAGR + regresión por mercado | 46K growing |
| `sector_dashboard.parquet` | sector_intelligence | Métricas por sector | 9 |
| `region_dashboard.parquet` | sector_intelligence | Métricas por región | 34 |
| `sector_region_matrix.parquet` | sector_intelligence | Cruce sector × región | 265 |
| `discount_by_context.parquet` | discount_optimizer | Descuento por tipo+rubro+oferentes | — |
| `competitor_forecast_l1.parquet` | competitor_predictor | N oferentes por org+rubro+tipo | — |
| `competitor_forecast_l2.parquet` | competitor_predictor | N oferentes por rubro+tipo | — |
| `window_classified.parquet` | preparation_window | Cada LIC clasificada vs norma | — |
| `window_norms.parquet` | preparation_window | Norma por tipo+sector (lookup) | — |
| `provider_diversification.parquet` | provider_diversification | Score diversificación proveedor | — |
| `opportunity_scores.parquet` | opportunity_scorer | Score 0–10 por mercado | 237K |
| `tfidf_model.joblib` | tfidf_matcher | Modelo TF-IDF serializado | — |
| `tfidf_provider_vectors.npz` | tfidf_matcher | Vectores sparse por proveedor | 97K |
| `tfidf_provider_index.parquet` | tfidf_matcher | Mapeo proveedor → row | 97K |

---

## 7. Seguridad y Cumplimiento

### 7.1 Manejo de Documentos Sensibles

```python
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
            Params={'Bucket': settings.S3_BUCKET, 'Key': s3_key,
                    'ContentType': content_type,
                    'ServerSideEncryption': 'AES256',
                    'ContentLengthRange': (1, self.MAX_SIZE_BYTES)},
            ExpiresIn=300
        )
        return {"upload_url": url, "s3_key": s3_key}

    def _validate_s3_key_ownership(self, s3_key: str, empresa_id: str) -> None:
        """CRÍTICO: Validación explícita, no assert."""
        expected_prefix = f"empresas/{empresa_id}/"
        if not str(PurePosixPath(s3_key)).startswith(expected_prefix):
            raise HTTPException(403, "Acceso denegado")
```

### 7.2 Autenticación y Autorización por Plan

```python
PLAN_ORDER = ['basico', 'pyme', 'pro', 'gremio', 'admin']

# basico:   5 alertas/mes, sin upload docs, BI limitado (3 queries/día)
# pyme:     ilimitado, 1 empresa, BI completo
# pro:      ilimitado, hasta 3 empresas, + matching semántico avanzado
# gremio:   ilimitado, hasta 20 empresas, tablero multi-empresa
```

### 7.3 Stripe Webhook — Verificación de Firma

```python
@router.post("/billing/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(400, "Missing stripe-signature")
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
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

### 7.5 Protección de Datos (Ley 19.628 Chile)

- **RUT de empresa**: No loggear en texto plano.
- **Exportación**: `GET /api/empresa/export`.
- **Eliminación**: `DELETE /api/empresa` — cascada + S3 lifecycle.
- **Retención**: Documentos eliminados 90 días después de cancelar cuenta.

---

## 8. Pipeline de Analytics — Módulos BI

> **15 módulos de analytics batch construidos con Polars sobre parquets mensuales.**
> Todos usan patrón map-reduce: procesan un archivo a la vez para controlar memoria.
> Manejan schema drift entre años con `diagonal_relaxed` concat.

### Ejecutar

```bash
# Todos los módulos (orden óptimo de dependencias)
python -m etl.analytics.run_all

# Un módulo específico
python -m etl.analytics.run_all --modulo <nombre>
```

### Configuración (`etl/analytics/config.py`)

- `OC_PARQUET_DIR`: `etl/data/consolidated/oc/`
- `LIC_PARQUET_DIR`: `etl/data/consolidated/lic/`
- `OUTPUT_DIR`: `etl/data/analytics/`
- `MIN_YEAR`: 2010 (filtrar datos muy antiguos)

### Data Loaders (`etl/analytics/data_loader.py`)

- `scan_oc()` / `scan_lic()` — lazy loading con `pl.scan_parquet`
- `iter_oc_parquets()` / `iter_lic_parquets()` — iterador por archivo (para map-reduce)
- Manejo automático de schema drift: selecciona solo columnas disponibles por archivo

### 8.1 Módulos — Inteligencia de Precios

#### `product_price_bands` — Bandas de Precio por Producto Específico

**El indicador más valioso del BI.** Calcula precio unitario (precioNeto / cantidad) y genera
bandas de referencia con fallback jerárquico:

| Nivel | Granularidad | Min. transacciones | Ejemplo |
|---|---|---|---|
| L1 | producto + organismo + unidad | 5 | "Este hospital paga $800–$1,200 por unidad de este reactivo" |
| L2 | producto + sector + unidad | 10 | "Los hospitales pagan $700–$1,500 por este reactivo" |
| L3 | producto + unidad (nacional) | 20 | "A nivel nacional se paga $500–$2,000" |

- Filtrado de outliers: IQR × 1.5 (método Tukey)
- Score de confianza: `(log(n)/log(100)) × (1 - cv/2)` ∈ [0, 1]
- **Output**: `product_price_bands_{L1,L2,L3}.parquet`, `product_price_coverage.parquet`

#### `price_benchmarking` — Benchmarking a Nivel Rubro

Bandas de precio por (organismo, rubro): p10–p90 + modelo log-normal con scipy.
Menos preciso que product_price_bands pero cubre más combinaciones.

- **Output**: `price_benchmarking.parquet`

#### `discount_optimizer` — Descuento Óptimo por Contexto

Calcula distribución de descuentos sobre MontoEstimado en licitaciones adjudicadas:
`discount = (MontoEstimado - MontoAdjudicado) / MontoEstimado`

Segmentado por (CodigoTipo, Rubro2, rango de oferentes). Responde:
"En LQ de limpieza con 4–6 competidores, el descuento mediano es 12 %."

- **Output**: `discount_by_context.parquet`, `discount_summary.parquet`
- **Fuente**: LIC

### 8.2 Módulos — Inteligencia Competitiva

#### `competitor_analysis` — Mapa de Competidores por Mercado

Market shares, HHI, y perfiles de proveedores por (organismo, rubro).

- **Output**: `competitors_by_market.parquet` (4.2M filas), `market_concentration.parquet` (168K mercados)

#### `competitor_predictor` — Predictor de N° Competidores

Distribución histórica de NumeroOferentes por contexto, con jerarquía:
L1 (org+rubro+tipo), L2 (rubro+tipo), L3 (solo tipo).

Identifica mercados de baja competencia (>60 % licitaciones con ≤ 2 oferentes).

- **Output**: `competitor_forecast_{l1,l2,l3}.parquet`, `competitor_low_competition.parquet`
- **Fuente**: LIC

### 8.3 Módulos — Evaluación de Compradores

#### `buyer_scoring` — Score de Compradores (0–1)

Evalúa cada organismo como cliente para un proveedor PYME.

| Componente | Peso | Fuente |
|---|---|---|
| **Transparencia** (% Trato Directo) | 0.25 | LIC |
| Tasa de aceptación | 0.20 | OC |
| Tasa de NO cancelación | 0.15 | OC |
| Tasa adjudicación LIC | 0.15 | LIC |
| Regularidad de compras | 0.10 | OC |
| Volumen (oportunidad) | 0.10 | OC |
| Satisfacción proveedor | 0.05 | OC |

> **Nota v1.1**: Se reemplazó "Velocidad de pago" (peso 0.25) por "Transparencia"
> (% Trato Directo). El Estado chileno paga rápido (mediana 1.4 días), haciendo que
> el 90 % de organismos obtuviera score "excelente" — sin información diferenciadora.

- **Output**: `buyer_scores.parquet`, `buyer_payment_stats.parquet`, `buyer_risk_flags.parquet`

#### `buyer_transparency` — Índice de Transparencia

Score 0–1 combinando: % Trato Directo (peso 0.50), tasa fracaso licitaciones (0.25),
y HHI concentración de adjudicaciones (0.25).

- **Output**: `buyer_transparency.parquet`
- **Fuente**: LIC

### 8.4 Módulos — Inteligencia de Mercado

#### `seasonality` — Estacionalidad de Compras

Z-scores mensuales, consistency score, peak detection y predicciones 12 meses
por (organismo, rubro).

- **Output**: `seasonality_monthly.parquet`, `seasonality_predictions.parquet`, `seasonality_peaks.parquet`

#### `trend_analysis` — Tendencias de Mercado

Regresión lineal + CAGR por (organismo, rubro) time series.
Identifica mercados crecientes (46K) y emergentes (CAGR > 20 %: 1.7K).

- **Output**: `trend_markets.parquet`

#### `sector_intelligence` — Inteligencia por Sector y Región

Dashboard por sector (9), región (34), y cruce sector × región (265).

- **Output**: `sector_dashboard.parquet`, `region_dashboard.parquet`, `sector_region_matrix.parquet`

### 8.5 Módulos — Matching y Clasificación

#### `tfidf_matcher` — Motor de Matching Semántico TF-IDF

Perfiles de proveedores basados en productos vendidos históricamente.

- Corpus: productos ÚNICOS por proveedor (2018+), máx 10K chars por perfil
- Modelo: TF-IDF con max_features=20K, ngram_range=(1,2), min_df=5, max_df=0.8
- Matching: cosine similarity query_text vs todos los proveedores
- **97K proveedores** con perfil textual
- **Output**: `tfidf_model.joblib`, `tfidf_provider_vectors.npz`, `tfidf_provider_index.parquet`

#### `word_clustering` — Clustering de Tipos de Compra

TF-IDF + MiniBatchKMeans sobre 71K nombres de producto → 100 clusters.

- **Output**: `word_clusters.parquet`

### 8.6 Módulos — Herramientas de Decisión

#### `opportunity_scorer` — Scoring de Oportunidades (0–10)

Combina 5 componentes: predictibilidad de precio, accesibilidad competitiva,
estacionalidad, tendencia y volumen. 237K mercados scored.

- **Output**: `opportunity_scores.parquet`

#### `preparation_window` — Clasificador de Ventana de Preparación

Compara la ventana real de cada licitación (FechaCierre - FechaCreacion) contra la norma
histórica de su tipo+sector. Genera:
- `pct_del_tipico`: fracción del tiempo típico (< 0.50 = tiene menos de la mitad)
- `presion_score`: 0–1 donde 1 = urgentísimo
- `clasificacion_ventana`: crítica / corta / normal / larga / muy_larga

> **Nota**: La fecha de cierre ya viene en el dato publicado. El valor NO es decirte cuántos
> días quedan (eso es trivial) sino clasificar si la ventana es inusualmente corta para su tipo.

- **Output**: `window_classified.parquet`, `window_norms.parquet`, `window_norms_type.parquet`
- **Fuente**: LIC

#### `provider_diversification` — Score de Diversificación Proveedor

HHI de clientes (organismos), sectores, regiones, rubros activos.
Alerta de dependencia: HHI > 0.50 con > 20 OC.

- **Output**: `provider_diversification.parquet`, `provider_concentration_alerts.parquet`

---

## 9. Roadmap de Desarrollo

### Principio rector: **Strangler Fig Pattern + Validación antes de construir**

---

### Hito 0 — Validación Técnica ✅ COMPLETADO

**Resultado**: Los datos históricos SON accionables, pero no de la forma que asumía el plan
original. El valor está en **bandas de precio por producto específico**, no en predicción
de precio a nivel rubro.

- [x] Descarga masiva de ZIPs OC + LIC (2018–2026)
- [x] Consolidación en parquets mensuales con Polars
- [x] Validación Go/No-Go: CV < 40 % a nivel rubro → **FALLA** (4.8 %)
- [x] Revalidación: bandas producto+organismo+unidad → **46.6 % ratio ≤ 3×** → **GO**
- [x] Pipeline analytics completo: 15 módulos construidos y ejecutados
- [x] TF-IDF matching sobre 97K proveedores
- [ ] Concierge MVP manual: 5 PYMES, cobrar USD 20/mes
- [ ] Setup técnico: Docker, dependencias, feature flags

### Hito 0b — Setup Técnico (pendiente)

- [ ] Crear rama `v1-tordo` desde `main`
- [ ] Desactivar `/dashboard/analytics` con `ANALYTICS_ENABLED=false`
- [ ] Reemplazar `pypdf2` por `pypdf==4.2.0`
- [ ] Agregar dependencias backend: `asyncpg`, `scikit-learn`, `polars`, etc.
- [ ] Agregar servicios `minio`, `flower` a `docker-compose.yml`
- [ ] **Iniciar proceso de aprobación WhatsApp WABA** (4–8 semanas)
- [ ] Configurar `celery_app.py`: `timezone=America/Santiago`, crons
- [ ] Crear `core/database.py` con pool config y `create_async_engine`
- [ ] Agregar tabla `task_failures`
- [ ] Actualizar `.env.example`

---

### Fase 1 — Empresa, Estado Hábil y Documentos (Semanas 2–4) · 10 días

- [ ] Migración: `empresas_usuario`, `estado_habil_log`, `documentos_empresa`, `tfidf_perfiles`
- [ ] CRUD empresa con validación RUT
- [ ] `EstadoHabilExtractor` + Celery task
- [ ] `DocumentService` con presigned URLs
- [ ] Task `check_document_expiry`
- [ ] Frontend: `<EstadoHabilBadge>` + página `/documentos`

---

### Fase 2 — Checklist de Postulaciones (Semanas 4–5) · 8 días

- [ ] Migración: `postulaciones`, `checklist_postulacion`, `plantillas_checklist`
- [ ] `ChecklistService.generate_from_template()`
- [ ] API `postulaciones.py`
- [ ] Task `send_deadline_reminders` (09:00 AM Santiago)
- [ ] Frontend: checklist con progress bar en detalle de licitación

---

### Fase 3 — ETL Horario + Motor de Alertas (Semanas 5–6) · 8 días

- [ ] `LicitacionExtractor.fetch_activas()` — cron horario
- [ ] Trigger: `MatchingService.match_nueva_licitacion()`
- [ ] `AlertService.create_alert_idempotent()` para alertas nuevas
- [ ] Watchdog task
- [ ] Tests: sin alertas duplicadas en reintentos Celery

---

### Fase 4 — BI API + Dashboard (Semanas 6–8) · 10 días

> **NUEVO en v1.1**: Esta fase integra los analytics pre-computados con el frontend.

- [ ] `BIService`: lee parquets de analytics, expone datos vía API
- [ ] `GET /api/bi/precio?producto=X&organismo=Y` → bandas de product_price_bands
- [ ] `GET /api/bi/competidores?rubro=X&organismo=Y` → competitors_by_market
- [ ] `GET /api/bi/matching?empresa_id=X` → TF-IDF matching
- [ ] `GET /api/bi/oportunidad?licitacion_id=X` → score compuesto
- [ ] `GET /api/bi/comprador?organismo=X` → buyer_scores + transparency
- [ ] `GET /api/bi/ventana?licitacion_id=X` → window classification
- [ ] Frontend — Panel `/bi`: histograma precios + competidores + score oportunidad
- [ ] Frontend — Widget BI en `/licitaciones/[codigo]`
- [ ] Dashboard: widget "¿Conviene postular?" + próximos plazos + estado hábil + alertas

---

### Fase 5 — Onboarding + Billing (Semanas 8–10) · 8 días

- [ ] Flujo `/onboarding` 5 pasos: RUT → estado hábil → rubros → BI demo → alerta
- [ ] Stripe: Básico (free), PYME (USD 25), Pro (USD 55), Gremio (USD 150)
- [ ] Webhook verificado por firma
- [ ] Middleware de plan en endpoints BI

---

### Fase 6 — Google OAuth + WhatsApp (Semana 11) · 4 días

- [ ] Google OAuth con `authlib`
- [ ] Twilio WABA para alertas críticas
- [ ] Fallback automático a email

---

### Resumen del Roadmap

```
Semana 0–1:  [HITO 0]  ✅ Validación datos + Analytics pipeline (COMPLETADO)
             [HITO 0b] Setup técnico + Concierge MVP
Semana 2–4:  [FASE 1]  Empresa + Estado Hábil + Documentos
Semana 4–5:  [FASE 2]  Checklist de Postulaciones
Semana 5–6:  [FASE 3]  ETL horario + Motor de alertas
Semana 6–8:  [FASE 4]  BI API (integrar analytics) + Dashboard
Semana 8–10: [FASE 5]  Onboarding + Billing Stripe
Semana 11:   [FASE 6]  Google OAuth + WhatsApp
────────────────────────────────────────────────────────────────
Total: ~11 semanas · ~55 días de desarrollo
```

---

## 10. Estándares de Calidad y Arquitectura

### 10.1 Arquitectura: Monolito Modular

```
backend/app/
├── api/           → Solo llama a Services. Sin lógica de negocio.
├── services/      → Lógica de negocio
│                    bi_service.py (lee analytics parquets)
│                    tfidf_matcher.py (matching semántico)
│                    alert_engine.py, alert_service.py (idempotency)
│                    document_service.py, checklist_service.py
│                    estado_habil_service.py
├── models/        → SQLAlchemy ORM. Sin lógica.
├── schemas/       → DTOs Pydantic.
├── tasks/         → Workers Celery. Solo invocan Services.
└── core/          → database.py, security.py, email.py, config.py

etl/
├── scripts/              → descargar_datos_masivos.py
├── data/consolidated/    → Parquets mensuales OC + LIC
├── data/analytics/       → Outputs del pipeline analytics
├── analytics/            → 15 módulos Polars batch
│   ├── config.py, data_loader.py, run_all.py
│   ├── product_price_bands.py, price_benchmarking.py
│   ├── competitor_analysis.py, competitor_predictor.py
│   ├── buyer_scoring.py, buyer_transparency.py
│   ├── seasonality.py, trend_analysis.py, sector_intelligence.py
│   ├── tfidf_matcher.py, word_clustering.py
│   ├── opportunity_scorer.py, discount_optimizer.py
│   ├── preparation_window.py, provider_diversification.py
│   └── __init__.py
├── extractors/           → Licitaciones API, Estado Hábil CSV
├── transformers/         → Transformación de datos
└── loaders/              → Carga en PostgreSQL
```

**Regla de dependencias**: `api → services → models`. Nunca al revés.

### 10.2 BIService — Lee Analytics Pre-Computados

```python
# backend/app/services/bi_service.py

import polars as pl
from pathlib import Path
from functools import lru_cache

ANALYTICS_DIR = Path(settings.ANALYTICS_DIR)  # etl/data/analytics/

class BIService:

    @lru_cache(maxsize=1)
    def _load_price_bands(self, level: str = "L1") -> pl.DataFrame:
        return pl.read_parquet(ANALYTICS_DIR / f"product_price_bands_{level}.parquet")

    def get_precio_producto(
        self, codigo_producto: str, codigo_organismo: str = None,
        unidad_medida: str = None
    ) -> dict:
        """
        Busca banda de precio para un producto específico.
        Fallback jerárquico: L1 → L2 → L3.
        """
        for level in ["L1", "L2", "L3"]:
            bands = self._load_price_bands(level)
            filtro = pl.col("codigoProductoONU") == codigo_producto
            if level == "L1" and codigo_organismo:
                filtro &= pl.col("CodigoOrganismoPublico") == codigo_organismo
            if unidad_medida:
                filtro &= pl.col("UnidadMedida") == unidad_medida
            result = bands.filter(filtro)
            if len(result) > 0:
                row = result.sort("confianza", descending=True).head(1).to_dicts()[0]
                return {
                    "nivel": level, "p25": row["p25"], "p50": row["p50"],
                    "p75": row["p75"], "n": row["n"],
                    "confianza": row["confianza"],
                }
        return None

    def get_competidores(self, rubro: str, organismo: str = None, top_n: int = 10):
        comps = pl.read_parquet(ANALYTICS_DIR / "competitors_by_market.parquet")
        filtro = pl.col("rubro") == rubro
        if organismo:
            filtro &= pl.col("organismo") == organismo
        return (
            comps.filter(filtro)
            .sort("market_share", descending=True)
            .head(top_n)
            .to_dicts()
        )

    def get_buyer_score(self, organismo: str) -> dict | None:
        scores = pl.read_parquet(ANALYTICS_DIR / "buyer_scores.parquet")
        row = scores.filter(pl.col("CodigoOrganismoPublico") == organismo)
        if len(row) == 0:
            return None
        return row.head(1).to_dicts()[0]

    def classify_window(self, codigo_tipo: str, sector: str, window_days: int) -> dict:
        norms = pl.read_parquet(ANALYTICS_DIR / "window_norms.parquet")
        row = norms.filter(
            (pl.col("CodigoTipo") == codigo_tipo) & (pl.col("sector") == sector)
        )
        if len(row) == 0:
            # Fallback a solo tipo
            norms_t = pl.read_parquet(ANALYTICS_DIR / "window_norms_type.parquet")
            row = norms_t.filter(pl.col("CodigoTipo") == codigo_tipo)
        if len(row) == 0:
            return {"clasificacion": "sin_norma"}
        ref = row.head(1).to_dicts()[0]
        pct = window_days / ref["p50"] if ref["p50"] > 0 else 1.0
        return {
            "window_days": window_days,
            "p50_ref": ref["p50"], "p25_ref": ref["p25"],
            "pct_del_tipico": round(pct, 2),
            "clasificacion": (
                "crítica" if window_days < ref["p10"] else
                "corta" if window_days < ref["p25"] else
                "normal" if window_days <= ref["p75"] else
                "larga"
            ),
        }
```

### 10.3 Motor TF-IDF — Matching en Runtime

```python
# backend/app/services/tfidf_matcher.py

import joblib
from scipy import sparse
from sklearn.metrics.pairwise import cosine_similarity

class TFIDFMatcher:
    """
    Carga modelo pre-entrenado por el pipeline analytics.
    Sin LLM — TF-IDF + cosine similarity.
    """

    def __init__(self):
        self.vectorizer = joblib.load(ANALYTICS_DIR / "tfidf_model.joblib")
        self.matrix = sparse.load_npz(ANALYTICS_DIR / "tfidf_provider_vectors.npz")
        self.index = pl.read_parquet(ANALYTICS_DIR / "tfidf_provider_index.parquet")

    def match(self, query_text: str, top_n: int = 20) -> list[dict]:
        query_vec = self.vectorizer.transform([query_text])
        scores = cosine_similarity(query_vec, self.matrix).flatten()
        top_idx = scores.argsort()[-top_n:][::-1]
        results = []
        for idx in top_idx:
            if scores[idx] > 0.01:
                row = self.index.filter(pl.col("matrix_row") == int(idx))
                if len(row) > 0:
                    results.append({
                        "proveedor": row["CodigoProveedor"][0],
                        "nombre": row["NombreProveedor"][0],
                        "score": round(float(scores[idx]), 4),
                    })
        return results
```

### 10.4 Patrón Celery Async

> **CRÍTICO**: Celery tasks son `def` síncronas. Usar `asyncio.run()`, nunca `await`.

```python
@celery_app.task(bind=True, max_retries=3, acks_late=True,
                 on_failure=register_task_failure)
def run_licitaciones_activas_update(self):
    try:
        result = asyncio.run(_licitaciones_activas_async())
        logger.info("licitaciones_horario_ok", **result)
    except Exception as exc:
        raise self.retry(exc=exc)
```

### 10.5 Variables de Entorno (`.env.example`)

```bash
# === DATABASE ===
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/tordo
DATABASE_URL_SYNC=postgresql://user:pass@localhost:5432/tordo

# === AUTH ===
SECRET_KEY=change-me-in-production-min-32-chars

# === REDIS / CELERY ===
REDIS_URL=redis://localhost:6379/0

# === S3 / DOCUMENTOS ===
S3_BUCKET=tordo-documentos
S3_ENDPOINT_URL=http://localhost:9000  # MinIO para dev

# === STRIPE ===
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# === NOTIFICACIONES ===
SMTP_HOST=smtp.gmail.com
EMAIL_FROM=alertas@tordo.cl
TWILIO_ACCOUNT_SID=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# === ETL ===
MERCADOPUBLICO_API_TICKET=
OC_ZIP_URL_TEMPLATE=https://transparenciachc.blob.core.windows.net/oc-da/{year}-{month}.zip
LIC_ZIP_URL_TEMPLATE=https://transparenciachc.blob.core.windows.net/lic-da/{year}-{month}.zip

# === ANALYTICS ===
ANALYTICS_DIR=etl/data/analytics

# === APP ===
APP_NAME=TORDO
ANALYTICS_ENABLED=false
```

---

## 11. Política de Datos, Backups y Cuotas

### 11.1 Backups

| Parámetro | MVP | > USD 3K MRR |
|---|---|---|
| PostgreSQL | Snapshot diario, 7 días | Cada 6h, 30 días |
| Parquets analytics | Git-tracked o S3 sync semanal | S3 sync diario |
| Test de restauración | Mensual | Quincenal |
| RTO objetivo | 4 horas | 2 horas |

### 11.2 Cuotas por Plan

| Plan | Docs máx. | Tamaño máx./doc | Alertas activas | Queries BI/día |
|---|---|---|---|---|
| Básico | 5 | 5 MB | 5 | 3 |
| PYME | 50 | 25 MB | Ilimitadas | 50 |
| Pro | 200 | 25 MB | Ilimitadas | Ilimitadas |
| Gremio | 1.000 | 25 MB | Ilimitadas | Ilimitadas |

### 11.3 Comportamiento cuando Plan Básico supera límites

La query se bloquea con `bloqueada_por_plan`. Banner: *"Has alcanzado tu límite. Actualiza
para continuar."* Si hace upgrade, las pendientes se procesan inmediatamente.

---

## Apéndice A: Resumen Ejecutivo para el Desarrollador

> **Si solo lees una página de este documento, que sea esta.**

**Lo que tienes hoy**: Backend funcional (FastAPI + Celery), frontend (Next.js), y un
**pipeline de analytics completo con 15 módulos** que generan datos BI sobre OC + LIC
históricos de ChileCompra.

**Lo que falta construir**: La capa de **integración**: conectar los analytics pre-computados
con endpoints de API y el frontend para que los usuarios accedan al BI.

**Los 3 diferenciadores reales de TORDO**:

1. **Bandas de precio por producto específico** — "Este hospital paga $800–$1,200 por este
   reactivo." 722K bandas L1, 46.6 % con ratio ≤ 3×. Sin esto TORDO no tiene moat.
2. **Matching semántico TF-IDF** — sugiere proveedores afines a una licitación. 97K perfiles.
   Sin LLM. scikit-learn en el backend.
3. **Alertas de nueva oportunidad en < 2 horas** — cron horario + matching + WhatsApp/email.

**El pipeline analytics** (`etl/analytics/`) ya está construido. Ejecutar con
`python -m etl.analytics.run_all`. Lee parquets de `etl/data/consolidated/`,
escribe outputs en `etl/data/analytics/`.

**El BIService** de la API lee esos parquets pre-computados con Polars. No hay DuckDB.

**Los horarios de Celery** son en hora Santiago (`America/Santiago`).

**El patrón Celery async** es `asyncio.run(_async_fn())`, nunca `await` en un `def` task.

**`DATABASE_URL` necesita `+asyncpg`**: `postgresql+asyncpg://...`

**Nombre**: "TORDO" es placeholder. Usar `APP_NAME` en todos los textos visibles.

---

*TORDO SPEC.md v1.1 · Marzo 2026 · Confidencial*
*BI pre-postulación accionable + compliance operativo para PYMES proveedoras del Estado chileno*
*Motor analytics: 15 módulos Polars batch sobre ZIP masivo OC + LIC de ChileCompra*
