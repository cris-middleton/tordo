# Revisión de Arquitectura — TORDO

> **Fecha**: 2026-08-05 · **Commit revisado**: `2348535` (main) · **Autor**: revisión técnica senior
> **Alcance de referencia considerado**: LicitaLab (CL/PE/CO), LicitApp, Falconsoft SGL/POM.
> **Convenciones de ingeniería contrastadas contra**: workspace `~/github` (api-ref,
> servicio-usuarios-ref, payment-gateway, auction-engine, frontend-ref).

---

## 0. Veredicto en una página

**La aplicación no está mal construida.** Es un monolito modular competente, con profundidad de
dominio real y varias decisiones que están por encima del promedio de una startup en esta etapa
(§1). No hay que reescribirla.

Lo que sí hay son **cuatro problemas de fondo**, y los cuatro son más baratos de arreglar hoy que
en seis meses:

| # | Problema | Por qué importa | Costo hoy | Costo en 6 meses |
|---|---|---|---|---|
| **A** | El plano de datos analítico (parquet en disco local + caché en el proceso de la API) **no sobrevive al despliegue real** | La API no escala horizontalmente, no arranca en frío, y en Railway el BI simplemente no puede funcionar | 1–2 sem | Rehacer con usuarios pagando |
| **B** | La **multi-tenancy se garantiza por repetición**, no por construcción (12+ chequeos manuales de membresía) | Un endpoint nuevo sin el chequeo = fuga de datos entre empresas | 3–4 días | Incidente de seguridad |
| **C** | **Cero andamiaje de ingeniería**: sin CI, sin linter, sin lockfile, sin pre-commit, 1 073 líneas de tests para 42 000 de código | Cada cambio es una apuesta; imposible delegar en agentes con confianza | 1 sem | Se vuelve cultural |
| **D** | El **modelo de datos está casado con "licitación chilena"** cuando el alcance de referencia es multi-país y multi-tipo de convocatoria | Compra Ágil / Convenio Marco / Trato Directo son ~la mitad del mercado y no existen en el modelo | 1–2 sem | Migración con datos productivos |

Además hay **un hallazgo de seguridad que hay que atender hoy, no en el plan**: `backend/.env` está
versionado en git con credenciales reales de Twilio, y `/api/data/*` expone 8 endpoints públicos sin
autenticación sobre el dataset que es el activo del producto (§2).

**Recomendación:** sí, mutar ahora — pero **quirúrgicamente y en este orden**: F0 sanitización →
F1 cimientos → F2 plano analítico → F3 tenancy y capas → F4 modelo de datos. No es un rewrite; es
~5–8 semanas de trabajo enfocado sobre una base que se conserva.

---

## 1. Lo que está bien (y no hay que tocar)

Esto no es cortesía: son decisiones que normalmente hay que enseñar, y acá ya están tomadas bien.

- **El BI jerárquico L1→L2→L3 con confianza y `n`** (`bi_service.py:51`). Lo obvio habría sido
  devolver un promedio. Devolver `p10..p90` + nivel de fallback usado + tamaño de muestra es
  la diferencia entre un número y una decisión. Está bien pensado.
- **Hito 0: se probó la hipótesis y se reportó que falló.** `SPEC.md §1.3` documenta que el test
  original (CV < 40 % a nivel rubro) falló con 4.8 %, y **reencuadra el producto** hacia
  producto+organismo+unidad (46.6 % de cobertura). Eso es disciplina de ingeniería real, no
  optimismo de pitch deck.
- **El harness de evaluación** (`etl/analytics/evaluation/`: splits, walk-forward de 4 folds,
  métricas, variantes, registry, reporter). Esto es práctica de ML más madura que la de la mayoría
  de las startups que dicen tener IA. Consérvenlo y extiéndanlo.
- **Idempotencia en alertas** (`idempotency_key` UNIQUE + `INSERT ON CONFLICT`). Correcto.
- **`task_failures` + watchdog cada 30 min** — hay una noción explícita de que los jobs fallan.
- **Feature flags reales** (`config.py`), con 503 y mensaje accionable cuando algo está apagado
  (`bi.py:49`). No son `if False:`.
- **Cuotas por plan con Redis + gating por tier** (`core/plan_limits.py`). El modelo de negocio
  está en el código, no en la cabeza de alguien.
- **Arquitectura de 3 capas en ETL** (básico → detalle → historial, con hash de contenido para
  detección de cambios). Está documentada en `etl/PROPUESTA_MEJORA_ARQUITECTURA.md` y ejecutada.
- **`dashboard_home_cache` + `precompute_dashboard_matches`** — precomputar de noche y servir de
  caché es exactamente el patrón correcto. **Es el patrón que hay que generalizar en F2.**
- **Abstracción de storage** (local/S3 con presigned URLs) y cuotas por plan.

---

## 2. Atender hoy (no es parte del plan por fases)

### 2.1 Credenciales reales versionadas en git — CRÍTICO

`backend/.env` está **trackeado** (fue commiteado antes de agregarlo al `.gitignore`, así que el
`.gitignore` no lo protege). Contiene:

```
DB_URL, JWT_SECRET, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
```

`TWILIO_AUTH_TOKEN` es una credencial viva que permite enviar mensajes cobrando a la cuenta.
También están trackeados `frontend/.env.local`, `backend/celerybeat-schedule` (binario de estado) y
`.claude/settings.local.json`.

**Acción, en este orden:**
1. **Rotar el token de Twilio ya** (consola de Twilio → Auth Token → rotate). Rotar `SECRET_KEY`
   del JWT y la contraseña de la BD.
2. `git rm --cached backend/.env frontend/.env.local backend/celerybeat-schedule .claude/settings.local.json`
3. Agregar `.claude/settings.local.json` y `celerybeat-schedule` al `.gitignore`.
4. El repo es privado y de un solo autor: reescribir la historia con `git filter-repo` es viable y
   barato. Aun así, **rotar primero** — la reescritura no invalida una credencial ya expuesta.

### 2.2 `/api/data/*` es público y expone el activo del producto — ALTO

`backend/app/api/data_inspection.py:24` define deliberadamente un esquema de auth opcional
(`auto_error=False`) para que los endpoints funcionen sin token. Los 8 endpoints incluyen:

