# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Este documento describe el estado REAL del código, no el objetivo.** Lo que está
> planificado pero no construido vive en "Hacia dónde va" y en
> `docs/PIVOTE_PUBLICO_2026-10.md` (`docs/ARQUITECTURA_REVISION_2026-08.md` es la revisión
> del SaaS, histórica desde el pivote). Si encuentras una diferencia entre este
> archivo y el código, **el código gana** — y corrige este archivo en el mismo PR.
>
> **`docs/README.md` es el mapa de la documentación**: dice, documento a documento, cuál
> describe el sistema de hoy (🟢) y cuál es la foto de un momento (🟡). Un documento nuevo
> sin clasificar hace fallar `tests/test_docs_indexadas.py` — porque una documentación
> desfasada es peor que ninguna: la de hoy se lee con desconfianza y la vieja se cree.
>
> **Lo de cada capa vive junto a su código**: `backend/CLAUDE.md`, `etl/CLAUDE.md` y
> `frontend/CLAUDE.md`, que Claude Code carga al trabajar en esa carpeta. Este archivo
> guarda lo que cruza las tres y no puede pasar de 150.000 caracteres: lo nuevo de una sola
> capa va en el suyo.

---

## Qué es

**TORDO** — sitio público con los datos de Mercado Público, para PYMES chilenas que
licitan. **Sin cuentas** desde el pivote de octubre de 2026 (`docs/PIVOTE_PUBLICO_2026-10.md`):
no hay usuarios, empresas, planes, cobro ni sesiones.

**Antes de postular** — catálogo de licitaciones, bandas de precio históricas,
análisis de competidores, scoring de oportunidad y perfilado de compradores. Responde *"¿me conviene postular, y a qué precio?"*

El compliance operativo (estado hábil, documentos, checklist, recordatorios), las alertas, el
informe semanal y el encaje personalizado **se retiraron con las cuentas**: todos dependían de
saber quién era el usuario.

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

- **Flujo:** worktree → `make ci` en verde → PR a `main` → checks de Actions en verde →
  `gh pr merge <n> --squash` → despliegue.
- **`main` está protegida en GitHub** (ruleset «main protegida», desde el 2026-10-15): exige
  PR, los ocho checks de CI —el de DCO sale «saltado» en los PR propios, y cuenta como verde— y
  prohíbe *force push* y borrado, también al dueño (sin excepciones). Para una urgencia se
  desactiva el ruleset, se arregla y se reactiva. Antes de publicar el repo no existía (GitHub la
  reserva a repos públicos o Pro): la guarda era `make merge`, un script local, y aun así el
  PR #14 se mergeó con el build de imágenes en FAILURE. Se retiró con el PR 7 del rediseño.
- **El repositorio es público** (`github.com/cris-middleton/tordo`, AGPL-3.0) desde el
  2026-10-15, con *secret scanning* y *push protection*: un push con una credencial
  reconocible se rechaza en el servidor. No sustituye al hook de `.env` ni a la regla de rotar.
- **Su historia se reescribió antes de publicarlo** (sin `backend/.env`, sin el correo laboral,
  sin las versiones del fixture del golden anteriores al enmascarado). Los PR #1–#175 y los
  hashes anteriores viven en `cris-middleton/tordo-saas-privado`, **privado para siempre** (se
  archiva al cerrar el PR 7): su historia y sus refs de PR conservan credenciales. **Nunca
  empujes nada de ese repo a este.** En los mensajes de commit esos PR aparecen como `saas#N`,
  y los «#N» de los documentos escritos antes del 2026-10-15 son también de ese repo.
- Los worktrees **no heredan archivos gitignoreados**: cada uno necesita su propio
  `.env` y su propio `node_modules` (el target copia el primero e instala el segundo).
  Los hooks de pre-commit, en cambio, se comparten con el checkout principal.

#### GitHub Actions sí corre. `make ci` es el ensayo previo

Este archivo decía que Actions no estaba habilitado y que `.github/workflows/ci.yml` no
corría. **Ya no es cierto**: `actions/permissions` devuelve `enabled=true` y el workflow
ejecuta sus ocho jobs —lint, migraciones, tests de backend, tests de ETL, frontend, extremo
a extremo, build de imágenes y DCO (sólo en PR desde un fork, `scripts/dco.sh`)— en cada `pull_request` contra `main`. Verificado sobre once PRs seguidos.

Dos cosas que sí conviene saber:

- **Un PR abierto durante una caída de Actions se queda sin checks para siempre — y, con `main`
  protegida, sin poder mergearse.** GitHub no
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
> personal de un solo desarrollador desplegando en Railway; el flujo de dos ramas tiene
> sentido donde cada rama auto-despliega a su propio entorno.
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
- **Cambiar de librería en algo que tenga un formato persistido exige test de
  interoperabilidad.** Salió de la autenticación (hoy retirada): un JWT y un hash de
  contraseña son *formatos*, no librerías, y lo que puede salir mal no es que falle, es que
  funcione con lo nuevo y rechace lo ya emitido. Los valores de referencia los genera **la
  librería anterior**.

### Migraciones
- **Siempre `make migrate-create MSG="descripción"`. Nunca `alembic revision` directo.**
  Es la única forma de obtener IDs y cadenas de `down_revision` correctas. Este repo ya
  se rompió una vez por esto (ver `011_fix_alerttype_enum_uppercase`).
  Los targets `migrate*` corren alembic **en el host**, no dentro del contenedor: dentro
  fallaban desde cualquier worktree, así que esta regla y la de trabajar en worktrees se
  contradecían. Sólo hace falta `DATABASE_URL`; no hace falta levantar el stack.
- CI valida que haya exactamente una cabeza y que `upgrade head` + `downgrade base` corran
  limpios contra una base vacía. Una migración que no revierte no pasa.
  **Y ahora también un hook local** (`scripts/una-sola-cabeza.sh`), porque el control de CI
  vive sobre `main` y la colisión sólo existe al mezclar: cada PR ve una sola cabeza en su
  propia rama. El 2026-08-17 `main` quedó con dos cabezas —dos worktrees partiendo del mismo
  commit— y no se supo hasta que `make e2e` murió en las migraciones, porque Actions estaba
  caído por facturación justo entre los dos merges. El hook avisa **antes de commitear** si
  tu `down_revision` apunta a un padre que en `origin/main` ya tiene otro hijo.
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

### Sin cuentas — no hay multi-tenancy
Desde el pivote público no hay usuarios, empresas, roles, sesiones ni claves de API, y por
tanto no hay datos de una empresa que aislar de otra. Todo lo que expone la API es público y
anónimo. **No reintroduzcas un endpoint que dependa de quién llama** sin rehacer antes esa
decisión (spec del pivote): con cuentas vuelve todo lo que se borró — dependencias de tenancy,
test estructural de `empresa_id`, cuotas.

**El recorrido de rutas vive en `backend/tests/rutas.py`, en un solo sitio.** No uses
`app.routes` directamente: desde FastAPI 0.115 los routers incluidos **no se aplanan** ahí,
y `app.routes` devuelve envoltorios `_IncludedRouter`. Al actualizar desde 0.104 los tests
estructurales pasaron a encontrar **cero rutas** — y lo dijeron sólo porque llevan guardas
explícitas ("se esperaban ≥10, hay 0"). **Un test estructural sin esa guarda se queda mudo
comprobando el vacío.** Por eso, cuando el pivote retiró las cuentas, las guardas **bajaron
con su motivo escrito junto al número**, no se borraron.

### Contrato de BI
`backend/tests/test_contrato_bi.py` declara, ruta por ruta, qué protección le toca a cada uno
de los 18 endpoints de BI. **Un endpoint nuevo hace fallar el test hasta que alguien decida
explícitamente su nivel.**

