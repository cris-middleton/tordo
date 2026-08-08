# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Este documento describe el estado REAL del código, no el objetivo.** Lo que está
> planificado pero no construido vive en "Hacia dónde va" y en
> `docs/ARQUITECTURA_REVISION_2026-08.md`. Si encuentras una diferencia entre este
> archivo y el código, **el código gana** — y corrige este archivo en el mismo PR.

---

## Qué es

**TORDO** — SaaS B2B para PYMES chilenas que licitan en Mercado Público. Dos propuestas de valor:

1. **Inteligencia pre-postulación** — bandas de precio históricas, análisis de competidores,
   matching semántico TF-IDF, scoring de oportunidad y perfilado de compradores. Responde
   *"¿me conviene postular, y a qué precio?"*
2. **Compliance operativo** — monitoreo de estado hábil, vencimiento de documentos, checklist
   de postulación, recordatorios de plazo. Responde *"¿me van a rechazar por forma?"*

Desktop-first, responsive, sólo español, sólo Chile.

**El nombre se lee de `APP_NAME` / `BRAND_NAME`. Nunca hardcodear "TORDO" en el código.**

---

## Reglas de trabajo (no negociables)

### Ceremonia proporcional al tamaño
Cambios chicos: sin brainstorming ni plan; evalúa y procede sólo con ≥95 % de confianza.
Proyectos medianos o grandes: `grill-me` primero, sin cabos sueltos.

### Ramas y worktrees

**Toda feature se desarrolla en un worktree. Nunca se ramifica en el checkout
principal.** No es una preferencia de estilo: mantiene `main` siempre limpio y
levantable, permite tener dos features a medias sin pisarse, y evita el `git stash`
a medio camino cuando hay que revisar otra cosa.

```bash
make worktree NOMBRE=mi-feature   # crea la rama, copia el .env y sincroniza deps
cd ../tordo-worktrees/mi-feature
# ... trabajar, commitear, PR ...
make worktree-clean NOMBRE=mi-feature   # tras mergear
make worktree-list
```

`make worktree` hace el setup completo a propósito: una regla que exige cuatro pasos
manuales se salta, un comando no.

- **Flujo:** worktree → `make ci` en verde → PR a `main` → **`make merge PR=<n>`** → despliegue.
- **Mergea siempre con `make merge PR=<n>`, no con `gh pr merge`.** Espera a los checks,
  los lista y se niega si alguno no está en verde.

  Hace falta porque **`main` no tiene protección de rama**: GitHub la reserva a repos públicos
  o a cuentas Pro, y este repo es privado en cuenta gratuita — la API devuelve 403 tanto para
  `branches/main/protection` como para `rulesets`. Así que nada del lado del servidor impide
  mergear en rojo, y ya pasó: el PR #14 se mergeó con el build de imágenes en FAILURE y los
  tests de ETL en CANCELLED.

  Esto **no es protección de verdad** — es local y se puede saltar. Sólo hace que el camino
  correcto sea también el más corto. **La protección real cuesta ~4 USD/mes (GitHub Pro)**;
  mientras no esté, esto es lo que hay.
- Los worktrees **no heredan archivos gitignoreados**: cada uno necesita su propio
  `.env` y su propio `node_modules` (el target copia el primero e instala el segundo).
  Los hooks de pre-commit, en cambio, se comparten con el checkout principal.

#### GitHub Actions sí corre. `make ci` es el ensayo previo

Este archivo decía que Actions no estaba habilitado y que `.github/workflows/ci.yml` no
corría. **Ya no es cierto**: `actions/permissions` devuelve `enabled=true` y el workflow
ejecuta sus seis jobs —lint, migraciones, tests de backend, tests de ETL, frontend y build
de imágenes— en cada `pull_request` contra `main`. Verificado sobre once PRs seguidos.

Dos cosas que sí conviene saber:

- **Un PR abierto durante una caída de Actions se queda sin checks para siempre.** GitHub no
  dispara retroactivamente: hay que cerrar y reabrir el PR para gatillar el evento. Pasó con
  una pila entera durante un `major_outage`.
- **`make ci` sigue valiendo la pena antes de pushear.** Levanta un Postgres efímero y corre
  lo mismo en local, así que el ciclo de vuelta es de minutos en vez de esperar al runner. Lo
  que más se olvida es siempre lo mismo: el ciclo de migraciones y el build del frontend.
- Los contenedores y volúmenes de Docker son compartidos: no levantes el stack desde dos
  worktrees a la vez.
