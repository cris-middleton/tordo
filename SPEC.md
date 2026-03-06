# SPEC.md — YUCA v3.1
## Especificaciones Técnicas de Producto

> **Versión**: 3.1 · **Fecha**: Marzo 2026 · **Estado**: Aprobado para desarrollo
> **Autor técnico**: Senior Software Architect
> **Documentos fuente**: SPEC.md v2.2 (LicitaFácil) + YUCA_Plan_SaaS_v2.1.pdf
>
> **Changelog v3.1** *(Auditoría de Codebase + Validación Discovery, Marzo 2026)*:
> Se realizó auditoría exhaustiva del codebase base (LicitUp) contra esta especificación.
> Se agrega la **Sección 2.0 — Inventario del Estado Real del Codebase** con inventario
> completo de lo implementado, bugs críticos preexistentes y deuda técnica documentada.
> Se corrigen referencias a rutas de módulos (config en `app/config.py`, no en
> `app/core/config.py`). Se documenta el bug `alert_metadata` vs `metadata` en la
> migración 001 y el `AlertEngine`. Se agrega advertencia sobre endpoints `/api/data`
> sin autenticación. Se corrige nota sobre `uvicorn --reload` en docker-compose.
> Se documentan dependencias no utilizadas en ETL y backend. Se actualiza la nota
> sobre Celery Beat (actualmente sin schedule definido).
> 
> **VALIDACIÓN DISCOVERY COMPLETADA**: Se confirmó que **no existe CSV masivo de estado
> hábil**. La única fuente confiable es el endpoint per-RUT en
> `datos-abiertos.chilecompra.cl/organismos-proveedores/{RUT}`. Se simplifica la
> sección 7.2 del SPEC: eliminar fallback a CSV. Se actualiza el código de
> `EstadoHabilExtractor` en las fases para usar solo el endpoint per-RUT.
> Se actualiza `tareas_manuales.md` para reflejar validación completada y que el
> ticket de API de Mercado Público ya está disponible en `.env.example`.
>
> **Changelog v3.0**: Integración estratégica del Plan YUCA v2.1. Se incorpora Capa 2
> (inteligencia pre-postulación: BI histórico, benchmarking de precios, mapa de
> competidores, matching semántico TF-IDF). Se rehabilita ETL de Órdenes de Compra
> como pipeline BI histórico separado del backend transaccional. Se agregan DuckDB,
> scikit-learn/TF-IDF, pandas al stack. Se incorporan secciones de Go-to-Market,
> Modelo de Negocio ampliado, Análisis Competitivo y Riesgos. Se actualiza el endpoint
> de estado hábil con la URL per-RUT documentada en el plan. Se preservan todas las
> correcciones críticas de v2.1 y v2.2 (asyncpg, timezone, idempotencia, etc.).
>
> **Changelog v2.2**: Agrega `asyncpg` faltante (crítico), corrige patrón Celery
> async/sync, agrega `python-magic` y `tenacity` al ETL, snippets docker-compose.
> **Changelog v2.1**: Correcciones de auditoría Staff Engineer (7 críticos resueltos).
>
> **Nombre del producto**: "YUCA" se usa como **placeholder** en todo el código y la
> documentación. El nombre comercial final aún no está definido. Usar la constante
> `APP_NAME` (variable de entorno) para facilitar el cambio posterior.

---

## Tabla de Contenidos