Queda un solo nivel, `publica`: ni sesión, ni empresa, ni cuota; la protege sólo el límite por
IP de `/api/v1/bi/*`. Que lo público no pida sesión se prueba también por HTTP, sin cabecera
`Authorization`: lo declarado no basta.

### Convenciones de código
- **Imports a nivel de módulo.** Nada de imports dentro de funciones. El código heredado
  los usa para diferir dependencias pesadas — es un síntoma del problema de servicio de
  analytics (F2), no un patrón a copiar. **No añadas imports diferidos nuevos.**
  Ya causó un bug real: `subscription_status_from_stripe` importado dentro de una función y
  usado en otra rompía todos los webhooks `customer.subscription.updated` (hoy retirados).
- **Todos los schemas Pydantic en `app/schemas/`.** Nunca inline en endpoints o servicios.
- **Toda tabla y columna nueva lleva `comment=`.** Es un producto de datos con decenas de
  columnas por tabla; sin comentarios se vuelve inusable en meses.
- **Clave primaria: `UUID` para entidades de negocio, `BigInteger` para las de ingesta.**
  Las de ingesta crecen sin techo y `integer` se queda corto; las de negocio se exponen en
  URLs y no conviene que sean adivinables.
- **Las dos reglas anteriores las verifica `tests/test_convenciones_modelo.py`**, con
  trinquete. **La deuda está en cero** (migración `e8e7e0f3f5e5`: las 43 columnas que
  quedaban, comentadas, y `licitaciones` y `licitaciones_detalle` con clave y secuencia
  `bigint`), así que `tests/convenciones_baseline.json` está vacío y sólo puede seguir así.
  Una columna sin `comment=` o una PK `integer` nueva hacen fallar el test.
- Los errores de negocio se devuelven con `HTTPException` y mensaje en español — los ve el usuario.

### La voz de los textos

Todo texto que se escriba o se toque sigue **`docs/VOZ.md`** (desde el 2026-10-21; antes era la
§6.1 de `docs/IDENTIDAD_Y_PORTADA_2026-10.md`): la voz de PixelFrame más la del newsletter de
Fintual, *precisa como una tabla, hablada como una persona*. Ahí están las seis reglas, las
muletillas de folleto que se borran, **el vocabulario fijo** (comprador, unidad de compra, «la
mitad de las compras», mediana, «8 de cada 10 compras»…) y ejemplos de antes y después. Lo más
corto de recordar:

- **Primero la respuesta.** Un título dice lo que la página contesta. Una pregunta como título sólo
  si es la del lector; «¿Qué le vendes al Estado?» se fue por ambigua (¿me pregunta?, ¿me vende?).
- **Chileno, en segunda persona y concreto.** Cifras, plazos y objetos con nombre antes que
  adjetivos. La jerga, traducida en la misma frase la primera vez.
- **Carácter con medida**: una frase con gracia por pantalla como mucho, en lo secundario (vacíos,
  errores, 404, notas), nunca sobre una cifra.
- **Frases cortas y afirmativas.** Sin signos de exclamación y sin emojis.
- **Suena a quien confía en lo que hace, no a una tienda que necesita vender.**
- **Los cuatro vicios**, que se revisan antes de dar un texto por bueno:
  1. *La antítesis*: definir algo diciendo primero lo que no es («no es X, es Y»).
  2. *El par vacío*: dos o tres negaciones seguidas para decir una cosa («sin cuentas, sin planes
     y sin publicidad»).
  3. *El cierre que resume*: una última frase que repite lo que el párrafo ya dijo.
  4. *La frase que hay que releer*: dice en una cláusula lo que cabe en cuatro palabras.
- **No repetir la ficha de al lado**: un texto no dice lo que ya está escrito a doscientos píxeles.
- **No describir lo que el sitio no hace**: no se promete un aviso, una alerta o un dato que no
  existe.

Es regla y no gusto: una frase difícil de leer se juzga **menos verdadera**, no sólo menos
agradable (fluidez de procesamiento, Reber y Schwarz, 1999).

`__tests__/voz-textos.test.ts` fija lo mecánico. Prohíbe exactamente estas frases: «gratis y sin
cuenta» (y «cuentas»), «sin registrarte», «sin cuenta.», «sin clave y sin cuenta» y «sin cuentas,
sin planes». Las busca en **todo el texto** de cada fichero de `app/` (no sólo en títulos y
descripciones), en `lib/publico.ts`, `lib/compraAgil.ts`, `lib/portada.ts`,
`lib/lecturasPortada.ts`, `lib/metodo.ts`, `lib/graficoPrecio.ts`, las piezas de
`components/portada/`, `components/metodo/` y `components/precio/` y el título y la descripción de las
guías (`content/explicativos/*.mdx`), y las notas de datos enteras (`content/notas/*.mdx`), que
además no llevan «!» ni «¡» fuera del código. Y los textos de esos cuatro `lib/` de la portada y el
texto de esas piezas no llevan «!» ni «¡».
Lo demás se revisa leyendo. **Se quedan a propósito**: «{APP_NAME} es gratis. Mantenerlo, casi.»
(habla de cómo se financia, que es un hecho) y lo descriptivo que responde una duda donde se tiene
(«sin cuenta» en `/guardados`, «sin registrarte» en una respuesta de `lib/acerca.ts`).

### Secretos
Nunca al repo. Un hook de pre-commit bloquea cualquier `.env`. Si una credencial llega a un
commit, **rótala**: quitarla después no la invalida.

**Y ningún valor por defecto para una credencial.** `infra/docker-compose.yml` traía un
ticket de demostración de Mercado Público como respaldo de `MERCADO_PUBLICO_TICKET`, así que
un despliegue que olvidara la variable **no fallaba**: salía a la API con la credencial
compartida de pruebas y traía datos limitados, pareciendo que funcionaba. Ahora usa
`${VAR:?mensaje}` y el extractor falla al construirse, no en la primera petición — donde el
error de la API es indistinguible de una caída del servicio.

### Skills de plugins de usuario

Los plugins instalados a nivel de usuario también ponen sus skills aquí, y algunos apuntan a
sistemas de terceros (tenants de autenticación, Notion, Sentry, proyectos de nube) que
modificarían infraestructura ajena. **TORDO es un proyecto personal y no comparte nada con
ningún otro sistema.** Aquí sólo se usan las skills genéricas —estresar un plan con `grill-me`
(obligatorio en proyectos medianos o grandes), `handoff`, el pipeline `feature` y `demo-video`—
y **ninguna que toque infraestructura externa**. La lista concreta, por máquina, vive en
`CLAUDE.local.md` (gitignoreado; Claude Code lo lee solo).

TORDO usa su propio Sentry (`SENTRY_DSN`), dos cron de Railway (`etl/cron.py`) en vez de un
programador en la nube, y no tiene Pub/Sub, Cloud Tasks ni cola de tareas.

### Frontend

Las reglas del frontend —proxy sin sesión, Sentry, tokens de color y contraste, gráficos,
TanStack Query, E2E, axe y capturas— viven en **`frontend/CLAUDE.md`**, que Claude Code carga al
trabajar en `frontend/`.

## Comandos

`make help` los lista todos.

```bash
make setup                       # deps + hooks (clone o worktree nuevo)
make hooks                       # sólo hooks
make lint / make lint-fix        # ruff check + format (idéntico a CI)
make audit                       # vulnerabilidades y antigüedad de dependencias
make diseno [URL="http://localhost:3000/ …"]  # señales de plantilla (Impeccable, sin telemetría; fuera de CI)
make test                        # backend + ETL + frontend
make e2e                         # extremo a extremo (pila completa + Playwright)
make medir-memoria               # ¿cabe la API en 512 MB? mide la imagen real
make dev-up-d / dev-logs / dev-down
make migrate / make migrate-create MSG="..." / make migrate-status
make db-shell
make front-dev
```

