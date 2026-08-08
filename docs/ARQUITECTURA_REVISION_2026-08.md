# Revisión de Arquitectura — TORDO

> **Fecha**: 2026-08-05 · **Commit revisado**: `2348535` (main) · **Autor**: revisión técnica senior
> **Alcance de referencia considerado**: LicitaLab (CL/PE/CO), LicitApp, Falconsoft SGL/POM.
> **Convenciones de ingeniería contrastadas contra**: workspace `~/github` (api-ref,
> servicio-usuarios-ref, payment-gateway, auction-engine, frontend-ref).

---

## Estado al cerrar · 2026-08-08

**Las siete fases están cerradas** — F0 a F6. Los cuatro problemas de fondo del veredicto
(§0) están resueltos: el plano de datos analítico vive en Postgres, la multi-tenancy se
garantiza por dependencia con test estructural, el modelo de datos soporta el alcance
objetivo, y el frontend tiene tests de extremo a extremo.

**Lo que sigue abierto, con su motivo — no son pendientes sin dueño:**

| qué | por qué sigue abierto |
|---|---|
| Protección de rama en `main` | GitHub la reserva a cuentas Pro (~4 USD/mes). Sustituto local: `make merge PR=<n>`, que se niega en rojo. |
| Primitivas accesibles tipo Radix | Mejora de accesibilidad que conviene hacer con un inventario de componentes delante. |
| Extracción de bases con LLM | Aplazada con su [ADR 0010](decisiones/0010-extraccion-de-bases-con-llm.md): **no hay fuente** para las bases. Se reabre si el OCDS de ChileCompra trae `documents`. |
| Servidor MCP | En pausa y especificado ([ADR 0004](decisiones/0004-llm-solo-mcp.md)): es un canal, no una capacidad. |
| Refresco en el login con Google | La sesión por Google sigue caducando a los 30 min. La solución es un código de un solo uso, y toca el backend. |
| `subprocess.run` de Celery hacia el ETL | Deuda conocida de F2, no bloqueante. |

**Y tres cosas que dependen de credenciales que no tengo, dichas claro:**

- **El cliente de Compra Ágil nunca ha hablado con la API real** — el ticket configurado es el
  de ejemplo. Lo primero con un ticket de verdad es correr una pasada y comparar.
- **El adaptador de MercadoPago nunca se ha probado contra la API real.**
- **La infraestructura no está declarada como código.**

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
3. **Los modelos y las migraciones divergieron.** Hay diferencias reales:
   `alerts.empresa_id` declara `ondelete=CASCADE` en el modelo y la migración creó
   `SET NULL`; `users.onboarding_step` es `SMALLINT` en la base e `Integer` en el modelo;
   `users.notification_whatsapp` difiere en nulabilidad; varias restricciones únicas e
   índices están declarados de una forma y creados de otra.

   > **Corrección del diagnóstico (2026-08-06).** Esta sección decía "~45 diferencias" y el
   > job de CI las atribuía a que la base se provisionó con `create_all()`. **Las dos cosas
   > estaban mal.** El número real era 180 (52 `remove_table` + 128 `remove_index`) y la
   > causa era otra: `alembic/env.py` **nunca importaba los modelos**. Tenía el comentario
   > `# Import all models so Alembic can detect them` con nada debajo, así que
   > `target_metadata` tenía **cero tablas** y autogenerate concluía —correctamente, dado lo
   > que veía— que sobraba la base entera. De ahí salieron los dos esqueletos destructivos
   > que hubo que descartar a mano. Con el import puesto, el conjunto de tablas del modelo
   > coincide **exacto** con el de la base, y la deriva restante es la que lista este punto.

**Corregido en F1:** migración `000_baseline_licitaciones_ordenes` que crea ambas tablas en su
forma anterior a la `001`, idempotente (inspecciona antes de crear, así que las bases
existentes no se ven afectadas y no hace falta `alembic stamp`). Se corrigió además el
`downgrade` de `001`, que dejaba huérfanos los tipos ENUM `alerttype` y `alertstatus` y hacía
fallar el siguiente `upgrade`. Verificado: ciclo `upgrade → downgrade → upgrade` completo,
12 migraciones en cada sentido, 27 tablas.