- **`etl/data/` tampoco se hereda** (está gitignoreado). Si necesitas los parquets de
  analytics en un worktree, materializa apuntando al checkout principal en vez de
  redescargarlos:
  ```bash
  uv run --project .. python -m analytics.materialize \
      --data-dir ~/personal/tordo/etl/data/analytics
  ```

> **No hay rama `staging` ni entorno de staging, y es deliberado.** Este es un proyecto
> personal de un solo desarrollador desplegando en Railway; el flujo de dos ramas de los
> repos de otra empresa existe porque allá cada rama auto-despliega a un entorno GCP distinto.
> Aquí sería ceremonia sin beneficio — y "ceremonia proporcional al tamaño" es justamente
> la regla. **Cuando haya el primer usuario pagando**, crear entorno + rama de staging y
> volver al flujo de dos etapas.

### Python
- `uv` y `python3`. **No hay `requirements.txt`**: un solo `pyproject.toml` en la raíz con
  grupos `shared` / `api` / `etl` / `dev`, y un solo `uv.lock`.
- Comandos desde `backend/` o `etl/`: `uv run --project .. <cmd>`.
- **Los hooks de pre-commit son por clone.** Los *worktrees* de git comparten el directorio
  de hooks con el checkout principal (`git rev-parse --git-path hooks` resuelve al `.git`
  común), así que basta instalarlos una vez por clone. En un clone nuevo: `make hooks`.
  **Nunca `--no-verify`** — arregla la causa.
- Tras tocar `pyproject.toml`: `make lock` y commitea el `uv.lock`. CI falla si divergen.

### Dependencias — `make audit`

**Córrelo cada cierto tiempo, y siempre antes de añadir una librería nueva.** Consulta OSV
para cada paquete del `uv.lock`, corre `npm audit` sobre el frontend y avisa de lo que lleva
más de 24 meses sin release.

Hace falta porque **un pin no caduca y nadie lo mira**. La primera vez que se auditó, todo el
conjunto de Python llevaba ~33 meses congelado y **nueve paquetes tenían vulnerabilidades
conocidas**, entre ellas confusión de algoritmos en la librería que validaba los JWT.

No está en CI a propósito: depende de red externa y una caída de OSV no debería bloquear un PR.

Tres reglas que salieron de esa auditoría:

- **Antes de actualizar una dependencia, comprueba si se usa.** Seis estaban declaradas y no se
  importaban en ninguna parte (`lxml`, `pypdf`, `aiosmtplib`, `beautifulsoup4`, `schedule`,
  `ratelimit`) — y tres de ellas cargaban CVE. **Quitarlas es mejor que actualizarlas.**
- **Una librería sin releases es una señal, aunque no tenga CVE.** `passlib` llevaba 70 meses
  sin publicar y era lo que obligaba a clavar `bcrypt` en 4.0.1.
- **Cambiar de librería en autenticación exige test de interoperabilidad.** Un JWT y un hash
  de contraseña son *formatos*, no librerías: lo que puede salir mal no es que falle, es que
  funcione con lo nuevo y rechace lo que ya está emitido, echando a todos los usuarios en el
  despliegue. Ver `tests/test_jwt_interoperable.py` y `tests/test_passwords_interoperable.py`,
  donde los valores de referencia los generó **la librería anterior**.

### Migraciones
- **Siempre `make migrate-create MSG="descripción"`. Nunca `alembic revision` directo.**
  Es la única forma de obtener IDs y cadenas de `down_revision` correctas. Este repo ya
  se rompió una vez por esto (ver `011_fix_alerttype_enum_uppercase`).
  Los targets `migrate*` corren alembic **en el host**, no dentro del contenedor: dentro
  fallaban desde cualquier worktree, así que esta regla y la de trabajar en worktrees se
  contradecían. Sólo hace falta `DATABASE_URL`; no hace falta levantar el stack.
- CI valida que haya exactamente una cabeza y que `upgrade head` + `downgrade base` corran
  limpios contra una base vacía. Una migración que no revierte no pasa.
- **`alembic check` es bloqueante.** Los modelos y las migraciones ya no divergen: si cambias
  un modelo, la migración va en el mismo PR.
- **Nada de índices por expresión.** Alembic los compara mal y con el check bloqueante eso es
  deriva perpetua. Si necesitas indexar `f(columna)`, añade una **columna generada** y ponle
  un índice normal — es lo que hacen `licitaciones.busqueda` y `nombre_norm`.
- **La unicidad se declara UNA vez, como restricción.** `unique=True` en la columna basta —
  la convención de `app/db/__init__.py` la nombra `uq_<tabla>_<columna>`. **Nunca
  `unique=True, index=True`**: eso genera un índice único en vez de una restricción, y una
  restricción UNIQUE ya trae su propio índice. `index=True` es sólo para búsquedas no únicas.
