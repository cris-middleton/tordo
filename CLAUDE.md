# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Este documento describe el estado REAL del código, no el objetivo.** Lo que está
> planificado pero no construido vive en "Hacia dónde va" y en
> `docs/ARQUITECTURA_REVISION_2026-08.md`. Si encuentras una diferencia entre este
> archivo y el código, **el código gana** — y corrige este archivo en el mismo PR.
>
> **`docs/README.md` es el mapa de la documentación**: dice, documento a documento, cuál
> describe el sistema de hoy (🟢) y cuál es la foto de un momento (🟡). Un documento nuevo
> sin clasificar hace fallar `tests/test_docs_indexadas.py` — porque una documentación
> desfasada es peor que ninguna: la de hoy se lee con desconfianza y la vieja se cree.

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

Si una capacidad se vende en `/api/v1/billing/plans`, el endpoint que la implementa tiene que
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
  (`core/plan_limits.py`) y llegan por `GET /api/v1/empresas/{id}/plan`, junto con el consumo
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
    (Next quita la barra, FastAPI la vuelve a pedir), así que `/api/v1/tenders/`,
    `/api/v1/empresas/` y `/api/v1/alerts/` **nunca cargaban**;
  - `sort_by=relevance` **sin artefactos TF-IDF ignoraba el término** y devolvía el
    catálogo entero — el estado normal de un despliegue nuevo;
  - **`params` es una Promesa desde Next 16**, y las dos páginas de detalle la leían como
    objeto: pedían `/codigo/undefined`. Rotas desde la actualización.
  - En un componente cliente el parámetro de ruta se lee con **`useParams()`**.
- **El navegador de los E2E se elige solo** (`E2E_NAVEGADOR=auto`): nativo si puede
  lanzarse, y si no, la imagen oficial de Playwright. En una máquina de trabajo
  `playwright install --with-deps` pide sudo; en CI no, y **bajar la imagen de 2 GB desde
  Actions tardaba cuatro minutos y moría con `connection reset by peer`** — por eso el job
  instala Chromium y fuerza `nativo`. Lo único que cambia entre los dos caminos es de dónde
  sale el binario: misma versión, mismos tests, misma pila.
- **El navegador y el servidor de Next tienen que verse en `http://localhost`.** Las cookies
  de sesión son `Secure`, y ése es el único origen sin TLS que un navegador trata como de
  confianza. Servido desde otro nombre, el login devuelve 200, no guarda nada y el test falla
  sin decir por qué. Por eso, en el camino de contenedor, Next arranca DENTRO del contenedor.
  El backend sí vive siempre en el host, y por eso escucha en `0.0.0.0`.
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
make medir-memoria               # ¿cabe la API en 512 MB? mide la imagen real
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

Monolito modular **por capas**. Los routers hacen HTTP y autorización; **no arman
consultas**: eso vive en `repositories/`, y `tests/test_capas_sin_sql_en_routers.py` lo
comprueba fichero a fichero.

Había 120 consultas repartidas por once routers, y mover cada filtro repetido a un solo sitio
destapó tres cosas que no rompían nada visible: `Alert.user_id` escrito **seis veces**
(la garantía de que nadie lee la alerta de otro), `documento.eliminado` en cuatro
(un documento borrado reaparecía con su enlace de descarga) y `Licitacion.activo` **ausente**
en el endpoint que crea postulaciones (se podía postular a algo ya retirado).

Tres excepciones, cada una con su motivo en el test: `deps.py` (las dependencias de tenancy
SON el acceso a datos), `data_inspection.py` (explorador genérico: construir la consulta es la
feature) y `health.py` (`SELECT 1` no es una consulta de dominio).

**`app/api/__init__.py` está vacío a propósito.** Importar ahí los routers convertía cualquier
`from app.api.deps import ...` en «importa la aplicación entera», y de ahí salía una
importación circular con `core.plan_limits`. Peor: **dependía del orden de importación**, así
que CI estaba en verde mientras un script de operaciones no arrancaba.
`tests/test_modulos_importables.py` importa cada módulo en un proceso limpio para que no
vuelva a pasar.