ETL — **desde la raíz**, como módulo (`cd etl && python main.py` falla con
`No module named 'etl'`):
```bash
uv run python -m etl.cron frecuente [--forzar] # cron de Railway, cada hora UTC (se autolimita)
ETL_ALMACEN=disco uv run python -m etl.cron semanal  # cron de Railway: R2 → descarga masiva → analytics → materializa → R2
uv run python -m etl.main --horario            # una pasada «horaria» a mano
uv run python -m etl.main --fecha-desde 2026-09-01 --fecha-hasta 2026-09-01
uv run python -m etl.analytics.run_all [--modulo seasonality]
cd etl && uv run --project .. python -m analytics.evaluation --model tfidf_matcher --walk-forward
```

**`etl.cron` es el único programador.** El detalle de los dos cron —horario, ventanas,
fallos que tumban la corrida, revalidación, R2, retención y RAM medida— vive en
**`etl/CLAUDE.md`**, que Claude Code carga al trabajar en `etl/`.

**Cualquier cambio a un modelo de scoring pasa por el harness de evaluación**
(`etl/analytics/evaluation/`: splits, walk-forward, métricas, variantes). No se toca un
scorer sin correrlo. **Su modelo de referencia es `tfidf_matcher`, que NO corre cada
semana**: la API dejó de cargarlo en el paso 8, así que el cron semanal ya no lo entrena;
se entrena a mano (`run_all --modulo tfidf`) o lo entrena el propio harness.

---

## Arquitectura (estado real)

### Backend — `backend/app/`

Monolito modular **por capas**. Los routers hacen HTTP; **no arman consultas**: eso vive en `repositories/`, y `tests/test_capas_sin_sql_en_routers.py` lo
comprueba fichero a fichero.

Había 120 consultas repartidas por once routers, y mover cada filtro repetido a un solo sitio
destapó cosas que no rompían nada visible — entre ellas `Licitacion.activo` **ausente** en un
endpoint (se podía actuar sobre algo ya retirado). Desde el pivote quedan dos routers de
dominio, y la regla sigue.

Una excepción, con su motivo en el test: `health.py` (`SELECT 1` no es una consulta de dominio).

**Los `__init__.py` de `api/`, `core/` y `services/` están vacíos a
propósito, y los de `models/` y `schemas/` sólo re-exportan lo que existe.** Importar ahí los
routers convertía cualquier `from app.api.x import ...` en «importa la aplicación entera», y
de ahí salió una importación circular. Peor: **dependía del orden de importación**, así que CI
estaba en verde mientras un script de operaciones no arrancaba. Y un `__init__` que importa
un módulo borrado rompe todo lo que cuelga del paquete — el BI, el MCP y el ETL.
`tests/test_modulos_importables.py` importa cada módulo en un proceso limpio para que no
vuelva a pasar.

```
api/            routers: tenders, bi, compra_agil, publico, health; documentacion.py
                (superficie pública), limites.py (cotas de parámetros), dependencias.py
repositories/   Acceso a datos: licitaciones (catálogo), compra_agil, analytics (sync; del async
                queda sólo `existe_tabla`) y busqueda (la regla de búsqueda por texto).
services/       Lógica de negocio como funciones de módulo: bi/, publico/ (páginas
                indexables), exportar.
                services/bi/ está partido por dominio (precio, competencia,
                comprador, oportunidad, temporal, mercado, panel, rubro), con
                _base.py como único punto de acceso a las tablas de analytics.
core/           tiempo.py (el reloj de Chile), versionado.py, limite_ip.py (límite por IP)
mcp/            servidor MCP anónimo: 4 herramientas de grano grueso sobre services/bi/
observability/  logging JSON con request_id (contextvar) + Sentry opt-in
db/             sesión async (asyncpg) y motor sync (psycopg2, para analytics_sync)
models/         SQLAlchemy
schemas/        Pydantic — todos van aquí
utils/          slug.py (la única función de slugs)
```

**Routers**: tenders (3 rutas), bi (18), compra_agil (1), publico (7), health. Todos anónimos. Los de cuenta (auth, users,
empresas, alerts, documentos, postulaciones, estado_habil, dashboard, billing, webhooks) y el
explorador `data_inspection` se borraron en el pivote público.

**Todo cuelga de `/api/v1`, y el prefijo lo pone `main.py`** (ADR 0009). Los routers declaran
su ruta relativa (`/tenders`, `/bi`) y **nunca `/api` por su cuenta**: publicar una v2
es montar los mismos routers bajo otro prefijo, no editar cada fichero. `/health` queda
fuera de la versión — lo consulta el healthcheck de la plataforma, no un cliente.
La versión vive en `app/core/versionado.py` y, duplicada a propósito, en
`frontend/lib/versionApi.ts`: si se desincronizan, **todas** las llamadas fallan a la vez.

**Las respuestas son planas, sin envelope** (ADR 0009). El éxito ya lo lleva el código HTTP;
un `{success, data}` termina siempre en 200 con `success: false`, que obliga a cada cliente a
mirar dos sitios. Lo fija `tests/test_versionado_api.py`.

**No hay Celery ni Redis.** Lo programado son los dos cron de `etl/cron.py` (ver
`etl/CLAUDE.md`), en servicios de Railway aparte de la API.

### Datos

- **PostgreSQL** — sólo lo que se sirve hoy (spec §5.2): `licitaciones` y
  `licitaciones_detalle`, con retención (el cron `semanal`, en `etl/CLAUDE.md`), más el esquema `analytics`.
  Las 21 de cuenta y `categories` las borró `3d73beca994e_retirar_cuentas`;
  `task_failures`, `08c6653fd4dc_retirar_task_failures`; y **`e3afe71ab019_adelgazar_postgres_paso_7`**
  las tres de órdenes de compra, el historial de cambios, compradores, proveedores y los cuatro
  catálogos `ref_*` — nada los leía —, más el payload crudo del detalle (`datos_completos`,
  `participantes`): el hash basta para saber si un detalle cambió. La historia de órdenes vive
  entera en los parquets de R2. **Medido en producción el 2026-10-13: 1,4 GB** más 1 GB de WAL
  (`competitors_by_market` 497 MB, `time_series` 301 MB), por encima del objetivo de 1 GB
  de la spec pero estable con la ventana fija; detalle y cómo medir en
  `docs/DESPLIEGUE.md`, paso 13.1.
- **Parquet + Polars** — sólo cómputo batch. La API **no lee parquets**: el pipeline
  materializa los resultados en el esquema `analytics` de Postgres con índices
  (`etl/analytics/materialize.py`), y `bi_service` los consulta con SQL. Ver
  `docs/decisiones/0006-analytics-en-postgres.md`.
- Migraciones en `backend/alembic/versions/`.

### Frontend — `frontend/`

Next.js 16 App Router + TypeScript + Tailwind, sin sesión: todo el tráfico pasa por
`/api/proxy`. **La cáscara, las pantallas, el sistema de diseño, la portada y las páginas de
contenido están en `frontend/CLAUDE.md`.** Aquí quedan las dos piezas que cruzan backend, ETL y
frontend.