- **La convención de nombres afecta a las migraciones ya escritas**, porque Alembic se la pasa
  a `op.create_table`. Una base nueva y una antigua pueden salir con nombres distintos para la
  misma restricción. Si tocas restricciones únicas, prueba la migración en las dos rutas (§5.0).
- **Revisa siempre el esqueleto que genera autogenerate antes de commitearlo.** `env.py` ya
  estuvo sin importar los modelos, y con `target_metadata` vacío autogenerate propone borrar
  la base entera con toda naturalidad. Corregido y con test (`tests/test_alembic_metadata.py`),
  pero la lección se mantiene: autogenerate propone, no decide.

### Multi-tenancy — CRÍTICO PARA LA SEGURIDAD
Todo endpoint que toque datos de una empresa **debe** resolver el contexto de empresa por
dependencia, no a mano:

```python
from app.api.deps import EmpresaContext, empresa_ctx, require_rol

async def leer(ctx: EmpresaContext = Depends(empresa_ctx)): ...
async def escribir(ctx: EmpresaContext = Depends(require_rol("owner", "admin"))): ...
```

Cuando el `empresa_id` no viene por path (cuerpo del request, o de una entidad ya cargada)
se usa `verificar_acceso_empresa(...)`, que es **la misma implementación**. Nunca escribas
una consulta propia de membresía en un router.

`backend/tests/test_tenancy_estructural.py` falla en CI si una ruta con `{empresa_id}` no
declara la dependencia. Ver `.claude/skills/endpoint-empresa/`.

**El recorrido de rutas vive en `backend/tests/rutas.py`, en un solo sitio.** No uses
`app.routes` directamente: desde FastAPI 0.115 los routers incluidos **no se aplanan** ahí,
y `app.routes` devuelve envoltorios `_IncludedRouter`. Al actualizar desde 0.104 los dos
tests estructurales pasaron a encontrar **cero rutas** — y lo dijeron sólo porque llevan
guardas explícitas ("se esperaban ≥10, hay 0"). **Un test estructural sin esa guarda se
queda mudo comprobando el vacío.**

### Gating por plan en BI
`backend/tests/test_contrato_bi.py` declara, ruta por ruta, qué protección le toca a cada uno
de los 22 endpoints de BI. **Un endpoint nuevo hace fallar el test hasta que alguien decida
explícitamente su nivel** — igual que con tenancy.

Si una capacidad se vende en `/api/billing/plans`, el endpoint que la implementa tiene que
comprobar el plan. Encontró que no se cumplía: "Matching semántico" se vendía como Pro y
`/licitacion-match` no lo comprobaba.

### Convenciones de código
- **Imports a nivel de módulo.** Nada de imports dentro de funciones. El código heredado
  los usa para diferir dependencias pesadas — es un síntoma del problema de servicio de
  analytics (F2), no un patrón a copiar. **No añadas imports diferidos nuevos.**
  Ya causó un bug real: `subscription_status_from_stripe` importado dentro de una función y
  usado en otra rompía todos los webhooks `customer.subscription.updated`.
- **Todos los schemas Pydantic en `app/schemas/`.** Nunca inline en endpoints o servicios.
- **Toda tabla y columna nueva lleva `comment=`.** Es un producto de datos con 78 columnas
  por orden de compra; sin comentarios se vuelve inusable en meses.
- **Clave primaria: `UUID` para entidades de negocio, `BigInteger` para las de ingesta.**
  Las de ingesta crecen sin techo y `integer` se queda corto; las de negocio se exponen en
  URLs y no conviene que sean adivinables.
- **Las dos reglas anteriores las verifica `tests/test_convenciones_modelo.py`**, con
  trinquete: hoy hay deuda (24 tablas y 302 columnas sin comentario, 16 PK `integer`), así que
  el test **no exige arreglarla** — falla si aparece deuda **nueva**. La deuda vive en
  `tests/convenciones_baseline.json` y sólo puede encoger.
  Al arreglar algo: `cd backend && uv run --project .. python tests/regenerar_baseline.py`.
- Los errores de negocio se devuelven con `HTTPException` y mensaje en español — los ve el usuario.

### Secretos
Nunca al repo. Un hook de pre-commit bloquea cualquier `.env`. Si una credencial llega a un
commit, **rótala**: quitarla después no la invalida.

### Skills del plugin `toolkit-de-usuario`

El plugin está instalado a nivel de usuario, así que sus skills aparecen también aquí.
**TORDO es un proyecto personal y no comparte nada con otra empresa**: ni infraestructura, ni tenant,
ni Notion, ni Sentry, ni GCP.