**Corregido después:** el import que faltaba en `alembic/env.py`, con test de regresión
(`backend/tests/test_alembic_metadata.py`) que falla si autogenerate vuelve a proponer borrar
tablas. Era lo que hacía que `make migrate-create` produjera esqueletos destructivos.

**Reconciliado** en la migración `da5fb1e45066`. `alembic check` es **bloqueante** en CI desde
entonces: si un modelo cambia sin su migración, el PR se detiene.

Cómo se resolvió cada clase:

| clase | resolución |
|---|---|
| índices redundantes sobre PKs | se quitó `index=True` de las 16 PKs y se eliminaron los 3 índices que sobraban en la base |
| restricción única vs índice único | **una sola forma**: restricción `uq_<tabla>_<columna>`, con la convención de nombres en `app/db/__init__.py` |
| `alerts.empresa_id` SET NULL vs CASCADE | gana el modelo (CASCADE). Sin riesgo: `Alert.empresa_id` no se consulta en ninguna parte del backend |
| `users.onboarding_step` SMALLINT vs Integer | gana la base: `SmallInteger` en el modelo, sin migración de datos |
| `users.notification_whatsapp` nulabilidad | gana la base, que es la estricta: `nullable=False` en el modelo |
| índices que sólo existían en la base | se **declararon en el modelo**, no se borraron — incluidos los dos de `empresas_usuario` que sirven cada comprobación de tenancy |

**Beneficio medible además de la coherencia:** se eliminaron **11 índices duplicados**. Una
restricción UNIQUE en Postgres ya crea su índice, así que un segundo índice sobre la misma
columna sólo cuesta disco y escritura en cada carga del ETL. `licitaciones` y `ordenes_compra`
—las tablas grandes— tenían dos cada una.

> **Trampa que dejó esto, y que hay que conocer antes de tocar `unique=True`.** La convención de
> nombres vive en `Base.metadata`, y **Alembic se la pasa a `op.create_table`**. Es decir: cambia
> retroactivamente lo que producen las migraciones **ya escritas**. Una base creada hoy desde
> cero nace con `uq_licitaciones_codigo_externo`; la productiva, creada antes, tenía
> `licitaciones_codigo_externo_key`. Por eso la migración de reconciliación es **condicional**:
> comprueba el estado antes de cada operación y converge ambas. Verificado en las dos rutas.

**Las llamadas a `create_all()` ya no existen.** Eran dos, y no eran equivalentes:

- `etl/loaders/database_loader_v2.py` — **esta era la de verdad**. El loader llamaba a
  `create_all()` en cada conexión y el ETL corre cada hora, así que creaba en producción
  cualquier tabla que faltara, sin migración y sin rastro en `alembic_version`. Ahora
  **verifica** el esquema y falla con instrucciones si algo falta.
- `backend/scripts/init_production_db.py` — **no hacía nada**. Tenía el comentario
  `# Make sure all models are imported so Base.metadata knows about them` con nada debajo,
  igual que `env.py`, así que `create_all` recibía cero tablas. Un script llamado "creación
  forzada de base de datos de producción" que dejaba la base vacía y no daba error. Eliminado:
  `make migrate` es el camino.

### 5.1 Defectos concretos del esquema

1. **`Column(JSON)` en vez de `JSONB`** — `licitacion.py:49-50`, `orden_compra.py:56-57`,
   `orden_compra_detalle.py:27-33`, `alert.py:99-113`. Postgres guarda `JSON` como texto: sin índice
   GIN, sin operadores, re-parseo en cada lectura. `dashboard_cache.py:11` ya usa
   `JSON().with_variant(JSONB(), "postgresql")` — **ese es el patrón; falta aplicarlo al resto.**
   Migración barata hoy, cara con 10 M de filas.
2. ~~**Cero índices compuestos.**~~ — **resuelto**: tres índices parciales sobre `activo`
   (`fecha_publicacion DESC`, `estado + fecha`, `region + fecha`). Parciales porque la consulta
   siempre lleva `WHERE activo = true` y un índice normal sobre un booleano casi siempre verdadero
   no sirve. Verificado con `EXPLAIN ANALYZE` sobre 200 000 filas: el planificador usa los
   compuestos cuando el filtro es selectivo y cae al de fecha cuando no lo es, que es lo correcto.