- `GET /api/data/tables` — estructura de la base
- `GET /api/data/licitaciones` y `/ordenes_compra` — volcado paginado de filas
- `GET /api/data/licitaciones/structure` — columnas y tipos
- `GET /api/data/summary` — estadísticas del dataset

El middleware de rate limit (`main.py:33`) sólo cubre `/api/bi/*`, así que estos endpoints no tienen
ni límite. El dataset consolidado (78 columnas por OC, histórico 2018–2026) **es el moat del
producto**; está publicado sin llave.

**Acción:** o se elimina el router (es una herramienta de debug), o se pone detrás de
`get_current_superuser`. Si hay algo ahí que el frontend necesita, se expone como endpoint
específico y autenticado.

### 2.3 El handler global filtra internals — MEDIO

`main.py:69` devuelve al cliente `f"Error interno: {type(exc).__name__}: {exc}"`. Eso puede
contener fragmentos de SQL, rutas de archivo, o valores. Debe loguear el detalle con un
`request_id` y devolver sólo `{"detail": "Error interno", "request_id": "..."}`.

---

## 3. El problema arquitectónico de fondo: el plano de datos analítico

Este es **el** hallazgo. Todo lo demás es corregible incrementalmente; esto define si el producto
puede desplegarse y escalar.

### 3.1 Cómo funciona hoy

```
Celery beat (lunes 03:00)
   └─ subprocess.run(["python", "-m", "etl.analytics.run_all"])   ← etl_tasks.py:275
        └─ Polars → escribe ~20 .parquet en  etl/data/analytics/   (L1 solo pesa 60 MB)
                                    │
                        volumen ../etl/data:/workspace/etl/data:ro
                                    │
   FastAPI  ──  bi_service._load(f)  ──  _cache: dict[str, (ts, DataFrame)]  TTL 24 h
                                          │
                  main.py:@on_event("startup") → prewarm en background (60 MB + 71 MB npz)
```

### 3.2 Por qué no funciona

1. **Memoria por worker, no por servicio.** `_cache` es un dict a nivel de módulo. Con
   `gunicorn -w 4`, cuatro copias de 60 MB + 71 MB. Un contenedor Railway de 512 MB–1 GB muere.
   Esto es lo que fuerza el hack de `prewarm_bi_artifacts` y los imports diferidos por todo el
   código (`import polars as pl` dentro de `_load`, `import redis` dentro del middleware).
2. **Requiere sistema de archivos compartido entre ETL y API.** El `docker-compose` lo resuelve con
   un bind mount. **En Railway no existe eso** — los volúmenes son por servicio. Según
   `docs/deploy_steps/railway_deployment_guide.md`, la topología de producción es 6 servicios
   separados. **El BI, tal como está, no puede funcionar en esa topología.** Es un bloqueador de
   despliegue, no una deuda técnica.
3. **Las consultas son scans lineales en Python.** `bi_service.py:96` hace
   `df1["codigoProductoONU"].cast(str) == str(codigo_producto)` sobre 722 000 filas — un cast y un
   scan completo por request. No hay índice. Con 60 req/min por IP permitidos, eso es CPU quemada.
4. **Arranque en frío de decenas de segundos** y sin invalidación coordinada: cada instancia
   cachea por su cuenta con TTL de 24 h, así que después de un rebuild semanal distintas instancias
   sirven datos distintos hasta por 24 h.
5. **El ETL se invoca por `subprocess.run`** desde Celery (`etl_tasks.py:52,135,243,275`) — sin
   tipos, sin excepciones propagadas, sólo códigos de salida y timeouts. Acoplamiento por proceso y
   por ruta de archivo (`etl_workspace: "/workspace"`).

### 3.3 La corrección

**Regla que hay que establecer y no romper: el proceso de la API es stateless.** No carga modelos,
no cachea DataFrames, no depende del filesystem. Todo lo pesado ocurre en batch y aterriza en
Postgres o Redis.

```
Celery / Cloud Run Job
   └─ Polars sobre parquet   (SE MANTIENE — está validado y es rápido)
        └─ al final del batch: COPY a Postgres  →  analytics_price_bands_l1, _l2, _l3,
                                                   analytics_competidores, analytics_comprador, …
                                                   (con índices sobre las claves de consulta)
   └─ job nocturno TF-IDF  →  tabla  match_empresa_licitacion (empresa_id, licitacion_id, score)
        (ya existe para el home: dashboard_tasks.precompute_dashboard_matches — generalizarlo)

FastAPI  →  repositories/analytics.py  →  SQLAlchemy async  →  Postgres
            (sin caché en proceso, sin parquet, sin joblib, sin volumen)
```

**Por qué Postgres y no DuckDB/ClickHouse:** los *outputs* son chicos — 722 K bandas L1, 51 K L3,
97 K perfiles. Eso es trivial para Postgres con los índices correctos, y elimina un datastore en vez
de agregarlo. El cómputo pesado sobre millones de OC sigue siendo Polars en batch. Si más adelante
hacen falta consultas históricas ad-hoc en vivo, ahí sí: **DuckDB leyendo parquet desde Cloudflare
R2** (`httpfs` con predicate pushdown, sin traerse el archivo). No antes.

**Lo que esto elimina de un golpe:** `_cache`, `prewarm_bi_artifacts`, el volumen `:ro`, el techo de
memoria, el arranque en frío, la incoherencia entre instancias, y la mitad de los imports diferidos.

**Nota sobre el `subprocess`:** una vez que exista un `pyproject.toml` con grupos de dependencias
(F1), Celery importa las funciones del ETL directamente. Se van los 4 `subprocess.run`.

---

## 4. Multi-tenancy: garantizada por repetición

`_get_membership_or_403` (`api/empresas.py:23`) se llama manualmente en 12+ sitios, y en `bi.py` la
misma consulta está **inlineada cuatro veces** con variantes (`bi.py:226,423,476,519`). `tenders.py:83`
y `data_inspection.py:198` la reimplementan a mano.

El modelo es correcto (M2M `EmpresaUsuario` con rol y `UniqueConstraint`). El problema es que la
garantía depende de que nadie olvide la línea. Un endpoint nuevo sin ella es una fuga silenciosa
entre empresas.

**Corrección:** dependencia de FastAPI, no llamada manual.