**Se pueden usar** (son genéricos, no tocan sistemas externos):

| Skill | Para qué |
|---|---|
| `grill-me` | Estresar un plan antes de construirlo. Obligatorio en proyectos medianos o grandes. |
| `handoff` | Comprimir la sesión para que otra continúe. Útil: estas sesiones se alargan. |
| `feature` | Pipeline completo staff-engineer → dev → review por chunk → review de integración. Encaja bien con las fases F2–F5. |
| `demo-video` | Grabar una demo con Playwright y editarla con Remotion. Relevante para competir de igual a igual con LicitaLab. |
| agentes `staff-engineer`, `dev`, `chunk-reviewer`, `integration-reviewer`, `git-commit-generator` | Genéricos. |

**NO usar aquí — apuntan a sistemas de otra empresa y modificarían infraestructura ajena:**

`auth0` (tenant de otra empresa) · `customerio` · `grafana` (dashboard de otra empresa) ·
`sentry-alerts` (organización `org-ajena`) · `pubsub`, `scheduler`, `tasks` (GCP de otra empresa,
manifest-first sobre el repo `infra`) · `drd`, `crear-proyecto` (Notion de otra empresa) ·
`setup` (instala el toolkit de otra empresa).

TORDO usa su propio Sentry (`SENTRY_DSN`), su propio Celery beat en vez de Cloud Scheduler,
y no tiene Pub/Sub ni Cloud Tasks.

### Frontend
- **El navegador nunca ve un token.** La sesión vive en cookies `httpOnly`
  (`tordo_acceso`, `tordo_refresco`) que pone el servidor de Next, y todo el tráfico va por
  `/api/proxy`, que lee la cookie y pone `Authorization`. Un XSS ya no puede llevarse la
  sesión, porque no hay nada que leer.
  - **El proxy renueva solo.** Al 401 rota el refresco y reintenta una vez. Antes el usuario
    quedaba fuera a los 30 minutos.
  - **`lib/api.ts` no maneja tokens.** No hay `setToken` ni `localStorage`: si te ves
    añadiéndolos, es que algo se saltó el proxy.
  - **La URL del backend es `API_URL`, de SERVIDOR.** `NEXT_PUBLIC_API_URL` desapareció:
    cualquier variable `NEXT_PUBLIC_*` se inlinea en el bundle.
  - `__tests__/sesion-cookies.test.ts` fija que las cookies sean `httpOnly` y `sameSite=lax`.
    Todo el valor de esto depende de esa palabra, y es lo que se pierde en un refactor sin
    que nada falle.
  - **Pendiente**: una sesión iniciada con Google sigue caducando a los 30 minutos — el
    backend sólo manda el token de acceso en su redirección. Mandar el refresco por la URL
    sería peor. La solución es un código de un solo uso, y toca el backend.
- **Los límites de plan NO se copian al frontend.** Viven en `PLAN_QUOTAS`
  (`core/plan_limits.py`) y llegan por `GET /api/empresas/{id}/plan`, junto con el consumo
  actual. Una copia en TypeScript se desincroniza al primer cambio de precios **sin que nada
  falle**: el cliente ve un límite que no es el suyo. `null` es *ilimitado*, no cero.
- **Un 402 del backend se traduce a `plan-upgrade-needed` en el interceptor de `lib/api.ts`**,
  y `PlanUpgradeBanner` lo pinta. Va ahí y no en cada pantalla porque el backend devuelve 402
  desde cuatro sitios y uno de ellos son los 22 endpoints de BI. **El banner llevaba
  escuchando ese evento sin que nadie lo emitiera**: cada tope de plan se topaba en silencio.
  Lo fija `__tests__/cuota-402.test.ts`, contra el interceptor real.
- **Sentry cubre los tres runtimes** (navegador, Node y edge) y las opciones salen de un solo
  sitio, `lib/sentry-comun.ts`. Ponerlas en dos de los tres es la forma fácil de equivocarse,
  así que hay un test estructural que exige que las tres partan de `OPCIONES_COMUNES`.
  - **`sendDefaultPii: false`**, como el backend: por aquí pasan RUTs, montos y documentos.
    Cambiarlo no rompe nada y empieza a mandar datos de clientes a un tercero —
    `__tests__/sentry-privacidad.test.ts` lo fija.
  - **Sin replay de sesión**, a propósito: graba la pantalla. Un `maskAllText` es una
    salvaguarda que hay que acertar; no grabar no hay que acertarlo.
  - `AbortError` y los 401 se descartan: cancelar peticiones es el comportamiento **correcto**
    (el proxy renueva, TanStack Query cancela lo obsoleto) y reportarlo convierte lo normal
    en alarma.
  - **`app/error.tsx` y `app/global-error.tsx`.** No existía ninguna frontera de error: un
    fallo al renderizar dejaba una página en blanco y **nada registrado**. `global-error`
    lleva sus estilos en línea porque si lo que falló es el layout, las hojas de estilo
    pueden no haber llegado.