3. ~~**Búsqueda por `ILIKE '%término%'`**~~ — **resuelto**, y además **insensible a tildes**:
   en Chile se teclea sin ellas más veces que con ellas, así que la búsqueda fallaba en el caso
   normal, no en el raro. Se logra con `inmutable_unaccent`, que envuelve a `unaccent` pasando
   el diccionario explícito — sin eso la función es STABLE (resuelve el diccionario por
   `search_path`) y no sirve ni para una columna generada ni para un índice. La única salvedad
   real: si una actualización de PostgreSQL cambiara `unaccent.rules`, habría que `REINDEX`.

   Implementado con columna generada `busqueda`
   (`to_tsvector('spanish', …)`) + GIN, y trigrama sobre `nombre`. Se usaron **las dos** opciones
   que planteaba este punto, no una: el tsvector cubre las palabras y el trigrama los fragmentos.
   Lo que se pierde son los fragmentos a mitad de palabra que sólo estaban en `descripcion` —
   ahí no hay trigrama porque es texto largo y sería el índice más caro de mantener en cada carga
   del ETL. Está fijado en `backend/tests/test_busqueda_licitaciones.py`.
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

- [x] ~~Rotar credenciales~~ — **decisión del 2026-08-06: no se rota.** El dueño confirmó que
      el token de Twilio no es productivo y no genera cargos. Además, `DB_URL` y `JWT_SECRET` del
      `.env` filtrado nunca los leyó la aplicación: `config.py` declara `DATABASE_URL` y
      `SECRET_KEY`, y `extra="ignore"` los descartaba. Riesgo aceptado y cerrado.
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
- [x] **Sentry en el frontend** — los tres runtimes (navegador, Node y edge), con las opciones
      en un solo sitio (`lib/sentry-comun.ts`) y un test estructural que exige que las tres
      partan de ahí. Sin replay de sesión y con `sendDefaultPii: false`, fijado por test.
- [x] **Next 14 → 16** (con ESLint 8 → 9 y configuración plana). Cierra las dos últimas
      vulnerabilidades graves del frontend: `npm audit` pasa de 6 a **0**.
- [~] Protección de `main` — **no se puede desde aquí**: GitHub la reserva a repos públicos o a
      cuentas Pro (403 en `branches/main/protection` y en `rulesets`). Sustituto local:
      `make merge PR=<n>`, que se niega si algún check no está en verde. La protección real
      cuesta ~4 USD/mes. `staging` sigue descartado a propósito (ver CLAUDE.md).
- [x] **`conftest.py` migrado a Postgres real**: el esquema lo crean las migraciones y cada test
      corre en una transacción que se revierte. El `docker-compose.test.yml` nunca hizo falta —
      `scripts/ci-local.sh` levanta el Postgres efímero y lo destruye al terminar.
- [x] **Contrato de los 22 endpoints de BI** (`test_contrato_bi.py`): tabla ruta → nivel de
      protección, con test estructural que falla si aparece un endpoint sin decidir el suyo.
      **Encontró una fuga real**: `/licitacion-match` implementa "Matching semántico", que se
      vende como capacidad Pro, y no comprobaba el plan.
- [x] Autorización por empresa — cubierta por `test_tenancy_estructural.py` (estructural) y
      `test_tenancy_autorizacion.py` (funcional, rol por rol).

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

- [x] **Generalizado `precompute_dashboard_matches` → tabla `match_empresa_licitacion`.**
      Una fila por par (empresa, licitación) con `score` 0-100 y `nivel`, en vez del blob JSON
      de `dashboard_home_cache` (tabla eliminada). Tres consecuencias:

      1. **La portada dejó de mostrar datos rancios.** El blob copiaba nombre, monto y fecha
         de cierre dentro; ahora salen de `licitaciones` por join.
      2. **El listado ya no carga el modelo TF-IDF para el encaje.** Era una de las dos
         llamadas en tiempo de request, y la única precomputable — la otra
         (`score_texts` sobre términos de búsqueda arbitrarios) sigue como está, tal como
         anota la corrección de más arriba.
      3. **`sort_by=score_encaje` se resuelve en SQL.** El camino anterior cortaba en un pool
         de 500 en memoria y devolvía ese tamaño como `total`, así que la paginación mentía
         en cuanto había más resultados.

      Contrapartida: una licitación ingerida hoy no tiene fila hasta las 06:00 siguientes.