```python
# app/api/v1/deps.py
class EmpresaContext(BaseModel):
    empresa_id: UUID
    rol: Literal["owner", "admin", "viewer"]

async def empresa_ctx(empresa_id: UUID, user=Depends(get_current_active_user), db=...) -> EmpresaContext: ...
def require_rol(*roles: str): ...   # factory: Depends(require_rol("owner", "admin"))
```

Más **un test que recorra `app.routes` y falle si una ruta bajo el árbol de empresa no declara la
dependencia**. Eso convierte la garantía en estructural. Como defensa en profundidad, más adelante:
RLS de Postgres con `SET LOCAL app.empresa_id`.

---

## 5. Modelo de datos frente al alcance objetivo

Contrastando con lo que hacen las referencias:

| Capacidad | LicitaLab | Falconsoft | TORDO hoy | Brecha |
|---|---|---|---|---|
| Tipos de convocatoria | Licitación, **Compra Ágil, Convenio Marco, Trato Directo, Cotizaciones** | Licitación + OC + Convenio Marco | Licitación + OC | **Faltan 3 de 5** |
| Países | CL, PE, CO | CL | CL (hardcodeado) | Sin abstracción de fuente |
| IA sobre bases | **LIA** — analiza las bases | — | Descartado por diseño ("sin LLM") | Es el diferenciador actual del mercado |
| Servidor MCP | **Sí** (integración Claude) | — | No | Barato y visible |
| Equipos / roles | "equipo sincronizado" | Por ejecutivo/línea | Backend sí, **UI no** | Falta UI de invitaciones |
| Integración ERP / API | — | **Sí** | No | Sin API pública ni API keys |
| Monitoreo de precios | Análisis de mercado | **Alertas de cambio de precio** | Bandas históricas | Falta el disparador |

### 5.0 La base de datos no se puede construir desde las migraciones — CRÍTICO

> Descubierto el 2026-08-05 al levantar el stack completo por primera vez. Corregido
> parcialmente en F1; la reconciliación queda en F4.

**Ninguna migración creaba `licitaciones` ni `ordenes_compra`**, las dos tablas centrales del
producto. La migración `001` las *altera* (`ADD COLUMN organismo_id`) dando por hecho que
existen. `alembic upgrade head` sobre una base vacía fallaba con
`relation "licitaciones" does not exist`.

Existían porque se creaban **fuera de Alembic**, con `Base.metadata.create_all()`:
- `backend/scripts/init_production_db.py:42`
- `etl/loaders/database_loader_v2.py:99` — **este se ejecuta en cada carga del ETL**

Consecuencias:

1. **No había forma reproducible de levantar un entorno.** Ni staging, ni recuperación ante
   desastre, ni un desarrollador nuevo, ni CI.
2. **El esquema de las dos tablas principales no estaba versionado en ninguna parte** salvo
   los modelos. Lo que hay en producción no está registrado.
3. **Los modelos y las migraciones divergieron.** `alembic check` reporta ~45 diferencias.
   Parte es ruido de autogenerate (índices sobre claves primarias), pero hay diferencias
   reales: `alerts.empresa_id` declara `ondelete=CASCADE` en el modelo y la migración creó
   `SET NULL`; `users.onboarding_step` es `SMALLINT` en la base e `Integer` en el modelo;
   `users.notification_whatsapp` difiere en nulabilidad; varias restricciones únicas e
   índices están declarados de una forma y creados de otra.

**Corregido en F1:** migración `000_baseline_licitaciones_ordenes` que crea ambas tablas en su
forma anterior a la `001`, idempotente (inspecciona antes de crear, así que las bases
existentes no se ven afectadas y no hace falta `alembic stamp`). Se corrigió además el
`downgrade` de `001`, que dejaba huérfanos los tipos ENUM `alerttype` y `alertstatus` y hacía
fallar el siguiente `upgrade`. Verificado: ciclo `upgrade → downgrade → upgrade` completo,
12 migraciones en cada sentido, 27 tablas.

**Pendiente en F4:** una migración de reconciliación que cierre las ~45 diferencias, y retirar
las llamadas a `create_all()` — sobre todo la del ETL, que puede crear tablas silenciosamente
saltándose las migraciones. Hasta entonces el job de deriva en CI es informativo, no bloqueante.

### 5.1 Defectos concretos del esquema

1. **`Column(JSON)` en vez de `JSONB`** — `licitacion.py:49-50`, `orden_compra.py:56-57`,
   `orden_compra_detalle.py:27-33`, `alert.py:99-113`. Postgres guarda `JSON` como texto: sin índice
   GIN, sin operadores, re-parseo en cada lectura. `dashboard_cache.py:11` ya usa
   `JSON().with_variant(JSONB(), "postgresql")` — **ese es el patrón; falta aplicarlo al resto.**
   Migración barata hoy, cara con 10 M de filas.
2. **Cero índices compuestos.** No hay una sola declaración `Index(...)` en los modelos ni en las
   migraciones. La consulta de listado filtra por `estado + region + fecha_publicacion + monto` y
   ordena — es un seq scan sobre una tabla que sólo crece.
3. **Búsqueda por `ILIKE '%término%'`** (`tenders.py:66`). Comodín inicial ⇒ ningún índice sirve.
   A escala esto se cae. Corrección: `tsvector` generado + índice GIN (`to_tsquery` en español), o
   `pg_trgm` si hace falta tolerancia a typos.
4. **La suscripción cuelga del `User`, no de un tenant.** `plan_tier`, `subscription_status`,
   `stripe_customer_id`, `trial_ends_at` están en `models/user.py`. `models/organization.py` **no es
   un tenant** — es `BuyerOrganization`, el organismo comprador. Consecuencia: si tres personas de
   la misma PYME usan el producto, cada una necesita su propio plan. Para un SaaS B2B con equipos
   esto es un error de modelado que se paga en soporte y en churn. **La suscripción pertenece a la
   cuenta/empresa; los usuarios son asientos.**
5. **Sin discriminador de tipo ni de fuente.** Aunque hoy sólo carguen licitaciones chilenas, agregar
   `tipo_convocatoria` y `fuente`/`pais` ahora cuesta una migración; después cuesta una migración
   con datos productivos y con código que asume el caso único en 40 lugares.
6. **PKs inconsistentes**: `Integer` en `users`/`licitaciones`, `UUID` en `empresas`/`postulaciones`.
   No vale la pena migrar lo existente; sí vale definir la regla para lo nuevo (UUIDv7 para entidades
   de negocio, `BigInteger` para tablas de ingesta masiva).