- **`NEXT_PUBLIC_*` se inlinea en el BUILD, no en ejecución.** Ponerlo en el `environment`
  del contenedor no llega al navegador: van como `ARG` en el Dockerfile y como `build.args`
  en el compose. Es el motivo por el que `API_URL` **no** lleva ese prefijo, y por el que el
  DSN de Sentry **sí** lo lleva (para reportar un error del navegador, el navegador tiene que
  saber a dónde mandarlo; un DSN sólo permite escribir eventos, no leerlos).
  `SENTRY_AUTH_TOKEN` es `ARG` y nunca `ENV`: un `ENV` lo deja escrito en los metadatos.
- **Nunca hardcodear un color.** La paleta vive en tokens (`app/globals.css`) y se consume por
  Tailwind. Los componentes tenían 112 hexes; hoy tienen cero.
- **Nunca `text-white` sobre un fondo de token.** Los rellenos se invierten con el tema: en
  claro `bg-accent` es teal oscuro con etiqueta blanca, en oscuro es teal claro con etiqueta
  navy. Usa `text-onAccent`, `text-onPrimary`, `text-onGold`… `__tests__/on-color.test.ts`
  falla si alguien lo olvida, y hace falta: **el error es invisible en tema claro**, que es el
  que se revisa por defecto, porque ahí `on-accent` justamente ES blanco.
- **Si tocas un token de color, revalida el contraste.** Los 166 pares del sistema están
  verificados contra WCAG AA — cada tinta contra cada superficie, en ambos temas. El bug de
  `.alert-info` (texto invisible en tema claro) nació de cambiar un token a ojo.
- Las superficies que deben verse oscuras siempre —el hero, la tarjeta Pro, los paneles de
  autenticación— se marcan con la clase `dark` sobre `bg-brand-navy`, y los tokens se
  invierten solos dentro. No repintes a mano.
- **El estado de servidor va en TanStack Query, sin excepciones.** Las consultas y sus claves
  viven en `lib/queries.ts`, en un solo sitio: las claves son lo que permite invalidar con
  precisión tras una mutación. Los hooks envuelven `lib/api.ts`, no `fetch` — esa capa es la
  que permitirá mover el transporte a un proxy con cookie `httpOnly` sin tocar una pantalla.
  **`react-hooks/set-state-in-effect` e `immutability` son `error`**: reintroducir el patrón
  `useEffect` + `setState` para pedir datos no compila.
- **Nada de `useEffect` + `setState` para leer algo que vive fuera de React.** Para
  `localStorage`, `matchMedia` o un evento del navegador, la API correcta es
  `useSyncExternalStore` — ya lo usan `useEmpresaActiva`, `useAvatar` y
  `usePrefersReducedMotion`. Además de dejar el lint limpio, arregla un fallo que el efecto
  tenía: **sólo corría al montar**, así que cambiar de empresa no actualizaba las pantallas
  ya montadas.
- **Hay tres excepciones en todo el frontend**, cada una marcada en su línea con el motivo:
  inicializar desde la URL (`bi/page`), sincronizar un formulario con datos que llegan después
  (`settings`) y arrancar la sesión (`AuthContext`). Si necesitas una cuarta, escribe por qué
  ahí mismo — nunca desactives la regla globalmente.
- **Ninguna pantalla pasa de 700 líneas.** Las tres que lo hacían están partidas por su
  seam natural: el detalle de licitación en `components/licitacion/` + `lib/licitacionDetalle.ts`,
  el listado en `TarjetaLicitacion` + `lib/licitacionEstado.ts`, y las herramientas de BI en
  `bi/components/herramientas/` (una pestaña por fichero). **Los ayudantes de estado y formato
  van en `lib/`, no dentro del componente**: definidos dentro se reconstruían en cada render
  y no se podían reutilizar desde la tarjeta.