```
api/            14 routers. HTTP y autorización por dependencia (deps.py).
domain/         Reglas puras, sin IO. Hoy: el puerto de cobro.
infra/          Adaptadores externos. Hoy: billing/ (MercadoPago + Stripe).
repositories/   Acceso a datos. Hoy: analytics (sync y async).
services/       Lógica de negocio como funciones de módulo.
                services/bi/ está partido por dominio (precio, competencia,
                comprador, oportunidad, temporal, mercado, panel), con _base.py
                como único punto de acceso a las tablas de analytics.
core/           security.py (JWT), plan_limits.py (cuotas), limites_api.py
                (límite por clave), versionado.py, email.py
mcp/            servidor MCP: 4 herramientas de grano grueso sobre services/bi/
observability/  logging JSON con request_id (contextvar) + Sentry opt-in
db/             sesión async (asyncpg) y sync (psycopg2)
models/         SQLAlchemy
schemas/        Pydantic — todos van aquí
tasks/          Celery
```

**Routers**: auth, users, tenders, alerts, empresas, documentos, postulaciones, estado_habil,
bi (22 endpoints), dashboard, billing, webhooks, health, data_inspection.
`data_inspection` requiere auth a nivel de router — **no añadas rutas ahí que la salten**.

**Todo cuelga de `/api/v1`, y el prefijo lo pone `main.py`** (ADR 0009). Los routers declaran
su ruta relativa (`/tenders`, `/empresas`…) y **nunca `/api` por su cuenta**: publicar una v2
es montar los mismos routers bajo otro prefijo, no editar catorce ficheros. `/health` queda
fuera de la versión — lo consulta el healthcheck de la plataforma, no un cliente.
La versión vive en `app/core/versionado.py` y, duplicada a propósito, en
`frontend/lib/versionApi.ts`: si se desincronizan, **todas** las llamadas fallan a la vez.

**Las respuestas son planas, sin envelope** (ADR 0009). El éxito ya lo lleva el código HTTP;
un `{success, data}` termina siempre en 200 con `success: false`, que obliga a cada cliente a
mirar dos sitios. Lo fija `tests/test_versionado_api.py`.

**Celery**: 13 jobs. ETL horario, backfill diario, bulk semanal + analytics, estado hábil
cada 6 h, recordatorios de plazo y de vencimiento, precómputo nocturno de matches, watchdog
cada 30 min, trials (vencimiento de reverse-trial y de periodo pagado tras cancelar), informe
semanal, vigilancia de precios. Todo en `America/Santiago`.

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
    identificarla. Se emite en `POST /api/v1/empresas/{id}/api-keys` con rol de escritura, y
    **el secreto sólo se devuelve ahí**.

  Roles empresa (owner/admin/viewer) + cuotas por plan aplican igual por las dos vías.
  El acceso es un JWT y no se puede revocar; lo que sostiene la sesión es el refresco, que
  vive en `refresh_tokens` y sí se revoca. **Rota en cada uso**, y presentar uno ya canjeado
  revoca la familia entera: sin eso, quien roba un token se queda dentro para siempre.
  Cambiar la contraseña cierra todas las sesiones.
  **Resuelto en F5**: el navegador ya no ve ninguno de los dos. El proxy de Next los guarda
  en cookies `httpOnly` y renueva solo — ver las reglas de frontend.
  **La ruta de Google sigue sin refresco**: redirige con el token en la URL, y meter ahí un
  refresco sería peor (historial, logs, `Referer`). La solución es un código de un solo uso.
  - **Verificación de correo**: `users.is_verified` existía desde la primera migración y
    **nada la ponía en `True`** — la columna estaba, la promesa no. El registro emite un
    token (`email_verification_tokens`, 7 días, un solo uso, guardado como SHA-256) y manda
    el correo de bienvenida en segundo plano. Tabla propia y no una columna `proposito` en
    `password_reset_tokens`: son dos ciclos de vida distintos —siete días contra una hora—
    y mezclarlos convierte cada consulta en un filtro que alguien olvidará.
    **No bloquea el acceso.** Una cuenta sin verificar entra igual: cerrarle la puerta a
    alguien porque su proveedor de correo tardó es perder al usuario para cubrir un caso
    raro. Lo que sí acota es a quién se le cobra y a quién se le mandan datos de negocio.
    **Pedir el reenvío responde lo mismo exista o no la cuenta**, por el mismo motivo que
    la recuperación de contraseña: distinguir es regalar un verificador de cuentas.