- [x] **Medida la API en un contenedor de 512 MB con `-w 4`.** La predicción era correcta:
      no cabe. Reproducible con `make medir-memoria`, sobre la imagen real y con el modelo
      TF-IDF real montado:

      | límite | workers | TF-IDF | reposo | pico | resultado |
      |---|--:|:--:|--:|--:|---|
      | 512 MB | 1 | no | 77 MB | 79 MB | ✓ |
      | 512 MB | 1 | **sí** | 77 MB | **182 MB** | ✓ |
      | 512 MB | 2 | sí | 176 MB | 384 MB | ✓ |
      | 512 MB | 4 | no | 316 MB | 332 MB | ✓ |
      | 512 MB | 4 | **sí** | 317 MB | **420 MB** | **✗ OOM** |
      | 1 GB | 4 | sí | 316 MB | 627 MB | ✓ |

      **El modelo cuesta ~105 MB por PROCESO** (182 − 77) y no se comparte entre workers: se
      carga perezosamente en cada uno. Con 4 en 512 MB el kernel empieza a matarlos, cada
      reinicio vuelve a cargar el modelo y el ciclo se realimenta — en esa corrida el modelo
      se cargó **14 veces para 4 workers**.

      **Decisión:** la imagen sirve con `--workers ${WEB_CONCURRENCY:-1}`, explícito en el
      Dockerfile. Subir de ahí exige 1 GB; con 512 MB el techo son 2.

      *Ojo con cómo se mide:* el primer intento daba el mismo número con y sin TF-IDF, porque
      los endpoints devolvían **401** y no llegaban a cargar nada. El script autentica y
      además cuenta cuántas veces se cargó el modelo — si sale 0 con TF-IDF activo, avisa de
      que ese número no mide lo que dice.

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

- [x] `api/deps.py` con `empresa_ctx` / `require_rol`; eliminados los chequeos manuales
- [x] Test estructural: toda ruta de empresa declara la dependencia (detectó 2 rutas sin ella)
- [x] Partir `bi_service.py` (1 476 líneas) en `services/bi/*` — 8 módulos por dominio, ninguno pasa de 332 líneas. Verificado con el golden master: 31/31, ni un resultado cambió.
- [x] `repositories/` con **todos** los routers migrados, y `tests/test_capas_sin_sql_en_routers.py`
      comprobándolo fichero a fichero con tres excepciones documentadas. Sacar las 120 consultas
      de los routers destapó tres fallos que no rompían nada visible (ver la sección de backend
      en `CLAUDE.md`).
- [x] **Versionado `/api/v1/` y sin envelope** — [ADR 0009](decisiones/0009-api-versionada-y-sin-envelope.md).
      El prefijo lo pone `main.py`, no los routers.
- [x] **Suscripción por empresa** (decisión 2 — la pieza más grande de esta fase) — completa:
  - [x] Mover `plan_tier`, `subscription_status`, `billing_*`, `trial_*` de `User` a la empresa
  - [x] Usuarios pasan a ser asientos; límite por plan en `PLAN_QUOTAS.max_usuarios` (1/3/5/∞)
  - [x] `require_plan` y `check_bi_quota_dep` resuelven contra la empresa activa
  - [x] Cuotas de BI contabilizadas por empresa en Redis
  - [x] Migración de **datos** de los usuarios existentes a su empresa owner (`4829d50c138a`)
- [x] Puerto `ProveedorDePago` en `domain/`, Stripe como adaptador en `infra/`
- [x] Adaptador de pasarela local: **MercadoPago** (ADR 0008). Sin probar aún contra la API real.

### F4 — Modelo de datos para el alcance objetivo · 1–2 semanas

- [x] **Causa raíz de la "deriva" encontrada**: `alembic/env.py` no importaba los modelos, así que autogenerate veía cero tablas. Con test de regresión.
- [x] **Migración de reconciliación** (`da5fb1e45066`) y `alembic check` **bloqueante** en CI. De paso, 11 índices duplicados eliminados.
- [x] **Retiradas las llamadas a `Base.metadata.create_all()`**: el ETL verifica el esquema en vez de crearlo, y `init_production_db.py` (que no creaba nada por el mismo import ausente) se eliminó
- [x] `JSON` → `JSONB` en las 26 columnas (migración `8241c5e956f1`). **Sin GIN**: hoy ninguna
      se consulta por contenido en SQL, se leen enteras y se procesan en Python o Polars. Un GIN
      sobre una columna que nadie filtra sólo cuesta escritura en cada carga del ETL.