---

## 6. ¿Hay que mutar el stack? Decisión por componente

| Componente | Hoy | Veredicto | Razón |
|---|---|---|---|
| **FastAPI + SQLAlchemy 2.0 async + Alembic** | ✔ | **Mantener** | Es exactamente el stack de los 4 backends de `~/github`. Cambiarlo no compra nada y pierde transferencia de conocimiento. |
| **PostgreSQL** | ✔ | **Mantener** | Suficiente para todo el alcance previsible, incluido servir el BI (§3.3). |
| **Celery + Redis** | ✔ | **Mantener** | Funciona. Si en algún momento despliegan en GCP junto al resto, migrar a Cloud Tasks/Pub-Sub es mecánico. No es prioridad. |
| **Polars + Parquet (batch)** | ✔ | **Mantener** | Validado sobre datos reales. El problema nunca fue el motor de cómputo, fue el de servicio. |
| **Parquet en disco como capa de servicio** | ✔ | **MUTAR → Postgres materializado** | §3. Es el cambio de fondo. |
| **Next.js 14 App Router** | ✔ | **Mantener, modernizar** | Añadir TanStack Query + capa proxy + shadcn/ui. Next 15 cuando convenga. |
| **Auth propia (JWT HS256 30 min)** | ✔ | **Mantener ahora, preparar salida** | Ver abajo. |
| **Supabase** | — | **No** | Ver abajo. |
| **Stripe** | ✔ | **Mantener + agregar pasarela local** | Ver abajo. |
| **Railway** | ✔ | **Mantener** | Correcto para esta etapa. F2 es justamente lo que lo hace viable. |
| **MinIO dev / R2 prod** | ✔ | **Mantener** | Ya está abstraído bien. |

### 6.1 Auth — mantener, con tres correcciones y una preparación

Hoy: JWT HS256 de 30 minutos, **sin refresh token** (`api/auth.py` tiene register, login, google,
callback, change-password — no hay refresh), guardado en **`localStorage`**
(`frontend/lib/api.ts:17,46`), y el frontend llama al backend directamente vía
`NEXT_PUBLIC_API_URL`.

Eso implica: (a) cierre de sesión duro cada 30 minutos, (b) el token es exfiltrable por cualquier
XSS, (c) la URL del backend es pública.

**Corregir:**
1. Refresh token con rotación (y revocación en logout).
2. Sacar el token de `localStorage` → cookie `httpOnly` emitida por un **route handler de
   Next.js que actúa de proxy** (es la convención de `frontend-ref`: *nunca* llamar al backend
   desde un componente cliente).
3. Añadir `auth_provider` y `external_sub` a `users` ahora.

**Y no migrar todavía.** Con (3) hecho, mudarse a Auth0 (que es lo que ya corre en los 4 servicios
de `~/github`, con tooling y skill propios) es una migración de datos, no un rewrite. El momento
para hacerlo es cuando el primer deal de gremio/enterprise pida SSO — no antes, porque Auth0 cobra
desde el día uno y aquí no es el cuello de botella.

**Supabase: no.** Sería sumar un proveedor sin quitar ninguno. Su valor real (PostgREST, RLS,
realtime, storage, auth integrados) aquí se aprovecharía en un ~20 %: ya hay Alembic + SQLAlchemy
async + escrituras masivas del ETL, que pelean con el modelo de Supabase. Supabase gana cuando se
parte de cero; este proyecto no parte de cero.

### 6.2 Pagos — Stripe no alcanza para el ICP

El ICP es PYME chilena a USD 25–55/mes. Stripe opera en Chile, pero una parte relevante de ese
segmento paga con tarjetas locales, débito Redcompra o transferencia. Van a necesitar
**Transbank/Webpay, o Flow/Khipu/MercadoPago** como alternativa. El `SPEC.md` ya lo anticipa
("Transbank v2") pero no está modelado.

Nota: en `~/github/payment-gateway` existe justamente eso — una API unificada sobre Transbank
WebPay, Santander, Banco de Chile BDP y Servipag. **Verificar la titularidad antes de reutilizar
código** (es un repo de trabajo); si no es reutilizable, al menos copiar el **diseño de la interfaz**,
que ya resolvió este problema.

Lo que sí conviene hacer ahora, y es gratis: **no acoplar el dominio a Stripe**. Hoy
`services/stripe_service.py` se invoca directo desde `api/billing.py`. Definir un puerto
`BillingProvider` en `app/domain/` y dejar Stripe como un adaptador en `app/infra/` — así agregar
Transbank es un archivo, no una cirugía.

---

## 7. Estructura objetivo del backend

Adoptar el layout de `~/github` (api → services → repositories → domain, con `infra/` para
adaptadores externos), que es lo que ya usan api-ref y servicio-usuarios-ref. La ganancia no es pureza
teórica: es que el equipo (y los agentes) ya conocen esa forma.

```
backend/app/
├── api/
│   └── v1/
│       ├── deps.py              ← get_current_user, empresa_ctx, require_rol, quotas
│       ├── router.py            ← agrega todos los routers, un solo include
│       └── endpoints/           ← SÓLO HTTP: validar → autorizar → llamar service → devolver schema
├── services/                    ← lógica de negocio, orquestación
│   └── bi/                      ← bi_service.py (1 303 líneas) partido por dominio:
│       ├── precio.py                precio, competidores, comprador, tendencia,
│       ├── competidores.py          estacionalidad, matching, resumen, posicion
│       └── ...
├── repositories/                ← acceso a datos (SQLAlchemy). Nada de SQL en los routers.
│   ├── base.py
│   ├── licitacion.py
│   ├── empresa.py
│   └── analytics.py             ← las tablas materializadas de F2
├── domain/                      ← reglas puras, sin IO. Testeables sin BD.
│   ├── scoring.py                  (score de oportunidad, bandas, confianza)
│   ├── plan_limits.py              (cuotas por tier)
│   ├── checklist.py                (reglas L1/LE/LP)
│   └── billing.py                  (puerto BillingProvider)
├── infra/                       ← adaptadores externos
│   ├── stripe/  twilio/  storage/  mercado_publico/  oauth/
├── core/                        ← config, security, logging, errors, middleware
├── models/   schemas/           ← TODOS los schemas Pydantic viven acá. Sin excepción.
└── observability/               ← tracing, request_id, métricas
```