**«Lo mejor de hoy» (paso 9)** — `GET /compra-agil/destacadas`, `repositories/compra_agil.py`.
Ranking público de Compras Ágiles abiertas que cierran en más de 2 h: producto de **tres**
factores en [0, 1] —comprador, tiempo y monto—, y **un factor sin dato vale el neutro de su
escala**. Es una heurística sin verdad contra la que evaluarla: ordena, no predice.
- **`comprador` = percentil de órdenes de la UNIDAD** (`analytics.compra_agil_unidad.percentil_ordenes`,
  por RUT de la unidad, 6 meses): mide cuánto compra, **no si adjudica lo que
  publica**. **Dos «sin dato» que no son lo mismo**: con la tabla poblada, una unidad ausente no
  compró nada en la ventana y vale **0**; con la tabla ausente o vacía (entre el despliegue y la
  primera semanal) no se sabe nada, vale **0,5** y la respuesta trae `historia_disponible: false`
  para que el frontend no diga nada del comprador. El RUT se normaliza con **una sola función**
  (`app/utils/rut.py`; el ETL la importa por `shared_imports`), ceros a la izquierda incluidos. `órdenes/publicadas` ya no entra (saturaba en 1 y `publicadas` sólo se acumula desde
  el despliegue); `comprador.publicadas` de la API es siempre `null`. La Compra Ágil sólo trae el
  RUT, y la historia se une por RUT (sin ceros a la izquierda), no por código: por código cada
  unidad heredaba la de su organismo (la FACh son 14 RUT bajo un código). `compra_agil_comprador`
  (por organismo) y `comprador_rut` sólo sirven ya a la ficha pública y al filtro `codigo_organismo`.
- **`tiempo` = `min(1, horas/72)`** (a 24 h saturaba más de la mitad y empataban) y **`monto` =
  `0,5 + 0,5·m/(m+708.050)`, sin monto 0,75**. El monto **pesa**, no sólo desempata (~1,7× en
  los extremos de la instantánea del 2026-10-14, $80.000 a $7.000.000), y está porque el criterio
  de orden (mayor empate ≤ 5, ≥ 30 puntajes distintos entre las 50 primeras;
  `tests/test_orden_destacadas_instantanea.py`, reloj fijo `ahora`) sólo pasa con él: 6/37 sin
  monto, 2/49 con él (y 2/49 sin historia por unidad, como en producción hoy). Es una decisión
  de producto que se revisa, no una verdad medida.
- **El tope de Compra Ágil vale lo mismo que sin monto (0,75)** y la respuesta lo marca con
  `monto_es_tope`. Muchos compradores declaran el tope (100 UTM) en vez de lo que piensan gastar,
  y el factor premiaba eso: el 2026-10-16 las cinco primeras valían $7,2 millones. **El tope se
  lee del dato, no se escribe**, porque la UTM cambia cada mes: `tope_compra_agil` es el mayor
  `monto_estimado` que declaran **al menos 3** Compras Ágiles guardadas (`REPETICIONES_TOPE`; todas,
  abiertas o no), desde un piso `TOPE_MINIMO` ($6.000.000; 100 UTM ya eran $6.669.200 en
  noviembre de 2024). **No el máximo a secas**: un 72.151.000 mal tipeado aparece una vez, el tope
  cientos, y con el máximo ese único error apagaba la detección en toda la lista sin que nada
  fallara. Sin ningún monto que cumpla, no hay tope (una base casi vacía). Es tope lo que queda a
  menos de `TOLERANCIA_TOPE` (2 %) **por arriba o por abajo**: cubre el tope del mes anterior, el
  nuevo a principio de mes (aún no se repite: hace de referencia el viejo) y «7.200.000», y deja
  fuera 7.000.000 (a un 3 %) y el error. La instantánea del golden siembra el tope tres veces
  (`_historia_del_tope`): como top 50, lo trae una sola. El sitio lo dice junto al monto («Hasta $7,2
  millones» y «El máximo que permite Compra Ágil» debajo; `NOTA_TOPE` en `lib/compraAgil.ts`), sin repetir
  la cifra.
- **La competencia `1/(1+cotizaciones)` viaja en `factores` pero NO está en el puntaje**
  (`EN_EL_PUNTAJE`), y el sitio **no muestra el conteo** (`MOSTRAR_COTIZACIONES = false` en
  `lib/compraAgil.ts`). **Compuerta G1 cerrada (2026-10-15, medida en producción en sólo
  lectura): el conteo NO se refresca.** De 1.785 Compras Ágiles abiertas, ninguna subió su
  conteo en ~3 h que cruzaron la corrida de las 13:00: el cron frecuente sólo lista lo publicado
  en su ventana, así que una abierta conserva el conteo de su primera lectura (el 82,9 % de las
  abiertas dice 0; las cerradas, mediana 5). Por eso `MOSTRAR_COTIZACIONES` sigue en `false`.
  Mostrarlo exige antes un refresco de las abiertas en el ETL (no existe y gasta cuota).
  `ofertas_al` = cuándo se escribió por última vez la fila, la mejor cota de cuándo se vio el
  conteo, no una lectura garantizada. **Si ese refresco llega a existir**:
  `MOSTRAR_COTIZACIONES = true` enciende la tarjeta y el RSS, pero **no basta**: la guía «Lo
  mejor de hoy» dice «por ahora no mostramos ese número»
  (`frontend/content/explicativos/lo-mejor-de-hoy-en-compra-agil.mdx`, y `docs/API_PUBLICA.md`
  lo repite) y varios tests afirman que no aparece «cotiz» (`compra-agil-destacadas.test.tsx`,
  `rss.test.ts`, `acerca.test.tsx` en las preguntas frecuentes y, mientras
  `MOSTRAR_COTIZACIONES` sea `false`, `portada-hoy.test.tsx`; el comentario de `portada.test.tsx`
  lo remite a este último); hay que reescribir todo en el mismo cambio. **Volver a pesar la
  competencia es otra decisión**: se añade a `EN_EL_PUNTAJE`, se pasa el criterio de orden y se
  cambian `DESCRIPCION_DESTACADAS` y la guía. La descripción del sitio no puede prometer «pocas
  cotizaciones» mientras no entre.
- **La pantalla dice a qué hora se actualizó** y avisa sólo si **se saltó una corrida
  programada** (`ultimaCorridaEsperada` en `lib/compraAgil.ts`, copia del horario de
  `etl/cron.py`): un umbral fijo de horas saltaba cada fin de semana, y un aviso que salta en
  lo normal enseña a ignorarlo. Si cambias el horario del cron, cambia los dos.
- **Las fechas de Compra Ágil son hora de Chile aunque digan `Z`** (spec §6.1): el
  transformador las lee así. Leídas como UTC, cada cierre quedaba 3–4 h antes.
  **Las de la API clásica de licitaciones también**, y sin zona: se guardaban ingenuas y Postgres
  (sesión UTC) las corría igual. Las dos APIs leen con `en_hora_de_chile` (`app/core/tiempo.py`);
  las filas guardadas antes del 2026-10-16 no se migran: quedan corridas hasta que la retención las
  borra, 90 días después de su cierre.

**Páginas públicas indexables (paso 10)** — `/compradores/[codigo]`, `/rubros/[slug]`,
`/productos/[slug]` y la búsqueda `/productos`, en el grupo `app/(publico)/`, que sólo pone el
contenedor único (cabecera y pie, con la atribución, son de la cáscara única). Datos de `GET /publico/*` (`api/publico.py`, `services/publico/`).
- **La búsqueda de productos vive en la URL** (`/productos?q=`, `rutaBusquedaProductos` en
  `lib/publico.ts`): el buscador la lee con `useSearchParams` en un inicializador perezoso,
  dentro de `Suspense`, y la escribe con `replaceState` (con ≥ 3 letras, tras el retardo).
  **La página no lee `searchParams`**: la volvería dinámica. Quien enlace a una búsqueda usa
  `rutaBusquedaProductos`, no arma la URL.
- **ISR, nada en el deploy**: `generateStaticParams` devuelve `[]` y cada página se genera al
  primer pedido con `fetch(…, { next: { revalidate: 604800, tags: ['analytics'] } })` desde
  `lib/publicoServidor.ts`, **como renderizado del servidor** (`cabecerasHaciaElBackend(null)`,
  exento del límite por IP). Un error que no sea 404 lanza: una página rota no se cachea.
  **Por eso el parámetro se valida antes de pedir** (`lib/parametrosPublicos.ts`): un slug
  con otra forma que la de `app/utils/slug.py` (o de más de 80 caracteres) o un código de
  comprador que no sea un número es `notFound()` sin llamar al backend. Sin eso, cada URL
  inventada era una llamada que el límite no contaba.
  La excepción es `GET /publico/portada`, que no lee analytics: la pide la portada con
  `pedirResumenPortada()` (media hora, etiqueta `compra-agil`, nunca lanza).