- [x] Índices para el listado (migración `adcfd900e5f3`): tres **parciales** sobre `activo`, con
      `fecha_publicacion DESC` como última columna. El listado por defecto pasa de recorrer la
      tabla a un index scan de 4 páginas. `region` no tenía ningún índice.
- [x] `tsvector` + GIN para búsqueda. **El `ILIKE` no se retira del todo, a propósito**: cada
      término coincide por palabra (tsvector, con stemming) **o** por fragmento en `nombre`
      (trigrama). Retirarlo entero habría perdido la búsqueda por fragmento sin evidencia de que
      nadie la usa. Medido: el `COUNT` que el endpoint ejecuta en cada búsqueda pasa de **94 ms a
      1,5 ms** sobre 200 000 filas.
- [x] `tipo_convocatoria` — **hecho en F6.2**, donde tocaba: con los datos reales de Compra
      Ágil y Convenio Marco delante, en vez de fijar el enum antes de verlos. Vive en
      `app/models/convocatoria.py` y el ETL lo importa por `shared_imports`, no lo copia.
      Ojo: `licitaciones.tipo_licitacion` es otra cosa — el código LE/LP/LQ que entrega la API.
- [x] ~~`fuente` / `pais` en las entidades de ingesta~~ — descartado (decisión 1: sólo Chile)
- [x] Regla de PKs (UUID negocio / BigInteger ingesta) **y verificada**: ninguna tabla nueva
      puede llevar PK `integer`. Las 16 existentes quedan en la línea base — migrarlas exige
      reescribir las tablas grandes y tocar cada FK, y no hay urgencia (int4 aguanta 2,1 mil
      millones de filas).
- [x] Comentarios de BD **con chequeo**. Trinquete, no prohibición: exigirlos en todo fallaría
      con 302 violaciones y el test acabaría desactivado. Falla sólo con deuda nueva, y la línea
      base sólo puede encoger.

### F5 — Frontend · 1–2 semanas · paralelizable con F3/F4

> **Revisado el 2026-08-07, y el plan cambia en un punto.** Mientras corrían F3 y F4, otra
> sesión construyó el sistema de diseño: paleta por tokens en `globals.css` mapeada a
> Tailwind, dos paradas invertidas por tema con su `--color-on-*`, tipografía, accesibilidad
> AA verificada sobre 166 pares, y **tests estructurales propios** — `on-color.test.ts`
> escanea el código buscando `text-white` sobre fondos de token, que es un fallo invisible en
> tema claro.
>
> Eso deja **"shadcn/ui como design system" fuera de sitio**: la capa de tokens ya existe y
> está verificada, y adoptar shadcn entero importaría un segundo vocabulario que pelearía con
> ella. Lo que sí falta son **primitivas accesibles** (diálogo, select, dropdown, tabs):
> `SelectField.tsx` está hecho a mano. Eso es Radix montado sobre los tokens que ya hay —
> complementario, no sustitutivo, y se añade pieza a pieza cuando haga falta.
>
> Verificado además que el cambio de autenticación **no rompe el frontend**: `lib/api.ts`
> desestructura sólo `access_token` e ignora el resto de la respuesta, y `changePassword` no
> depende del mensaje. El esquema OpenAPI genera limpio (73 rutas, 100 schemas).

- [x] **TanStack Query** en las 28 pantallas. De paso desapareció `useCompradorCache`, una
      caché de promesas hecha a mano, y se arreglaron dos fallos reales: el selector de empresa
      no actualizaba las pantallas ya montadas, y comparar dos rubros podía mezclar respuestas
      si una tardaba más que la otra.
- [x] **Capa proxy con route handlers + sesión en cookie `httpOnly`.** El navegador ya no ve
      ningún token y el proxy renueva de forma transparente: **se acabó el cierre de sesión a
      los 30 minutos**. Verificado de punta a punta contra un backend real — login, petición
      autenticada, renovación con sólo la cookie de refresco, y cierre que revoca en el
      servidor además de borrar la cookie.
      Queda que Google siga sin refresco: su redirección sólo trae el acceso.