Decisión pendiente que conviene tomar explícitamente: **el envelope de respuesta**. api-ref usa
`{success, data, message?}`; TORDO devuelve el objeto plano. Cualquiera de las dos está bien —
lo que no está bien es no haber decidido. Si el objetivo es coherencia con el resto del workspace,
adoptar el envelope; si el objetivo es que el frontend sea simple y estándar, quedarse plano y
documentarlo. **Recomiendo quedarse plano** (es lo idiomático en FastAPI y ya está así en todo el
código) y anotarlo como decisión.

---

## 8. Frontend

Estado actual: 15 908 líneas de TS/TSX, **1 archivo de test**, sin librería de estado de servidor,
sin design system, y páginas de 900+ líneas.

| Problema | Evidencia | Corrección |
|---|---|---|
| Fetching con `useState`/`useEffect` | 37 archivos | **TanStack Query** — caché, revalidación, sin waterfalls. Es lo que usa `frontend-ref`. |
| Llamadas directas al backend | `lib/api.ts:3` (`NEXT_PUBLIC_API_URL`) | **Capa proxy** con route handlers de Next. La URL del backend queda server-side y el token en cookie `httpOnly`. |
| Token en `localStorage` | `lib/api.ts:17,46` | Ídem — desaparece con el proxy. |
| Componentes gigantes | `tenders/[codigo]/page.tsx` (915), `HerramientasAvanzadas.tsx` (932), `bi/page.tsx` (620) | Descomponer por feature-folder (`feature/{components,hooks,api,types}`). |
| Sin design system | Componentes a mano | **shadcn/ui + Tailwind**. Para competir visualmente con LicitaLab, es el camino más corto a una UI coherente. |
| Sin tests | `__tests__/narrative.test.ts` | Vitest para lógica, Playwright para 3–4 flujos críticos (login, búsqueda, postulación). |

---

## 9. Observabilidad, CI y operación — hoy no existen

- Sin `.github/` — **cero CI**. Sin lint, sin tests en PR, sin validación de migraciones.
- Sin `pyproject.toml`, sin lockfile. Dos `requirements.txt` con dependencias solapadas
  (`polars==0.20.15` y `pyarrow==14.0.2` duplicados) y el ETL declarando "backend dependencies
  (needed for database models)" — acoplamiento por copia.
- Sin `ruff`, sin `.pre-commit-config.yaml`.
- Sin Sentry. Sin logging estructurado (el backend usa `logging` de stdlib; el ETL declara
  `structlog` en requirements pero no lo usa de forma consistente). Sin `request_id`.
- `/health/ready` existe, pero no refleja frescura del ETL ni salud de Celery.

Todo esto está resuelto y probado en `~/github` (ver §11). No hay que diseñarlo: hay que copiarlo.

---

## 10. Higiene del repositorio

**66 archivos markdown.** En `etl/` solos hay 13, incluyendo `ESTADO_FINAL.md`,
`ESTADO_IMPLEMENTACION.md`, `LISTO_PARA_USAR.md`, `MEJORAS_APLICADAS.md`,
`RESUMEN_IMPLEMENTACION_DETALLES.md`, `README_V2.md` y `README_DETALLES.md`. En `backend/scripts/`
hay 5 (`README`, `QUICK_START`, `HOW_TO_USE`, `LOCAL_SETUP`, `USAGE_EXAMPLES`) para 5 scripts.

Esto es **sedimento de sesiones de IA**, y no es cosmético: es activamente dañino cuando se trabaja
con agentes, porque son instrucciones contradictorias compitiendo por el contexto. Un agente que
lee `ESTADO_FINAL.md` y `ESTADO_IMPLEMENTACION.md` recibe dos verdades.

Otros:

- **Código muerto conviviendo con el vivo**: `etl/main_v1_deprecated.py` (437 líneas),
  `loaders/database_loader.py` junto a `database_loader_v2.py`.
- **`tfidf_matcher` duplicado — corrección**: la primera lectura de esta revisión lo dio por
  duplicación real; no lo es. El de `etl/analytics/` **entrena** (`build_provider_corpus`,
  `train_tfidf_model`, `run_tfidf`) y el de `backend/app/services/` **sirve** (`match`,
  `score_empresa_licitacion`, `is_available`). Son roles distintos y la separación es correcta.
  Lo que sí está duplicado es `_clean_text` y la lógica de carga del modelo — piezas chicas que
  pertenecen a un paquete compartido (F1, con `pyproject` y grupos de dependencias). No tocar en F0.
- **Contradicción de identidad**: el `README.md` dice *"En pivot hacia **YUCA** (SPEC v3.1)"*;
  `docs/SPEC.md` es **TORDO v1.1**; `CLAUDE.md` dice TORDO v1.1. La v3.1 referida no existe en
  `docs/`. Hay que resolver cuál es la verdad.
- `docs/superpowers/` y `frontend/docs/superpowers/` — datos de sesión de tooling versionados.

**Objetivo:** de 66 a ~12 markdown. Uno por tema, con dueño claro:
`README.md`, `CLAUDE.md`, `docs/SPEC.md`, `docs/ARQUITECTURA.md`, `docs/DATOS.md`,
`docs/DESPLIEGUE.md`, `docs/api-reference.md`, `backend/README.md`, `etl/README.md`,
`frontend/README.md`, `docs/decisiones/ADR-*.md`. Todo lo demás → `docs/_archive/` o borrar.

---

## 11. Reglas de trabajo a importar desde `~/github`

Las convenciones del workspace de otra empresa están maduras y probadas en 4 servicios en producción.
**Sí, conviene adoptarlas** — la lista siguiente es la que aplica a un repo de un solo producto
(se descarta lo que sólo tiene sentido en un ecosistema multi-repo: contratos cross-service,
Pub/Sub manifest-first, gate de drift entre repos).