- **`GET /publico/mercado`** (`services/publico/mercado.py`): el gasto mensual por sector
  (`time_series`), la concentración de los mercados (`market_concentration`: cuántos con el
  líder en el 50 % o más, con un solo proveedor, y la cuota del líder en diez tramos con su
  monto) y la **red** (`competitors_by_market`), para la portada. **Se agrega en SQL**
  (`analytics_sync.gasto_mensual_por_sector`, `concentracion_de_mercados` y
  `red_de_compradores`), nunca en Polars: `time_series` pesa 301 MB y `competitors_by_market`
  497 MB en producción. Sin su tabla, cada bloque sale `null`; con `FEATURE_ANALYTICS` apagada,
  503 como las fichas. Se guarda 10 min en memoria del proceso, sólo si vienen los tres bloques.
  `tests/test_publico_mercado.py`, sobre Postgres.
  - **La red**: los `N_COMPRADORES` (30) compradores de más monto, con su sector de
    `time_series` (sin sector, «Otros»), y como proveedores la unión de los `POR_COMPRADOR` (4)
    primeros de cada uno, los `AMPLIOS` (12) que venden a más de ellos y, además, **todos los que le
    venden a la mitad o más, hasta `TOPE_AMPLIOS` (48)** (empate: monto, código): con 12 fijos la
    portada decía «40 le venden a la mitad o más» y dibujaba 12;
    los enlaces son cada par de esos con monto, sumado sobre los rubros. **Las personas
    naturales (`PN-…`) no son nodos ni enlaces**, pero cuentan en `monto_total` y
    `proveedores_total`. Una sola consulta que devuelve el JSON armado: un recorrido entero
    agrupado por comprador y lo demás por el índice de comprador, sólo para los 30. Medido en
    local (404.000 filas, 91 MB): **160 ms** en `EXPLAIN ANALYZE`, ~55 KB de respuesta (30
    compradores, 114 proveedores, 548 enlaces).
- **Revalidación desde los cron**: `POST /api/revalidar` con `X-Revalidar-Secreto`
  (`REVALIDAR_SECRETO`, servidor, sin valor por defecto: sin él responde 503) y
  `{"etiquetas": ["analytics" | "compra-agil"]}` → `revalidateTag(tag, 'max')`. Lo llama
  `Revalidador` en `etl/cron.py`. CI construye con un centinela y `check:secreto` lo busca.
- **Qué se indexa vive en un solo sitio**, `services/publico/indexables.py`, con sus umbrales
  y conteos medidos (≈1.039 compradores, 309 rubros y **7.758 productos** en la copia local: con
  el precio unitario corregido eran 15.452, y la regla de precio de mercado deja la mitad; en
  producción, el sitemap lista 13.381 productos el 2026-10-22). El resto existe con
  `noindex` (producto, comprador o rubro) o 404.
- **Un precio «del Estado» necesita varios compradores** (decisión del 2026-10-16). Una banda
  nacional es **precio de mercado** (`de_mercado`) si tiene **≥ 3 organismos compradores y
  ninguno con más del 50 % de las compras**; un producto se indexa sólo si una misma banda
  cumple eso, `n ≥ 10` y predictibilidad alta o media. Medido en local: el 37 % de las bandas
  que pasaban lo demás era de un solo organismo y el 49 % tenía uno sobre la mitad (la
  portada llegó a publicar 88 compras de 90 de la I. M. de Concepción como «lo que paga el
  Estado»). El ETL cuenta (`compradores`, `cuota_mayor` en L0N, sobre las filas ya sin
  atípicos); **la regla vive sólo en `indexables.de_mercado()`** y viaja como `de_mercado` en
  cada banda de `/publico/productos/{slug}`: la portada y `verificar-produccion.sh` leen ese
  booleano, no recalculan. Una tabla sin las columnas (materializada antes) no indexa ningún
  producto.
- **«Quién lo compra» y los puntos del gráfico salen de `analytics.product_price_compradores`**
  (`_compradores_de_la_banda` en `etl/analytics/product_price_bands.py`): la mediana y las compras
  de cada organismo detrás de cada banda L0N, **sin mínimo de compras**, sobre las mismas filas ya
  sin atípicos: las filas de una (firma, unidad) son su `compradores` y la suma de `n`, su `n`. Antes
  salían de L0, que pide `MIN_N_L0` = 3 compras por organismo: «impresora multifuncional» decía «87
  compras de 63 compradores» y dibujaba un punto. **`MIN_N_L0` no se toca**: L0 es del fallback del
  BI. Sólo las (firma, unidad) con banda L0N (233.318 filas con los seis meses locales; sin ese
  filtro, 1,4 millones) y `puesto` ya ordenado (más compras, luego código y unidad), así que la API
  pide los 10 primeros por índice. **Sin la tabla** (hasta la primera semanal que la genera) la API
  cae a L0, como antes.
  - **El gráfico dibuja a todos con `medianas_compradores`**, en cada banda de `unidades` de
    `/publico/productos/{slug}`: `[{n, p50}]` de cada organismo de esa banda, por `puesto`, como mucho
    `TOPE_MEDIANAS_POR_BANDA` (200; una firma local llega a 505). Sin tope son tantas como
    `compradores` y suman su `n`. **`null` sin la tabla, nunca `[]`**: no se sabe, que no es
    «ningún comprador». `compradores` (los 10 de «Quién lo compra») no cambia.
  - **Mientras no esté la tabla, «Quién lo compra» dice su corte** (`descripcionCompradores`,
    `listaDeL0`): la lista de L0 sólo trae a quien compró `MINIMO_COMPRAS_L0` (3) veces o más, y
    «87 compras de 63 compradores» sobre una lista de uno se leía como un error. Dice «Los que lo
    compraron 3 veces o más…» y cuántos quedan fuera («Es uno de 63: los demás lo compraron una o
    dos veces.»); en `/buscar`, «Los que compraron «X» 3 veces o más.».
- **Todo precio dice cuántos compradores tiene detrás y de cuándo** (`comprasDeOrganismos`,
  `frasePrecio`, `notaCompradores` en `lib/publico.ts`): «46 compras de 40 compradores» y el periodo
  («de abr 2025 a mar 2026») en la ficha (el periodo en la cabecera), en `/buscar` (en las cifras de la banda, `CifrasBanda`, con el mismo gráfico que la ficha) y en
  el pie de la lectura de la portada. Con p25 y p75 iguales tras `plata`, nunca «entre $X y $X».
- **Un producto se titula como lo escribe quien lo compra** (`nombreProducto`): la
  `descripcion` de su banda con más compras, sin los códigos del principio ni el registro del ISP
  («D-232/21», «Reg. ISP N° …»), en tipo oración si venía en mayúsculas, con la región en romanos
  («región IX») y cortada a 80 caracteres; sin una legible, la firma. La firma sigue siendo
  la identidad y el slug, y va al pie de la ficha. La búsqueda (`/publico/productos?q=`) manda
  la `descripcion` de cada resultado, pedida sólo para esos (no se guarda en el índice). **Un rubro se indexa sólo si tiene filas en
  `competitors_by_market`**: sin ellas el panorama sale vacío y la página dice «Sin datos
  históricos». Recontado el 12-10 en la copia local: los 309 la tienen; en el fixture del
  golden, 72 de 124 — ahí se vio. `sitemap.xml` sale de `GET /publico/sitemap` con el mismo filtro.
- **Slugs: una sola función, `app/utils/slug.py`, y el frontend nunca des-slugifica.** Los
  rubros no tienen código y las firmas llevan tildes; dos nombres con el mismo slug → gana el
  de más observaciones y el otro no tiene página (`slug` nulo donde se enlaza).