- [~] ~~shadcn/ui como design system~~ — **el sistema de tokens ya existe** (ver nota arriba),
      y **las páginas de 900+ líneas están descompuestas**: ninguna pasa de 700, partidas por
      su seam natural y con los ayudantes de estado y formato en `lib/`.
      **Queda abierto a propósito**: primitivas accesibles tipo Radix sobre esos tokens. No es
      un pendiente de la fase sino una mejora de accesibilidad que conviene hacer con un
      inventario de componentes delante, no a la vez que se parten las pantallas.
- [x] **Vitest y Playwright**, los dos en CI. Playwright cubre 9 flujos y encontró tres fallos
      que ninguna otra capa veía — todos compilaban y pasaban el lint.
- [x] **UI de invitación y gestión de miembros** — `components/empresa/PanelEquipo.tsx`, con
      `UsoDeAsientos` al lado para que el tope del plan se vea antes de toparse con el 402.

### F6 — Diferenciación · continuo, empezar después de F2

Reordenado según las decisiones del 2026-08-05:

1. **Servidor MCP de sólo lectura sobre la base histórica** — **construido el 2026-08-08**,
   al cumplirse la condición que su propia especificación puso: *«si la API pública ya está y
   el MCP pasa a ser una envoltura fina sobre ella»*. F6.4 la dejó hecha. Las otras dos
   razones de la pausa siguen siendo ciertas —sigue siendo un canal y sigue alcanzando sólo a
   quien ya paga un cliente MCP—; lo que cambió es el costo de construirlo, no el premio. Y el
   orden se respetó: Compra Ágil y Convenio Marco se hicieron **antes**.

   Historial de la pausa, que sigue valiendo:
   ~~**EN PAUSA desde 2026-08-07**~~,
   especificado en el [ADR 0004](decisiones/0004-llm-solo-mcp.md). No es una capacidad, es un
   canal: alcanza sólo a quien ya paga un cliente MCP, mientras Compra Ágil y Convenio Marco
   —volumen de mercado que los usuarios no ven— siguen sin construirse. La razón original era
   "LicitaLab ya lanzó el suyo", que es imitar a un competidor, no resolver un problema propio.
   Los cimientos sí se hicieron y no se pierden: claves de API (que además son prerequisito de
   la API pública) y la actualización del framework.
2. **Compra Ágil + Convenio Marco** — **hecho**, con dos correcciones al plan que salieron de
   leer la documentación oficial en vez de suponerla:

   - **Convenio Marco no tiene endpoint propio.** Las compras por catálogo llegan como
     **órdenes de compra con `Tipo=9`** (§3.1 del diccionario de datos oficial), y ese campo
     no se guardaba en ninguna columna. Es la única vía.
   - **Compra Ágil no está en la API clásica.** ChileCompra publicó **una API aparte** en mayo
     de 2026: otro host (`api2.mercadopublico.cl`), **el ticket va en una cabecera** y hay
     **cuota diaria** con un 429 que no se restablece hasta el día siguiente.

   El discriminador es `tipo_convocatoria`, en `app/models/convocatoria.py`, importado por el
   ETL a través de `shared_imports` — no copiado.

   **El cliente de Compra Ágil nunca ha hablado con la API real**: el ticket configurado es el
   de ejemplo. Está escrito contra la especificación y probado con respuestas simuladas que la
   reproducen. Con un ticket de verdad, lo primero es correr una pasada y comparar.