| Regla | De dónde | Por qué aplica a TORDO |
|---|---|---|
| `uv` + `python3` + `ruff` para lint/format | todos | Elimina los dos `requirements.txt` y da un lockfile |
| `.pre-commit-config.yaml` con ruff + ruff-format + higiene de archivos; **instalar por clone y por worktree**; nunca `--no-verify` | todos | Es la regla que ya tienes en tu `~/.claude/CLAUDE.md` global |
| **`make migrate-create MSG="…"`, nunca `alembic revision` directo** | servicio-usuarios-ref | Evita cadenas rotas de `down_revision` — que ya pasó acá (`011_fix_alerttype_enum_uppercase`) |
| `Makefile` con `help` autodocumentado: `dev-up-d`, `dev-logs`, `migrate`, `test`, `db-shell` | todos | Un solo lugar donde mirar cómo se corre el proyecto |
| **`docker-compose.test.yml` con BD efímera** + `make test` que la levanta, corre pytest y la destruye | servicio-usuarios-ref | Es lo que hace posible tener tests de integración de verdad |
| **Imports siempre a nivel de módulo**, nunca dentro de funciones | todos | TORDO lo viola sistemáticamente — pero por una razón real (memoria). Tras F2 la razón desaparece y la regla se puede exigir. |
| **Todos los schemas Pydantic en `/app/schemas/`** | todos | Ya se cumple en su mayoría; formalizarlo |
| **Comentarios de BD obligatorios en tablas y columnas nuevas**, con chequeo estático en pre-commit y CI | servicio-usuarios-ref | Para un producto de datos con 78 columnas por OC, esto vale oro. Es la regla más valiosa de las que se pueden importar. |
| **Worktrees para toda feature**, raíz `~/personal/tordo-worktrees/<feature>` | workspace | Ya existe `tordo-worktrees/` en tu máquina |
| **Flujo de promoción: localhost → PR a `staging` → verde → merge → probar staging → PR a `main`.** Nunca PR directo a `main` | workspace | Hoy TORDO mergea PRs directo a `main` |
| **Ceremonia proporcional al tamaño**: cambios chicos sin plan, sólo a ≥95 % de confianza; proyectos medianos/grandes con `grill-me` | workspace | Evita que el proceso ahogue el desarrollo ágil |
| **Nunca llamar al backend desde un componente cliente** — siempre por la capa proxy | frontend-ref | §8 |
| **Secretos en un gestor, nunca en el repo**, inyectados en runtime | todos | §2.1 |
| CI: jobs separados de `lint`, `migrations check`, `test`, `build` | servicio-usuarios-ref `.github/workflows/ci.yml` | Copiable casi tal cual |

Propuesta concreta de `CLAUDE.md` reconstruido: **`docs/CLAUDE.md.propuesto`** (en este mismo
commit). Conserva el mapa de arquitectura del actual —que es preciso y útil— y le agrega la sección
de reglas de trabajo.

---

## 12. Plan por fases

Estimaciones para **1 desarrollador con asistencia de agentes**. Las fases F0–F2 son secuenciales;
F3/F4/F5 pueden solaparse.

### F0 — Sanitización · EJECUTADO 2026-08-05 (rama `chore/f0-sanitizacion`)

- [ ] **Rotar Twilio auth token, `SECRET_KEY`, credenciales de BD** ← requiere acción humana, pendiente
- [x] `git rm --cached` de `.env`, `.env.local`, `celerybeat-schedule`, `settings.local.json`; `.gitignore` ampliado
- [x] `/api/data/*` cerrado con dependencia de auth a nivel de router (se conserva funcional: alimenta las páginas de Orders)
- [x] Handler global: detalle sólo al log, `request_id` al cliente, middleware `X-Request-ID`
- [x] Código muerto borrado (`main_v1_deprecated.py`, `database_loader.py` v1, `test_detalles_extraction.py`)
- [x] ~~Unificar `tfidf_matcher`~~ — no procede, no era duplicación (ver §10). Va a F1 como paquete compartido.
- [x] 66 → 22 markdown en el árbol vivo; el resto a `docs/_archive/` con índice
- [x] Identidad resuelta: **TORDO**, README corregido
- [x] **Bug de facturación corregido**: `subscription_status_from_stripe` estaba importado dentro de
      `stripe_webhook()` pero se usaba en `_handle_subscription_updated()` → `NameError` en cada
      evento `customer.subscription.updated`. Bajas, impagos y renovaciones **nunca** se
      propagaban al usuario. Detectado por ruff (F821); causado por el patrón de imports inline.

### F1 — Cimientos de ingeniería · EJECUTADO PARCIALMENTE 2026-08-05

- [x] `pyproject.toml` en la raíz con grupos `shared`/`api`/`etl`/`dev`, `uv.lock` único; ambos `requirements.txt` eliminados
- [x] `ruff` + `.pre-commit-config.yaml` + hook que bloquea commitear `.env` + chequeo de `uv.lock`
- [x] `Makefile` autodocumentado con `help`, `setup`, `hooks`, `lint`, `test`, `dev-up-d`, `migrate-create MSG=`, `db-shell`
- [x] `.github/workflows/ci.yml`: lint · migraciones · tests backend · tests ETL · frontend · build de imágenes
- [x] Sentry (backend + Celery) + logging JSON con `request_id` propagado por contextvar
- [x] Dockerfiles migrados a `uv` con contexto en la raíz + `.dockerignore`
- [x] Barrido de ruff aislado en su propio commit, con `.git-blame-ignore-revs`
- [x] **Suite de tests reparada**: backend 30→45 pasando (14 errores por `aiosqlite` ausente, un test desfasado del código); ETL 42→47 (pin de polars incompatible con el propio código)
- [ ] Sentry en el frontend ← pendiente
- [ ] Ramas `staging` y `main` con protección; flujo de promoción ← **requiere acción humana en GitHub**
- [ ] `docker-compose.test.yml` con Postgres efímero; migrar `conftest.py` del DDL de SQLite a BD real ← pendiente, ver nota abajo
- [ ] **Primeros tests que importan**: autorización por empresa (cada rol × cada endpoint) y contrato de los 22 endpoints de BI ← pendiente

> **Nota sobre `conftest.py`.** Mantiene a mano el DDL de 11 tablas en SQLite porque
> los modelos usan `ARRAY` de Postgres. Ese esquema paralelo **ya divergió**: declaraba
> la columna `alert_metadata` cuando el modelo mapea a `metadata`, y por eso 5 tests
> fallaban. Se parcheó para desbloquear, pero el arreglo real es Postgres efímero.
> No se hizo en F1 porque no había daemon de Docker disponible para verificarlo en local;
> el verificador natural es el job `test-backend` de CI, que ya provisiona Postgres.

### F2 — Plano de datos analítico · EN CURSO · EL CAMBIO DE FONDO