- **Alertas**: preferencias → AlertEngine → `INSERT ON CONFLICT` idempotente →
  **`services/notificaciones.py`**, que es quien despacha.
  - **El canal lo declara el TIPO de alerta, no quien la crea.** `POLITICA` es la única
    tabla donde se decide, y `tests/test_notificaciones.py` falla si aparece un tipo sin
    política — el mismo trinquete que el calendario de Celery. Hizo falta porque **todas
    las alertas creadas después del camino viejo por preferencias se insertaban con
    `["in_app"]` y nadie llamaba al envío**: el encaje semántico, los plazos de 48 h y
    24 h, el vencimiento de documentos, el estado hábil y el cambio de precio se
    calculaban y no salían de la aplicación.
  - **Lo que caduca sale al momento; el resto va en tanda.** Un correo por licitación
    termina en una regla de filtro de Gmail, y a partir de ahí el usuario deja de
    enterarse de todo, incluido lo urgente. La frontera de la tanda es la **corrida**,
    no la licitación: quien orquesta junta los ids y despacha una vez.
  - **El aviso de encaje lleva el BI dentro** (`correo_render.lineas_de_bi`): banda de
    precio del comprador, competidores habituales, días de pago. Es el mismo canal que
    usa la competencia y una respuesta que sólo puede escribir quien tiene el histórico.
    Una línea sin dato **se omite**: un «sin datos» en un correo enseña a no leerlo.
  - **Sin WhatsApp.** Se retiró: la verificación WABA con Meta tarda 4–8 semanas y nunca
    se inició, cobra por conversación, y el canal no es el diferenciador. Quedan `email`,
    `in_app` y `webhook` — el webhook cuesta cero y sostiene el ángulo ERP junto con la
    API pública. Si vuelve, vuelve como adaptador detrás del despacho.
- **Informe semanal** (lunes 09:00): un correo por empresa con encaje, cierres, cambios de
  precio, cumplimiento y mercado, más el mismo informe en **PDF adjunto**
  (`services/informe_semanal.py` construye, `informe_render.py` pinta).
  - **Sustituyó al radar semanal**, que ahora es una de sus secciones. Dos correos el mismo
    lunes serían dos correos que se ignoran igual.
  - **El encaje se LEE de `match_empresa_licitacion`**, no se recalcula: el radar cargaba
    TF-IDF y puntuaba 200 licitaciones por empresa, y podía dar un número distinto al del panel.
  - **Una sección vacía se pinta igual**, con su frase: omitirla no distingue entre «no hay
    nada» y «no se miró».
  - **Todo el texto que viene de fuera se escapa** (`html.escape`). Los nombres son datos de
    ChileCompra: el correo anterior los metía en crudo y un `&` rompía la maqueta.
  - **`send_email` acepta adjuntos**, y con ellos la estructura es `mixed` por fuera y
    `alternative` por dentro. Al revés, el cliente esconde el PDF o lo muestra en lugar del
    mensaje — y el envío no falla, así que no hay traza.
  - Lo reciben **owners y admins con `users.recibe_informe_semanal`**. Esa columna existe
    porque el pie del correo prometía «Ajustes → Notificaciones» para desactivarlo y esa
    opción no existía.