- **Tests de extremo a extremo: `make e2e`.** Monta la pila entera contra una base
  efímera y corre Playwright. Encontró **tres fallos que ninguna otra capa veía**, y los
  tres compilaban y pasaban el lint:
  - el proxy entraba en **bucle de redirecciones** con cualquier ruta terminada en `/`
    (Next quita la barra, FastAPI la vuelve a pedir), así que `/api/tenders/`,
    `/api/empresas/` y `/api/alerts/` **nunca cargaban**;
  - `sort_by=relevance` **sin artefactos TF-IDF ignoraba el término** y devolvía el
    catálogo entero — el estado normal de un despliegue nuevo;
  - **`params` es una Promesa desde Next 16**, y las dos páginas de detalle la leían como
    objeto: pedían `/codigo/undefined`. Rotas desde la actualización.
  - En un componente cliente el parámetro de ruta se lee con **`useParams()`**.
- **El navegador de los E2E corre en contenedor**, y el servidor de Next **dentro del
  mismo contenedor**. No es capricho: las cookies de sesión son `Secure`, y
  `http://localhost` es el único origen sin TLS que un navegador trata como de confianza.
  Servido desde fuera, el login devuelve 200, no guarda nada y el test falla sin decir por
  qué. El backend sí vive en el host, y por eso escucha en `0.0.0.0`.
- **El lint es `eslint .`, no `next lint`** — desapareció en Next 16. La configuración es plana
  (`eslint.config.mjs`), porque ESLint 9 abandonó `.eslintrc`.

---

## Comandos

`make help` los lista todos.

```bash
make setup                       # deps + hooks (clone o worktree nuevo)
make hooks                       # sólo hooks
make lint / make lint-fix        # ruff check + format (idéntico a CI)
make audit                       # vulnerabilidades y antigüedad de dependencias
make test                        # backend + ETL + frontend
make e2e                         # extremo a extremo (pila completa + Playwright)
make dev-up-d / dev-logs / dev-down
make migrate / make migrate-create MSG="..." / make migrate-status
make db-shell
make front-dev
```

ETL (desde `etl/`):
```bash
uv run --project .. python main.py
uv run --project .. python -m etl.analytics.run_all [--modulo seasonality]
uv run --project .. python -m analytics.evaluation --model tfidf_matcher --walk-forward
```

**Cualquier cambio a un modelo de scoring pasa por el harness de evaluación**
(`etl/analytics/evaluation/`: splits, walk-forward, métricas, variantes). No se toca un
scorer sin correrlo.

---

## Arquitectura (estado real)

### Backend — `backend/app/`

Monolito modular, **en migración a capas** (F3). Ya existen `repositories/`, `domain/` e
`infra/`, pero muchos routers todavía llevan consultas SQLAlchemy inline: eso se va
moviendo agregado por agregado.

```
api/            14 routers. HTTP y autorización por dependencia (deps.py).
domain/         Reglas puras, sin IO. Hoy: el puerto de cobro.
infra/          Adaptadores externos. Hoy: billing/ (MercadoPago + Stripe).
repositories/   Acceso a datos. Hoy: analytics (sync y async).
services/       Lógica de negocio como funciones de módulo.
                services/bi/ está partido por dominio (precio, competencia,
                comprador, oportunidad, temporal, mercado, panel), con _base.py
                como único punto de acceso a las tablas de analytics.
core/           security.py (JWT), plan_limits.py (cuotas), email.py
observability/  logging JSON con request_id (contextvar) + Sentry opt-in
db/             sesión async (asyncpg) y sync (psycopg2)
models/         SQLAlchemy
schemas/        Pydantic — todos van aquí
tasks/          Celery
```

**Routers**: auth, users, tenders, alerts, empresas, documentos, postulaciones, estado_habil,
bi (22 endpoints), dashboard, billing, webhooks, health, data_inspection.
`data_inspection` requiere auth a nivel de router — **no añadas rutas ahí que la salten**.

**Celery**: 11 jobs. ETL horario, backfill diario, bulk semanal + analytics, estado hábil
cada 6 h, recordatorios de plazo y de vencimiento, precómputo nocturno de matches, watchdog
cada 30 min, trials, radar semanal. Todo en `America/Santiago`.

### Datos

- **PostgreSQL** — transaccional.
- **Parquet + Polars** — sólo cómputo batch. La API **no lee parquets**: el pipeline
  materializa los resultados en el esquema `analytics` de Postgres con índices
  (`etl/analytics/materialize.py`), y `bi_service` los consulta con SQL. Ver
  `docs/decisiones/0006-analytics-en-postgres.md`.
- Migraciones en `backend/alembic/versions/`.

### Frontend — `frontend/`

Next.js 16 App Router + TypeScript + Tailwind + Recharts. Componentes propios. El estado de
servidor va en TanStack Query (`lib/queries.ts`) y la sesión en cookies `httpOnly` servidas
por `/api/proxy` — ver las reglas de frontend más arriba.