**Cimientos, hechos y verificados contra Postgres real (2026-08-05):**

- [x] Esquema `analytics` + `pg_trgm` (migración `012`). Las tablas de dentro no llevan
      migración a propósito: son datos derivados que el pipeline reemplaza enteros.
- [x] `etl/loaders/analytics_loader.py` — materializador agnóstico al esquema: infiere tipos
      del parquet, `COPY`, índices, y **swap atómico** de tabla. La API nunca ve una tabla a
      medio cargar ni sin índices.
- [x] `etl/loaders/analytics_catalog.py` — 23 tablas con sus índices, **derivados de por dónde
      filtra realmente `bi_service`**, no de intuición.
- [x] `etl/analytics/materialize.py` — paso final del batch, con `--dry-run` y `--solo`.
      Incluye el índice GIN con `pg_trgm` para la búsqueda de productos por subcadena.
- [x] `backend/app/repositories/analytics.py` — lectura con **filtros empujados a SQL**,
      búsqueda por subcadena y escape de comodines del usuario.
- [x] 13 tests contra Postgres real (5 del cargador, 8 del repositorio). CI corre Postgres
      también en el job del ETL.

**Conversión, hecha y verificada contra datos reales (2026-08-05):**

- [x] `bi_service` consulta Postgres. `_load()` mantiene su firma pero enruta al repositorio
      con los filtros empujados a SQL.
- [x] **Golden master**: se capturó la salida de las 16 funciones con la implementación de
      parquets sobre 3 meses de datos reales de ChileCompra, y se exige salida idéntica con
      la nueva. 31 casos, 31 pasando. Sin esto la conversión habría sido una apuesta.
- [x] Eliminados `_cache`, `prewarm_bi_artifacts` y el volumen `:ro` del compose.
      Verificado: el contenedor del backend no ve ningún parquet y `ANALYTICS_DATA_PATH`
      ni siquiera está definida.
- [x] Verificado end-to-end por HTTP con `FEATURE_ANALYTICS=true`: 13 endpoints de BI
      devuelven 200 con datos reales. `/api/bi/precio` responde bandas de verdad
      ("Reactivos de analizadores químicos: p10 $556 – p90 $28.255, confianza 0.24, L1").

**Rendimiento — filtros empujados a SQL (2026-08-05):**

- [x] Las cargas de `get_resumen` y de las bandas de precio pasan el filtro a la cláusula
      `WHERE` en vez de traer la tabla entera a memoria. `get_resumen` cargaba ~193 000 filas
      de 4 tablas para usar unos cientos.
- [x] Medido por HTTP, con el golden verificando que la salida no cambió:

      | endpoint | antes | después |
      |---|---|---|
      | `/api/bi/resumen` | 1,90 s | **0,013 s** |
      | `/api/bi/precio` | 0,67 s | **0,009 s** |
      | resto de endpoints | 10–500 ms | < 15 ms |

**Pendiente:**

- [ ] Generalizar `precompute_dashboard_matches` → tabla `match_empresa_licitacion`.
- [ ] Medir la API en un contenedor de 512 MB con `-w 4`.

> **Sobre sacar el TF-IDF del proceso de la API — corrección al plan original.**
> No se puede sin cambiar el comportamiento, y conviene decirlo en vez de arrastrarlo como
> pendiente. El modelo se usa en dos sitios distintos:
> - **En workers** (`alert_engine`, `radar_service`): `score_empresa_licitacion` sobre el
>   perfil guardado. Ahí ya está fuera de la API y no hay nada que hacer.
> - **En tiempo de request** (`tenders.py`, `bi.py`, `data_inspection.py`):
>   `score_texts(consulta, textos)` puntúa **términos de búsqueda arbitrarios** contra un
>   pool de candidatos. Eso no se puede precomputar: depende de lo que escriba el usuario.
>
> Sacarlo exige **reemplazar el ranking por búsqueda de texto de PostgreSQL**
> (`tsvector` + `ts_rank`), que ya está planificado en F4 y de paso resuelve el
> `ILIKE '%término%'`. Es un cambio de algoritmo de ranking, no un refactor: necesita
> decisión de producto. Hasta entonces, el modelo de 71 MB sigue en el proceso bajo
> `FEATURE_TFIDF`.

> **Sobre reemplazar los `subprocess.run` — también corrijo el plan original.**
> Recomendé sustituirlos por llamadas directas. Tras examinarlo, **el aislamiento por
> proceso es lo correcto** para un batch de 30 min a 2 h: un fallo o una fuga de memoria en
> el pipeline no se lleva por delante al worker, y permite que la imagen de la API no cargue
> las dependencias del ETL. Lo que sí estaba mal era la fragilidad, ya corregida:
> `sys.executable` en vez de `"python"` del PATH, el worker con las dependencias del ETL, el
> montaje con permiso de escritura y los logs a stdout.

### F3 — Tenancy, capas y contratos · 1–2 semanas

- [ ] `api/v1/deps.py` con `empresa_ctx` / `require_rol`; eliminar los 12+ chequeos manuales
- [ ] Test estructural: toda ruta de empresa declara la dependencia
- [ ] Partir `bi_service.py` (1 303 líneas) en `services/bi/*`
- [ ] Introducir `repositories/` y sacar SQLAlchemy de los routers
- [ ] Versionado `/api/v1/`; documentar la decisión de envelope
- [ ] **Suscripción por empresa** (decisión 2 — la pieza más grande de esta fase):
  - [ ] Mover `plan_tier`, `subscription_status`, `stripe_customer_id`, `stripe_subscription_id`, `trial_*` de `User` a la entidad de cuenta/empresa
  - [ ] Usuarios pasan a ser asientos; definir límite de asientos por plan
  - [ ] `require_plan` y `check_bi_quota_dep` resuelven contra la empresa activa, no contra el usuario
  - [ ] Cuotas de BI y de alertas contabilizadas por empresa en Redis
  - [ ] Migración de datos de los usuarios existentes a su empresa owner
- [ ] Puerto `BillingProvider` en `domain/`, Stripe como adaptador en `infra/` (decisión 5 — **v1**)
- [ ] Adaptador de pasarela local (Transbank / Flow / Khipu), en el mismo bloque

### F4 — Modelo de datos para el alcance objetivo · 1–2 semanas