- Las páginas muestran nombres de proveedores desde analytics: **la primera corrida semanal
  en producción tiene que terminar antes de abrir el dominio** (los parquets anteriores al
  11-10 no están enmascarados). Está en `docs/DESPLIEGUE.md`.
- La exportación CSV corta en `MAX_FILAS_CSV` (5.000) y lo dice en la última línea (§7.4).
- `make e2e` materializa el fixture del golden (con productos **sintéticos**) y exporta
  `FEATURE_ANALYTICS=true`.

### ETL — `etl/`

`main.py` orquesta → `extractors/` → `transformers/` → `loaders/DatabaseLoaderV2`.
`analytics/` tiene 14 módulos Polars que corren cada semana; `opportunity_scorer` corre
último y agrega el resto. `analytics/evaluation/` es el harness de evaluación, con
`tfidf_matcher` como modelo de referencia (a mano, no semanal).
**Ningún módulo escribe un parquet que nada lea**: se retiraron trece —predicciones de
estacionalidad, tendencia por sector, tableros por región, alertas de concentración, normas
de ventana, modelo log-normal de precio, cobertura de bandas, contextos de baja competencia
y el clustering de tipos de compra entero—, que costaban RAM y R2 cada domingo.
`etl/tests/test_personas_naturales.py` fija que no vuelvan. Antes de añadir una salida,
que tenga lector: la API (vía `materialize`) u otro módulo.

`ETL_DATA_DIR` mueve la raíz de los datos (`raw/`, `consolidated/`, `analytics/`) sin tocar
código. Para correr analytics desde un worktree sobre los datos del checkout principal:
`ETL_DATA_DIR=~/…/tordo/etl/data uv run python -m etl.analytics.run_all`.

### Patrones vigentes

Los patrones de cada capa viven junto a su código, en un `CLAUDE.md` que Claude Code carga al
trabajar en esa carpeta: **`backend/CLAUDE.md`** (exportar, golden de BI, «abierta», límite por
IP, endurecimiento, redirecciones, cotas, MCP, un worker) y **`etl/CLAUDE.md`** (personas
naturales, ventana de analytics, montos y precios, identidad por código, HHI, canceladas). Aquí
quedan los que cruzan las tres.

- **Sin cuentas.** Lo que había aquí sobre sesión (JWT, refresco con rotación, Google,
  verificación de correo), claves de API, alertas y notificaciones, informe semanal,
  vigilancia de precios, encaje precomputado y planes se fue con el pivote público. Está en
  la historia de git (antes de `3d73beca994e_retirar_cuentas`) si alguna vez vuelve.
- **Atribución a ChileCompra: es una condición de uso de los datos, no un adorno**
  (`docs/DECLARACION_USO_DATOS.md`). La frase literal «Fuente: Dirección de Compras y
  Contratación Pública (ChileCompra / Mercado Público)» y que ChileCompra no respalda el
  sitio van en el **pie de cada página** (`components/legal/PieAtribucion.tsx`, que pone **una
  sola vez** el pie del sitio, `components/cascara/PieSitio.tsx`, alrededor de toda página desde
  el layout raíz) y en la **primera línea de cada CSV**. Vive en `frontend/lib/atribucion.ts` y en
  `exportar.ATRIBUCION`; un test comprueba que coincidan. **Ningún otro fichero pinta
  `PieAtribucion`**: `__tests__/legal-enlazado.test.tsx` falla con un pie duplicado o con una
  página que monte su propio marco. `/terminos` y `/privacidad`
  publican **sólo el nombre del responsable y `hola@tordo.cl`** (`lib/responsable.ts`): ni RUT
  ni domicilio, que la ley no pide. El nombre sale de `RESPONSABLE_LEGAL` (servidor, se lee en
  el build) para no quedar en el repo; sin ella el `[[hueco]]` se ve, **nunca un dato
  inventado**. La portada, `/acerca` y el pie NO firman con ese nombre: firman con
  `AUTOR_NOMBRE` (`lib/autor.ts`, V5), y sin ella no firman. La fecha de vigencia se pone al publicar. Si cambia lo que el sistema trata (IP, Sentry, analytics, `localStorage`),
  la política se corrige en el mismo PR.
- **Todo lo que se cuenta «por día» se fecha en `America/Santiago`** (`app/core/tiempo.py`,
  `hoy_chile()`). **Nunca `date.today()`**: devuelve la fecha local del proceso, que en el
  contenedor es UTC, y con Chile en UTC-4 el día cambiaba a las 20:00 de Santiago. Estaba en
  siete sitios: la cuota diaria de BI se renovaba al anochecer y un documento que vencía HOY
  se daba por vencido desde la tarde anterior (los dos se fueron con las cuentas; `hoy_chile()`
  se queda para el autolímite del paso 5). Un test en una máquina configurada en Chile no
  lo habría visto — `tests/test_reloj_chile.py` fija un instante dentro de esa franja.
  El borde de un día es `inicio_del_dia()`, **en UTC**: un `datetime` en la hora que no existe
  el día del cambio de hora no es igual a ninguno de otra zona (PEP 495), y restar dos de la
  misma zona da horas de reloj (24 h un día que dura 23).
- **El tramo bajo del HHI se llama `fragmentado`, no `competitivo`.** El eje que mide el HHI
  es la concentración; «competitivo» se lee al revés de lo que significa. Convivían las dos
  palabras —el ETL una, los servicios otra— y el usuario veía dos nombres para el mismo
  mercado en la misma pantalla. Los cortes 1.500 / 2.500 son los de las guías DOJ/FTC y no
  se mueven por intuición. `market_concentration` se re-materializa una vez por semana, así
  que el frontend **mapea también la palabra vieja** hasta esa corrida.

## Deuda conocida — no la refuerces

El razonamiento de cada punto está en `docs/ARQUITECTURA_REVISION_2026-08.md` (anterior al
pivote). Si necesitas apoyarte en alguno de
estos patrones, es señal de que hay que arreglar la causa, no de copiarlo:

- ~~Analytics servido desde caché de parquet en el proceso de la API~~ — **resuelto en F2**: se sirve desde `analytics.*` en Postgres con índices.
- ~~Verificación de membresía repetida a mano en cada endpoint~~ — **resuelto en F3**, y
  desaparecido con las cuentas en el pivote público.
- ~~`Column(JSON)` donde corresponde `JSONB`~~ — **resuelto en F4**: las 26 columnas son JSONB.
  **Toda columna JSON nueva se declara `JSONB`**; `JSON` guarda texto y lo reparsea en cada
  lectura, y no se puede indexar.