3. **Alertas de cambio de precio** (lo que hace Falconsoft) — **hecho**. Los datos ya estaban;
   faltaba el disparador, y faltaba por una razón concreta que sólo aparece al mirar el ETL:
   **`analytics.product_price_bands_l1` se reemplaza entera** en cada materialización (swap
   atómico), así que después de recalcularla **no queda con qué comparar**. Un cambio de precio
   era invisible por construcción, no por falta de ganas.

   Lo que se añadió es lo que faltaba para que "aquí está el precio" se convierta en "el precio
   subió un 18 %":

   - `precio_referencia` — el último precio conocido por producto **y unidad**. No es un
     histórico: se actualiza en el sitio. Un histórico daría 23 000 filas por corrida de las
     que nadie consultaría el 99 %.
   - `suscripcion_precio` — qué vigila cada **empresa**, con **su propio umbral**. Por eso el
     umbral se aplica al avisar y no al detectar: aplicarlo antes impediría que una empresa
     pidiera avisos más finos que otra.
   - `app/services/vigilancia_precios.py` + tarea Celery los **lunes a las 04:30**, hora y media
     después de la reconstrucción de analytics. Correrla en paralelo compararía contra una tabla
     a medio reemplazar y las variaciones serían inventadas.
   - Tres endpoints bajo `/empresas/{id}/precios-vigilados` y el botón «avisarme si cambia el
     precio» en la herramienta de consulta de precios del BI.

   Cuatro decisiones que el código no explica solo, y por eso están fijadas con tests: **la
   primera corrida no avisa de nada** (un precio visto por primera vez no ha cambiado de nada, y
   alertar del catálogo entero sería spam garantizado); **un producto con menos de 5 órdenes no
   genera aviso** (su mediana se mueve sola); **avisa a todo el equipo**, porque la suscripción
   es de la empresa y `alerts.user_id` es de usuario; y **correr dos veces el mismo día no
   duplica**, con el día dentro de la clave de idempotencia.

   La unidad de medida **la resuelve el servidor** por la unidad en la que más se compra el
   producto. Quien pulsa «vigilar» busca un producto, no una unidad — y guardarla vacía habría
   creado una vigilancia incapaz de coincidir con los datos: no avisaría nunca, sin decirlo.

   > **De paso apareció otra cosa:** `beat_schedule` nombra las tareas por cadena, y el módulo
   > nuevo no estaba importado en `celery_app.py`. Beat la habría encolado y el worker la habría
   > rechazado con `Received unregistered task` — un fallo que sólo se ve en producción, un lunes
   > a las 4:30. Ahora hay un test que recorre **las 12 entradas del calendario** y comprueba que
   > cada una corresponde a una tarea registrada.
4. **API pública + API keys** — **hecho**. El ángulo de integración ERP de Falconsoft.
   Habilita el segmento gremios.

   Las claves de API hubo que adelantarlas: el orden del plan estaba invertido. El MCP
   (punto 1) necesita una credencial que un cliente sin navegador pueda usar, y la única
   autenticación era un JWT de 30 minutos. El versionado se cerró en el [ADR
   0009](decisiones/0009-api-versionada-y-sin-envelope.md). Lo que faltaba —y ya está— es
   la superficie en sí:

   - **Está declarada, no deducida.** `app/api/documentacion.py::SUPERFICIE` clasifica cada
     grupo como `publica` o `interna`, y un test falla si aparece uno sin clasificar. Sin esa
     declaración, «la API pública» sería «todo lo que resultó estar montado» — una promesa de
     estabilidad que nadie decidió dar, y que se ampliaría sola con cada router nuevo.
   - **La guía viaja dentro del OpenAPI**, no en un README: la ve quien abre `/docs`, quien
     genera un cliente y quien se descarga el esquema. Un README se queda viejo sin que nada
     falle. `docs/API_PUBLICA.md` se queda con lo que el esquema no puede decir solo.
   - **Límite por minuto y por CLAVE**, según el plan. Por clave y no por IP porque un ERP
     sale por una sola IP de oficina: limitar ahí metería a toda la empresa en el mismo cubo,
     y quien quisiera saltárselo sólo tendría que usar varias IP. Las cabeceras
     `X-RateLimit-*` se mandan **también al dejar pasar** — enterarse por el 429 es tarde.

   > **Deuda que salió al hacerlo.** `core/plan_limits.py` importaba `app.api.deps` **dentro
   > de una función**: `core` importando de `api`, la dirección contraria a la que manda el
   > diseño por capas. Era un ciclo real que sólo se sostenía por estar diferido, y se cerró
   > en cuanto `core.security` necesitó un import normal de `plan_limits` — la aplicación
   > dejó de arrancar. Las tres dependencias de cuota se movieron a `api/deps.py`, que es
   > donde vive el resto; `core` se queda con la tabla de cuotas y las funciones puras. De
   > paso desapareció un `check_bi_quota` muerto que sólo lanzaba `NotImplementedError`.