- [ ] **Migración de reconciliación modelos↔migraciones** (~45 diferencias, ver §5.0), y quitar `continue-on-error` del job de deriva en CI
- [ ] **Retirar las llamadas a `Base.metadata.create_all()`** — sobre todo `etl/loaders/database_loader_v2.py:99`, que crea tablas en cada carga saltándose Alembic
- [ ] `JSON` → `JSONB` en todos los modelos + GIN donde se consulte
- [ ] Índices compuestos para el listado de licitaciones
- [ ] `tsvector` + GIN para búsqueda; retirar `ILIKE '%x%'`
- [ ] `tipo_convocatoria` (licitacion | compra_agil | convenio_marco | trato_directo | cotizacion)
- [x] ~~`fuente` / `pais` en las entidades de ingesta~~ — descartado (decisión 1: sólo Chile)
- [ ] Regla de PKs para entidades nuevas (UUIDv7 negocio / BigInteger ingesta)
- [ ] Comentarios de BD obligatorios (regla + chequeo)

### F5 — Frontend · 1–2 semanas · paralelizable con F3/F4

- [ ] TanStack Query
- [ ] Capa proxy con route handlers + sesión en cookie `httpOnly`
- [ ] Refresh token con rotación
- [ ] shadcn/ui como design system; descomponer las páginas de 900+ líneas
- [ ] Vitest + Playwright para 3–4 flujos críticos
- [ ] UI de invitación y gestión de miembros (el backend ya la soporta)

### F6 — Diferenciación · continuo, empezar después de F2

Reordenado según las decisiones del 2026-08-05:

1. **Servidor MCP de sólo lectura sobre la base histórica** (decisión 4). Después de F2 es casi
   gratis: mismas consultas Postgres que ya sirve la API, y el medidor por plan ya existe
   (`check_bi_quota_dep`). Cobrado dentro del plan de quien lo consume. LicitaLab ya lanzó el suyo.
2. **Compra Ágil + Convenio Marco.** Volumen de mercado chileno que hoy no se ve. Requiere F4.
3. **Alertas de cambio de precio** (lo que hace Falconsoft) — los datos ya están; falta el disparador.
4. **API pública + API keys.** El ángulo de integración ERP de Falconsoft. Habilita el segmento gremios.
5. **Reportes semanales automáticos** en PDF/email.
6. **Extracción de bases con LLM** — reevaluar después de F3, no antes. Ver §14: es el único uso de
   LLM con valor claro acá, y sólo se puede vender bien una vez que el plan sea por empresa.

---

## 13. Decisiones tomadas · 2026-08-05

| # | Decisión | Consecuencia en el plan |
|---|---|---|
| 1 | **No multi-país.** Sólo Chile. | Se elimina `fuente`/`pais` de F4. No se separa un núcleo `Convocatoria` de extensiones por fuente. **Ahorra ~1 semana en F4** y simplifica el modelo. Sigue en pie `tipo_convocatoria` (Compra Ágil, Convenio Marco, Trato Directo), que es de mercado chileno, no de país. |
| 2 | **La suscripción es por empresa**, con planes diferenciados por capacidades. | La migración de billing sube a **F3, alcance completo**: entidad de cuenta, `plan_tier`/`stripe_customer_id`/cuotas movidos de `User` a la empresa, usuarios como asientos, y el gating de features (`require_plan`, `check_bi_quota_dep`) resuelto contra la empresa activa y no contra el usuario. Es la pieza más grande de F3. |
| 3 | **TORDO.** El pivot a YUCA queda descartado. | Cerrado en F0: README corregido; `APP_NAME`/`BRAND_NAME` sigue siendo la única fuente del nombre en código. |
| 4 | **LLM sí, pero acotado a un servidor MCP sobre la base histórica**, simple, medido y cobrado dentro del plan de quien lo consume. Para más adelante. | Sale de F6 como "análisis de bases con LLM" y entra como **MCP de sólo lectura, después de F2**. Ver §14 — hay un matiz que conviene revisar antes de cerrarlo. |
| 5 | **Pasarela local de pago en v1.** | El puerto `BillingProvider` en `domain/` + Stripe como adaptador **se implementa en F3**, no se documenta para después. El adaptador local (Transbank / Flow / Khipu) entra inmediatamente después, en el mismo bloque de trabajo. |

## 14. Nota sobre la decisión 4 (MCP vs. LLM)

El MCP es una buena decisión y es barata: después de F2 los datos ya están en tablas Postgres
indexadas, así que el servidor MCP es un consumidor más de las mismas consultas que ya sirve la API,
y el medidor por plan ya existe (`check_bi_quota_dep` sobre Redis). Costo casi nulo, y LicitaLab ya
lanzó el suyo — no tenerlo se nota.

**Pero conviene separar dos cosas que no son lo mismo**, porque la decisión de "sin LLM" del SPEC se
tomó contra la primera y aquí lo valioso es la segunda:

- **LLM como interfaz conversacional sobre datos estructurados** — coincido en que aporta poco. Los
  22 endpoints de BI ya responden esas preguntas de forma determinista, más rápida y más barata. Un
  chat encima sería una interfaz peor a datos que ya se consultan bien. **Descartar.**
- **LLM como extractor estructurado sobre las bases de licitación** — es otra cosa. Las bases son
  PDF/DOC no estructurados donde vive lo único que no se puede derivar de los datos de OC/LIC:
  documentos exigidos, criterios de evaluación con ponderaciones, garantías, y causales de rechazo.

Ese segundo caso ataca directamente el pilar de compliance —*"que no te rechacen por forma"*— y
justamente el módulo que hoy está más débil: el checklist de anexos depende de
`PlantillaChecklist`, plantillas estáticas por tipo (L1/LE/LP) que según el `CLAUDE.md` actual puede
que ni siquiera estén sembradas. Extraer el checklist **de las bases reales de cada licitación**
convierte el módulo más flojo en el más fuerte.

La economía es la parte que suele decidirse mal: **no es costo por consulta de usuario, es costo por
documento**. Las bases de una licitación se procesan una vez, se cachean, y ese costo se amortiza
entre todos los suscriptores que miren esa licitación. Con volúmenes de Mercado Público eso es
marginal.

**Recomendación:** dejar el MCP como está decidido (post-F2), y **reevaluar la extracción de bases
como candidato de F6 una vez que F3 haya movido el billing a la empresa** — porque recién ahí se
puede cobrar por capacidad, que es como se debería vender.