- ~~Búsqueda con `ILIKE '%término%'`~~ — **resuelto en F4**: columna generada `busqueda`
  (tsvector español) + GIN, más trigrama sobre `nombre`. **La búsqueda no se escribe a mano**:
  usa `coincide_termino()` en `repositories/licitaciones.py`, que combina las dos vías.
  **Ignora las tildes** en los dos sentidos: el texto se indexa normalizado con
  `inmutable_unaccent` y el término se normaliza igual antes de comparar.
  **Un fragmento casa al COMIENZO de una palabra, nunca dentro de otra**
  (`repositories/busqueda.py`): `nombre_norm ~* '\m<término>'`, que el mismo índice de
  trigramas sirve como servía el `ILIKE '%t%'` de antes (medido con `EXPLAIN ANALYZE`;
  `tests/test_busqueda_comienzo_de_palabra.py` lo fija). Con el `ILIKE`, «bus» traía
  «combustible» y «mesa», «parmesano»; «valvul» sigue encontrando «válvula». El término se
  escapa **en Postgres, después de `unaccent`** (que convierte «©» en «(C)»): todo lo que no
  es letra, dígito o espacio se busca literal. La misma regla sirve a «Lo mejor de hoy» (por
  `coincide_termino`), a `/bi/productos?q=` (`_analytics_sql.sql_busqueda_texto`) y, con el
  guion como separador de palabras del slug, a `/publico/productos?q=`.
  - **`/bi/productos?q=` también ignora las tildes**: el ETL añade a `product_price_bands_l3`
    la columna generada `texto_buscable` (`COLUMNA_BUSCABLE`, `lower(inmutable_unaccent(nombre))`)
    con su índice de trigramas, en la tabla temporal y antes del swap (`TablaAnalytics.buscable`).
    Columna generada y no índice por expresión, como `nombre_norm`; la expresión vive una vez, en
    `busqueda.sql_normalizado`, y el ETL la importa. Sin la columna (una tabla materializada antes),
    el nombre se normaliza al vuelo: mismo resultado, sin índice, hasta la semanal siguiente.
  - **La vía de palabras corrige al stemmer** (`_empieza_alguna_palabra`, migración
    `94f54e8e1fdf`). `plainto_tsquery('spanish', 'mesa')` es `'mes'`, el mismo lexema que
    «meses», y «mesa» encontraba toda licitación de «12 meses»: en la copia local (4.706
    licitaciones), 121 coincidencias de las que 5 eran mesas. Ahora cada palabra del término
    tiene que, además, **empezar** alguna palabra de `busqueda_palabras` (el mismo texto con la
    configuración `simple`, sin raíz) **o ser exactamente su singular** (sin «s»/«es»):
    «servicios» encuentra «servicio» y «camiones», «camión»; el singular va exacto porque con
    `mes:*` «meses» volvería a traer «mesas». Una palabra que el español descarta («de») no exige
    nada. Con eso «mesa» da 5 y «computador» deja de traer «tomografía computada». **Sin índice
    a propósito**: sólo filtra lo que encontró el GIN de `busqueda`, y comparar un tsvector
    guardado es barato —medido sobre 50.000 filas de 1.700 caracteres, ~1 ms más con 50.000
    coincidencias; la regex sobre `descripcion` que se descartó costaba 270 ms—.
  - **Cada palabra trae sus otras formas y sus sinónimos** (`app/utils/sinonimos.py`, Python
    puro): `formas` (comienzo, singular entero, el otro género, «-ora» sin la «a») alimenta
    `consulta_prefijos` y el patrón de los slugs, y `alternativas` (el plural en «-ces» y una
    lista corta de sinónimos de compras públicas: mantención/mantenimiento, lápiz/bolígrafo,
    «pc» → notebook) amplía `coincide_termino` y `/publico/productos?q=`. Medido en local:
    «computadora» encontraba 0 de las 7 de «computador» y «guantes» dejaba fuera 385 productos
    de «guante». Lo escrito sale primero (la relevancia puntúa sólo el término escrito; los
    productos ordenan antes lo que coincide sin sinónimos). **Un sinónimo nuevo no puede tener
    otro sentido en una compra** («auto» empieza «autorización»): `test_busqueda_alternativas.py`.
  - **«¿Quisiste decir…?»** (`GET /publico/sugerencia`, `services/publico/sugerencias.py`): la
    búsqueda con cada palabra desconocida cambiada por la más parecida (`difflib`, ≥ 0,8) del
    vocabulario de las firmas del índice, en memoria. `/buscar` la pide sólo cuando nada
    encontró nada.
  **El orden por relevancia también es Postgres** (`puntuacion_relevancia`: `ts_rank_cd`
  con todos los términos, que premia la cercanía, + `ts_rank` con cualquiera y sobre el
  nombre). Antes lo hacía el TF-IDF del ETL cargado en la API. **Relevancia ordena, no
  amplía**: el filtro es el mismo AND que en cualquier otro orden y las abiertas van
  primero; `tests/test_relevancia_licitaciones.py` fija el orden en un catálogo de juguete.
- ~~Suscripción y `plan_tier` colgando de `User`~~ — **resuelto en F3**; hoy no hay ni
  suscripciones ni usuarios.
- ~~`subprocess.run` desde Celery hacia el ETL (F2)~~ — **resuelto en el paso 5 del pivote**:
  sin Celery; `etl/cron.py` llama al ETL en proceso.
- ~~`Base.metadata.create_all()` en el loader del ETL~~ — **resuelto en F4**: verifica el
  esquema y falla con instrucciones. **El esquema sólo lo crean las migraciones.**
- ~~`conftest.py` mantiene a mano el DDL de 11 tablas en SQLite~~ — **resuelto**: el esquema
  lo crean las migraciones (`alembic upgrade head`) sobre Postgres real, y cada test corre
  en una transacción que se revierte.
- ~~El golden master de BI no corre en CI~~ — **resuelto**: el fixture de analytics está
  versionado (`backend/tests/golden/fixture_analytics`, 1 MB) y `make ci` lo materializa
  antes de los tests. Los 31 casos corren siempre.
- ~~56 hallazgos de ruff silenciados~~ — **resuelto**: quedan sólo decisiones permanentes.
  El `zip()` sin `strict=` se arregló con `strict=True` donde el largo está garantizado,
  **no** con el `strict=False` que propone el autofix: eso conserva el truncamiento
  silencioso y sólo calla la regla.

## Hacia dónde va

> **Pivote decidido el 2026-10-11: TORDO pasa a ser un sitio público y gratuito** — sin
> cuentas ni cobros, financiado con donaciones, en Vercel Hobby + Railway con dos cron.
> Especificación: `docs/PIVOTE_PUBLICO_2026-10.md`. **Del 3 al 11 están hechos**: fuera las
> cuentas (3 y 4), cron en vez de Celery y Redis (5), R2, enmascarado y ventana de analytics
> (6), Postgres adelgazado (7), TF-IDF fuera de la API (8) y «lo mejor de hoy», RSS y
> favoritos (9), páginas públicas, sitemap y revalidación (10), guías y portada (10b) y legal (11; faltan
> nombre, correo y fecha al lanzar). La preparación del lanzamiento (12) también, y **el sitio está
> en producción desde el 2026-10-13** (`tordo.cl`, `api.tordo.cl`; Railway `tordo-publico`
> y Vercel `tordo`). Lo que enseñó desplegarlo, con números medidos, está en
> `docs/DESPLIEGUE.md`.

Decisiones tomadas el 2026-08-05, con su ADR en `docs/decisiones/`: sólo Chile (sin
multi-país), nombre TORDO y LLM acotado a un servidor MCP sobre la base histórica siguen
vigentes. La suscripción por empresa con planes y la pasarela de pago local **las dejó sin
objeto el pivote**: [ADR 0011](docs/decisiones/0011-sitio-publico-sin-cuentas.md) supersede a
0002, 0005 y 0008, modifica a 0004 (MCP anónimo) y dice qué lo reabriría.

**El MCP está construido** (ADR 0004, retomado el 2026-08-08 al cumplirse su propia
condición: la API pública ya está, así que dejó de ser superficie nueva). Vive en `app/mcp/`,
montado en `/mcp/` (también responde en `/mcp`, sin redirigir) **fuera de `/api/v1`** — MCP
versiona su propio protocolo.
- **Anónimo** desde el pivote: sin clave ni cuota. Ver `backend/CLAUDE.md` para la
  protección contra DNS rebinding y `MCP_HOSTS_PERMITIDOS`.
- **Cuatro herramientas de grano grueso, no veinte.** Un modelo encadena unas quince
  llamadas donde una persona hace tres. Nació para no agotar una cuota en una conversación;
  sin cuotas, sigue acotando la carga que mete un cliente anónimo. Hay un test que falla si
  aparece una quinta herramienta.