5. **Reportes semanales automáticos en PDF/email** — **hecho**.

   Ya existía un «radar semanal» por correo, y al abrirlo aparecieron tres cosas: mandaba el
   **HTML en el hueco del texto plano** (quien lo leyera sin HTML recibía el marcado en
   crudo), **interpolaba nombres de ChileCompra sin escapar** —un `&` rompía la maqueta— y su
   pie ofrecía desactivarlo en «Ajustes → Notificaciones», **una pantalla que no tenía esa
   opción**.

   El informe lo sustituye: cinco secciones —encaje, cierres de la semana, cambios de precio
   de lo vigilado, cumplimiento y mercado— con el mismo contenido **en PDF adjunto**, porque
   un correo no se reenvía a un directorio ni se archiva con la postulación.

   - **El encaje se lee del precomputado.** El radar cargaba TF-IDF y puntuaba 200
     licitaciones por empresa en cada corrida; además de costar, podía dar un número distinto
     al que muestra el panel. Dos fuentes de verdad para «encaje» es una de más.
   - **Una sección vacía se dice, no se esconde.** «Ningún documento vence en 30 días» es
     información; omitir la sección deja sin saber si es que no hay o es que no se miró.
   - **Si no hay absolutamente nada, no se manda.** Un semanal vacío enseña a ignorar el
     semanal.
   - `reportlab` y no un motor de navegador: weasyprint necesita cairo y pango del sistema, y
     la imagen ya se mide contra 512 MB. reportlab es Python puro.
6. **Extracción de bases con LLM** — **reevaluada y aplazada** el 2026-08-08, con su
   [ADR 0010](decisiones/0010-extraccion-de-bases-con-llm.md). F3 está hecho, así que tocaba
   decidir; al ir a hacerlo apareció que **el proyecto no era el que parecía**.

   §14 razonó la economía como «costo por documento, que se amortiza entre los suscriptores
   que miren esa licitación», y con eso la respuesta era obviamente sí. Ese cálculo da por
   supuesto que el documento está disponible, y **no lo está**:

   - En el diccionario de datos oficial de la API, «Licitaci…» aparece **260 veces** y
     «Adjunt…», «Garantía», «Criterio» y «Ponderaci…» aparecen **cero**. No sólo faltan los
     archivos: faltan también los datos que el LLM iba a extraer de ellos.
   - `licitaciones` guarda `url_licitacion` y `url_acta`, que son enlaces a la **ficha del
     portal**, no a archivos. Ningún extractor descarga adjuntos.
   - Y la premisa que sostenía la urgencia era falsa: §14 decía que el checklist dependía de
     plantillas «que puede que ni siquiera estén sembradas». **`plantillas_checklist` tiene 29
     filas.** El módulo funciona.

   Así que lo que había que construir era un **scraper del portal** (ASP.NET WebForms con
   `viewstate`, frágil), resolver **si automatizar el portal está permitido** —consumir la API
   lo está; el portal es otra cosa— y almacenar los archivos. El LLM era la última parte y la
   barata.

   **Se reabre** si aparece una fuente autorizada de los archivos. La comprobación que falta
   está nombrada en el ADR: si el OCDS que publica ChileCompra trae su array `documents` con
   URL, desaparecen el scraper y la duda legal, el cálculo de §14 vuelve a ser correcto y la
   respuesta vuelve a ser sí.

---

> **El golden master no corría en ninguna parte, y ya está resuelto.** El esquema `analytics`
> estaba vacío en CI, así que sus 31 casos —la única verificación automática de
> `services/bi/`— se saltaban en silencio. `make ci` tampoco lo destapaba porque no exportaba
> `CI`, así que era más permisivo que el CI que decía reproducir.
>
> Los datos completos no caben en el repo (27 MB de parquets), así que se recortaron a un
> fixture de 1 MB construido alrededor de las claves que el golden consulta. Comprobado que
> no debilita el test: **los mismos 27 de 31 casos conservan contenido real**, exactamente
> como con los datos completos.
>
> Verificado además que detecta regresiones de verdad, no sólo que pasa: se le introdujo la
> pérdida de un desempate y un off-by-one en un límite, y falló en ambos casos nombrando la
> función.

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