- **Vigilancia de precios**: `analytics.product_price_bands_l1` **se reemplaza entera** en cada
  materialización, así que por sí sola no permite detectar un cambio — no queda con qué comparar.
  `precio_referencia` guarda el último precio conocido por producto **y unidad** (se actualiza en
  el sitio, no es un histórico) y `suscripcion_precio` dice a qué empresa le importa, **con su
  propio umbral**: por eso el umbral se aplica al avisar y no al detectar. El job corre los lunes
  a las 04:30, después de la reconstrucción de analytics: en paralelo compararía contra una tabla
  a medio reemplazar. Se avisa **a cada miembro** de la empresa, porque `alerts.user_id` es de
  usuario y la suscripción es de la empresa.
- **Tareas Celery**: `beat_schedule` las nombra **por cadena**, así que un módulo sin importar en
  `celery_app.py` produce `Received unregistered task` en el worker y nada más.
  `tests/test_celery_beat.py` comprueba que cada entrada del calendario existe; si añades una
  tarea programada, importa su módulo al final de `celery_app.py`.
- **Exportar es una consulta de BI y descuenta cuota igual.** `/bi/exportar/*` devuelve el
  mismo análisis en CSV; si no cobrara, sería la forma de saltarse el medidor. El archivo va
  **con BOM y separador `;`**: sin BOM Excel en Windows parte las tildes, y con coma Excel en
  configuración regional chilena mete todo en una columna. Un CSV que se abre mal no es un
  entregable, y son dos detalles que un refactor bienintencionado rompe sin que falle nada.
- **Postulaciones: tablero además de lista.** Los seis estados del `CHECK` son las columnas.
  **No son configurables a propósito**: `adjudicada` es lo que cruza contra el ZIP para
  cerrar el ciclo del resultado (`services/resultados.py`), así que renombrarlas rompería
  eso a cambio de nada. Se arrastra con la API nativa de HTML5 —una librería de arrastre son
  ~30 kB y una entrada más en `make audit` para una pantalla— y cada tarjeta lleva además un
  selector, que es el único camino con teclado y en móvil.
- **Lo que el plan no incluye se enseña con candado, no se esconde** (`components/Candado.tsx`).
  Detrás del candado está el BI, que es el argumento de compra: esconderlo hace que el
  producto parezca más pobre de lo que es. El 402 del servidor sigue siendo la protección —
  un candado en el cliente es una cortesía— pero llega **antes** de que el usuario pulse.
- **Planes**: el `id` del plan que devuelve `/api/v1/billing/plans` **es** el `plan_tier` que se
  guarda en la empresa (`basico | pyme | pro | enterprise`); `nombre` es sólo lo que se
  muestra. Los límites — documentos, consultas BI, alertas y **asientos** — viven todos en
  `PLAN_QUOTAS` (`core/plan_limits.py`), que es la única tabla que hay que editar.
- **BI**: batch en Polars → tablas materializadas en `analytics.*` → consulta con filtros
  empujados a SQL → fallback jerárquico **L0→L0N→L1→L2→L3→L4** con dispersión y tamaño de
  muestra → gating por plan (de la empresa). Hay un golden master (`backend/tests/golden/`) que fija
  el contrato: **cualquier cambio a `services/bi/` tiene que pasarlo**, y corre en CI.
  Si cambias los datos del fixture, recaptura con
  `python tests/golden/capturar_golden_bi.py --desde-golden` — **sin `--desde-golden` el
  script redescubre los casos muestreando los datos** y sobre el fixture recortado produce
  otros distintos (la primera vez pasó de 31 casos a 7).