- **Sus argumentos tienen las cotas de la API** (`Codigo`, `Texto`, de `limites.py`;
  `test_todo_argumento_de_texto_tiene_cota`), y **los servicios de BI corren en un hilo**
  (`_en_hilo`, como mucho dos a la vez): son síncronos, y llamados desde la corrutina
  bloqueaban el bucle, con lo que toda la API REST esperaba a que terminara un panel.
- **Ninguna herramienta acepta `empresa_id`**: un modelo rellenaría ese hueco con lo que le
  pareciera. Un test lo comprueba.
- **`tests/test_mcp.py` habla el protocolo por HTTP**, no llama a las funciones. Es la única
  forma de ver los dos fallos que tiene esto: que montar una app ASGI dentro de otra **no
  ejecuta su ciclo de vida**, y que la lista blanca de `Host` deja fuera un dominio que no
  esté en ella — **todo** responde `421`.
- **Su ficha para los registros es `server.json`, en la raíz** (registro oficial, espacio de
  nombres `cl.tordo/mercado-publico` verificado por DNS; Glama la copia de ahí; Smithery aparte).
  **Cada publicación la confirma el dueño**, paso por paso (`docs/DESPLIEGUE.md` §12.1). La
  `1.0.0` se publicó el 2026-10-15, sin `repository` (el repo aún era privado); la `1.1.0`, que
  ya está en `server.json`, añade `repository` y se publica después de mergear el PR que la
  sube (rediseño 7b). Las versiones del registro son
  **inmutables** —cambiar la ficha es subir `version`— y sus metadatos no se borran nunca, sólo
  se ocultan. `tests/test_server_json.py` la valida contra el esquema oficial y exige que su URL
  sea `URL_MCP`.

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

`cp .env.example .env`. Críticas: `DATABASE_URL`, `MERCADO_PUBLICO_TICKET` (lo usan el ETL
y los cron, no la API), `API_URL`, `APP_NAME`, y en producción `MCP_HOSTS_PERMITIDOS` con el
dominio **de la API** (`api.tordo.cl`: los integradores y el MCP le hablan directo, no por
Vercel) y `FEATURE_ANALYTICS=true` (por defecto `false`: todo `/bi/*` da 503).

**Producción: `docs/DESPLIEGUE.md`**, con **una sola tabla de variables** (servicio, obligatoria,
formato, de dónde sale), `scripts/generar-secretos.sh` (imprime `PROXY_SECRETO` y
`REVALIDAR_SECRETO` y dónde va cada uno; nunca los escribe a disco) y
`scripts/verificar-produccion.sh <sitio> <api>` (prueba de humo de sólo lectura, ✓/✗ por
comprobación, sale con el número de fallos). **No hay `railway.json`, y `frontend/vercel.json` sólo hace una cosa**: el Config as Code
de Railway no admite servicios nuevos y deja de leerse el 2026-12-01, su IaC no documenta cron
ni ruta del Dockerfile (se usa la variable `RAILWAY_DOCKERFILE_PATH`), y los dos cron llevan
*Restart policy* **Never** en el panel (con el «On Failure» por defecto, un cron que falla se
re-ejecutaría hasta 10 veces). El `vercel.json` sólo deja desplegar `main`
(`git.deploymentEnabled`, con `"**"`: `*` no cruza la `/` de `feat/…`, y con él se
construyeron 100 *Preview* en una semana): un *Preview* no tiene variables y sería una página
rota; la región sigue siendo la de por defecto, `iad1`.

**Vercel Hobby pausa la cuenta entera al pasarse de una cuota** (2026-10-19, escrituras en la
Data Cache: tordo.cl y pixelframe.cl en 402 durante 30 días; `docs/DESPLIEGUE.md` §13.4). Lo
causaron rastreadores recorriendo miles de fichas bajo pedido, no los despliegues. Por eso
`robots.txt` aparta esas fichas de los rastreadores de entrenamiento
(`RASTREADORES_DE_ENTRENAMIENTO`, `FICHAS_BAJO_PEDIDO` en `lib/publico.ts`). **Una sección
nueva con miles de páginas en ISR multiplica las escrituras**: se mide antes de abrirla.
Desde el 2026-10-20 la cuenta está en **Pro** (el gasto avisa y no pausa) y el Firewall
registra (`log`, sin bloquear) las ráfagas de más de 120 fichas por minuto por IP y los bots
de IA. La guía es
una lista ordenada con una comprobación por paso
(Railway, R2, Healthchecks, Sentry, Vercel, DNS, correo y la prueba en vivo del
`X-Forwarded-For`). Las variables de cada servicio están ahí; si cambias una aquí o en un
Dockerfile, se corrige allí en el mismo PR.

**La imagen del ETL lleva `backend/app`**, y `asyncpg`/`greenlet` están en el grupo `shared`:
el ETL importa los modelos, y `app.db` crea el motor async al importarse. Faltaban las dos
cosas y **ningún cron arrancaba en la imagen** (`No module named 'app'`); en compose no se
veía porque el repo se monta entero sobre `/workspace`.

**Límite por IP**: `PROXY_SECRETO` va en la API **y** en el servidor de Next, sin valor por
defecto y nunca con prefijo `NEXT_PUBLIC_` (`openssl rand -hex 32`); `CONFIAR_X_FORWARDED_FOR`
es `true` sólo en Railway; `LIMITE_POR_MINUTO` (60). En producción la API avisa al arrancar si
falta alguna de las dos primeras, y si `MCP_HOSTS_PERMITIDOS` sólo tiene `localhost`/`127.0.0.1`
(`app/mcp/servidor.py`, `aviso_de_hosts`). No hay `REDIS_URL`.

**No hay `SECRET_KEY`.** Se borró con las cuentas: nada firma tokens, y un secreto
obligatorio que nadie usa enseña a rellenar variables sin mirar.

**`RESPONSABLE_LEGAL`** (servidor de Next, en el build): el nombre que firman `/terminos` y
`/privacidad`. En Vercel tiene que estar definida al construir.

**`AUTOR_NOMBRE`, `AUTOR_ROL` y `AUTOR_URL`** (servidor de Next, en el build, opcionales;
`lib/autor.ts`): quién hace el sitio, en el «Lo hace» de la portada, `/acerca` («Lo hace {Nombre},
{rol}, a título personal.»), la ficha del autor y el pie. Sin `AUTOR_NOMBRE` no se firma nada, ni el
rol. `AUTOR_ROL` (≤ 80 caracteres; en producción «ingeniero que construye productos con datos») no
tiene valor por defecto: sin ella se firma sólo con el nombre. `AUTOR_URL` sólo `https://`, y
`nombreDelEnlace` la nombra «GitHub», «LinkedIn» o por su dominio. **`VERCEL_GIT_COMMIT_SHA`** la
pone Vercel en el build: el commit del pie.

**`REPOSITORIO_URL`** (servidor de Next, en el build, opcional, sólo `https://`): el repositorio
público para «Código» en `/abierto` y para los términos §7, que la leen solos. **Puesta en
Vercel (Production) desde el 2026-10-15**: `https://github.com/cris-middleton/tordo`. Estuvo
vacía mientras el repo era privado (spec del rediseño R8): GitHub responde 404 a un repo privado
y el sitio habría enseñado un enlace roto. Al cambiarla hay que redeployar.

**`API_URL` es de servidor y no lleva prefijo `NEXT_PUBLIC_`.** Cualquier variable que sí lo
lleve se inlinea en el bundle del navegador, y la URL del backend ya no tiene por qué estar
ahí: quien habla con él es el proxy de Next.

Observabilidad: `SENTRY_DSN` (backend, vacío = desactivado), `NEXT_PUBLIC_SENTRY_DSN`
(frontend, se inlinea en el build), `LOG_JSON` (false en local), `LOG_LEVEL`, `ENVIRONMENT`.
`SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` son **sólo de build**: sin ellas el
build funciona igual, pero las trazas del navegador llegan minificadas.

Feature flags: `FEATURE_ANALYTICS`.