**Sistema de diseño por tokens** en `app/globals.css`, mapeado a Tailwind en
`tailwind.config.js`. Paleta "Iridiscencia", sacada del propio logo — el tordo es un pájaro
negro con tornasol azul-verdoso:

- **navy = estructura**, **teal = acción**, **verde = liberado para significar "bueno"**.
  Antes `--color-accent` y `--color-success` valían el mismo hex, así que "esto es de TORDO"
  y "este número es bueno" eran indistinguibles.
- Ningún hex único sirve en ambos temas, así que cada color de acción tiene **dos paradas
  invertidas por tema** más un `--color-on-*` que dice qué etiqueta va encima.
- La landing añade cuatro bandas (`band-1..4`) que dibujan una distribución: el tono se
  profundiza hacia el centro y el centro es el bloque de datos de ChileCompra. Es el mismo
  gesto que P10·P25·P50·P75·P90 en `PriceBandChart`.
- Tipografía: **Archivo** display, **DM Sans** cuerpo, **Varien** sólo para la marca.
  `.cifra` para cifras que se comparan en columna — DM Sans no trae figuras tabulares y
  Archivo sí.
- Tema claro por defecto, con toggle claro/oscuro/sistema en Configuración.

La landing es server component (`app/page.tsx`) y toda su interactividad vive en
`components/landing/LandingClient.tsx`: **no le devuelvas el `'use client'`**, porque Next
ignora `metadata` en componentes cliente y la home perdería título y tarjeta de preview.

### ETL — `etl/`

`main.py` orquesta → `extractors/` → `transformers/` → `loaders/DatabaseLoaderV2`.
`analytics/` tiene 15 módulos Polars; `opportunity_scorer` corre último y agrega el resto.
`analytics/evaluation/` es el harness de evaluación.

### Patrones vigentes
- **Auth**: dos vías por el mismo `Authorization: Bearer`, distinguidas por el prefijo
  `tordo_` sin tocar la base.
  - **JWT de sesión** (30 min) **+ token de refresco con rotación** + Google OAuth. Para el
    navegador.
  - **Clave de API** (`tordo_<prefijo>_<secreto>`). Para clientes sin navegador: MCP, ERP,
    scripts. **Pertenece a la empresa y la fija**: nombrar otra da 403, aunque quien la creó
    pertenezca a las dos. Se guarda el hash; el prefijo queda en claro para poder
    identificarla. Se emite en `POST /api/empresas/{id}/api-keys` con rol de escritura, y
    **el secreto sólo se devuelve ahí**.

  Roles empresa (owner/admin/viewer) + cuotas por plan aplican igual por las dos vías.
  El acceso es un JWT y no se puede revocar; lo que sostiene la sesión es el refresco, que
  vive en `refresh_tokens` y sí se revoca. **Rota en cada uso**, y presentar uno ya canjeado
  revoca la familia entera: sin eso, quien roba un token se queda dentro para siempre.
  Cambiar la contraseña cierra todas las sesiones.
  **Pendiente (F5, sesión de frontend)**: el refresco viaja en el cuerpo y hoy el frontend
  guarda el acceso en `localStorage`. El destino es que el proxy de Next lo guarde en una
  cookie `httpOnly` y el navegador no vea ninguno de los dos.
  **La ruta de Google sigue sin refresco**: redirige con el token en la URL, y meter ahí un
  refresco sería peor. Se arregla junto con el proxy.
- **Alertas**: preferencias → AlertEngine → `INSERT ON CONFLICT` idempotente → multicanal.
- **Planes**: el `id` del plan que devuelve `/api/billing/plans` **es** el `plan_tier` que se
  guarda en la empresa (`basico | pyme | pro | enterprise`); `nombre` es sólo lo que se
  muestra. Los límites — documentos, consultas BI, alertas y **asientos** — viven todos en
  `PLAN_QUOTAS` (`core/plan_limits.py`), que es la única tabla que hay que editar.
- **BI**: batch en Polars → tablas materializadas en `analytics.*` → consulta con filtros
  empujados a SQL → fallback jerárquico L1→L2→L3 con confianza y tamaño de muestra →
  gating por plan (de la empresa). Hay un golden master (`backend/tests/golden/`) que fija
  el contrato: **cualquier cambio a `services/bi/` tiene que pasarlo**, y corre en CI.
  Si cambias los datos del fixture, recaptura con
  `python tests/golden/capturar_golden_bi.py --desde-golden` — **sin `--desde-golden` el
  script redescubre los casos muestreando los datos** y sobre el fixture recortado produce
  otros distintos (la primera vez pasó de 31 casos a 7).