- **El precio se agrupa por PRODUCTO, no por categoría del catálogo.**
  `codigoProductoONU` es una categoría UNSPSC: medido sobre datos reales, una sola
  categoría en un solo hospital y un solo mes contiene artículos que difieren en cinco
  órdenes de magnitud (un calibrador a $557.062 y un criovial a $1 bajo «Reactivos»).
  Los niveles L0/L0N agrupan por la **firma** de `EspecificacionComprador`
  (`etl/analytics/normalizacion.py`) y dan una banda **más de dos veces más estrecha**:
  QCD mediano 0,21–0,26 contra 0,57–0,59. Cubren el 22–29 % de los ítems; del resto
  sigue encargándose L1.
  - **La firma ordena los tokens y quita cualquiera que contenga un dígito.** Lo primero
    porque el orden de las palabras no cambia el producto; lo segundo porque en los datos
    reales los alfanuméricos son códigos de orden y de guía, y cada uno parte el producto
    en un grupo de una observación. Se pierde el gramaje: es el precio a pagar, medido.
  - **La dispersión se mide con QCD, no con CV.** Sobre precios con cola larga la
    desviación estándar mide el outlier que sobrevivió a Tukey, no el mercado.
  - **`predictibilidad` (alta|media|baja) es producto, no diagnóstico interno.** Una banda
    muy dispersa significa que el precio no es lo que decide la adjudicación, y decirlo
    vale más que inventar un número con aspecto de respuesta.
  - **Deflactar por inflación no sirve, y está medido**: el CV dentro de un solo mes es
    0,83–0,88 y mezclando 2016–2026 es 0,88, con +38 % de inflación en la década. No lo
    reabras sin un número nuevo.
- **Encaje empresa × licitación: `match_empresa_licitacion`, precomputado.** Una fila por par,
  con `score` 0-100 y `nivel`. Lo llena el job de las 06:00 (`precompute_dashboard_matches`),
  que es donde vive el modelo TF-IDF; la API **no lo carga para esto**.
  - Los datos de la licitación se leen con **join**, nunca copiados. La versión anterior
    guardaba un blob JSON con nombre, monto y fecha dentro: eran una foto de las 06:00 y el
    ETL horario los dejaba rancios sin que nada avisara.
  - **Se lee por `repositories/matches.py`**, no con SELECT propios en el router.
  - **Ordenar por encaje usa join EXTERNO con `NULLS LAST`.** Con join interno, "ordenar por
    encaje" pasaría a ser "filtrar por encaje" y el catálogo encogería al cambiar el orden.
  - **Contrapartida, dicha claro**: una licitación ingerida hoy no tiene fila hasta las 06:00
    siguientes y sale sin score. El score se guarda entero (0-100) y la API lo devuelve como
    coseno 0-1, así que se pierde precisión por debajo del 1 %.
- **Mecanismo de compra: `tipo_convocatoria`** (`app/models/convocatoria.py`, importado por el
  ETL a través de `etl/shared_imports.py` — **no se copia**). El modelo daba por hecho que todo
  lo ingerido era una licitación; Compra Ágil y Convenio Marco son cerca de la mitad del
  mercado chileno.
  - **Convenio Marco sólo se ve por la orden de compra.** La API de Mercado Público no le da
    endpoint propio: las compras por catálogo llegan como órdenes con `Tipo=9` (§3.1 del
    diccionario de datos oficial). Se guarda el código crudo (`tipo_oc`) **y** su traducción.
  - Los tipos `1` (Automática) y `8` (Sin emisión automática) describen **cómo se emitió** la
    orden, no por qué mecanismo se compró: quedan en `NULL` a propósito.
  - **Compra Ágil NO está en la API clásica.** Tiene su propia API (`api2.mercadopublico.cl`,
    v2, ticket por cabecera) — ver `etl/extractors/compra_agil.py`.
  - Un filtro con un mecanismo desconocido devuelve **422**, no el catálogo entero: ignorarlo
    haría creer que no hay compras de ese tipo.
- **Rate limiting**: tres capas, cada una por un motivo distinto.
  - **Por IP** en `/api/v1/bi/*` — para el navegador, que es donde una IP es
    aproximadamente una persona.
  - **Por CLAVE de API y por minuto** (`core/limites_api.py`, aplicado en
    `autenticar()`), según el plan. Por clave y no por IP porque una integración sale por
    una sola IP de oficina: limitar ahí metería a toda la empresa en el mismo cubo, y quien
    quisiera saltárselo sólo tendría que usar varias IP. Se anuncia con `X-RateLimit-*`
    **también al dejar pasar** — enterarse por el 429 es enterarse tarde.
  - **Cuota diaria por empresa** en BI, que es la capacidad que se vende.

  Las tres fallan abiertas si Redis no responde.