1. [Análisis Competitivo y Posicionamiento](#1-análisis-competitivo-y-posicionamiento)
2. [Gap Analysis: Evolución del Producto](#2-gap-analysis-evolución-del-producto)
3. [Propuesta de Valor y ICP](#3-propuesta-de-valor-y-icp)
4. [Mercado y Oportunidad](#4-mercado-y-oportunidad)
5. [Decisión de Dispositivo: Mobile vs. Desktop](#5-decisión-de-dispositivo)
6. [Arquitectura de Sistema](#6-arquitectura-de-sistema)
7. [Fuentes de Datos Validadas](#7-fuentes-de-datos-validadas)
8. [BI e Inteligencia Pre-Postulación](#8-bi-e-inteligencia-pre-postulación)
9. [Stack Tecnológico Validado](#9-stack-tecnológico-validado)
10. [Modelo de Datos](#10-modelo-de-datos)
11. [Seguridad y Cumplimiento](#11-seguridad-y-cumplimiento)
12. [Modelo de Negocio y Pricing](#12-modelo-de-negocio-y-pricing)
13. [Go-to-Market](#13-go-to-market)
14. [Roadmap de Producto](#14-roadmap-de-producto)
15. [Estándares de Calidad y Arquitectura](#15-estándares-de-calidad-y-arquitectura)
16. [Política de Datos, Backups y Cuotas](#16-política-de-datos-backups-y-cuotas)
17. [Riesgos y Mitigaciones](#17-riesgos-y-mitigaciones)

---

## 0. Inventario del Estado Real del Codebase

> **Esta sección es el resultado de la auditoría de Marzo 2026.** Documenta con
> precisión qué existe hoy en el repositorio, qué bugs críticos tiene el código
> base antes de comenzar el pivot, y qué deuda técnica debe resolverse en la Fase 0.
> La arquitectura **objetivo** de YUCA se describe a partir de la Sección 6 en adelante.

---

### 0.1 Stack Base Verificado

| Componente | Estado Real | Notas |
|---|---|---|
| FastAPI 0.104.1 | ✅ Funcional | Sync, sin async en las rutas actuales |
| SQLAlchemy 2.0.23 | ✅ Funcional | **Modo sync únicamente** (`psycopg2-binary`). No hay `asyncpg` ni `create_async_engine`. La migración a async es parte de Fase 0. |
| PostgreSQL 15 | ✅ Funcional | 3 migraciones Alembic aplicadas |
| Celery 5.3.4 + Redis 7 | ✅ Funcional | Solo 2 tasks on-demand (alertas); **Celery Beat está deployado pero no tiene `beat_schedule` definido** — no ejecuta ninguna tarea periódica. |
| JWT Auth (python-jose + bcrypt) | ✅ Funcional | Token expiry = 30 min. Sin refresh token. |
| Next.js 14 (App Router) | ✅ Funcional | 11 páginas, AuthContext, Layout component |
| ETL Mercado Público (licitaciones) | ✅ Funcional | Extractor día-a-día, transformers, loaders con historial/detalle |
| ETL Órdenes de Compra | ✅ Funcional (pero desactivado) | `etl` container command está comentado en docker-compose |
| Docker Compose (db, redis, backend, celery, frontend) | ✅ Funcional | Ver bugs #5 y #6 en sección 0.3 |
| Email (SMTP sync) | ✅ Funcional condicionalmente | Solo funciona si `SMTP_*` vars están configuradas. No hay vars en `.env.example`. |

---

### 0.2 Rutas de Módulos — Realidad vs. Objetivo SPEC

> **Importante para los LLMs que implementen**: Los módulos `core/config.py` y
> `core/database.py` **no existen todavía**. Deben ser **creados** en Fase 0.

| Módulo | Ruta Real (hoy) | Ruta Objetivo SPEC | Acción en Fase 0 |
|---|---|---|---|
| Configuración de la app | `backend/app/config.py` | `backend/app/core/config.py` | Mover archivo y actualizar todos los imports |
| Session DB (sync) | `backend/app/db/__init__.py` | `backend/app/core/database.py` | Reemplazar con version async (asyncpg) |
| Seguridad JWT | `backend/app/core/security.py` | `backend/app/core/security.py` | Ya está en la ruta correcta ✅ |
| Email | `backend/app/core/email.py` | `backend/app/core/email.py` | Ya está en la ruta correcta ✅ |

**Import correcto hasta que se migre en Fase 0:**
```python
# ACTUAL (hoy):
from app.config import settings

# OBJETIVO (después de Fase 0):
from app.core.config import settings
```

---

### 0.3 Bugs Críticos en el Codebase Base

> Estos bugs existen en el código actual y deben resolverse durante la Fase 0 o
> antes de desarrollar las funciones que los tocan. Están ordenados por severidad.

#### Bug #1 — `alert_metadata` vs `metadata`: nombre de columna inconsistente (CRÍTICO)

- **Migración `001_add_user_auth_and_alerts.py`**: crea la columna como `alerts.metadata`
- **Modelo SQLAlchemy `alert.py`**: define la columna como `alert_metadata`
- **`AlertEngine.create_alert()`**: pasa `metadata=metadata` como kwarg

**Resultado**: El ORM no mapea el valor porque el Python attribute es `alert_metadata`
pero la columna SQL real se llama `metadata`. Los metadatos de alerta se pierden
silenciosamente en cada `create_alert()`.

**Fix requerido** (en la migración de Fase 1, junto con los cambios de tabla `alerts`):
```sql
-- En la migración de Fase 1 (junto con idempotency_key):
ALTER TABLE alerts RENAME COLUMN metadata TO alert_metadata;
```
Y actualizar `AlertEngine.create_alert()` para usar `alert_metadata=metadata`.

---

#### Bug #2 — Endpoints `/api/data` sin autenticación (SEGURIDAD ALTA)

El router `data_inspection.py` expone **acceso irrestricto a toda la base de datos**:

```
GET /api/data/tables           # Lista todas las tablas
GET /api/data/licitaciones     # Query raw con filtros
GET /api/data/ordenes_compra   # Query raw con filtros
GET /api/data/summary          # Estadísticas globales
```

Cualquier persona en internet puede consultar todos los datos sin credenciales.
**Resolución en Fase 0 (tarea 0.5)**: mover a `router_debug.py` con guard
`if settings.DEBUG: app.include_router(debug_router)`.

---

#### Bug #3 — `aiosmtplib` en requirements pero nunca usado (TÉCNICO)

`backend/requirements.txt` incluye `aiosmtplib==3.0.1` pero `backend/app/core/email.py`
usa la biblioteca estándar `smtplib` (síncrona). La biblioteca `aiosmtplib` nunca es
importada. **Esto no rompe nada**, pero genera confusión sobre qué biblioteca de email
usa el sistema.

**Fix**: Eliminar `aiosmtplib` de `requirements.txt`. Agregar `aiosmtplib` de vuelta
solo cuando se migre a Amazon SES async (post-MVP).

---

#### Bug #4 — `ACCESS_TOKEN_EXPIRE_MINUTES = 30` (UX CRÍTICA)

El token de acceso actual expira en **30 minutos**. Al expirar, todas las llamadas API
fallan silenciosamente y el usuario se desloguea automáticamente sin aviso al volver a
la página (el `checkAuth()` del `AuthContext` detecta el token inválido y limpia la
sesión). No hay refresh token.

**Fix en Fase 0**: Cambiar a 1440 minutos (24h) como mínimo para MVP. Implementar
refresh token como tarea de Fase 1 o posterior. Agregar `ACCESS_TOKEN_EXPIRE_MINUTES`
a `.env.example`.

---

#### Bug #5 — `uvicorn --reload` en `docker-compose.yml` de producción (INFRA)

```yaml
# infra/docker-compose.yml — línea actual del backend:
command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

El flag `--reload` activa el file watcher de uvicorn. En producción esto:
1. Consume CPU innecesariamente
2. Puede causar reinicios no controlados ante cambios de archivos de configuración

**Fix en Fase 0**: Eliminar `--reload`. Usar `--workers 2` en lugar de `--reload`.

---

#### Bug #6 — ETL container command comentado en `docker-compose.yml` (INFRA)

```yaml
# infra/docker-compose.yml — etl service:
# command: python main.py  ← COMENTADO
```

El container `etl` arranca pero no ejecuta nada. El ETL solo puede ejecutarse
manualmente con `docker compose exec etl python main.py`.

**Resolución en Fase 0**: Definir el comando de ETL y el schedule. Con la migración
a Celery Beat (Fase 0, tarea 0.12), el ETL pasará a ser una task de Celery y este
container puede deprecarse.

---

#### Bug #7 — Ticket de API de Mercado Público hardcodeado (SEGURIDAD MEDIA)

`etl/config.py` tiene el demo ticket hardcodeado como valor por defecto:
```python
MERCADO_PUBLICO_TICKET = os.getenv(
    "MERCADO_PUBLICO_TICKET", "F8537A18-6766-4DEF-9E59-426B4FEE2844"
)
```
Este ticket también aparece **duplicado** en `.env.example` (misma clave, dos veces).

**Fix en Fase 0**: El default debe ser `""` (string vacío). Si el ticket está vacío,
el ETL debe fallar con un mensaje de error claro. Eliminar la entrada duplicada del
`.env.example`.

---

#### Bug #8 — Category matching completamente sin implementar (FUNCIONAL)

En `backend/app/services/alert_engine.py`, el método `_matches_preference()` tiene
la lógica de matching por categoría como un stub silencioso:

```python
# alert_engine.py — línea actual:
if preference.category_id:
    pass  # ← STUB: category matching nunca filtra nada
```

Cualquier `AlertPreference` que tenga `category_id` configurado parece funcionar, pero
en realidad ignora completamente el filtro de categoría. Las alertas se envían aunque
no correspondan a la categoría.

**Fix**: Implementar el join con la tabla `categories` y filtrar por código CPV.
Está planificado para Fase 1 (al migrar el Alert Engine al nuevo modelo YUCA).

---

### 0.4 Deuda Técnica Documentada

| Item | Descripción | Impacto | Resolución |
|---|---|---|---|
| **Deps no usadas en ETL** | `beautifulsoup4`, `lxml`, `pandas`, `numpy`, `schedule` están en `etl/requirements.txt` pero no son importadas por ningún extractor ni transformer. | Build más lento, imagen más grande | Limpiar en Fase 0 (mantener `pandas` y `numpy` para el nuevo pipeline BI) |
| **`httpx` duplicado en backend** | `httpx==0.25.2` aparece dos veces en `backend/requirements.txt` | Harmless pero confuso | Eliminar duplicado en Fase 0 |
| **Sin `/privacy` ni `/terms` pages** | El `Layout.tsx` del frontend enlaza `/privacy` y `/terms` pero esas rutas no existen (404) | SEO + legal | Crear páginas vacías con placeholder antes de ir a producción |
| **No hay capa de manejo de errores frontend** | Cada `page.tsx` tiene su propio try/catch inline. Sin `ErrorBoundary` global ni componente de error compartido | Experiencia inconsistente al fallar | Crear `<ErrorBoundary>` y `<LoadingSpinner>` compartidos |
| **`declarative_base()` deprecated import** | `backend/app/db/__init__.py` importa desde `sqlalchemy.ext.declarative` (deprecado). Ruta moderna: `sqlalchemy.orm.DeclarativeBase` | Warnings en logs | Corregir al migrar a `core/database.py` |
| **Sin componentes UI compartidos** | Solo existe `Layout.tsx` en `frontend/components/`. Toda la UI de cards, tablas, badges está duplicada inline en cada `page.tsx` | Inconsistencia visual, mantenimiento difícil | Crear librería de componentes básicos en Fase 5 (Dashboard) |
| **Sin refresh token** | JWT expira en 30 min (Bug #4). No hay endpoint de refresh. El logout es solo client-side. | UX + seguridad | Implementar en Fase 1 post-empresa |
| **No hay email verification** | El campo `is_verified` existe en el modelo `User` pero nunca se setea ni se valida. Todo usuario puede operar sin verificar su email. | Calidad de datos | Implementar junto con el flujo de bienvenida en Fase 5 |
| **No hay password reset** | No existe endpoint `forgot-password` ni `reset-password`. Si un usuario olvida su contraseña, no puede recuperar su cuenta. | Funcionalidad básica faltante | Implementar en Fase 5 o antes |

---

### 0.5 Inventario de Endpoints API Actuales

| Método | Path | Auth | Estado |
|---|---|---|---|
| `POST` | `/api/auth/register` | No | ✅ Funcional |
| `POST` | `/api/auth/login` | No | ✅ Funcional |
| `GET` | `/api/auth/me` | Requerida | ✅ Funcional |
| `POST` | `/api/auth/change-password` | Requerida | ✅ Funcional |
| `GET` | `/api/users/` | Superuser | ✅ Funcional |
| `GET/PUT/DELETE` | `/api/users/{id}` | Requerida/Superuser | ✅ Funcional |
| `GET` | `/api/tenders/` | Requerida | ✅ Funcional (filtros: estado, organismo, region, monto, search) |
| `GET` | `/api/tenders/{id}` | Requerida | ✅ Funcional |
| `GET` | `/api/tenders/codigo/{codigo}` | Requerida | ✅ Funcional |
| `CRUD` | `/api/alerts/preferences` | Requerida | ✅ Funcional (category matching stub — ver Bug #8) |
| `CRUD` | `/api/alerts/` | Requerida | ✅ Funcional |
| `GET` | `/health/` | No | ✅ Funcional |
| `GET` | `/api/data/*` | **⚠️ Ninguna** | ✅ Funcional pero **inseguro** (ver Bug #2) |
| `GET` | `/api/orders/*` | — | ❌ **No existe**. Frontend consulta `/api/data/ordenes_compra` sin auth. |

---

### 0.6 Inventario de Modelos de Base de Datos Actuales

| Tabla | Estado | Notas |
|---|---|---|
| `users` | ✅ Existe | Faltan: `plan_tier`, `stripe_*`, `onboarding_*` — agregar en Fase 1 |
| `licitaciones` | ✅ Existe | Columnas del mapeo SPEC (sección 7.1) en su mayoría ya existen con distintos nombres |
| `ordenes_compra` | ✅ Existe | |
| `alerts` | ✅ Existe | Bug: columna `metadata` en SQL vs `alert_metadata` en ORM (ver Bug #1) |
| `alert_preferences` | ✅ Existe | |
| `buyer_organizations` | ✅ Existe | Deprecar en Fase 0 |
| `suppliers` | ✅ Existe | |
| `categories` | ✅ Existe | |
| `licitaciones_detalle` | ✅ Existe | Deprecar en Fase 0 per sección 2.4 |
| `licitaciones_historial` | ✅ Existe | Mantener para auditoría |
| `ordenes_compra_detalle` | ✅ Existe | Deprecar per sección 2.4 |
| `ordenes_compra_historial` | ✅ Existe | Mantener para auditoría |
| `ref_tipo_orden_compra` | ✅ Existe | Deprecar per sección 2.4 |
| `ref_unidad_monetaria` | ✅ Existe | Deprecar per sección 2.4 |
| `ref_tipo_despacho` | ✅ Existe | Deprecar per sección 2.4 |
| `ref_forma_pago` | ✅ Existe | Deprecar per sección 2.4 |
| `empresas_usuario` | ❌ No existe | Crear en Fase 1 |
| `estado_habil_log` | ❌ No existe | Crear en Fase 1 |
| `documentos_empresa` | ❌ No existe | Crear en Fase 3 |
| `postulaciones` | ❌ No existe | Crear en Fase 4 |
| `checklist_postulacion` | ❌ No existe | Crear en Fase 4 |
| `plantillas_checklist` | ❌ No existe | Crear en Fase 4 |
| `task_failures` | ❌ No existe | Crear en Fase 0 |

---

### 0.7 Inventario de Páginas Frontend Actuales

| Ruta | Estado | Notas |
|---|---|---|
| `/` | ✅ Existe | Landing page pública |
| `/login` | ✅ Existe | |
| `/register` | ✅ Existe | |
| `/dashboard` | ✅ Existe | Layout antiguo (LicitUp). Rediseñar en Fase 5 |
| `/dashboard/tenders` | ✅ Existe | Mantener, extender con badge checklist en Fase 4 |
| `/dashboard/tenders/[codigo]` | ✅ Existe | Extender con panel BI en Fase 4 |
| `/dashboard/orders` | ✅ Existe | Consume `/api/data/ordenes_compra` sin auth — arreglar en Fase 0 |
| `/dashboard/orders/[codigo]` | ✅ Existe | |
| `/dashboard/alerts` | ✅ Existe | |
| `/dashboard/analytics` | ✅ Existe | Deshabilitar con feature flag en Fase 0 |
| `/dashboard/settings` | ✅ Existe | Convertir en onboarding en Fase 5 |
| `/onboarding` | ❌ No existe | Crear en Fase 5 |
| `/documentos` | ❌ No existe | Crear en Fase 3 |
| `/bi` | ❌ No existe | Crear en Fase 5 |
| `/pricing` | ❌ No existe | Crear en Fase 6 |
| `/privacy` | ❌ No existe | **Enlazado en el footer pero retorna 404** |
| `/terms` | ❌ No existe | **Enlazado en el footer pero retorna 404** |

---

## 1. Análisis Competitivo y Posicionamiento

### 1.1 LicitaLab: el incumbente de referencia

LicitaLab (fundado 2020) tiene ~380 clientes activos, USD 360K ARR, crecimiento del
20% trimestral y ronda de USD 300K cerrada (Nakama Ventures, Magical Startups). Cubre
búsqueda inteligente, alertas, calendario, análisis de competidores, BI de precios
históricos y LIA (IA para chatear con bases técnicas). Precio desde 2 UF/mes (~USD 65).
Competidores tradicionales: Falconsoft y Masnet (más complejos y caros).

**Señales clave:**
- 380 clientes sobre 110.000 proveedores = **0,3% penetración**. El mercado está prácticamente sin capturar.
- LicitaLab valida willingness-to-pay. No hay que probar que el mercado paga — ya lo hace.
- **Riesgo**: Si LicitaLab lanza plan USD 15, el precio como único argumento no sobrevive.

YUCA apunta al cuadrante de **bajo costo + onboarding simple + compliance operativo** —
espacio no ocupado por los actores actuales.

### 1.2 Mapa comparativo: LicitaLab vs. YUCA

| Dimensión | LicitaLab | YUCA |
|---|---|---|
| Job to be done | Descubrir y analizar oportunidades | Ejecutar postulaciones + inteligencia para ganar |
| Usuario objetivo | Analista / área comercial / proveedor grande | Dueño de PYME / backoffice único / contador |
| Complejidad de uso | Media-alta (muchas funciones) | Baja — flujo guiado <10 min, onboarding asistido |
| Precio | USD 65–200/mes (desde 2 UF) | USD 0–95/mes (freemium a multi-cliente) |
| IA / NLP | LIA: chat con bases técnicas (LLM) | Matching semántico TF-IDF en títulos históricos — sin costo LLM en MVP |
| BI histórico | Precios adjudicados | 78 campos/OC desde ZIP masivo ChileCompra — gratuito y verificable |
| Estado hábil | No cubierto | Monitor diario por RUT via API datos-abiertos.chilecompra.cl + alerta inmediata |
| Gestión documental | No cubierto | Upload, organización y vinculación a checklist por licitación |
| Checklist de anexos | No cubierto | Template dinámico por tipo (L1/LE/LP) con ítems editables |
| Precio mínimo | USD 65/mes | Gratis (plan funcional) + USD 25 PYME |
| Segmento expansión | Grandes proveedores, Perú, Colombia | PYMES sin analista, contadores multi-cliente, gremios |

---

## 2. Gap Analysis: Evolución del Producto

### 2.1 Contexto del Pivot

La versión anterior (**LicitUp**) fue construida para resolver **descubrimiento y análisis
de oportunidades** — similar a LicitaLab. El producto actual (**YUCA**) resuelve dos capas
de valor diferenciadas y complementarias:

- **Capa 1 — Compliance operativo**: Ejecutar la postulación sin errores, mantener estado
  hábil, gestionar documentos base. Las PYMES con 1–10 licitaciones/mes no necesitan BI
  avanzado ni IA para bases técnicas: necesitan saber qué documentos cargar esta semana
  y no perder el plazo.

- **Capa 2 — Inteligencia pre-postulación accionable**: Antes de invertir 4 horas
  preparando una oferta, ¿cuántas veces ha comprado este organismo este producto? ¿A
  qué precio histórico? ¿Quiénes ganan sistemáticamente? Esta información existe en los
  archivos masivos gratuitos de ChileCompra (78 campos/OC) pero nadie la procesa de
  forma simple para el dueño de PYME.

| Dimensión | Visión Anterior (LicitUp) | Visión YUCA |
|---|---|---|
| Usuario objetivo | Analista / área comercial | Dueño de PYME / backoffice único |
| Problema central | Descubrir licitaciones relevantes | No perder plazos + saber si conviene postular |
| Feature estrella 1 | Analytics/BI, búsqueda avanzada | Estado hábil + checklist de anexos |
| Feature estrella 2 | — | BI histórico OC: precios, competidores, matching |
| Complejidad UI | Media-alta | Baja (flujo guiado simple) |
| Precio | No definido | USD 25/mes (plan PYME) |

### 2.2 Componentes REUTILIZABLES

| Componente | Archivo(s) | Justificación |
|---|---|---|
| **ETL Pipeline (licitaciones)** | `etl/extractors/`, `etl/transformers/`, `etl/loaders/` | Pipeline de ingesta de Mercado Público es el core. Reutilizable al 100%. |
| **FastAPI Backend structure** | `backend/app/main.py`, `config.py`, `celery_app.py` | Monolito modular en FastAPI es exactamente lo especificado. |
| **Sistema JWT Auth** | `backend/app/core/security.py` | Sólido. Solo agregar Google OAuth. |
| **Email Notifications** | `backend/app/core/email.py` | Reutilizable, extender para alertas de estado hábil. |
| **Celery + Redis** | `backend/app/tasks/`, `docker-compose.yml` | Arquitectura de jobs periódicos correcta para el motor de alertas. |
| **Alert Engine core** | `backend/app/services/alert_engine.py` | Motor de matching existe. Extender, no reemplazar. |
| **Tabla `licitaciones`** | `backend/app/models/` | Modelo de datos válido (ver sección 7 para mapeo exacto). |
| **Tabla `alert_preferences`** | `backend/app/models/` | CPV/keyword/región matching es reutilizable. |
| **Tabla `users`** | `backend/app/models/` | Base válida, necesita extensión. |
| **Next.js App Router shell** | `frontend/app/layout.tsx`, `AuthContext.tsx` | Estructura de rutas y auth context reutilizables. |
| **Docker Compose** | `infra/docker-compose.yml` | Orquestación de servicios adecuada. |
| **Migrations Alembic** | `backend/alembic/` | Mantener historial. Agregar nuevas versiones. |

### 2.3 Componentes que DEBEN SER MODIFICADOS

| Componente | Cambio Requerido | Prioridad |
|---|---|---|
| **Dashboard UI** | Rediseñar centrado en Estado Hábil + compliance. Agregar widget de BI (precios rápidos, competidores top). | P0 |
| **Alert Engine** | Agregar nuevos tipos: `ESTADO_HABIL_CAMBIO`, `PLAZO_CIERRE_48H`, `PLAZO_CIERRE_24H`, `DOCUMENTO_VENCIDO`. **Agregar idempotency_key.** | P0 |
| **Modelo `users`** | Agregar `rut_empresa`, `nombre_empresa`, `plan_tier`, `estado_habil_actual`, `estado_habil_ultima_revision`. | P0 |
| **ETL Pipeline** | Agregar extractor para estado hábil via endpoint per-RUT (sección 7.1) con fallback a CSV. | P0 |
| **Celery Tasks** | Agregar tasks críticas. **Configurar timezone America/Santiago. Agregar watchdog. Configurar acks_late=True.** | P0 |
| **Celery Beat Schedule** | **CORRECCIÓN CRÍTICA**: Cambiar todos los crons a timezone `America/Santiago`. | P0 |
| **Página de Settings** | Agregar flujo de onboarding de empresa (RUT, rubros, regiones). | P0 |
| **Router de Tenders** | Agregar filtros por perfil + badge de checklist + datos de BI inline (precio rango, nro. competidores). | P1 |
| **Modelo `alerts`** | Agregar `alert_type` enum extendido. **Agregar columna `idempotency_key` UNIQUE.** | P0 |
| **`core/database.py`** | Configurar connection pool explícito con `pool_size`, `max_overflow`, `pool_pre_ping`. Agregar soporte async con `asyncpg`. | P0 |

### 2.4 Componentes que DEBEN SER DESCARTADOS

| Componente | Motivo | Acción |
|---|---|---|
| **Analytics page** (`/dashboard/analytics`) versión anterior | BI-first sin contexto de compliance. Reemplazar por BI accionable YUCA. | Eliminar ruta legacy. |
| **ETL de Órdenes de Compra (transaccional)** | Las OC son post-adjudicación en el contexto transaccional. El nuevo ETL OC es un **pipeline BI separado**. | Desactivar task transaccional en Celery Beat. Crear nuevo pipeline BI async (ver sección 8). |
| **`/api/data` (debug endpoints)** | **⚠️ CRÍTICO de seguridad**: actualmente sin autenticación. Cualquier usuario anónimo puede consultar toda la base de datos. Ver Sección 0.3, Bug #2. | Mover a `router_debug.py` cargado solo si `DEBUG=true`. **P0 — resolver en Fase 0.** |
| **`useDashboardCollections` (localStorage)** | Bookmarking solo en cliente. Reemplazar por `postulaciones` en DB. | Eliminar hook. |
| **Tabla `buyer_organizations`** | No necesaria para flujo PYME-proveedor en MVP. | Deprecar. |
| **Tablas `ref_*` de lookup** | Sobrecarga de referencia. | Consolidar en tabla `ref_catalogos`. |
| **`pypdf2`** | **CRÍTICO**: Librería deprecada con CVEs sin parche. | Reemplazar por `pypdf==4.2.0`. |
| **`licitaciones_detalle` y `ordenes_compra_detalle`** | JSON blobs completos innecesarios para MVP. | Deprecar en nueva migración. |

---

## 3. Propuesta de Valor y ICP

### 3.1 Propuesta Central

> **"YUCA es el backoffice inteligente para PYMES que venden al Estado: te avisa qué
> licitaciones son para ti, te dice si conviene postular antes de invertir tiempo, te
> mantiene siempre habilitado y te guía para no perder ninguna oferta por un documento
> mal cargado."**

### 3.2 Los Cinco Dolores que Resuelve YUCA

| # | Dolor | Solución YUCA | Urgencia |
|---|---|---|---|
| 1 | No sé si estoy hábil en el Registro de Proveedores | Monitor diario por RUT — alerta instantánea si cambia a inhábil | **CRÍTICA** — sin esto la empresa no puede postular (Ley 21.634) |
| 2 | Pierdo plazos de cierre de licitaciones | Calendario activo + alerta 48h antes de cada cierre | **ALTA** — pérdida directa de ingresos |
| 3 | Me descalifican por documentos incorrectos | Checklist dinámico por tipo (L1/LE/LP) con ítems editables | **ALTA** — una oferta descalificada = horas de trabajo perdidas |
| 4 | No sé si vale la pena postular | BI histórico: precios, competidores en el rubro, tasa de éxito del organismo | **MEDIA-ALTA** — reduce desperdicio de esfuerzo en licitaciones inganables |
| 5 | No encuentro licitaciones relevantes entre miles | Alertas filtradas por CPV + rubro + matching semántico en títulos históricos | **MEDIA** — diferenciador en simpleza vs. complejidad de LicitaLab |

### 3.3 Segmentos Objetivo (ICP)

| Segmento | Descripción | Tamaño est. | ARPU | JTBD primario |
|---|---|---|---|---|
| **PYMES core** | 1–50 empleados, 1–15 licitaciones/mes, sin área dedicada | 15.000 | USD 25/mes | No perder plazos ni ser descalificado |
| **Contadores** | Despachos que gestionan 5–20 clientes PYME | 2.000 | USD 95/mes | Dashboard multi-empresa eficiente |
| **Gremios** | Cámara Comercio, Construcción, TI — beneficio a socios | 200 | USD 150+/mes | Beneficio tangible para asociados |
| **PYMES analíticas** | PYMES con >15 licitaciones/mes orientadas a BI | 3.000 | USD 55/mes | Ganar más con la misma inversión de tiempo |

---

## 4. Mercado y Oportunidad

En 2024 Mercado Público registró 2.031.670 adquisiciones por USD 17.643 millones (~4,5%
del PIB). Participan más de 110.000 proveedores activos, de los cuales 60% son personas
jurídicas (mayoría PYMES). La norma de 'estado hábil' (Ley 21.634, dic-2024) crea un
requisito de compliance permanente que ninguna solución actual acompaña bien.

**TAM objetivo conservador**: 20.000 PYMES activas sin solución de gestión.
Captar el 1% = 200 clientes ≈ USD 528K ARR.

| Señal | Fuente | Implicación |
|---|---|---|
| >110.000 proveedores activos en Mercado Público | ChileCompra 2024 | Mercado grande y medible |
| LicitaLab: 380 clientes, USD 360K ARR, ronda USD 300K | Diario Financiero, nov 2023 | Willingness-to-pay probado |
| Estado hábil exigido desde dic-2024 | ChileCompra / Ley 21.634 | Nuevo dolor de compliance sin solución en mercado |
| Salud 38.3% + Municipalidades 26.5% = 65% de las OC | Análisis datos-abiertos mar 2026 | ICP sectorial claro para primeras alianzas |
| 78 campos de datos por OC disponibles gratis | datos-abiertos.chilecompra.cl | BI competitivo sin costo de adquisición de datos |
| Tasa adjudicación sube 31%→43% con herramientas | LicitaLab press release | ROI medible para el cliente |

### Distribución de OC — Muestra Marzo 2026

| Variable | Distribución | Implicación Estratégica |
|---|---|---|
| Tipos de OC | SE 41.6% · AG 38.1% · CM 15.7% · TD 4.1% | Compra Ágil (AG) casi igual a SE — canal masivo subutilizado en alertas actuales |
| Sectores | Salud 38.3% · Municipalidades 26.5% · Gob. Central 11.6% | Salud y Municipalidades = 65% — alianzas sectoriales prioritarias para YUCA |
| Escala mensual | 16.838 OC · 2.772 proveedores · 724 organismos · ~CLP 132B | Mercado activo y medible; histórico 10+ años = millones de registros para BI |

---

## 5. Decisión de Dispositivo

### Veredicto: **Desktop First con Diseño Responsivo + PWA en v3**

**El flujo crítico de YUCA implica:**

1. **Carga de documentos**: Patente comercial, certificado de deuda tributaria, declaraciones juradas. Archivos en el PC del usuario. Navegar el sistema de archivos en mobile es friccioso.
2. **Completar checklist de anexos**: Flujo de formulario con múltiples ítems.
3. **Revisar BI de postulación**: Tablas de benchmarking, gráficos de competidores. Requieren pantalla amplia.
4. **Revisar bases técnicas**: PDFs de múltiples páginas.
5. **Contexto de uso**: El backoffice de una PYME trabaja desde un escritorio.

**Donde SÍ aplica mobile:**

- **Consumo de alertas**: El usuario quiere saber desde el móvil que "tiene una licitación nueva" o que "su estado hábil cambió". → WhatsApp y email push son el canal mobile natural.
- **Revisar estado hábil**: Vista de solo lectura. Funciona en móvil.
- **Ver próximos plazos**: Calendario de deadlines. Funciona en móvil.

**Conclusión**: Las vistas de **acción** (upload, checklist, BI detallado) son Desktop.
Las vistas de **lectura** (alertas, estado, calendario) deben funcionar en mobile.
El stack Next.js + Tailwind CSS responsive ya soporta esto sin cambio de paradigma.
**La PWA va en v3.**

---

## 6. Arquitectura de Sistema

### 6.1 Diagrama Lógico de Módulos

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        FUENTES EXTERNAS VALIDADAS                            │
│                                                                              │
│  ┌───────────────────────────┐  ┌───────────────────────────────────────┐   │
│  │ API Mercado Público        │  │  Datos Abiertos ChileCompra           │   │
│  │ api.mercadopublico.cl/    │  │  datos-abiertos.chilecompra.cl        │   │
│  │ servicios/v1/publico/     │  │                                       │   │
│  │ licitaciones.json         │  │  · /organismos-proveedores/[RUT]      │   │
│  │ ?fecha=DDMMYYYY&ticket=X  │  │    → estado hábil per-RUT (tiempo     │   │
│  │ Formatos: JSON, XML       │  │    real, validado en PDF)             │   │
│  └──────────────┬────────────┘  │  · CSV proveedores hábiles (fallback) │   │
│                 │               │  · /descargas ZIP mensual OC (BI)     │   │
│                 │               └──────────────────┬────────────────────┘   │
└─────────────────┼────────────────────────────────  ┼──────────────────────────┘
                  │                                   │
          ┌───────▼────────┐              ┌───────────▼──────────────────────┐
          │  ETL Transacc. │              │  Pipeline BI Histórico (NUEVO)   │
          │  (diario)      │              │                                  │
          │  · Licitaciones│              │  · EstadoHabilExtractor          │
          │  · Estado Hábil│              │    (per-RUT + fallback CSV)      │
          │    por empresa │              │  · OCHistoricoExtractor          │
          │                │              │    (ZIP mensual → DuckDB)        │
          │  Retry x3 +    │              │  · TFIDFIndexer                  │
          │  backoff exp.  │              │    (scikit-learn, reconstruye     │
          └───────┬────────┘              │    índice post-ingesta)          │
                  │                       └──────────────┬───────────────────┘
                  │                                      │
                  └──────────────────┬───────────────────┘
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        BASE DE DATOS                                        │
│                                                                            │
│  PostgreSQL 15 (transaccional)       DuckDB (analítico, embebido)          │
│  ─────────────────────────────       ──────────────────────────────────    │
│  licitaciones                        oc_historico (millones de filas)      │
│  empresas_usuario                    oc_precios_benchmark (materialized)   │
│  estado_habil_log                    oc_competidores_rubro (materialized)  │
│  documentos_empresa                  tfidf_index (serializado en S3)       │
│  checklist_postulacion                                                     │
│  plantillas_checklist                                                      │
│  alertas (+ idempotency_key)                                               │
│  alert_preferences                                                         │
│  postulaciones                                                             │
│  users                                                                     │
│  task_failures (DLQ)                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                      │                                │
         ┌────────────┼──────────────┐                 │
         ▼            ▼              ▼                  ▼
┌──────────────┐ ┌─────────────┐ ┌────────────┐  ┌────────────────────────┐
│ BACKEND API  │ │ MOTOR DE    │ │ SERVICIO   │  │ SERVICIO BI            │
│ (FastAPI)    │ │ ALERTAS     │ │ NOTIF.     │  │ (FastAPI + DuckDB)     │
│              │ │ (Celery)    │ │            │  │                        │
│ /api/auth    │ │ TZ:         │ │ Email SES  │  │ /api/bi/precios        │
│ /api/tenders │ │ America/    │ │ WhatsApp   │  │ /api/bi/competidores   │
│ /api/empresa │ │ Santiago    │ │ In-app     │  │ /api/bi/matching       │
│ /api/checklist│ │            │ │            │  │ /api/bi/frecuencia     │
│ /api/docs    │ │ Watchdog    │ │            │  │                        │
│ /api/alerts  │ │ 30min       │ │            │  │  Queries sobre DuckDB  │
│ /api/billing │ │             │ │            │  │  embebido. Sin DB ext. │
│ /api/bi      │ └─────────────┘ └────────────┘  └────────────────────────┘
└──────┬───────┘
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 14)                             │
│                                                                          │
│  /onboarding       → Flujo 5 pasos (RUT → estado → rubros → alerta)    │
│  /dashboard        → Estado hábil + próximos plazos + alertas + BI      │
│                      rápido (precio rango, top competidores)            │
│  /licitaciones     → Lista filtrada por perfil + checklist badge +      │
│                      score de oportunidad (v2)                          │
│  /licitaciones/    → Detalle + checklist + documentos + panel BI        │
│  [codigo]            (benchmarking, competidores en el rubro)           │
│  /documentos       → Repositorio de documentos de la empresa            │
│  /alertas          → Inbox de notificaciones                            │
│  /bi               → Dashboard BI: precios, competidores, matching      │
│  /configuracion    → Perfil empresa + notificaciones + billing          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Principios de Arquitectura

- **Separación de pipelines**: El pipeline transaccional (licitaciones diarias, estado
  hábil, alertas) es independiente del pipeline BI histórico (ZIPs mensuales, DuckDB,
  TF-IDF). No comparten Celery Beat schedules ni conexiones de DB.
- **DuckDB embebido**: Las queries analíticas sobre millones de OC corren en DuckDB
  embebido en el proceso FastAPI. Sin data warehouse externo en MVP. Escalar a ClickHouse
  o BigQuery si el volumen lo requiere en v3.
- **TF-IDF en memoria**: El índice TF-IDF se construye sobre corpus de títulos históricos
  y se serializa en S3. Se carga en memoria al arrancar el worker BI. Sin llamadas a LLM.
- **Monolito modular**: `api → services → models`. Nunca al revés.

### 6.3 Flujo de Datos Principal

```
[Cron 02:00 SCL] → ETL extrae licitaciones del día anterior
                   GET api.mercadopublico.cl/servicios/v1/publico/
                       licitaciones.json?fecha=DDMMYYYY&ticket=XXX
                 → Upsert en PostgreSQL (clave: CodigoExterno UNIQUE)
                 → Trigger: alert_engine.match_new_licitaciones()
                 → Genera alertas con idempotency_key para usuarios matching
                 → Celery task: enviar email + WhatsApp

[Cron 06:00 SCL] → ETL consulta estado hábil per-RUT:
                   GET datos-abiertos.chilecompra.cl/organismos-proveedores/[RUT]
                   (1 request por empresa registrada; fallback: CSV masivo)
                 → Para cada empresa: comparar con estado previo en estado_habil_log
                 → Si cambió → Genera alerta ESTADO_HABIL_CAMBIO
                              idempotency_key = sha256(empresa_id+tipo+fecha)
                 → Email + WhatsApp inmediato

[Cron 09:00 SCL] → Celery tarea: revisar postulaciones activas
                 → Para cada una: calcular días a cierre
                 → Si fecha_cierre - hoy <= 2 días → alerta PLAZO_48H
                 → Idempotency_key previene duplicados en reintentos

[Cron 09:30 SCL] → Revisar documentos con fecha_vencimiento próxima
                 → Si vence en <= 30 días → alerta DOCUMENTO_POR_VENCER
                 → Si ya venció → alerta DOCUMENTO_VENCIDO

[Cron */30 min]  → Watchdog: verificar que tasks críticas corrieron
                 → Si check_estado_habil no ejecutó en 7h → alerta a ops

[Cron 1er día mes, 03:00 SCL] → Pipeline BI: descarga nuevo ZIP mensual OC
                 → URL: transparenciachc.blob.core.windows.net/oc/[AÑO]-[MES].zip
                 → Parsear, validar schema (78 columnas)
                 → Append a DuckDB oc_historico
                 → Recalcular vistas materializadas: precios, competidores
                 → Reconstruir índice TF-IDF con corpus actualizado
                 → Serializar índice TF-IDF a S3

[Usuario web]    → Upload documento → S3 (presigned URL)
                 → Metadata en tabla documentos_empresa
                 → Si tiene fecha_vigencia → crear reminder en scheduler
```

### 6.4 Resiliencia y Observabilidad

#### Estrategia de resiliencia para servicios externos

| Componente | Estrategia de fallo | Fallback |
|---|---|---|
| API Mercado Público (licitaciones) | Retry x3, backoff exponencial (4s → 60s) | Descarga CSV diaria de datos-abiertos.chilecompra.cl |
| Estado hábil per-RUT (endpoint) | Retry x2, circuit breaker por RUT | Fallback al CSV masivo de proveedores hábiles |
| ZIP mensual OC (pipeline BI) | Retry x2, wait 30 min | Log en task_failures + alerta ops; historial previo sigue disponible |
| Twilio WhatsApp | Retry x1 | Degradar silenciosamente a email |
| Amazon SES | Retry x3 | Log en DB + visible en dashboard como alerta no enviada |
| Stripe | No reintentar en webhooks propios | Stripe reintenta automáticamente hasta 3 días |
| DuckDB queries | Try/catch + timeout 30s | Responder con datos en caché (Redis, TTL 1h) |

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
| ETL no ejecutó en 25 horas | Email ops | 4h |
| `check_estado_habil` falló > 10% empresas | Slack/Email | 2h |
| Error rate API > 5% en 15 minutos | PagerDuty/Email | 30min |
| DB connections > 80% del pool | Slack | 1h |
| Pipeline BI no ejecutó en 35 días | Email ops | 4h |
| DuckDB query p95 > 5s | Slack | 2h |

#### Métricas mínimas a exponer

```python
# backend/app/core/metrics.py
METRICAS = {
    "alerts_sent_total":             "Counter — validar que el sistema envía",
    "estado_habil_checks_failed":    "Counter — detectar degradación del extractor",
    "etl_licitaciones_processed":    "Gauge — validar que el ETL corre",
    "checklist_completion_rate":     "Histogram — engagement de producto",
    "document_upload_size_bytes":    "Histogram — detectar abuso de almacenamiento",
    "api_mp_response_time_ms":       "Histogram — SLA de API externa",
    "celery_task_duration_seconds":  "Histogram — detectar tasks lentas",
    "bi_query_duration_seconds":     "Histogram — performance DuckDB queries",
    "tfidf_matching_score":          "Histogram — calidad del matching semántico",
    "oc_historico_rows_total":       "Gauge — tamaño del corpus BI",
}
```

---

## 7. Fuentes de Datos Validadas

> **Esta sección documenta las fuentes de datos reales validadas contra documentación
> oficial de ChileCompra y el Plan YUCA v2.1.**

### 7.1 API de Licitaciones (VALIDADA Y FUNCIONAL)

**Base URL**: `http://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json`

| Parámetro | Descripción | Ejemplo |
|---|---|---|
| `fecha` | Fecha de publicación (DDMMYYYY) | `fecha=04032026` |
| `codigo` | Código específico de licitación | `codigo=1556-50-LP25` |
| `ticket` | Token de acceso (solicitar a ChileCompra) | `ticket=TU_TICKET` |
| `estado` | Filtrar por estado | `estado=publicada` |

**Formatos disponibles**: JSON (default), XML, JSONP

#### 7.1.1 Mapeo de campos API → Tabla `licitaciones`

| Campo API (JSON path) | Campo DB | Tipo DB | Notas |
|---|---|---|---|
| `Listado[].CodigoExterno` | `codigo_externo` | VARCHAR(100) UNIQUE | Clave de deduplicación |
| `Listado[].Nombre` | `titulo` | VARCHAR(255) | |
| `Listado[].CodigoEstado` | `codigo_estado` | INTEGER | Ver tabla 7.1.2 |
| `Listado[].Estado` | `estado` | VARCHAR(510) | Texto del estado |
| `Listado[].Fechas.FechaCierre` | `fecha_cierre` | TIMESTAMPTZ | **Indexada — crítica para alertas** |
| `Listado[].Fechas.FechaPublicacion` | `fecha_publicacion` | TIMESTAMPTZ | |
| `Listado[].Fechas.FechaAdjudicacion` | `fecha_adjudicacion` | TIMESTAMPTZ | |
| `Listado[].Fechas.FechaEstimadaAdjudicacion` | `fecha_estimada_adjudicacion` | TIMESTAMPTZ | |
| `Listado[].Descripcion` | `descripcion` | TEXT | |
| `Listado[].Tipo` | `tipo` | VARCHAR(20) | L1, LE, LP, LQ, LR, LS, etc. |
| `Listado[].CodigoTipo` | `codigo_tipo` | INTEGER | 1=Pública, 2=Privada |
| `Listado[].MontoEstimado` | `monto_estimado` | NUMERIC(15,2) | float en API |
| `Listado[].Moneda` | `moneda` | VARCHAR(10) | CLP, CLF, USD, UTM, EUR |
| `Listado[].VisibilidadMonto` | `visibilidad_monto` | BOOLEAN | 1=visible, 0=oculto |
| `Listado[].Comprador.CodigoOrganismo` | `organismo_codigo` | VARCHAR(100) | |
| `Listado[].Comprador.NombreOrganismo` | `organismo_nombre` | VARCHAR(510) | |
| `Listado[].Comprador.RegionUnidad` | `region` | VARCHAR(510) | Para filtros de alerta |
| `Listado[].Items.Listado[].CodigoCategoria` | `categorias_unspsc` | TEXT[] | Array — para matching CPV |
| `Listado[].DiasCierreLicitacion` | `dias_cierre` | INTEGER | |
| `Listado[].ExtensionPlazo` | `extension_plazo` | BOOLEAN | |
| `Listado[].TipoConvocatoria` | `tipo_convocatoria` | INTEGER | 1=Abierto, 0=Cerrada |
| `Listado[].Adjudicacion.UrlActa` | `url_acta_adjudicacion` | TEXT | |

#### 7.1.2 Códigos de Estado de Licitación

| CodigoEstado | Descripción |
|---|---|
| 5 | Publicada |
| 6 | Cerrada |
| 7 | Desierta |
| 8 | Adjudicada |
| 9 | Revocada |
| 18 | Suspendida |

#### 7.1.3 Tipos de Licitación

| Código | Descripción |
|---|---|
| `L1` | Licitación Pública — Menor a 100 UTM |
| `LE` | Licitación Pública — 100 a 1.000 UTM |
| `LP` | Licitación Pública — 1.000 a 2.000 UTM |
| `LQ` | Licitación Pública — 2.000 a 5.000 UTM |
| `LR` | Licitación Pública — 5.000+ UTM |
| `LS` | Licitación Pública — Servicios personales especializados |
| `E2` | Licitación Privada — Menor a 100 UTM |
| `CO` | Licitación Privada — 100 a 1.000 UTM |
| `B2` | Licitación Privada — 1.000 a 2.000 UTM |
| `H2` | Licitación Privada — 2.000 a 5.000 UTM |
| `I2` | Licitación Privada — Mayor a 5.000 UTM |

### 7.2 Fuente de Estado Hábil — Endpoint per-RUT (VALIDADO)

> **ACTUALIZACIÓN v3.1** *(Validación de Semana 0 completada)*: Se confirma que
> **no existe CSV masivo de estado hábil**. La única fuente confiable es el endpoint
> per-RUT en datos-abiertos.chilecompra.cl. Se simplifica la estrategia: **solo
> endpoint per-RUT, sin fallback a CSV**.

#### Endpoint per-RUT (Fuente Única)

```
GET https://datos-abiertos.chilecompra.cl/organismos-proveedores/{RUT}
Ejemplo: https://datos-abiertos.chilecompra.cl/organismos-proveedores/89.862.200-2
```

**Respuestas**:
- **200 + JSON**: Proveedor existe. Campo `Proveedor.Estado` contiene "Hábil" o "Inhábil"
- **404 u otro error**: Proveedor no existe o no está registrado

YUCA hace polling de esta URL para cada empresa registrada y dispara alerta inmediata si
cambia a inhábil. **Permite verificación en tiempo real durante el onboarding
(< 2 minutos al registrar RUT).**

#### Implementación Simplificada (sin Fallback)

```python
# etl/extractors/estado_habil_extractor.py

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
import structlog

logger = structlog.get_logger()

ESTADO_HABIL_PER_RUT_URL = (
    "https://datos-abiertos.chilecompra.cl/organismos-proveedores/{rut}"
)

class EstadoHabilExtractor:

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=5, max=30),
        reraise=True
    )
    async def check_rut(self, rut_empresa: str) -> str:
        """
        Consulta estado hábil de un RUT directamente via endpoint per-RUT.
        
        Returns:
            "habil" — proveedor está hábil
            "inhabil" — proveedor está inhábil
            "no_encontrado" — proveedor no existe en el sistema
        """
        rut_norm = self._normalizar_rut(rut_empresa)
        
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    ESTADO_HABIL_PER_RUT_URL.format(rut=rut_norm)
                )
                
            # Si no es 200, asumir que no existe o hay error
            if response.status_code == 404:
                logger.warning(
                    "estado_habil_not_found", rut=rut_norm
                )
                return "no_encontrado"
            
            response.raise_for_status()
            data = response.json()
            
            # Parsear respuesta JSON
            proveedor = data.get("Proveedor", {})
            estado_raw = proveedor.get("Estado", "").lower()
            
            return "habil" if "hábil" in estado_raw else "inhabil"
            
        except Exception as exc:
            logger.error(
                "estado_habil_check_failed",
                rut=rut_norm, error=str(exc)
            )
            raise

    def _normalizar_rut(self, rut: str) -> str:
        """Normaliza RUT a formato XX.XXX.XXX-X o XXXXXXX-X"""
        rut = rut.upper().replace(".", "").replace("-", "").strip()
        if len(rut) < 2:
            raise ValueError(f"RUT inválido: {rut}")
        # Retornar sin puntos (el endpoint acepta ambos formatos)
        return rut[:-1] + "-" + rut[-1]
```

### 7.3 Archivo Masivo Mensual de Órdenes de Compra (Pipeline BI)

**Portal**: `https://datos-abiertos.chilecompra.cl/descargas`

**URL directa**:
```
https://transparenciachc.blob.core.windows.net/oc/{AÑO}-{MES}.zip
Ejemplo marzo 2026:
https://transparenciachc.blob.core.windows.net/oc/2026-3.zip
```

El archivo ZIP mensual contiene todas las OC tramitadas en Mercado Público.
La muestra de marzo 2026 tiene 16.838 registros con 78 columnas cada uno.
La carga histórica completa (estimada desde 2010) representa millones de registros.

**Estrategia de carga incremental**:

| Fase | Período | Features habilitados | Costo técnico |
|---|---|---|---|
| MVP (M1–M3) | Último año (12 ZIPs) | Benchmarking precios · Mapa competidores · Matching semántico v1 | ~3 días dev · ~50MB |
| v1 (M4–M6) | Últimos 3 años (36 ZIPs) | Frecuencia de compra por organismo · Matching semántico mejorado | ~1 semana dev · ~150MB |
| v2 (M7–M12) | Historial completo (~2010–2025) | Estacionalidad · Score de oportunidad · Alertas predictivas | ~2 semanas dev · ~2GB |

---

## 8. BI e Inteligencia Pre-Postulación

> **Esta sección es NUEVA en v3.0.** Define la Capa 2 del producto YUCA: inteligencia
> accionable derivada del archivo masivo de Órdenes de Compra.

### 8.1 Features de BI por Prioridad

| Feature | Datos necesarios | Valor para el proveedor | Complejidad | Fase |
|---|---|---|---|---|
| **Benchmarking de precios** | MontoTotalOC + NombreProductoGenerico + OrganismoPublico | "Este hospital paga CLP 2.5M–4M por este servicio. Tu cotización de 5M está fuera de rango." | MEDIA | MVP |
| **Mapa de competidores reales** | NombreProveedor + RubroN1/N2/N3 + OrganismoPublico | "En Salud Araucanía, este proveedor gana el 70% de OC de equipos médicos. Busca otros organismos." | BAJA | MVP |
| **Matching semántico histórico** | Títulos licitaciones + OC históricas + TF-IDF por rubro | "Basado en 4 años de OC similares, estas 3 licitaciones abiertas calzan con lo que tú vendes." | MEDIA | MVP |
| **Frecuencia de compra por organismo** | FechaCreacion + OrganismoPublico + Categoria | "Esta municipalidad compra TI cada abril y octubre. Próxima ventana: en 6 semanas." | MEDIA | v1 |
| **Alertas predictivas de oportunidad** | Patrones históricos + estacionalidad | "Este organismo suele abrir licitación de mantenimiento en junio — 4 años de historia." | ALTA | v3 |
| **Score de oportunidad** | Todos los anteriores combinados | "Esta licitación tiene score 7.2/10: precio alineado, poca competencia, organismo conocido." | MUY ALTA | v3 |

### 8.2 Pipeline de Ingesta OC

```python
# etl/pipelines/oc_historico_pipeline.py

import httpx
import zipfile
import io
import pandas as pd
import duckdb
from tenacity import retry, stop_after_attempt, wait_exponential
from pathlib import Path

OC_ZIP_URL = (
    "https://transparenciachc.blob.core.windows.net/oc/{year}-{month}.zip"
)

# Schema validado de 78 columnas — los nombres exactos deben confirmarse
# descargando y parseando el ZIP en Semana 0
OC_SCHEMA_COLUMNS_REQUIRED = [
    "CodigoOC", "FechaCreacion", "FechaEnvio", "EstadoOC",
    "TipoOC", "MontoTotalOC", "Moneda",
    "RutProveedor", "NombreProveedor",
    "RutUnidadCompra", "NombreUnidadCompra", "NombreOrganismo",
    "CodigoRegionUnidadCompra", "NombreRegionUnidadCompra",
    "RubroN1", "RubroN2", "RubroN3",
    "NombreProductoGenerico", "CodigoProductoONU",
    # ... resto de columnas según schema real del ZIP
]

class OCHistoricoPipeline:

    def __init__(self, duckdb_path: str = "/data/oc_historico.duckdb"):
        self.duckdb_path = duckdb_path

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=60, max=600),
        reraise=True
    )
    async def download_zip(self, year: int, month: int) -> bytes:
        url = OC_ZIP_URL.format(year=year, month=month)
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.get(url)
            response.raise_for_status()
        return response.content

    def parse_zip(self, zip_bytes: bytes) -> pd.DataFrame:
        """
        Extrae el CSV del ZIP y valida que las columnas clave estén presentes.
        Falla explícitamente si el schema cambia — evita ingestas silenciosamente erróneas.
        """
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            csv_name = next(
                n for n in zf.namelist() if n.endswith(".csv")
            )
            with zf.open(csv_name) as f:
                df = pd.read_csv(f, encoding="latin-1", low_memory=False)

        missing = [c for c in OC_SCHEMA_COLUMNS_REQUIRED if c not in df.columns]
        if missing:
            raise ValueError(
                f"Schema OC cambió. Columnas faltantes: {missing}. "
                f"Actualizar OC_SCHEMA_COLUMNS_REQUIRED."
            )
        return df

    def load_to_duckdb(self, df: pd.DataFrame, year: int, month: int) -> int:
        """Append incremental a DuckDB. Idempotente por (CodigoOC)."""
        con = duckdb.connect(self.duckdb_path)
        con.execute("""
            CREATE TABLE IF NOT EXISTS oc_historico (
                CodigoOC              VARCHAR PRIMARY KEY,
                FechaCreacion         TIMESTAMP,
                MontoTotalOC          DOUBLE,
                Moneda                VARCHAR,
                RutProveedor          VARCHAR,
                NombreProveedor       VARCHAR,
                RutUnidadCompra       VARCHAR,
                NombreOrganismo       VARCHAR,
                NombreRegionUnidadCompra VARCHAR,
                RubroN1               VARCHAR,
                RubroN2               VARCHAR,
                NombreProductoGenerico VARCHAR,
                CodigoProductoONU     VARCHAR,
                anio_ingesta          INTEGER,
                mes_ingesta           INTEGER
            )
        """)
        df["anio_ingesta"] = year
        df["mes_ingesta"] = month
        con.register("df_new", df)
        result = con.execute("""
            INSERT OR IGNORE INTO oc_historico
            SELECT * FROM df_new
        """)
        rows_inserted = result.rowcount
        self._refresh_materialized_views(con)
        con.close()
        return rows_inserted

    def _refresh_materialized_views(self, con: duckdb.DuckDBPyConnection) -> None:
        """
        Recalcula vistas analíticas tras cada ingesta.
        En DuckDB se implementan como tablas recreadas.
        """
        con.execute("""
            CREATE OR REPLACE TABLE oc_precios_benchmark AS
            SELECT
                RubroN2,
                NombreOrganismo,
                NombreProductoGenerico,
                PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY MontoTotalOC) AS p25,
                PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY MontoTotalOC) AS p50,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY MontoTotalOC) AS p75,
                COUNT(*) AS total_oc,
                MAX(FechaCreacion) AS ultima_oc
            FROM oc_historico
            WHERE MontoTotalOC > 0
            GROUP BY RubroN2, NombreOrganismo, NombreProductoGenerico
        """)
        con.execute("""
            CREATE OR REPLACE TABLE oc_competidores_rubro AS
            SELECT
                RubroN2,
                NombreOrganismo,
                RutProveedor,
                NombreProveedor,
                COUNT(*) AS total_adjudicaciones,
                SUM(MontoTotalOC) AS monto_total,
                MAX(FechaCreacion) AS ultima_adjudicacion,
                ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (
                    PARTITION BY RubroN2, NombreOrganismo
                ), 2) AS share_pct
            FROM oc_historico
            GROUP BY RubroN2, NombreOrganismo, RutProveedor, NombreProveedor
        """)
```

### 8.3 Matching Semántico con TF-IDF

```python
# backend/app/services/tfidf_service.py

import pickle
import boto3
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from app.core.config import settings
import structlog

logger = structlog.get_logger()

class TFIDFMatchingService:
    """
    Matching semántico sobre títulos históricos de licitaciones y OC.
    Sin LLM — corre en el proceso FastAPI con el índice en memoria.

    Flujo:
    1. Al arrancar: cargar índice desde S3 (o reconstruir si no existe).
    2. Al consultar: vectorizar el perfil del usuario y calcular cosine_similarity.
    3. Al ingestar nuevo ZIP: reconstruir y serializar índice a S3.
    """

    _vectorizer: TfidfVectorizer | None = None
    _matrix = None
    _corpus_ids: list[str] = []

    def load_index(self) -> None:
        """Carga el índice TF-IDF desde S3 al inicializar el proceso."""
        s3 = boto3.client("s3")
        try:
            obj = s3.get_object(
                Bucket=settings.S3_BUCKET, Key="tfidf/index.pkl"
            )
            data = pickle.loads(obj["Body"].read())
            self._vectorizer = data["vectorizer"]
            self._matrix = data["matrix"]
            self._corpus_ids = data["corpus_ids"]
            logger.info(
                "tfidf_index_loaded",
                corpus_size=len(self._corpus_ids)
            )
        except s3.exceptions.NoSuchKey:
            logger.warning("tfidf_index_not_found_in_s3")

    def rebuild_index(self, corpus: list[dict]) -> None:
        """
        Reconstruye el índice desde el corpus de títulos OC históricos.
        corpus: lista de {id: str, titulo: str}
        Llamar después de cada ingesta mensual.
        """
        self._corpus_ids = [item["id"] for item in corpus]
        titles = [item["titulo"] for item in corpus]

        self._vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            min_df=2,
            max_df=0.95,
            strip_accents="unicode",
            analyzer="word",
        )
        self._matrix = self._vectorizer.fit_transform(titles)
        self._serialize_to_s3()
        logger.info("tfidf_index_rebuilt", corpus_size=len(corpus))

    def find_similar(
        self, query: str, top_k: int = 10, min_score: float = 0.15
    ) -> list[dict]:
        """
        Devuelve top_k licitaciones/OC similares al query del perfil del usuario.
        Retorna lista de {id, score}.
        """
        if self._vectorizer is None or self._matrix is None:
            return []
        q_vec = self._vectorizer.transform([query])
        scores = cosine_similarity(q_vec, self._matrix).flatten()
        top_indices = np.argsort(scores)[::-1][:top_k]
        return [
            {"id": self._corpus_ids[i], "score": float(scores[i])}
            for i in top_indices
            if scores[i] >= min_score
        ]

    def _serialize_to_s3(self) -> None:
        s3 = boto3.client("s3")
        data = pickle.dumps({
            "vectorizer": self._vectorizer,
            "matrix": self._matrix,
            "corpus_ids": self._corpus_ids,
        })
        s3.put_object(
            Bucket=settings.S3_BUCKET,
            Key="tfidf/index.pkl",
            Body=data,
        )
        logger.info("tfidf_index_serialized_to_s3")
```

### 8.4 Endpoints de BI

```
GET /api/bi/precios?rubro={rubro}&organismo={organismo}
    → Retorna p25, p50, p75 de precios históricos adjudicados
    → Fuente: oc_precios_benchmark (DuckDB)

GET /api/bi/competidores?rubro={rubro}&organismo={organismo}
    → Top proveedores por share de adjudicaciones
    → Fuente: oc_competidores_rubro (DuckDB)

GET /api/bi/matching?licitacion_id={id}
    → Licitaciones similares basadas en título
    → Fuente: TFIDFMatchingService.find_similar()

GET /api/bi/frecuencia?organismo={organismo}&categoria={unspsc}
    → Historial de compras por organismo+categoría + estacionalidad
    → Fuente: oc_historico (DuckDB)

GET /api/bi/resumen-mensual
    → Reporte del mes anterior en el rubro del usuario
    → Feature de retención: razón para abrir la app cada mes
```

> **Nota de plan**: Los endpoints de BI están disponibles desde el plan **PYME** (precios
> básicos). El plan **Pro** desbloquea competidores y matching semántico avanzado.

---

## 9. Stack Tecnológico Validado

### 9.1 Tabla de Compatibilidad

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| **API Backend** | FastAPI | 0.104.1 | Async nativo |
| **ORM** | SQLAlchemy | 2.0.23 | Soporta sync (psycopg2) y async (asyncpg). Nuevo código usa async. |
| **DB Driver (sync)** | psycopg2-binary | 2.9.9 | Para Alembic y código ETL legacy |
| **DB Driver (async)** | asyncpg | 0.29.0 | **CRÍTICO** — Requerido por `create_async_engine`. Sin esto el app crashea. |
| **DB transaccional** | PostgreSQL | 15 | JSONB para metadatos; `pg_trgm` para búsqueda texto |
| **DB analítico** | DuckDB | 0.10.x | **NUEVO** — Embebido, sin servidor; queries OLAP sobre OC histórico |
| **Migraciones** | Alembic | 1.12.1 | Alembic usa psycopg2 (sync) — correcto |
| **Task Queue** | Celery + Redis | 5.3.4 + 7 | **Configurar `timezone=America/Santiago`** |
| **Validación** | Pydantic v2 | 2.5.0 | `model_validator` para validar RUT chileno |
| **Auth** | python-jose + bcrypt | — | Agregar Google OAuth con `authlib` |
| **HTTP Client** | httpx | 0.25.2 | Async para APIs externas |
| **Retry/Resiliencia** | tenacity | 8.2.3 | Retry con backoff para APIs externas. Backend Y ETL. |
| **Rate Limiting** | slowapi | 0.1.9 | Proteger endpoints de consulta frecuente |
| **Logging** | structlog | 24.x | Logging estructurado JSON. Backend + ETL. |
| **PDF validation** | pypdf | 4.2.0 | Reemplaza pypdf2 (deprecado con CVEs) |
| **File type detection** | python-magic | 0.4.27 | Validar magic bytes de archivos subidos |
| **Email** | aiosmtplib / Amazon SES | 3.0.1 | SES cuando MRR > USD 1K/mes |
| **Data manipulation (BI)** | pandas | 2.x | **NUEVO** — Pipeline OC histórico: parse ZIP, validación schema |
| **Matching semántico** | scikit-learn | 1.4.x | **NUEVO** — TF-IDF + cosine similarity sobre corpus OC |
| **Frontend** | Next.js 14 | 14.x | App Router + SSR para SEO de landing page |
| **UI** | Tailwind CSS | 3.3.6 | Responsive por defecto; Desktop First |
| **Charts** | Recharts | 2.12.7 | Mini-gráfico historial estado hábil + gráficos BI |
| **Forms** | react-hook-form | 7.48.0 | Checklist con validación dinámica |
| **Dates** | date-fns | 2.30.0 | **Usar siempre `America/Santiago` como timezone** |
| **Infra** | Docker Compose | — | Agregar servicios `minio`, `flower` |

### 9.2 Dependencias — Backend (`backend/requirements.txt`)

```txt
# Driver async para SQLAlchemy — CRÍTICO: sin esto create_async_engine falla
asyncpg==0.29.0

# Almacenamiento de documentos
boto3==1.34.0

# OAuth
authlib==1.3.0

# Pagos
stripe==7.0.0

# Upload de archivos multipart
python-multipart==0.0.9

# Validación de PDFs — NOTA: pypdf2 está DEPRECADO con CVEs. Usar pypdf.
pypdf==4.2.0

# Validación de imágenes
Pillow==10.2.0

# Validación de magic bytes
python-magic==0.4.27

# Resiliencia y retry
tenacity==8.2.3

# Rate limiting
slowapi==0.1.9

# Logging estructurado
structlog==24.1.0

# Monitoreo de Celery (UI web)
flower==2.0.1

# === BI / Analytics (NUEVOS en v3.0) ===
duckdb==0.10.0
pandas==2.2.0
scikit-learn==1.4.0
numpy==1.26.0
```

### 9.3 Dependencias — ETL (`etl/requirements.txt`)

```txt
# Resiliencia y retry
tenacity==8.2.3

# Pipeline OC histórico (NUEVOS en v3.0)
pandas==2.2.0
duckdb==0.10.0
```

### 9.4 Dependencias — Frontend (`frontend/package.json`)

```json
{
  "@stripe/stripe-js": "^3.0.0",
  "@stripe/react-stripe-js": "^2.0.0",
  "react-dropzone": "^14.0.0",
  "@tanstack/react-query": "^5.0.0",
  "react-hot-toast": "^2.4.0"
}
```

### 9.5 Configuración Connection Pool — Backend

```python
# backend/app/core/database.py
#
# ESTADO ACTUAL: Este archivo NO EXISTE todavía. El módulo actual es
# backend/app/db/__init__.py y usa SQLAlchemy síncrono (psycopg2).
# CREAR este archivo en Fase 0, tarea 0.13. El archivo actual puede
# eliminarse o dejarse como referencia de la sesión sync para Alembic.
#
# ARQUITECTURA DUAL DE DRIVERS:
# - psycopg2 (sync): usado por Alembic para migraciones
# - asyncpg (async): usado por FastAPI y código nuevo para operaciones runtime
#
# REGLA: pool_size × workers_total < límite conexiones PostgreSQL
# Supabase free tier: 60 conexiones máximo
# 2 FastAPI workers + 2 Celery workers: pool_size=5 → 4×5=20 conexiones (seguro)

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings  # Mover config.py a core/ en Fase 0 (tarea 0.13)

engine = create_async_engine(
    settings.DATABASE_URL,  # Debe usar +asyncpg (ver .env.example)
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
    echo=settings.DEBUG,
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
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

### 9.6 Configuración Celery

> **Estado actual del archivo**: `backend/app/celery_app.py` existe pero necesita
> reescritura parcial en Fase 0 (tarea 0.12). Diferencias con el target:
> - `timezone` actual: `"UTC"` → debe ser `"America/Santiago"`
> - `task_acks_late`: no definido → agregar `True`
> - `task_reject_on_worker_lost`: no definido → agregar `True`
> - `beat_schedule`: **no existe en absoluto** → agregar completo
> - Import: `from app.config import settings` → cambiar a `from app.core.config import settings` (después de Fase 0 tarea 0.13)

```python
# backend/app/celery_app.py
# OBJETIVO FASE 0 — reescribir con esta configuración completa

from celery import Celery
from celery.schedules import crontab
from app.core.config import settings  # Después de mover config.py a core/ (tarea 0.13)

celery_app = Celery(
    "yuca",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    # CRÍTICO: timezone Chile. Sin esto los crons corren en UTC.
    timezone="America/Santiago",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_annotations={"*": {"on_failure": register_task_failure}},

    beat_schedule={
        "etl-licitaciones-diario": {
            "task": "tasks.etl.run_licitaciones_etl",
            "schedule": crontab(hour=2, minute=0),        # 02:00 AM Santiago
        },
        "check-estado-habil": {
            "task": "tasks.alerts.check_estado_habil_all_users",
            "schedule": crontab(minute=0, hour="*/6"),
        },
        "send-deadline-reminders": {
            "task": "tasks.alerts.send_deadline_reminders",
            "schedule": crontab(hour=9, minute=0),        # 09:00 AM Santiago
        },
        "check-document-expiry": {
            "task": "tasks.alerts.check_document_expiry",
            "schedule": crontab(hour=9, minute=30),       # 09:30 AM Santiago
        },
        "watchdog": {
            "task": "tasks.monitoring.watchdog_check",
            "schedule": crontab(minute="*/30"),
        },
        # Pipeline BI — se ejecuta el 1er día de cada mes a las 03:00 AM
        "bi-oc-historico-mensual": {
            "task": "tasks.bi.run_oc_historico_pipeline",
            "schedule": crontab(hour=3, minute=0, day_of_month=1),
        },
        # Reconstruir índice TF-IDF tras el pipeline BI
        "bi-rebuild-tfidf-index": {
            "task": "tasks.bi.rebuild_tfidf_index",
            "schedule": crontab(hour=6, minute=0, day_of_month=1),
        },
    },
)
```

### 9.7 Docker Compose — Servicios

```yaml
# Agregar a infra/docker-compose.yml

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
        mc mb local/yuca-documentos --ignore-existing;
        mc mb local/yuca-tfidf --ignore-existing;
        mc anonymous set none local/yuca-documentos;
        echo 'MinIO buckets ready';
      "

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
  duckdb_data:
```

### 9.8 Servicios Cloud

| Servicio | Proveedor | Uso | Costo est. MVP |
|---|---|---|---|
| **Almacenamiento docs + TF-IDF index** | AWS S3 o Cloudflare R2 | PDFs, docs empresa, índice TF-IDF serializado | USD 5/mes |
| **Email** | Amazon SES | Alertas y recordatorios | USD 2/mes |
| **WhatsApp** | Twilio WABA | Alertas críticas (estado hábil, plazos) | USD 10/mes |
| **Pagos** | Stripe | Suscripciones recurrentes | % por transacción |
| **Pagos Chile** | Transbank Webpay | Pago único local (Fase 5b, post-MVP) | % por transacción |
| **Monitoreo** | Sentry (free tier) | Error tracking backend + frontend | USD 0/mes |
| **Celery UI** | Flower | Monitoreo de tasks en tiempo real | USD 0 (self-hosted) |
| **Deploy MVP** | Railway o Render | Backend + Worker + ETL + Worker BI | USD 35/mes |
| **Frontend** | Vercel (free tier) | Next.js + SSR landing page | USD 0/mes |
| **DB transaccional** | Supabase (free → pro) | PostgreSQL 15 | USD 0–25/mes |
| **DB analítico** | DuckDB embebido en proceso | Queries sobre OC histórico | USD 0 (en proceso) |

> **Nota WhatsApp WABA**: La aprobación de Meta toma **4 a 8 semanas**. **Iniciar el
> proceso en la Semana 0**, en paralelo con el desarrollo.

> **Nota DuckDB**: Para el MVP, DuckDB corre embebido en el worker BI (proceso separado
> del backend transaccional). Si las queries p95 superan los 5s con el historial completo
> (v2), migrar a ClickHouse o BigQuery Query.

---

## 10. Modelo de Datos

### 10.1 Cambios al Esquema Existente

#### 10.1.1 Tabla `users` — MODIFICAR

```sql
ALTER TABLE users
  ADD COLUMN plan_tier              VARCHAR(20) NOT NULL DEFAULT 'basico'
                                    CHECK (plan_tier IN (
                                        'basico', 'pyme', 'pro', 'contador', 'gremio', 'admin'
                                    )),
  ADD COLUMN stripe_customer_id     VARCHAR(255),
  ADD COLUMN stripe_subscription_id VARCHAR(255),
  ADD COLUMN onboarding_completed   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN onboarding_step        SMALLINT NOT NULL DEFAULT 0;
```

#### 10.1.2 Tabla `licitaciones` — ACTUALIZAR

```sql
ALTER TABLE licitaciones
  ADD COLUMN IF NOT EXISTS codigo_externo           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS codigo_estado            INTEGER,
  ADD COLUMN IF NOT EXISTS tipo                     VARCHAR(10),
  ADD COLUMN IF NOT EXISTS codigo_tipo              INTEGER,
  ADD COLUMN IF NOT EXISTS moneda                   VARCHAR(10) DEFAULT 'CLP',
  ADD COLUMN IF NOT EXISTS visibilidad_monto        BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS organismo_codigo         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS organismo_nombre         VARCHAR(510),
  ADD COLUMN IF NOT EXISTS region                   VARCHAR(510),
  ADD COLUMN IF NOT EXISTS categorias_unspsc        TEXT[],
  ADD COLUMN IF NOT EXISTS dias_cierre              INTEGER,
  ADD COLUMN IF NOT EXISTS extension_plazo          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tipo_convocatoria        INTEGER,
  ADD COLUMN IF NOT EXISTS url_acta_adjudicacion    TEXT,
  ADD COLUMN IF NOT EXISTS fecha_adjudicacion       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_estimada_adjudicacion TIMESTAMPTZ;

ALTER TABLE licitaciones
  ADD CONSTRAINT licitaciones_codigo_externo_unique UNIQUE (codigo_externo);

CREATE INDEX IF NOT EXISTS idx_licitaciones_fecha_cierre  ON licitaciones(fecha_cierre);
CREATE INDEX IF NOT EXISTS idx_licitaciones_estado        ON licitaciones(codigo_estado);
CREATE INDEX IF NOT EXISTS idx_licitaciones_tipo          ON licitaciones(tipo);
CREATE INDEX IF NOT EXISTS idx_licitaciones_region        ON licitaciones(region);
CREATE INDEX IF NOT EXISTS idx_licitaciones_categorias    ON licitaciones USING gin(categorias_unspsc);
```

#### 10.1.3 Tabla `alerts` — CORREGIR BUG + AGREGAR idempotency_key

> **⚠️ Bug preexistente (ver Sección 0.3, Bug #1)**: La migración `001` creó la
> columna como `metadata`, pero el modelo SQLAlchemy la llama `alert_metadata`.
> Esta migración **debe** renombrar la columna antes de agregar las nuevas.

```sql
-- PASO 1: Corregir el nombre de columna inconsistente (Bug #1 de Sección 0.3)
ALTER TABLE alerts RENAME COLUMN metadata TO alert_metadata;

-- PASO 2: Agregar columnas nuevas para YUCA
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas_usuario(id);

ALTER TABLE alerts
  ADD CONSTRAINT alerts_idempotency_key_unique UNIQUE (idempotency_key);

ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_alert_type_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_alert_type_check
  CHECK (alert_type IN (
      'new_tender', 'tender_update', 'tender_closed',
      'estado_habil_cambio',
      'plazo_cierre_48h',
      'plazo_cierre_24h',
      'documento_por_vencer',
      'documento_vencido'
  ));
```

> **También corregir en código**: `AlertEngine.create_alert()` debe pasar
> `alert_metadata=metadata` (no `metadata=metadata`) al construir el objeto ORM.

### 10.2 Tablas NUEVAS

#### 10.2.1 `empresas_usuario`

```sql
CREATE TABLE empresas_usuario (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rut_empresa             VARCHAR(12) NOT NULL,
    nombre_empresa          VARCHAR(255) NOT NULL,
    razon_social            VARCHAR(255),
    rubros_cpv              TEXT[],
    rubros_n2               TEXT[],   -- Para matching con oc_competidores_rubro
    regiones                TEXT[],
    email_contacto          VARCHAR(255),
    telefono                VARCHAR(20),
    activo                  BOOLEAN NOT NULL DEFAULT TRUE,
    estado_habil            VARCHAR(20) NOT NULL DEFAULT 'desconocido'
                            CHECK (estado_habil IN (
                                'habil', 'inhabil', 'no_encontrado', 'desconocido'
                            )),
    estado_habil_updated_at TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, rut_empresa)
);

CREATE INDEX idx_empresas_rut    ON empresas_usuario(rut_empresa);
CREATE INDEX idx_empresas_user   ON empresas_usuario(user_id);
CREATE INDEX idx_empresas_activo ON empresas_usuario(activo) WHERE activo = TRUE;
```

#### 10.2.2 `estado_habil_log`

```sql
CREATE TABLE estado_habil_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas_usuario(id) ON DELETE CASCADE,
    rut_empresa     VARCHAR(12) NOT NULL,
    estado_anterior VARCHAR(20),
    estado_nuevo    VARCHAR(20) NOT NULL,
    fuente          VARCHAR(50) DEFAULT 'api_per_rut',  -- o 'csv_masivo'
    raw_response    JSONB,
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_estado_habil_empresa ON estado_habil_log(empresa_id, checked_at DESC);
CREATE INDEX idx_estado_habil_rut     ON estado_habil_log(rut_empresa, checked_at DESC);
```

#### 10.2.3 `documentos_empresa`

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

#### 10.2.4 `postulaciones`

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

#### 10.2.5 `checklist_postulacion`

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

#### 10.2.6 `plantillas_checklist`

```sql
CREATE TABLE plantillas_checklist (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_licitacion       VARCHAR(10) NOT NULL
                          CHECK (tipo_licitacion IN (
                              'L1', 'LE', 'LP', 'LQ', 'LR', 'LS',
                              'E2', 'CO', 'B2', 'H2', 'I2', 'GENERICO'
                          )),
    nombre_item           VARCHAR(500) NOT NULL,
    descripcion           TEXT,
    es_obligatorio        BOOLEAN NOT NULL DEFAULT TRUE,
    orden                 SMALLINT NOT NULL DEFAULT 0,
    activo                BOOLEAN NOT NULL DEFAULT TRUE,
    aplica_si_monto_mayor NUMERIC(15, 2),
    aplica_si_unspsc      TEXT[],
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plantillas_tipo ON plantillas_checklist(tipo_licitacion, activo)
    WHERE activo = TRUE;
```

#### 10.2.7 `task_failures` (DLQ)

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

### 10.3 Diagrama Entidad-Relación

```
users (1) ──────────────────────────── (N) empresas_usuario
                                               │
               ┌───────────────────────────────┼───────────────────┐
               │                               │                   │
               ▼                               ▼                   ▼
    estado_habil_log              documentos_empresa          postulaciones
                                                                   │
                                                       ┌───────────┤
                                                       │           │
                                                       ▼           ▼
                                          checklist_postulacion  licitaciones

users (1) ──── (N) alert_preferences
users (1) ──── (N) alerts (+ idempotency_key)
               task_failures (DLQ global)

-- DuckDB (analítico, separado) --
oc_historico ──► oc_precios_benchmark (vista materializada)
oc_historico ──► oc_competidores_rubro (vista materializada)
S3: tfidf/index.pkl (índice TF-IDF serializado)
```

---

## 11. Seguridad y Cumplimiento

### 11.1 Manejo de Documentos Sensibles

```python
# backend/app/services/document_service.py

from pathlib import PurePosixPath
from fastapi import HTTPException
import hashlib
import magic  # python-magic para validación de tipo real

class DocumentService:

    ALLOWED_MIME_TYPES = {
        "application/pdf", "image/jpeg", "image/png", "image/webp",
    }
    MAX_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB

    def generate_upload_url(
        self, empresa_id: str, filename: str, content_type: str
    ) -> dict:
        if content_type not in self.ALLOWED_MIME_TYPES:
            raise HTTPException(400, f"Tipo de archivo no permitido: {content_type}")
        safe_filename = hashlib.sha256(filename.encode()).hexdigest()[:16]
        s3_key = f"empresas/{empresa_id}/docs/{uuid4()}/{safe_filename}"
        url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.S3_BUCKET,
                "Key": s3_key,
                "ContentType": content_type,
                "ServerSideEncryption": "AES256",
                "ContentLengthRange": (1, self.MAX_SIZE_BYTES),
            },
            ExpiresIn=300,
        )
        return {"upload_url": url, "s3_key": s3_key}

    def generate_download_url(self, s3_key: str, empresa_id: str) -> str:
        self._validate_s3_key_ownership(s3_key, empresa_id)
        return s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET, "Key": s3_key},
            ExpiresIn=3600,
        )

    def _validate_s3_key_ownership(self, s3_key: str, empresa_id: str) -> None:
        """CRÍTICO: Validación explícita. No usar assert (desactivable con -O)."""
        expected_prefix = f"empresas/{empresa_id}/"
        normalized = str(PurePosixPath(s3_key))
        if not normalized.startswith(expected_prefix):
            raise HTTPException(
                status_code=403,
                detail="Acceso denegado: el recurso no pertenece a esta empresa",
            )

    def validate_file_magic_bytes(self, file_bytes: bytes, claimed_mime: str) -> bool:
        detected = magic.from_buffer(file_bytes[:2048], mime=True)
        return detected == claimed_mime
```

### 11.2 Autenticación y Autorización

```python
# backend/app/core/auth.py

PLAN_ORDER = ["basico", "pyme", "pro", "contador", "gremio", "admin"]

def require_plan(min_plan: str):
    async def dependency(current_user: User = Depends(get_current_user)):
        user_level = PLAN_ORDER.index(current_user.plan_tier)
        required_level = PLAN_ORDER.index(min_plan)
        if user_level < required_level:
            raise HTTPException(
                status_code=403,
                detail=f"Esta función requiere plan {min_plan} o superior",
            )
        return current_user
    return dependency

# Restricciones por plan:
# basico:    máx 5 alertas activas, sin upload docs, sin checklist, sin BI
# pyme:      ilimitado, 1 empresa, BI precios básico
# pro:       ilimitado, hasta 3 empresas, BI completo + matching semántico
# contador:  ilimitado, hasta 20 empresas + tablero multi-empresa
# gremio:    acceso multi-empresa para socios, whitelabel ligero
```

### 11.3 Stripe Webhook — Verificación de Firma

```python
@router.post("/billing/webhook")
async def stripe_webhook(request: Request):
    """CRÍTICO: Sin verificación de firma, cualquier actor puede escalar el plan."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing stripe-signature header")
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError as e:
        logger.warning("stripe_webhook_invalid_signature", error=str(e))
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "customer.subscription.updated":
        await billing_service.update_plan_tier(event["data"]["object"])
    elif event["type"] == "customer.subscription.deleted":
        await billing_service.downgrade_to_basico(event["data"]["object"])

    return {"received": True}
```

### 11.4 Idempotencia de Alertas

```python
# backend/app/services/alert_service.py

class AlertService:

    async def create_alert_idempotent(
        self, db: AsyncSession, empresa_id: str,
        alert_type: str, context_date: date, metadata: dict = None
    ) -> bool:
        key_content = f"{empresa_id}:{alert_type}:{context_date.isoformat()}"
        idempotency_key = hashlib.sha256(key_content.encode()).hexdigest()
        stmt = insert(Alert).values(
            empresa_id=empresa_id,
            alert_type=alert_type,
            idempotency_key=idempotency_key,
            metadata=metadata or {},
        ).on_conflict_do_nothing(index_elements=["idempotency_key"])
        result = await db.execute(stmt)
        return result.rowcount > 0
```

### 11.5 Rate Limiting

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.get("/empresa/{empresa_id}/estado-habil")
@limiter.limit("10/minute")
async def get_estado_habil(empresa_id: str, request: Request): ...

@router.post("/documentos/upload-url")
@limiter.limit("20/minute")
async def get_upload_url(request: Request): ...

@router.get("/bi/precios")
@limiter.limit("30/minute")
async def get_benchmarking_precios(request: Request): ...
```

### 11.6 Validación de RUT Chileno

```python
# backend/app/utils/rut_validator.py

def validar_rut(rut: str) -> bool:
    rut_limpio = rut.upper().replace(".", "").replace("-", "").strip()
    if len(rut_limpio) < 2 or not rut_limpio[:-1].isdigit():
        return False
    body, dv = rut_limpio[:-1], rut_limpio[-1]
    total, factor = 0, 2
    for digit in reversed(body):
        total += int(digit) * factor
        factor = factor % 7 + 2
    remainder = 11 - (total % 11)
    expected = {10: "K", 11: "0"}.get(remainder, str(remainder))
    return dv == expected

def normalizar_rut(rut: str) -> str:
    rut_limpio = rut.upper().replace(".", "").replace("-", "").strip()
    if len(rut_limpio) < 2:
        raise ValueError(f"RUT inválido: {rut}")
    return rut_limpio[:-1] + "-" + rut_limpio[-1]
```

### 11.7 Protección de Datos (Ley 19.628 Chile)

- **RUT de empresa**: No loggear en texto plano. Solo IDs y metadata en logs.
- **Logs**: Nunca loggear passwords, RUTs, ni contenido de documentos.
- **Retención**: Documentos eliminados 90 días después de cancelar cuenta (S3 lifecycle).
- **Exportación**: `GET /api/empresa/export` para exportar todos los datos del usuario.
- **Eliminación**: `DELETE /api/empresa` que limpia datos en cascada.

---

## 12. Modelo de Negocio y Pricing

### 12.1 Planes y Pricing

| Plan | Precio/mes | A quién | Límites | Incluye |
|---|---|---|---|---|
| **Básico** | Gratis | Empresas que quieren probar | 5 alertas/mes · 1 usuario | Alertas básicas · Calendario · Estado hábil (lectura) |
| **PYME** | USD 25 | PYMES 1–10 licitaciones/mes | Alertas ilimitadas · 1 usuario | + Checklist · Estado hábil activo · Doc. manager · BI precios básico |
| **Pro** | USD 55 | PYMES activas / analistas | Ilimitado · 3 usuarios | + BI competidores · Matching semántico · Plantillas · Historial · Soporte |
| **Contador** | USD 95 | Asesores 5–20 clientes | Hasta 20 empresas | Todo Pro + Tablero multi-empresa · Alertas unificadas |
| **Gremio** | USD 150+ | Asociaciones gremiales | Acceso para socios | Whitelabel ligero + Soporte dedicado + Reporte sectorial mensual |

> **Fee opcional**: USD 50 por postulación completada (plan PYME). Alinea incentivos y sube ARPU en clientes de alto volumen.

### 12.2 Comportamiento cuando Plan Básico supera límite de alertas

Cuando un usuario en plan `basico` tiene 5 alertas activas y llega una 6ª:

1. La alerta **se guarda en DB** con estado `bloqueada_por_plan`.
2. **No se envía** email ni WhatsApp.
3. En el dashboard, se muestra un banner: *"Tienes 1 alerta bloqueada. Actualiza tu plan para recibirla."*
4. Si el usuario hace upgrade, las alertas bloqueadas se procesan inmediatamente.

### 12.3 Unit Economics por Escenario

| Métrica | Lean | Estándar (target) | Agresivo |
|---|---|---|---|
| Clientes año 1 | 100 | 300 | 800 |
| ARPU (USD/mes) | 20 | 25 | 30 |
| CAC (USD) | 500 | 300 | 150 |
| Churn mensual | 5% | 4% | 3% |
| LTV (USD) | 400 | 625 | 1.000 |
| LTV/CAC | 0.8x — NO viable | 2.1x — target mínimo | 6.7x |
| Payback (meses) | >12 | ~7 | ~3 |
| ARR año 1 (USD) | 24.000 | 90.000 | 288.000 |
| OPEX anual (USD) | 30.000 | 70.000 | 150.000 |
| Breakeven (meses) | 18–24 | 12–18 | 6–9 |

> **El escenario Lean (LTV/CAC 0.8x) no es viable.** Target mínimo: 300 clientes,
> USD 25/mes, CAC ≤ USD 300, churn ≤ 4%.

---

## 13. Go-to-Market

### 13.1 Validación Antes de Código (Semanas 0–4)

| Hito | Acción concreta | Métrica go/no-go | Plazo |
|---|---|---|---|
| **Validar dolor compliance** | 10 entrevistas a dueños PYME: ¿cuánto tiempo/semana? ¿Han perdido licitaciones por doc o plazo? ¿Saben su estado hábil ahora mismo? | 7/10 confirman dolor urgente; 3+ no saben su estado hábil hoy | Semana 1–2 |
| **Explorar datos históricos** | Descargar ZIPs del último año, cargar en DuckDB local. Generar primer reporte manual "top competidores en rubro X" para 5 empresas piloto. | Reporte generado en <1 día; 3/5 lo encuentran accionable | Semana 1 |
| **Concierge MVP** | Enviar manualmente: alerta de oportunidades + estado hábil + reporte competidores a 5 empresas por USD 20/mes. | 3/5 pagan el mes 2 sin incentivo adicional | Semana 2–5 |
| **Landing page + SEO** | Publicar landing con propuesta de valor + captura email + artículo "cómo mantener estado hábil en Mercado Público". | 100 visitantes únicos y 20 emails capturados en el primer mes | Semana 3–5 |
| **Build MVP** | Iniciar desarrollo solo si Hitos 1–3 son exitosos. | Demo funcional con datos reales en 10 semanas; primer cliente pago en semana 12 | Mes 1–3 |

> **PUNTO DE DECISIÓN GO/NO-GO**: Si después del Concierge MVP menos de 3/5 empresas
> pagan el mes 2, detener el desarrollo de código y re-entrevistar. El costo de pivotar
> aquí es 4 semanas de trabajo. El costo de pivotar después de construir es 6 meses.

### 13.2 Canales de Adquisición

| Canal | Táctica | CAC est. | Volumen M1–6 |
|---|---|---|---|
| **SEO / Contenido** | Blog + guías sobre estado hábil, checklist por rubro, "qué precio poner en licitación". Keywords de alto intent sin competencia fuerte. | USD 50–100 | 30–80 leads/mes |
| **LinkedIn Outreach** | Mensajes directos a dueños PYME + contadores. Secuencia 3 mensajes con lead magnet: template checklist gratis + reporte sectorial BI. | USD 200–400 | 20–50 leads/mes |
| **Alianzas contadores** | Programa referidos: comisión 20% durante 6 meses. El contador ya gestiona el RUT — acceso directo al dolor. | USD 100–200 | 10–30 clientes/mes |
| **Gremios sectoriales** | Distribución a socios (Cámara Construcción, TI, Salud). Canal de menor CAC — acceso masivo con un solo acuerdo. | USD 30–80 | 50–200 por gremio |

> **Prioridad sectorial**: Salud (38.3% OC) y Municipalidades (26.5% OC) concentran el
> 65% del mercado. Orientar primeras alianzas de gremios a estos sectores.

### 13.3 Retención

- **Alertas semanales personalizadas**: Email/WhatsApp con oportunidades de la semana — razón para abrir la app cada lunes.
- **Recordatorio 48h antes de cierre**: Notificación automática — el momento de mayor valor percibido.
- **Reporte mensual de mercado**: Resumen del gasto público en el rubro del usuario basado en OC del mes anterior. Feature único, construye hábito.
- **Revisión mensual de estado hábil**: Email proactivo confirmando vigencia. Construye confianza.
- **Score de postulación (v2)**: Cuántas licitaciones aplicaste, ganaste, tiempo/dinero ahorrado.

---

## 14. Roadmap de Producto

### Principio rector: **Strangler Fig Pattern**

No romper lo que funciona. Cada fase añade nueva funcionalidad sin eliminar la antigua
hasta que el reemplazo esté estable. El pipeline BI se desarrolla en paralelo y de forma
independiente al pipeline transaccional.

---

### Fase 0 — Preparación y Validación (Semana 1) · 5 días

**Objetivo**: Limpiar el proyecto, resolver bugs preexistentes, validar fuentes de datos
y ejecutar el Concierge MVP (ver sección 13.1) antes de comprometer semanas de desarrollo.

**Bugs a resolver en esta fase** (ver Sección 0.3 para detalles completos):
- Bug #2: `/api/data` sin auth → tarea 0.5
- Bug #3: `aiosmtplib` no usado → limpiar en tarea 0.7
- Bug #4: Token expiry 30 min → tarea 0.15
- Bug #5: `uvicorn --reload` en docker-compose → tarea 0.10
- Bug #6: ETL command comentado → tarea 0.12
- Bug #7: Ticket API hardcodeado → tarea 0.15

- [ ] **0.1** Crear rama `v3-yuca` desde `main`.
- [ ] **0.2** **DISCOVERY TÉCNICO (2 días)**:
  - Validar endpoint per-RUT: `GET datos-abiertos.chilecompra.cl/organismos-proveedores/{RUT}`. Documentar estructura de respuesta.
  - Descargar ZIP mensual OC, parsear 78 columnas, validar nombres exactos. Documentar en `docs/oc_historico_discovery.md`.
  - Si alguna fuente no sirve, redefinir estrategia antes de continuar.
- [ ] **0.3** Desactivar ETL de OC transaccional en Celery Beat. Mantener código.
- [ ] **0.4** Ocultar ruta `/dashboard/analytics` legacy con `ANALYTICS_ENABLED=false`.
- [ ] **0.5** **[Bug #2]** Mover endpoints `/api/data` a `router_debug.py` con guard `if settings.DEBUG`. **No deben ser accesibles en producción.**
- [ ] **0.6** **Reemplazar `pypdf2` por `pypdf==4.2.0`**.
- [ ] **0.7** Limpiar dependencias no usadas del backend: eliminar `aiosmtplib` (Bug #3) y la entrada duplicada de `httpx`. Limpiar ETL: eliminar `beautifulsoup4`, `lxml`, `schedule` (no usadas; mantener `pandas`, `numpy`). Agregar nuevas: backend: `asyncpg`, `boto3`, `authlib`, `stripe`, `slowapi`, `tenacity`, `structlog`, `python-magic`, `flower`, `duckdb`, `pandas`, `scikit-learn`.
- [ ] **0.8** Agregar `tenacity`, `pandas`, `duckdb` a `etl/requirements.txt` (si no están ya).
- [ ] **0.9** Agregar al frontend: `react-dropzone`, `@tanstack/react-query`, `react-hot-toast`.
- [ ] **0.10** **[Bug #5]** Actualizar `infra/docker-compose.yml`: eliminar `--reload` del backend, agregar `--workers 2`, descomentar o migrar el command del ETL, agregar servicios `minio`, `minio-init` y `flower`.
- [ ] **0.11** **Iniciar proceso de aprobación de WhatsApp WABA con Twilio/Meta** (toma 4-8 semanas).
- [ ] **0.12** Actualizar `backend/app/celery_app.py` con `timezone=America/Santiago`, `acks_late=True`, y el `beat_schedule` completo definido en sección 9.6. **Nota**: actualmente no hay ningún `beat_schedule` — este archivo hay que reescribirlo casi por completo.
- [ ] **0.13** Crear `backend/app/core/database.py` nuevo con `create_async_engine` y `AsyncSession` (sección 9.5). Mover `backend/app/config.py` a `backend/app/core/config.py` y actualizar todos los imports en el proyecto.
- [ ] **0.14** Agregar tabla `task_failures` como primera migración Alembic nueva (posterior a `003`).
- [ ] **0.15** **[Bugs #4, #7]** Actualizar `.env.example`: cambiar `ACCESS_TOKEN_EXPIRE_MINUTES` de 30 a 1440, eliminar el `MERCADO_PUBLICO_TICKET` duplicado, cambiar su default a cadena vacía, agregar todas las variables nuevas (ver sección 15.6).
- [ ] **0.16** Ejecutar Concierge MVP (ver sección 13.1, Hito 3) en paralelo.

---

### Fase 1 — Modelo de Empresa y Estado Hábil (Semanas 2–3) · 10 días

**Objetivo**: El usuario puede registrar su empresa y ver su estado hábil. Primer "aha moment".

- [ ] **1.1** Migración Alembic: tablas `empresas_usuario`, `estado_habil_log`. Actualizar `licitaciones` y `alerts`. **Incluir en esta migración el fix del Bug #1**: `ALTER TABLE alerts RENAME COLUMN metadata TO alert_metadata` (ver Sección 0.3 y 10.1.3).
- [ ] **1.2** Crear modelos SQLAlchemy y schemas Pydantic para las nuevas tablas.
- [ ] **1.3** Crear `backend/app/api/empresas.py`:
  - `POST /api/empresas` — Crear empresa (valida RUT).
  - `GET /api/empresas/me` — Obtener empresa + estado hábil actual.
  - `GET /api/empresas/me/estado-habil/history` — Historial de cambios.
- [ ] **1.4** Crear `etl/extractors/estado_habil_extractor.py` con la estrategia per-RUT + fallback CSV (sección 7.2).
- [ ] **1.5** Crear `AlertService.create_alert_idempotent()`.
- [ ] **1.6** Crear Celery task `check_estado_habil_all_users` con patrón async correcto (ver sección 15.2).
- [ ] **1.7** Frontend — Widget `<EstadoHabilBadge>` prominente en dashboard.
- [ ] **1.8** Frontend — Onboarding Paso 1: ingresar RUT → verificar estado hábil → mostrar en < 2 minutos.

---

### Fase 2 — Pipeline BI Histórico v1 (Semana 3–4) · 8 días

**Objetivo**: Datos históricos de OC listos para consumo. Requisito para diferenciador vs. LicitaLab.

- [ ] **2.1** Crear `etl/pipelines/oc_historico_pipeline.py` con descarga ZIP, validación schema, carga DuckDB.
- [ ] **2.2** Cargar últimos 12 ZIPs (1 año de historial) como backfill inicial.
- [ ] **2.3** Crear vistas materializadas `oc_precios_benchmark` y `oc_competidores_rubro`.
- [ ] **2.4** Crear `TFIDFMatchingService` con `rebuild_index()` y `find_similar()`.
- [ ] **2.5** Crear `backend/app/api/bi.py` con endpoints de benchmarking y competidores.
- [ ] **2.6** Celery task `run_oc_historico_pipeline` y `rebuild_tfidf_index` (1er día del mes, 03:00 + 06:00 SCL).

---

### Fase 3 — Gestor de Documentos (Semanas 4–5) · 8 días

- [ ] **3.1** Crear `DocumentService` con `generate_upload_url()` y `generate_download_url()` (con `_validate_s3_key_ownership()` explícita).
- [ ] **3.2** Migración para tabla `documentos_empresa`.
- [ ] **3.3** Crear `backend/app/api/documentos.py`.
- [ ] **3.4** Celery task `check_document_expiry` (09:30 AM Santiago). Usar `create_alert_idempotent()`.
- [ ] **3.5** Aplicar cuotas por plan en el endpoint de upload (ver sección 16.3).
- [ ] **3.6** Frontend — Página `/documentos`: categorías, `<DocumentUpload>` con `react-dropzone`, badges de vigencia.

---

### Fase 4 — Checklist de Postulaciones (Semanas 6–7) · 10 días

- [ ] **4.1** Migración para tablas `postulaciones`, `checklist_postulacion`, `plantillas_checklist`.
- [ ] **4.2** Poblar `plantillas_checklist` con datos reales por tipo de licitación. **Requiere input del analista de licitaciones.**
- [ ] **4.3** Crear `ChecklistService.generate_from_template()`.
- [ ] **4.4** Crear `backend/app/api/postulaciones.py`.
- [ ] **4.5** Celery task `send_deadline_reminders` (09:00 AM Santiago). Usar `create_alert_idempotent()`.
- [ ] **4.6** Frontend — Detalle de licitación: botón "Agregar a mis postulaciones", checklist con progress bar, panel BI inline (precio rango, top competidores en el rubro).

---

### Fase 5 — Dashboard y Onboarding (Semana 8) · 5 días

- [ ] **5.1** Rediseñar `/dashboard`: Card Estado Hábil → Card Plazos → Card Alertas → Widget BI rápido (precio rango del rubro, top competidores).
- [ ] **5.2** Flujo `/onboarding` en 5 pasos: RUT → estado hábil → rubros → oportunidades → primera alerta.
- [ ] **5.3** Página `/bi` con vista completa: benchmarking, mapa de competidores, matching semántico.
- [ ] **5.4** Redirect usuarios con `onboarding_completed=false` a `/onboarding` al login.

---

### Fase 6 — Billing Stripe (Semana 9) · 5 días

- [ ] **6.1** Crear productos en Stripe: basico (free), pyme (USD 25), pro (USD 55), contador (USD 95).
- [ ] **6.2** Crear `backend/app/api/billing.py` con webhook verificado por firma.
- [ ] **6.3** Middleware de plan en endpoints (incluyendo BI).
- [ ] **6.4** Frontend — Página `/precios` y componente de upgrade en sidebar.

### Fase 6b — Transbank Webpay (Post-MVP)

- [ ] Integrar Transbank Webpay Plus para pago único local (usuarios que prefieren WebPay).

---

### Fase 7 — Google OAuth + WhatsApp (Semana 10) · 4 días

> **Prerequisito**: El proceso WABA debe haberse iniciado en Semana 0.

- [ ] **7.1** Google OAuth con `authlib`.
- [ ] **7.2** Twilio WABA para alertas críticas.
- [ ] **7.3** Fallback automático a email si WhatsApp falla.

---

### Resumen del Roadmap

```
Semana 1:   [FASE 0] Limpieza + Discovery técnico + Concierge MVP (en paralelo)
Semana 2:   [FASE 1] Empresa + Estado Hábil (backend + ETL per-RUT)
Semana 3:   [FASE 1] Estado Hábil (frontend) + [FASE 2] Pipeline BI histórico
Semana 4:   [FASE 2] BI endpoints + TF-IDF + [FASE 3] Documentos (backend)
Semana 5:   [FASE 3] Documentos (frontend)
Semana 6:   [FASE 4] Checklist (backend + datos de plantillas)
Semana 7:   [FASE 4] Checklist (frontend) + Panel BI en detalle licitación
Semana 8:   [FASE 5] Dashboard + Onboarding + Página BI completa
Semana 9:   [FASE 6] Billing Stripe
Semana 10:  [FASE 7] Google OAuth + WhatsApp (si WABA aprobado)
────────────────────────────────────────────────────────────────────
Total: ~10 semanas · ~52 días de desarrollo
Con 1 dev full-stack senior: ~2.5 meses
```

---

## 15. Estándares de Calidad y Arquitectura

### 15.1 Arquitectura: Monolito Modular

```
backend/app/
├── api/           → Capa de presentación. SIN lógica de negocio. Solo llama a Services.
├── services/      → Capa de lógica de negocio (independiente de HTTP y DB)
│                    alert_engine.py, document_service.py,
│                    estado_habil_service.py, checklist_service.py,
│                    alert_service.py (con idempotency),
│                    tfidf_service.py (matching semántico),
│                    bi_service.py (queries DuckDB)
├── models/        → Capa de datos (SQLAlchemy ORM). Sin lógica de negocio.
├── schemas/       → DTOs Pydantic. Separados de modelos ORM.
├── tasks/         → Workers Celery. Solo invocan Services.
│                    alert_tasks.py, etl_tasks.py, bi_tasks.py
└── core/          → Infraestructura transversal
                     security.py, database.py (pool config + asyncpg),
                     email.py, config.py, metrics.py, logging_config.py

etl/
├── extractors/    → LicitacionExtractor, EstadoHabilExtractor
└── pipelines/     → OCHistoricoPipeline (independiente del ETL transaccional)
```

**Regla de dependencias**: `api → services → models`. Nunca al revés.

### 15.2 Patrón Correcto para Celery Tasks con Código Async

> **CRÍTICO — BUG COMÚN**: Las Celery tasks son funciones `def` (síncronas). Usar `await`
> directamente dentro de un `def` task lanza `RuntimeError: no running event loop`. El
> patrón correcto es `asyncio.run()`.

```python
# backend/app/tasks/alert_tasks.py

import asyncio
import structlog

logger = structlog.get_logger()

@celery_app.task(
    bind=True, max_retries=3, default_retry_delay=300,
    acks_late=True, on_failure=register_task_failure
)
def check_estado_habil_all_users(self):
    """
    Task Celery SÍNCRONA que envuelve código async con asyncio.run().
    Este es el patrón correcto — NO usar await directamente en un def task.
    """
    try:
        asyncio.run(_check_estado_habil_async())
    except Exception as exc:
        logger.error("check_estado_habil_failed", error=str(exc))
        raise self.retry(exc=exc)


async def _check_estado_habil_async():
    """
    Implementación async real. Separada del task para ser testeable
    sin necesidad de correr el worker de Celery.
    """
    extractor = EstadoHabilExtractor()
    # Descargar CSV masivo una sola vez como caché de fallback
    csv_cache = await extractor.download_csv_masivo()

    async with AsyncSessionLocal() as db:
        empresas = (await db.execute(
            select(EmpresaUsuario).where(EmpresaUsuario.activo == True).limit(1000)
        )).scalars().all()

        alert_service = AlertService()
        for empresa in empresas:
            nuevo_estado = await extractor.check_rut_con_fallback(
                empresa.rut_empresa, csv_cache
            )
            if nuevo_estado != empresa.estado_habil:
                await alert_service.create_alert_idempotent(
                    db=db,
                    empresa_id=str(empresa.id),
                    alert_type="estado_habil_cambio",
                    context_date=date.today(),
                    metadata={
                        "estado_anterior": empresa.estado_habil,
                        "estado_nuevo": nuevo_estado,
                    }
                )
                empresa.estado_habil = nuevo_estado
                empresa.estado_habil_updated_at = datetime.utcnow()

        await db.commit()

    redis_client.set("last_run:check_estado_habil", time.time(), ex=86400)


# Aplicar el mismo patrón asyncio.run(_async()) a:
# - send_deadline_reminders
# - check_document_expiry
# - run_oc_historico_pipeline (task BI)


@celery_app.task(bind=True, acks_late=True)
def watchdog_check(self):
    """Tarea sync — no requiere asyncio.run()."""
    last_run = redis_client.get("last_run:check_estado_habil")
    if not last_run or time.time() - float(last_run) > 25200:
        send_ops_alert("⚠️ check_estado_habil no ejecutó en 7h")
```

### 15.3 ETL con Retry y Fallback

```python
# etl/extractors/licitacion_extractor.py

from tenacity import retry, stop_after_attempt, wait_exponential

class LicitacionExtractor:

    API_BASE = "http://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json"

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=60),
        reraise=True
    )
    async def fetch_by_date(self, fecha: date) -> list[dict]:
        fecha_str = fecha.strftime("%d%m%Y")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                self.API_BASE,
                params={
                    "fecha": fecha_str,
                    "ticket": settings.MERCADOPUBLICO_API_TICKET
                }
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
            "fecha_cierre":      self._parse_dt(raw.get("Fechas", {}).get("FechaCierre")),
            "fecha_publicacion": self._parse_dt(
                raw.get("Fechas", {}).get("FechaPublicacion")
            ),
            "dias_cierre":       raw.get("DiasCierreLicitacion"),
            "extension_plazo":   bool(raw.get("ExtensionPlazo", 0)),
            "categorias_unspsc": [
                item.get("CodigoCategoria")
                for item in raw.get("Items", {}).get("Listado", [])
                if item.get("CodigoCategoria")
            ],
        }
```

### 15.4 Logging Estructurado

```python
# backend/app/core/logging_config.py

import structlog

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

# NUNCA loggear: rut, password, s3_key completa, contenido de docs
# SÍ loggear: empresa_id, user_id, alert_type, estado resultado, bi_query_ms
```

### 15.5 Testing Mínimo para Production-Ready

| Tipo | Cobertura mínima | Herramienta |
|---|---|---|
| Unit tests (services) | 80% | pytest + pytest-mock |
| Integration tests (API) | auth, empresa, checklist, billing webhook, BI endpoints | pytest + httpx |
| ETL tests (licitaciones) | Parsing de respuesta real con fixtures | pytest |
| ETL tests (estado hábil) | Endpoint per-RUT + fallback CSV con fixtures | pytest |
| Pipeline BI tests | Parse ZIP, carga DuckDB, vistas materializadas | pytest |
| TF-IDF tests | Calidad de matching con queries de ejemplo | pytest |
| Celery async pattern | Verificar que `asyncio.run()` envuelve correctamente | pytest + celery test mode |
| Alert idempotency | Verificar que reintentos no generan duplicados | pytest + celery test mode |
| Frontend E2E | Flujo onboarding completo + flujo BI | Playwright |

### 15.6 Variables de Entorno (`.env.example`)

```bash
# === DATABASE ===
# CRÍTICO: Usar +asyncpg para código nuevo async.
# Alembic sigue usando psycopg2 (sin +asyncpg) vía DATABASE_URL_SYNC.
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/yuca
DATABASE_URL_SYNC=postgresql://user:pass@localhost:5432/yuca

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
S3_BUCKET=yuca-documentos
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
STRIPE_PRICE_CONTADOR=price_...
STRIPE_PRICE_GREMIO=price_...

# === NOTIFICACIONES ===
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=alertas@yuca.cl
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# === ETL — API MERCADO PÚBLICO ===
MERCADOPUBLICO_API_TICKET=

# === FUENTES DATOS ABIERTOS CHILECOMPRA ===
ESTADO_HABIL_PER_RUT_URL=https://datos-abiertos.chilecompra.cl/organismos-proveedores
DATOS_ABIERTOS_CSV_URL=https://datos-abiertos.chilecompra.cl/proveedores/habiles
OC_ZIP_BASE_URL=https://transparenciachc.blob.core.windows.net/oc
ESTADO_HABIL_CHECK_INTERVAL_HOURS=6

# === BI / DUCKDB ===
DUCKDB_PATH=/data/oc_historico.duckdb
TFIDF_S3_KEY=tfidf/index.pkl
BI_QUERY_TIMEOUT_SECONDS=30

# === FLOWER ===
FLOWER_PASSWORD=change-me

# === APP ===
# Nombre del producto — PLACEHOLDER hasta que se defina el nombre comercial final
APP_NAME=YUCA
CORS_ORIGINS=http://localhost:3000,https://yuca.cl
DEBUG=false
ANALYTICS_ENABLED=false
```

---

## 16. Política de Datos, Backups y Cuotas

### 16.1 Backups de PostgreSQL

| Parámetro | Valor MVP | Valor > USD 3K MRR |
|---|---|---|
| Frecuencia | Snapshot diario (Supabase Pro) | Snapshot cada 6h |
| Retención | 7 días | 30 días |
| Test de restauración | Mensual a staging | Quincenal |
| RTO objetivo | 4 horas | 2 horas |
| RPO objetivo | 24 horas | 6 horas |

### 16.2 Backups de DuckDB

El archivo DuckDB es regenerable desde los ZIPs de ChileCompra. Sin embargo:

- Snapshot semanal del archivo `.duckdb` a S3 para evitar tener que re-procesar todo el historial.
- El índice TF-IDF se serializa a S3 tras cada reconstrucción (ya cubierto en `TFIDFMatchingService`).

### 16.3 S3 Lifecycle Policies

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

### 16.4 Cuotas por Plan

| Plan | Documentos máx. | Tamaño máx./doc | Almacenamiento total | Alertas activas | BI |
|---|---|---|---|---|---|
| Básico | 5 | 5 MB | 25 MB | 5 | Sin acceso |
| PYME | 50 | 25 MB | 500 MB | Ilimitadas | Precios básico |
| Pro | 200 | 25 MB | 2 GB | Ilimitadas | Completo + matching |
| Contador | 1.000 | 25 MB | 10 GB | Ilimitadas | Completo + multi-empresa |
| Gremio | Custom | 25 MB | Custom | Ilimitadas | Completo + sectorial |

---

## 17. Riesgos y Mitigaciones

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| **LicitaLab lanza plan básico USD 15** | Media | Alto | Diferenciación por compliance + BI accionable simple. Su costo de servir clientes pequeños es alto con equipo actual de 20 personas. |
| **Endpoint per-RUT no funciona como se documenta** | Media | Alto | Semana 0: validar manualmente con 5 RUTs reales. Si falla, usar CSV masivo como fuente principal. |
| **API ChileCompra cambia schema o restringe acceso** | Baja | Alto | Descarga mensual ZIP como respaldo. La URL es política pública — cambios lentos y anunciados. Monitoring automático de parsing. |
| **Schema del ZIP OC cambia entre meses** | Media | Medio | Tests automáticos de validación de columnas en cada ingesta (`OC_SCHEMA_COLUMNS_REQUIRED`). Fallo explícito si columnas clave faltan. |
| **DuckDB no escala con historial completo (v2)** | Media | Medio | DuckDB soporta decenas de GB embebido. Si p95 queries > 5s, migrar a ClickHouse o BigQuery. No es un riesgo para MVP. |
| **TF-IDF no suficientemente preciso para matching** | Media | Medio | Validar con 20 casos reales antes del MVP. Si precisión < 60%, upgrade a `sentence-transformers` livianos (all-MiniLM-L6-v2). |
| **Datos históricos BI no generan engagement** | Media | Medio | Validar con Concierge MVP: entregar manualmente reporte "competidores en tu rubro" y medir cambio de comportamiento. |
| **Churn alto en primeros 3 meses** | Alta | Medio | Onboarding asistido (call 30 min) para primeros 50 clientes. Concierge MVP antes de automatizar. Feedback semanal. |
| **WhatsApp WABA no aprobado para el lanzamiento** | Media | Bajo | El MVP funciona completamente con solo email. WhatsApp es una mejora, no un bloqueante. |
| **ChileCompra lanza solución propia mejorada** | Baja | Medio | La plataforma oficial está orientada al organismo comprador, no al proveedor — ángulo opuesto. |

---

## Apéndice A: Resumen Ejecutivo para el Desarrollador

> **Si solo lees una página de este documento, que sea esta.**

**Lo que tienes hoy**: Un SaaS funcional para buscar y monitorear licitaciones (LicitUp).
Stack correcto, código limpio, bien estructurado.

**Lo que debes construir**: Un "backoffice inteligente" para PYMES con dos capas:

**Capa 1 — Compliance operativo** (MVP): Monitor de estado hábil, gestor de documentos
con alertas de vencimiento, checklist de postulación. El usuario no pierde plazos ni
queda inhábil.

**Capa 2 — Inteligencia pre-postulación** (MVP también): Antes de invertir 4 horas en una
oferta, el usuario sabe qué precio poner, quién compite, y si vale la pena. Los datos
vienen de los ZIPs gratuitos de ChileCompra — 78 campos/OC, descarga mensual.

**No construyas** (sin validación previa): Alertas predictivas de estacionalidad, score de
oportunidad, PWA. Son v3.

**Semana 0 es inegociable**:
1. Validar el endpoint `datos-abiertos.chilecompra.cl/organismos-proveedores/{RUT}`.
2. Descargar el ZIP de OC, parsear las 78 columnas, confirmar nombres exactos.
3. Ejecutar el Concierge MVP: 5 empresas, servicio manual, ¿pagan el mes 2?

**Los horarios Celery son en hora Santiago** (`America/Santiago`), no UTC.

**El patrón Celery async es `asyncio.run(_async_fn())`**, nunca `await` en un `def` task.

**`DATABASE_URL` necesita `+asyncpg`**: `postgresql+asyncpg://...`

**DuckDB corre embebido** en un worker separado. No es una DB externa — es un archivo
local que permite queries analíticas sobre millones de filas de OC sin infraestructura
adicional.

**Regla de decisión de features**: Si una PYME con 3 licitaciones/mes no lo necesita en
su primera semana, va al backlog.

**Nombre del producto**: "YUCA" es un **placeholder**. El nombre comercial final aún no
está definido. Usar `APP_NAME` en lugar de hardcodear el nombre en emails, títulos y logos.

---

## Apéndice B: Log de Correcciones y Cambios

| # | Criticidad | Descripción | Sección | Versión |
|---|---|---|---|---|
| 1 | CRÍTICO | Extractor estado hábil sin validar (estrategia CSV-only) → endpoint per-RUT + CSV fallback | 7.2 | v3.0 |
| 2 | CRÍTICO | Celery Beat sin health checks ni DLQ | 6.4, 15.2 | v2.1 |
| 3 | CRÍTICO | `assert` desactivable con `-O` en autorización S3 → validación explícita | 11.1 | v2.1 |
| 4 | CRÍTICO | Sin idempotencia en alertas → duplicados en reintentos Celery | 10.1.3, 11.4 | v2.1 |
| 5 | CRÍTICO | Timezone UTC en crons → `America/Santiago` | 9.6, 15.2 | v2.1 |
| 6 | CRÍTICO | `pypdf2` deprecado con CVEs → `pypdf==4.2.0` | 2.4, 9.2 | v2.1 |
| 7 | CRÍTICO | Webhook Stripe sin verificación de firma | 11.3 | v2.1 |
| 8 | CRÍTICO | `asyncpg` faltante → `create_async_engine` crashea al arrancar | 9.1, 9.2 | v2.2 |
| 9 | CRÍTICO | `await` dentro de `def` Celery task → `RuntimeError` | 15.2 | v2.2 |
| 10 | ESTRATÉGICO | ETL OC descartado → rehabilitado como pipeline BI histórico separado | 6.1, 8, 14 | **v3.0** |
| 11 | ESTRATÉGICO | Analytics descartado → reemplazado por BI accionable (Capa 2) | 2.3, 8 | **v3.0** |
| 12 | ESTRATÉGICO | Producto sin diferenciador vs. LicitaLab → matching semántico TF-IDF + benchmarking OC | 8.1, 8.3 | **v3.0** |
| 13 | NUEVO | Sección Análisis Competitivo completo (LicitaLab, incumbentes, posicionamiento) | 1 | **v3.0** |
| 14 | NUEVO | Sección Propuesta de Valor y ICP detallado (4 segmentos con JTBD) | 3 | **v3.0** |
| 15 | NUEVO | Sección Mercado y Oportunidad (TAM, señales, distribución OC) | 4 | **v3.0** |
| 16 | NUEVO | Sección BI e Inteligencia Pre-Postulación (DuckDB, TF-IDF, endpoints) | 8 | **v3.0** |
| 17 | NUEVO | Sección Go-to-Market (Concierge MVP, canales, retención) | 13 | **v3.0** |
| 18 | NUEVO | Sección Modelo de Negocio y Pricing (5 planes, unit economics, escenarios) | 12 | **v3.0** |
| 19 | NUEVO | Sección Riesgos y Mitigaciones | 17 | **v3.0** |
| 20 | NUEVO | Pipeline OC histórico (OCHistoricoPipeline, DuckDB, vistas materializadas) | 8.2 | **v3.0** |
| 21 | NUEVO | TFIDFMatchingService (scikit-learn, serialización S3) | 8.3 | **v3.0** |
| 22 | MEJORA | `python-magic` mencionado pero no en requirements | 9.2, 11.1 | v2.2 |
| 23 | MEJORA | `tenacity` faltante en `etl/requirements.txt` | 9.3 | v2.2 |
| 24 | MEJORA | MinIO y Flower en docker-compose sin config → snippets completos | 9.7 | v2.2 |
| 25 | MEJORA | `DATABASE_URL` format ambigua → documentado `+asyncpg` vs sync para Alembic | 15.6 | v2.2 |
| 26 | MEJORA | Sin circuit breaker para APIs externas → `tenacity` con retry + fallback | 15.3 | v2.1 |
| 27 | MEJORA | Sin connection pool explícito | 9.5 | v2.1 |
| 28 | MEJORA | Nuevo plan `gremio` y fee opcional por postulación completada | 12.1 | **v3.0** |
| 29 | MEJORA | Backups de DuckDB documentados | 16.2 | **v3.0** |
| 30 | CRÍTICO | Bug `alert_metadata` vs `metadata`: columna SQL vs ORM inconsistente — alertas pierden metadatos | 0.3, 10.1.3 | **v3.1** |
| 31 | CRÍTICO | Endpoints `/api/data` sin autenticación — acceso irrestricto a DB | 0.3, 2.4 | **v3.1** |
| 32 | CRÍTICO | `uvicorn --reload` en docker-compose de producción — reinicio no controlado | 0.3 | **v3.1** |
| 33 | CRÍTICO | Token JWT expira en 30 min sin refresh — usuarios se desloguean solos | 0.3, 0.12 | **v3.1** |
| 34 | CRÍTICO | Celery Beat no tiene `beat_schedule` definido — no ejecuta ninguna tarea periódica | 0.3, 9.6 | **v3.1** |
| 35 | ALTO | Category matching en `AlertEngine` completamente sin implementar (stub `pass`) | 0.3 | **v3.1** |
| 36 | ALTO | Ticket API Mercado Público hardcodeado en `etl/config.py` | 0.3 | **v3.1** |
| 37 | MEDIO | `aiosmtplib` en requirements pero email usa sync `smtplib` — librería muerta | 0.3, 0.5 | **v3.1** |
| 38 | MEDIO | Deps ETL no usadas: `beautifulsoup4`, `lxml`, `schedule` — hinchen imagen Docker | 0.4 | **v3.1** |
| 39 | NUEVO | Sección 0: Inventario del Estado Real del Codebase (8 bugs + deuda técnica + inventarios completos) | 0 | **v3.1** |
| 40 | NUEVO | Rutas de módulos clarificadas: `app/config.py` y `app/db/` son estado actual; `core/config.py` y `core/database.py` son el objetivo YUCA | 0.2, 9.5, 9.6 | **v3.1** |
| 41 | VALIDACIÓN | Discovery completado: No existe CSV masivo de estado hábil. Fuente única: endpoint per-RUT en datos-abiertos.chilecompra.cl | 7.2, tareas_manuales | **v3.1** |
| 42 | VALIDACIÓN | API Key de Mercado Público ya disponible (ticket demo público en `.env.example`) | tareas_manuales | **v3.1** |

---

## Apéndice C: Cambios Principales v2.2 → v3.0

### Cambios principales realizados

1. **Reincorporación de BI (Capa 2)**: La spec v2.2 descartaba todo lo relacionado a analytics. YUCA v3.0 los rehabilita como diferenciador estratégico central, implementados sobre datos abiertos (ZIPs OC), DuckDB embebido y TF-IDF — sin LLM en MVP.

2. **Pipeline BI separado del pipeline transaccional**: El ETL de OC que la v2.2 desactivó vuelve como un pipeline independiente (`etl/pipelines/oc_historico_pipeline.py`) con schedule mensual, DuckDB como almacén y Celery tasks separadas. No interfiere con el pipeline transaccional diario.

3. **Endpoint per-RUT para estado hábil**: La v2.2 usaba solo CSV masivo. La v3.0 incorpora el endpoint `datos-abiertos.chilecompra.cl/organismos-proveedores/{RUT}` documentado en el Plan YUCA, con el CSV masivo como fallback. Sujeto a validación en Semana 0.

4. **Renaming de planes**: Plan `free` renombrado a `basico` para alinearse con la nomenclatura del Plan YUCA. Se agrega plan `gremio`.

5. **Secciones estratégicas nuevas**: Se incorporan las secciones 1 (Análisis Competitivo), 3 (ICP), 4 (Mercado), 12 (Pricing), 13 (GTM) y 17 (Riesgos) del Plan YUCA que faltaban completamente en la spec técnica.

### Secciones nuevas agregadas

- Sección 1: Análisis Competitivo y Posicionamiento
- Sección 3: Propuesta de Valor y ICP
- Sección 4: Mercado y Oportunidad
- Sección 8: BI e Inteligencia Pre-Postulación (DuckDB, OCHistoricoPipeline, TFIDFMatchingService)
- Sección 12: Modelo de Negocio y Pricing
- Sección 13: Go-to-Market
- Sección 17: Riesgos y Mitigaciones

### Supuestos técnicos introducidos

1. **DuckDB embebido es suficiente para MVP y v1**: Estimación de ~50MB para 1 año de historial y ~150MB para 3 años. Si el historial completo (~2GB) requiere queries complejas con p95 > 5s, se migrará a ClickHouse.

2. **TF-IDF es suficiente para matching semántico en MVP**: Se asume que el corpus de ~200K títulos de OC históricos (1 año) genera un índice de calidad aceptable. Si la precisión es < 60% en pruebas con casos reales, se upgradea a `sentence-transformers` livianos.

3. **Endpoint per-RUT de estado hábil es estable**: Documentado en el Plan YUCA v2.1 con ejemplo de URL. Se asume que la estructura de respuesta incluye un campo `Proveedor.Estado`. Los nombres exactos de los campos deben confirmarse en el discovery de Semana 0.

4. **Schema de 78 columnas del ZIP OC es estable**: Se asume que las columnas clave listadas en `OC_SCHEMA_COLUMNS_REQUIRED` no cambian entre meses. El pipeline falla explícitamente si detecta columnas faltantes.

5. **Worker BI puede correr en el mismo proceso FastAPI (MVP)**: Las queries DuckDB son de baja frecuencia y se ejecutan con timeout de 30s. Si el volumen de usuarios concurrentes lo requiere, se separa en un worker dedicado.

---

*YUCA SPEC.md v3.1 · Marzo 2026 · Confidencial*
*Integra: LicitaFácil SPEC.md v2.2 + YUCA Plan Estratégico SaaS v2.1*
*Correcciones incorporadas: 9 críticos (v2.1+v2.2) + cambios estratégicos YUCA v2.1 + auditoría codebase v3.1 (8 bugs + deuda técnica)*