- **Rate limiting**: Redis, por IP en `/api/bi/*`, más cuota diaria por tier.
- **Feature flags**: 7 en `app/config.py`; apagadas devuelven 503 con mensaje accionable.

---

## Deuda conocida — no la refuerces

`docs/ARQUITECTURA_REVISION_2026-08.md` es la referencia. Si necesitas apoyarte en alguno de
estos patrones, es señal de que hay que arreglar la causa, no de copiarlo:

- ~~Analytics servido desde caché de parquet en el proceso de la API~~ — **resuelto en F2**: se sirve desde `analytics.*` en Postgres con índices.
- ~~Verificación de membresía repetida a mano en cada endpoint~~ — **resuelto en F3**: `app/api/deps.py`, con test estructural.
- ~~`Column(JSON)` donde corresponde `JSONB`~~ — **resuelto en F4**: las 26 columnas son JSONB.
  **Toda columna JSON nueva se declara `JSONB`**; `JSON` guarda texto y lo reparsea en cada
  lectura, y no se puede indexar.
- ~~Búsqueda con `ILIKE '%término%'`~~ — **resuelto en F4**: columna generada `busqueda`
  (tsvector español) + GIN, más trigrama sobre `nombre`. **La búsqueda no se escribe a mano**:
  usa `_coincide_termino()` en `api/tenders.py`, que combina las dos vías.
  **Ignora las tildes** en los dos sentidos: el texto se indexa normalizado con
  `inmutable_unaccent` y el término se normaliza igual antes de comparar.
- ~~Suscripción y `plan_tier` colgando de `User`~~ — **resuelto en F3**: pertenecen a la empresa.
- `subprocess.run` desde Celery hacia el ETL (F2).
- ~~`Base.metadata.create_all()` en el loader del ETL~~ — **resuelto en F4**: verifica el
  esquema y falla con instrucciones. **El esquema sólo lo crean las migraciones.**
- ~~`conftest.py` mantiene a mano el DDL de 11 tablas en SQLite~~ — **resuelto**: el esquema
  lo crean las migraciones (`alembic upgrade head`) sobre Postgres real, y cada test corre
  en una transacción que se revierte.
- ~~El golden master de BI no corre en CI~~ — **resuelto**: el fixture de analytics está
  versionado (`backend/tests/golden/fixture_analytics`, 1 MB) y `make ci` lo materializa
  antes de los tests. Los 31 casos corren siempre.
- 56 hallazgos de ruff silenciados en `pyproject.toml` con su conteo y motivo (F3).

## Hacia dónde va

Decisiones tomadas el 2026-08-05, con su ADR en `docs/decisiones/`:
sólo Chile (sin multi-país), suscripción por empresa con planes por capacidades, nombre TORDO,
LLM acotado a un servidor MCP sobre la base histórica, y pasarela de pago local en v1.

**El MCP está en pausa desde 2026-08-07, y especificado** (ADR 0004): es un canal, no una
capacidad, y alcanza sólo a quien ya paga un cliente MCP. Si lo retomas, **lee la
especificación antes de escribir código** — sobre todo la parte de herramientas de grano
grueso: con las cuotas actuales, exponer los 22 endpoints uno a uno agota el plan de un
usuario en una sola conversación.

Fases pendientes: **F2** plano de datos analítico → **F3** tenancy, capas y billing por
empresa → **F4** modelo de datos → **F5** frontend → **F6** diferenciación.

---

## Entorno

`cp .env.example .env`. Críticas: `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`,
`MERCADO_PUBLICO_TICKET`, `API_URL`, `APP_NAME`.

**`API_URL` es de servidor y no lleva prefijo `NEXT_PUBLIC_`.** Cualquier variable que sí lo
lleve se inlinea en el bundle del navegador, y la URL del backend ya no tiene por qué estar
ahí: quien habla con él es el proxy de Next.

Observabilidad: `SENTRY_DSN` (backend, vacío = desactivado), `NEXT_PUBLIC_SENTRY_DSN`
(frontend, se inlinea en el build), `LOG_JSON` (false en local), `LOG_LEVEL`, `ENVIRONMENT`.
`SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` son **sólo de build**: sin ellas el
build funciona igual, pero las trazas del navegador llegan minificadas.

Feature flags: `FEATURE_ANALYTICS`, `FEATURE_TFIDF`, `FEATURE_BILLING`,
`FEATURE_ESTADO_HABIL`, `FEATURE_DOCUMENTOS`, `FEATURE_CHECKLIST`, `FEATURE_WHATSAPP`.