- **Las dependencias de cuota viven en `api/deps.py`, no en `core/`.** Estaban en
  `plan_limits.py` importando `app.api.deps` **dentro de una función**: `core` importando de
  `api`, un ciclo real que sólo se sostenía por estar diferido. `core` se queda con la tabla
  de cuotas y las funciones puras; las `Depends` van donde va el resto.
- **La API pública está declarada, no deducida.** `app/api/documentacion.py` clasifica cada
  grupo de endpoints como `publica` o `interna` y publica la guía dentro del propio OpenAPI
  (la ve quien abre `/docs` o genera un cliente). `tests/test_superficie_publica.py` falla si
  aparece un grupo sin clasificar: sin eso, «la API pública» sería «todo lo que resultó estar
  montado». Ver `docs/API_PUBLICA.md`.
- **Un worker por contenedor, y es una decisión medida.** El modelo TF-IDF cuesta **~105 MB
  por proceso** y no se comparte entre workers. Con `-w 4` en 512 MB el contenedor muere por
  OOM, y cada reinicio recarga el modelo: en la medición se cargó 14 veces para 4 workers.
  La concurrencia se sube con `WEB_CONCURRENCY`, y **exige 1 GB**; con 512 MB el techo son 2.
  Repetible con `make medir-memoria`.
- **Feature flags**: 6 en `app/config.py`; apagadas devuelven 503 con mensaje accionable.

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

**El MCP está construido** (ADR 0004, retomado el 2026-08-08 al cumplirse su propia
condición: la API pública ya está, así que dejó de ser superficie nueva). Vive en `app/mcp/`,
montado en `/mcp` **fuera de `/api/v1`** — MCP versiona su propio protocolo.
- **Cuatro herramientas de grano grueso, no veintidós.** Un modelo encadena unas quince
  llamadas donde una persona hace tres: con `basico` a 3 consultas/día, exponer los endpoints
  uno a uno agotaría el plan en una conversación. **Si se exponen uno a uno, hay que rehacer
  las cuotas primero**, y hay un test que falla si aparece una quinta herramienta.
- **La empresa sale de la CLAVE, no de un argumento.** Ninguna herramienta acepta
  `empresa_id`: un modelo rellenaría ese hueco con lo que le pareciera. Un test lo comprueba.
- **La cuota de BI se aplica con la MISMA función que la API** (`plan_limits.consumir_cuota_bi`).
  Escrita dos veces, una de las dos se queda atrás — y es la que no cobra.
- **`tests/test_mcp.py` habla el protocolo por HTTP**, no llama a las funciones. Es la única
  forma de ver los dos fallos que tiene esto: que montar una app ASGI dentro de otra **no
  ejecuta su ciclo de vida**, y que la protección anti-DNS-rebinding del SDK viene activada
  con una lista blanca que sólo trae `localhost` — desde un dominio real, **todo** responde
  `421`.

**La extracción de bases con LLM está aplazada** (ADR 0010), y no por precio: **la API no
entrega las bases ni los datos que se iban a sacar de ellas** — en su diccionario oficial,
«Adjunt…», «Garantía», «Criterio» y «Ponderaci…» aparecen cero veces. El proyecto real era
«construir y mantener un scraper del portal», con su duda legal; el LLM era la última parte y
la barata. Se reabre si el OCDS de ChileCompra trae su array `documents`. **No hay ninguna
dependencia de un proveedor de LLM en el sistema**, ni clave, ni costo variable.

**Las seis fases del plan están cerradas** (F0 higiene, F1 seguridad, F2 plano de datos
analítico, F3 tenancy/capas/billing por empresa, F4 modelo de datos, F5 frontend, F6
diferenciación). Lo que queda vive en `docs/ARQUITECTURA_REVISION_2026-08.md` como puntos
decididos y aplazados, cada uno con su motivo — no como pendientes sin dueño.

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
`FEATURE_ESTADO_HABIL`, `FEATURE_DOCUMENTOS`, `FEATURE_CHECKLIST`.
