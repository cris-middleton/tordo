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
  trinquete: **las tablas ya están todas comentadas**; quedan 43 columnas sin comentario y
  2 PK `integer`, así que el test **no exige arreglarlas** — falla si aparece deuda **nueva**.
  La deuda vive en `tests/convenciones_baseline.json` y sólo puede encoger.
  Al arreglar algo: `cd backend && uv run --project .. python tests/regenerar_baseline.py`.
- Los errores de negocio se devuelven con `HTTPException` y mensaje en español — los ve el usuario.

### La voz de los textos

Todo texto que se escriba o se toque desde octubre de 2026 sigue esta voz (spec
`docs/IDENTIDAD_Y_PORTADA_2026-10.md` §6.1, tomada de la guía de voz de PixelFrame):

- **Chileno, en segunda persona y concreto.** Cifras, plazos y objetos con nombre antes que
  adjetivos.
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
- **No hay sesión en el navegador, y es deliberado (pivote público).** Todo el tráfico va
  por `/api/proxy`, que **sólo reenvía**: no lee ni pone cookies, no añade `Authorization`
  y no reenvía las cabeceras del navegador (le pasaría a un tercero las cookies de este
  dominio). Existe por dos motivos: la URL del backend es de servidor, y las redirecciones
  internas de FastAPI se siguen ahí y no en el navegador. `__tests__/proxy-sin-sesion.test.ts`
  lo fija.
  - **Sólo reenvía `GET` bajo `/api/v1/`** (el prefijo sale de `lib/versionApi.ts`), que es
    todo lo que pide el navegador. Lo demás da 404 sin llamar al backend, y cualquier otro
    método, 405 (Next arma `HEAD` con el mismo manejador). Reenviaba cualquier ruta y
    método: `/api/proxy/docs` servía el Swagger en el origen del sitio, y `/mcp` o un `POST`
    llegaban por ahí. Un segmento con `..`, barra, `?`, `#` o `%` también es 404, y una
    redirección del backend fuera de `/api/v1/` no se sigue. `__tests__/proxy-solo-api.test.ts`.
  - **La URL del backend es `API_URL`, de SERVIDOR.** Cualquier variable `NEXT_PUBLIC_*` se
    inlinea en el bundle.
  - **El proxy le dice al backend quién es el visitante** (`lib/backendServidor.ts`):
    `X-Tordo-Visitante` con la IP que da la plataforma y `X-Tordo-Proxy` con `PROXY_SECRETO`.
    Sin eso el límite por IP del backend contaba a todo el sitio como UN cliente. **Una
    cabecera propia y no `X-Forwarded-For`**: el borde de Railway la reescribe, y lo que
    mandara el proxy no llegaría. Sin IP manda `desconocido`, no nada — sin visitante, el
    backend lo tomaría por un renderizado del servidor y lo eximiría.
    `__tests__/proxy-ip-visitante.test.ts` lo fija.
  - **`PROXY_SECRETO` es de SERVIDOR y no puede llegar al navegador.** CI construye con un
    centinela y `npm run check:secreto` lo busca en `.next/static` y en las páginas
    prerenderizadas (comprobado que salta si se filtra por el `env` de `next.config`). El
    módulo que lo lee no se importa desde un componente cliente.
  - El proxy devuelve `Content-Disposition` y las cabeceras del límite: sin la primera cada CSV se descargaba con el nombre
    genérico.
- **No hay planes, candados ni 402 en el frontend.** Todo lo que el producto calcula se ve
  entero, sin cuenta. Si un día vuelve algo de pago, el límite vive en el backend y llega por
  la API: una copia en TypeScript se desincroniza sin que nada falle.
- **Un 401, 402 o 403 no manda al visitante a ninguna parte** (`__tests__/errores-de-api.test.ts`):
  no hay login al que redirigir. El 429 dice «espera un momento».
- **Ninguna consulta espera para siempre**: axios corta a los 15 s y TanStack reintenta una
  sola vez, sólo 5xx o red, nunca un timeout (`lib/reintentos.ts`). Una sección que falla
  pinta `ErrorDeCarga` con «Reintentar». Antes eran tres intentos sin tope (un *spinner* de
  más de 30 s) y cada reintento repetía la consulta que había matado al proceso.
- **Sentry cubre los tres runtimes** (navegador, Node y edge) y las opciones salen de un solo
  sitio, `lib/sentry-comun.ts`. Ponerlas en dos de los tres es la forma fácil de equivocarse,
  así que hay un test estructural que exige que las tres partan de `OPCIONES_COMUNES`.
  - **`sendDefaultPii: false`**, como el backend: por aquí pasan RUTs, montos y documentos.
    Cambiarlo no rompe nada y empieza a mandar datos personales a un tercero —
    `__tests__/sentry-privacidad.test.ts` lo fija.
  - **Sin replay de sesión**, a propósito: graba la pantalla. Un `maskAllText` es una
    salvaguarda que hay que acertar; no grabar no hay que acertarlo.
  - `AbortError` y los 401 se descartan: cancelar peticiones es el comportamiento **correcto**
    (TanStack Query cancela lo obsoleto) y reportarlo convierte lo normal
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
  Tailwind. Los componentes tenían 112 hexes; los últimos, los de los Recharts de `/mercado`, se
  fueron con ellos (pasada micro de octubre de 2026). Un token en un estilo en línea va dentro de `rgb()`: es
  un triplete, y `var(--color-x)` a secas no es un color (el tooltip de `PriceBandChart` salía sin
  fondo).
- **Los gráficos siguen `docs/GUIA_GRAFICOS.md`** (reglas con test y criterios para leer, con sus
  fuentes): `__tests__/guia-graficos.test.tsx` exige que todo fichero que dibuje datos esté
  declarado como propio o como deuda, y fija en los propios tokens `dato`/`dato-tenue`, sin
  leyendas ni adornos, texto de 12 px y el dibujo `aria-hidden` con los valores en texto.
- **Ningún texto bajo 12 px** (`text-xs`): `__tests__/texto-minimo.test.ts`.
- **Nunca `text-white` sobre un fondo de token.** Los rellenos se invierten con el tema: en
  claro `bg-accent` es teal oscuro con etiqueta blanca, en oscuro es teal claro con etiqueta
  navy. Usa `text-onAccent`, `text-onPrimary`, `text-onGold`… `__tests__/on-color.test.ts`
  falla si alguien lo olvida, y hace falta: **el error es invisible en tema claro**, que es el
  que se revisa por defecto, porque ahí `on-accent` justamente ES blanco.
- **Si tocas un token de color, el test de contraste lo comprueba.**
  `__tests__/contraste-wcag.test.ts` lee `:root` y `.dark` de `app/globals.css` y comprueba
  134 pares contra WCAG AA (4,5:1 texto, 3:1 bordes de control): cada tinta sobre cada
  superficie, cada `on-*` sobre su relleno, cada tinta sobre su tenue, y los cuatro de la
  tarjeta de vista previa. Los cinco que medían tintas sobre `brand-navy` se fueron con el panel
  oscuro de la portada (portada v7, V1): nada pinta ya texto sobre navy. **Un token nuevo lo hace
  fallar** hasta que alguien decida sus pares (o lo declare decorativo en `SIN_PAR`). Antes eran
  «166 pares verificados» a mano, y el bug de `.alert-info` (texto invisible en tema claro) nació
  de cambiar un token a ojo.
- **Los enlaces dentro de un texto corrido llevan `className="enlace"`** (subrayado): es la
  señal de «hipertexto, no aplicación». La navegación, las tarjetas y los botones no se
  subrayan. `__tests__/enlaces-contenido.test.ts`.
- Una superficie que deba verse oscura siempre se marca con la clase `dark` sobre
  `bg-brand-navy`, y los tokens se invierten solos dentro. No repintes a mano. **Hoy no hay
  ninguna**: el panel de lecturas de la portada era la única y se fue con la portada v7 (el dueño:
  «los gráficos con un fondo muy fuerte ocupan un espacio muy corto»). Una superficie oscura nueva
  mete sus tintas sobre `brand-navy` en `contraste-wcag.test.ts`: `subtle` no pasa (4,18:1) y el
  `border` oscuro no se ve sobre navy.
- **El tema claro declara `color-scheme: only light`; el oscuro, `dark`** (`app/globals.css`, más
  `<meta name="color-scheme" content="only light">` desde `viewport` en `app/layout.tsx`). Con
  `light` a secas, Chrome en Android con «oscurecer sitios web» invertía la portada entera en el
  tema claro. next-themes lleva `enableColorScheme={false}`: su `style` en línea dice `light` y le
  gana a la hoja. Con el sistema en claro, el `FORCE_DARK_ONLY` de algunas WebView oscurece igual
  y ninguna declaración lo evita. `__tests__/oscurecido-forzado.test.ts` y
  `e2e/oscurecido-forzado.spec.ts`.
- **La tarjeta de vista previa** (`app/opengraph-image.tsx`, la misma para X en `twitter-image.tsx`)
  es un panel `brand-blue` (el azul del cuerpo del pájaro, invariante de tema; lo pinta también el
  pájaro de la cabecera) con
  el pájaro, la marca en Varien y el dominio, y un lienzo blanco con «¿Qué le vendes al Estado?» en
  navy y la píldora «Datos públicos de ChileCompra». Sin subtítulo: casi siempre se ve a 260 px.
  Se dibuja sin CSS, así que sus colores son copias de tokens en `lib/coloresImagen.ts`
  (`colores-imagen.test.ts` vigila la copia) y sus pares de texto, `PARES_IMAGEN`, los mide
  `contraste-wcag.test.ts`. Los trazos del pájaro están copiados del logo en `lib/pajaroImagen.ts`
  (`pajaro-imagen.test.ts`), y las fuentes van en WOFF (Satori no lee WOFF2 ni ejes variables): dos
  instancias estáticas de Archivo en `assets/fuentes-imagen/` (cómo rehacerlas, en
  `lib/fuentesImagen.ts`) y Varien desde `public/fonts/varien/WOFF/`. **Rutas literales** al leerlas:
  una ruta armada empaqueta el proyecto entero en el servidor (aviso de Turbopack).
- **El estado de servidor va en TanStack Query, sin excepciones.** Las consultas y sus claves
  viven en `lib/queries.ts`, en un solo sitio: las claves son lo que permite invalidar con
  precisión tras una mutación. Los hooks envuelven `lib/api.ts`, no `fetch`: el transporte
  se cambia en un solo sitio sin tocar una pantalla.
  **`react-hooks/set-state-in-effect` e `immutability` son `error`**: reintroducir el patrón
  `useEffect` + `setState` para pedir datos no compila.
- **Nada de `useEffect` + `setState` para leer algo que vive fuera de React.** Para
  `localStorage`, `matchMedia` o un evento del navegador, la API correcta es
  `useSyncExternalStore` — ya lo usan `useMediaQuery`,
  `SelectorTema` y los favoritos y búsquedas guardadas (`lib/almacenLocal.ts`). Además de dejar el lint limpio, arregla un fallo que el efecto tenía:
  **sólo corría al montar**, así que un cambio externo no llegaba a las pantallas ya montadas.
- **No queda ninguna excepción a esa regla.** Las tres que había (`bi/page`, `settings` y
  `AuthContext`) desaparecieron: las dos últimas con las cuentas, y la de `bi/page` con un
  inicializador perezoso. Si necesitas una, escribe por qué en su línea — nunca desactives la
  regla globalmente.
- **Ninguna pantalla pasa de 700 líneas.** Las tres que lo hacían están partidas por su
  seam natural: el detalle de licitación en `components/licitacion/` + `lib/licitacionDetalle.ts`,
  el listado en `FilaLicitacion` + `lib/licitacionEstado.ts`, y las herramientas de BI en
  `app/(panel)/mercado/components/herramientas/` (una pestaña por fichero). **Los ayudantes de estado y formato
  van en `lib/`, no dentro del componente**: definidos dentro se reconstruían en cada render
  y no se podían reutilizar desde la tarjeta.
- **Tests de extremo a extremo: `make e2e`.** Monta la pila entera contra una base
  efímera y corre Playwright. Encontró **tres fallos que ninguna otra capa veía**, y los
  tres compilaban y pasaban el lint:
  - el proxy entraba en **bucle de redirecciones** con cualquier ruta terminada en `/`
    (Next quita la barra, FastAPI la vuelve a pedir), así que rutas como `/api/v1/tenders/`
    **nunca cargaban**;
  - `sort_by=relevance` **sin artefactos TF-IDF ignoraba el término** y devolvía el
    catálogo entero — el estado normal de un despliegue nuevo;
  - **`params` es una Promesa desde Next 16**, y las dos páginas de detalle la leían como
    objeto: pedían `/codigo/undefined`. Rotas desde la actualización.
  - En un componente cliente el parámetro de ruta se lee con **`useParams()`**.
  - **La revalidación se prueba ahí** (`e2e/revalidacion.spec.ts`): el contrato de
    `/api/revalidar` y que revalidar `analytics` pasa una ficha de HIT a STALE y de vuelta a
    HIT, sobre el servidor standalone del build de producción. `scripts/e2e.sh` genera
    `REVALIDAR_SECRETO` como `PROXY_SECRETO`. Que el dato cambie de verdad se comprueba a
    mano (docs/DESPLIEGUE.md, «Si algo falla»).
- **Accesibilidad con axe** (`e2e/accesibilidad.spec.ts`, `@axe-core/playwright`): reglas
  WCAG 2.0 y 2.1 A y AA sobre el DOM pintado de la portada, `/licitaciones` y una licitación,
  `/compra-agil`, `/mercado`, `/productos`, `/notas` y una nota, `/guias` y una guía, `/acerca`,
  `/apoyar`, `/abierto` y el 404, en claro y oscuro, a 1440 y 390. Ve lo que el test de tokens
  no ve: nombres accesibles, ARIA prohibido, regiones con desplazamiento sin teclado. **Lo que
  marque se arregla en el componente**; una exclusión va en `EXCLUSIONES`, con regla, selector
  exacto y motivo, nunca una regla entera. Hoy está vacía. axe no decide el contraste del texto
  dentro de un SVG de Recharts (lo da por «incompleto», no por fallo), así que ahí no vigila
  nada. `__tests__/selects-con-nombre.test.ts` cubre los `<select>` que axe no ve porque no se
  pintan al abrir la página.
- **Comparación de capturas** (`e2e/capturas.spec.ts`): la portada y `/licitaciones` a 1440 y
  390 en claro, con `toHaveScreenshot`. **Sólo corre en Linux, y las líneas base
  (`capturas.spec.ts-snapshots/*-chromium-linux.png`) salen del runner de CI**: macOS rasteriza
  el texto distinto, y un Mac con Apple Silicon no es el x86-64 del runner. En un Mac se salta.
  Fechas, horas y días de la semana se reescriben en el DOM antes de capturar (la semilla fecha
  relativo a la hora en que corre), y la semilla separa un minuto cada publicación (el catálogo ya
  desempata por `id`, pero el orden sería el inverso al de carga y habría que rehacer las líneas
  base). **Un cambio visual en esas dos pantallas, una nota
  nueva incluida (la portada lista las cuatro últimas), exige rehacer la línea base**: borra el
  PNG, empuja, y el test falla dejando la captura nueva con su nombre en el artefacto
  «playwright» (`gh run download <id> -n playwright`); se copia a `capturas.spec.ts-snapshots/`
  y se revisa a ojo antes de commitearla. En CI una captura sin línea base falla
  (`updateSnapshots: 'none'`): con el valor por defecto el primer intento la escribía y el
  reintento pasaba comparándola consigo misma.
- **El navegador de los E2E se elige solo** (`E2E_NAVEGADOR=auto`): nativo si puede
  lanzarse, y si no, la imagen oficial de Playwright. En una máquina de trabajo
  `playwright install --with-deps` pide sudo; en CI no, y **bajar la imagen de 2 GB desde
  Actions tardaba cuatro minutos y moría con `connection reset by peer`** — por eso el job
  instala Chromium y fuerza `nativo`. Lo único que cambia entre los dos caminos es de dónde
  sale el binario: misma versión, mismos tests, misma pila.
- **En los E2E, Next arranca DENTRO del contenedor** del navegador, y el backend vive en el
  host escuchando en `0.0.0.0`. Hacía falta por las cookies `Secure` de la sesión, que ya no
  existe; se conserva porque funciona y no hay motivo para moverlo. **Los E2E recorren el
  sitio sin iniciar sesión** (`e2e/licitaciones.spec.ts`).
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

**`etl.cron` es el único programador.** Celery, Redis y Flower se retiraron en el paso 5 del
pivote (`docs/PIVOTE_PUBLICO_2026-10.md` §3.1), con la tabla `task_failures`: el watchdog
que la leía lo sustituye el latido. En local no hay programador; los cron se lanzan a mano. `frecuente` se dispara **cada hora en UTC** y
decide él si le toca —10, 13, 16 y 19 h de Santiago entre semana, 12 h el fin de semana—
porque Chile cambia de hora y Railway no. Corre en proceso, sin `subprocess`. La ventana
de Compra Ágil va desde la corrida **programada** anterior menos 1 h; **la primera del día,
desde la anterior a la primera de AYER** (~42–47 h), y barre además las licitaciones de
anteayer y ayer, como hacía la diaria de las 02:00 — sólo licitaciones: **las órdenes de
compra ya no se ingieren por la API** (paso 7); salen de la descarga masiva, y cada una
costaba un detalle de la cuota. Antes eran 26 h y un día: si fallaba la primera de un día,
lo que cambió entre la última de anteayer y ella no lo miraba nadie
(`test_una_corrida_cualquiera_que_falla_no_deja_hueco`). No se guarda cuál fue la última
corrida **buena** (no hay dónde sin añadir estado), así que dos primeras del día seguidas
fallidas sí dejan hueco.
**La primera del día re-consulta además los resultados** de las licitaciones cerradas en los
últimos 30 días sin adjudicación (tope 500/día, el 5 % de la cuota de la API clásica; ni
desiertas, ni revocadas, ni Compra Ágil). Sin esto la adjudicación sólo se llenaba si
aparecía con el llamado aún publicado. `licitaciones.resultado_consultado_en` rota la cola:
una preguntada no vuelve en 3 días aunque no haya novedad, o el tope nunca llegaría a las
demás. Va **después** del listado de Compra Ágil, como todo lo que gasta cuota. Latido
a Healthchecks.io con `LATIDO_URL_FRECUENTE` / `LATIDO_URL_SEMANAL`; un ping roto no
tumba la corrida.

**Un ticket rechazado hace fallar la corrida** (`CredencialRechazada`, `etl/extractors/base.py`).
La API clásica responde a un ticket inválido con **HTTP 203** —un 2xx— y `{"Codigo": 203,
"Mensaje": "Ticket no válido."}`, que pasaba por «0 registros»; Compra Ágil, con un 401 que se
registraba y seguía. Con el ticket roto los cron terminaban bien y el latido daba verde. Ahora
no se reintenta, `main.py` la deja pasar por sus `except Exception` y llega al `/fail`. **Un
`except Exception` nuevo en el ETL tiene que dejarla pasar.**

**Un fallo TOTAL también hace fallar la corrida; uno aislado, no** (`etl/tests/test_fallo_total.py`).
Con la API clásica caída cada día salía «0 registros», con la primera página de Compra Ágil
caída el listado era `[]`, y con todas las tandas del upsert fallidas `load_licitaciones`
devolvía 0: los tres terminaban «bien». Ahora el listado clásico sin respuesta en NINGÚN día y
Compra Ágil sin primera página en NINGÚN tramo lanzan `ConsultaFallida`
(`etl/extractors/base.py`), y `load_licitaciones` sin ninguna tanda escrita, `CargaFallida`;
las dos caen en los `except Exception` de `main.py`, el paso devuelve `False` y la corrida
termina en `/fail`. Hubo registros y no se transformó ninguno: también `False`. Un día de
varios, un tramo de veintiséis (o una página siguiente) o una tanda de varias quedan en ERROR
y se toleran: los recoge la ventana larga de la primera del día siguiente.

**Los cron revalidan las páginas públicas** (`Revalidador` en `etl/cron.py`): `POST
REVALIDAR_URL` con `X-Revalidar-Secreto: REVALIDAR_SECRETO` y `{"etiquetas": [...]}`; la
semanal manda `["analytics"]` tras materializar y la frecuente `["compra-agil"]` al final. Sin
las variables no hace nada; un fallo queda en ERROR y **no** tumba la corrida (la página sólo
se queda vieja). El mismo secreto en Vercel y en los dos cron. **La semanal materializa tabla
por tabla y revalida si entró al menos una** (`_materializar`): antes una sola tabla rota
dejaba sin revalidar todas las páginas una semana. La tabla rota sigue llevando la corrida
al `/fail`.

**`semanal` guarda la historia en R2** (`etl/almacen.py`): el contenedor de Railway arranca
con el disco vacío. Baja `consolidated/` y `analytics/` al empezar y sube lo que cambió al
terminar (MD5 contra ETag: sólo viaja lo que cambió). Todo lo demás del pipeline sigue leyendo
disco, sin una línea distinta entre local y producción. `raw/` no se sube: los ZIPs vienen de
ChileCompra, que es su fuente.
- **R2 guarda sólo lo que la corrida lee**: `MESES_EN_R2` = la ventana de analytics (36) más
  los 3 que se rehacen. Lo anterior ni se baja ni se queda en el bucket (`almacen` lo borra al
  subir). Medido: la descarga masiva 2007–2026 son ~26 GB (18 de OC, 8 de LIC), la capa
  gratuita de R2 son 10 GB, y los 39 meses ~4,5 GB. La descarga recibe la ventana entera y baja
  por tipo los meses sin consolidado: la primera corrida, con R2 vacío, llena la ventana (antes
  bajaba 3 meses y analytics corría sobre 3). **Si un módulo pasa a leer más historia, sube
  `MESES_EN_R2` en el mismo PR**, o leerá una ventana con agujeros sin avisar.
  - Consecuencia: `personas.codigos_persona_natural` clasifica con la historia que hay en
    disco, es decir, esos 39 meses, ya no desde 2007.
- **`ETL_ALMACEN` es obligatoria, sin valor por defecto** (`r2` | `disco`). Caer a disco en
  producción no fallaría: reconstruiría el análisis sólo con los 3 meses recién bajados y lo
  publicaría. En `r2`, una credencial que falta (`R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) hace fallar la corrida al construirse, con su nombre
  en el `/fail`.
- **Al final, la retención del catálogo** (`etl/retencion.py`, spec §5.2): fuera la Compra
  Ágil publicada hace más de **30 días, y nunca del mes anterior** (en hora de Chile), y las
  licitaciones cerradas hace más de 90 (sin cierre, desde la publicación). Lo del mes no es
  redundante: con 30 días móviles ninguna corrida semanal ve un mes entero, y el máximo que
  acumula `publicadas` se quedaba con un trozo — hasta una semana menos cada mes. Lo fija una
  simulación de semanas cruzando fronteras de mes en `etl/tests/test_retencion.py`; en
  Postgres quedan entre 30 y ~62 días de Compra Ágil. **Sólo si `compra_agil_mensual` terminó bien y ya se subió**: es la
  única fuente de `publicadas` y la acumula leyendo esa misma tabla, así que borrar lo que no
  contó lo perdería para siempre. Si no, la Compra Ágil espera una semana más. Un código
  purgado da **404** en el catálogo (`etl/tests/test_retencion.py`). **Nada que lea
  Postgres puede contar con lo purgado**: un conteo de Compra Ágil de 90–180 días (hoy, el
  «Publicadas» de la ficha pública del comprador; «lo mejor de hoy» ya no lo usa) sale de
  `analytics.compra_agil_mensual`, nunca de `licitaciones`.
- **La ventana tiene que quedar entera, o no se reconstruye** (`_descargar`). Un 404 sólo vale
  para un mes reciente (los 3 que se rehacen) **que no tenía datos antes de purgar**: el mes en
  curso, o el anterior en los primeros días de un mes, que ChileCompra aún no publica. Un
  timeout, un 5xx o una conexión cortada (`bajar_zip` ya no los cuenta como 404), un 404 de un
  mes purgado que sí tenía datos, uno de un mes viejo o un ZIP ilegible (`consolidar_tipo`
  devuelve `None`) hacen fallar la corrida antes de analytics: no se materializa ni se sube, y
  R2 conserva la versión anterior. Antes todo eso pasaba por «aún no publicado», y analytics se
  publicaba sin los meses purgados con el latido en verde. El ZIP se escribe a `.part` y se
  renombra al terminar.
- **Purga ZIP Y consolidado** de los 3 meses que rehace. Antes sólo el ZIP, y
  `consolidar_tipo` se salta un mes ya consolidado: lo que ChileCompra corregía de los meses
  recientes nunca llegaba a analytics.
- **RAM medida** (run_all + materialize en un proceso, como el cron; RSS máximo en macOS, Mac de
  10 núcleos): **1,68 GB con 3 meses de OC, 3,17 GB con 6**. Manda `product_prices` (3,25 GB
  sólo él con 6 meses, ~0,5 GB por mes de historia); el siguiente es `competitors` con 1,29 GB.
  **Cada módulo crece con la historia**, así que lo que acota el pico es la ventana de
  analytics (ver «Analytics lee una VENTANA de historia» en Patrones vigentes): **servicio
  semanal de 8 GB** en Railway. No lo arregles subiendo la máquina. **En producción
  (2026-10-13), con la ventana entera: 7,23 GB de pico y 15,5 minutos** — un 10 % de
  margen, y lo que manda sigue siendo `product_price_bands`. Los módulos de LIC
  (`buyers` incluido) no se pudieron medir: no hay parquets de LIC en local.

**La pasada horaria es `--horario`**: licitaciones publicadas hoy, Compra Ágil de las
últimas 2 h y detalles nuevos. La tarea «horaria» corría `--only-extraer-nuevos`, que sólo
pide el detalle de lo que ya está en la base: lo nuevo entraba una vez al día.

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

**Routers**: tenders (3 rutas), bi (18), compra_agil (1), publico (6), health. Todos anónimos. Los de cuenta (auth, users,
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
«Comandos»), en servicios de Railway aparte de la API.

### Datos

- **PostgreSQL** — sólo lo que se sirve hoy (spec §5.2): `licitaciones` y
  `licitaciones_detalle`, con retención (ver el cron `semanal`), más el esquema `analytics`.
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

Next.js 16 App Router + TypeScript + Tailwind. Componentes propios, y los gráficos también (SVG y cajas de servidor; Recharts salió en octubre de 2026). El estado de
servidor va en TanStack Query (`lib/queries.ts`) y todo el tráfico pasa por `/api/proxy`,
sin sesión — ver las reglas de frontend más arriba. Pantallas: el catálogo de
licitaciones (`/licitaciones`, con su detalle; **los filtros viven en la URL**, `abiertas=1` incluido, así que
una búsqueda es una URL; **entrar sin nada en la URL abre en «Sólo abiertas»** (`filtrosIniciales`), y
una URL con filtros se lee tal cual, así que un enlace, una búsqueda guardada o un RSS no cambian de
sentido; cada licitación es una fila, `FilaLicitacion`, con el cierre en palabras de `cierreEnPalabras`), «Lo mejor de hoy en Compra Ágil» (`/compra-agil`), `/guardados`
y los mercados por rubro (`/mercado`, «Mercados» en la navegación); y lo abierto en `/abierto`,
enlazado como «API y MCP» desde la cabecera; la búsqueda en `/buscar?q=` (ver abajo); y las
notas de datos en `/notas` (ver «Notas de datos»). Las del panel viven en el grupo de rutas
`app/(panel)/`, que sólo les pone el contenedor (abajo) sin aparecer en la URL.

**Una sola cáscara** (`components/cascara/`, spec del rediseño §6.1–§6.2). `app/layout.tsx`
envuelve TODA página en `Cascara` —cabecera, el único `<main id="contenido">` y el pie—, así que
ninguna página ni layout de grupo pinta cabecera, pie, `PieAtribucion` ni `<main>` propios:
`__tests__/legal-enlazado.test.tsx` falla si lo hace. No hay barra lateral (R3).
- **Un contenedor y una escala** (spec `docs/PORTADA_V7_Y_NOTAS_2026-10.md` §4).
  `components/cascara/Contenedor.tsx` (`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8`) lo usan
  la cabecera, el pie, los layouts de `(panel)` y `(publico)`, la portada, los legales, el 404 y
  `error.tsx`: **un solo borde izquierdo**. Ninguna página fija su `max-w-*` ni su relleno lateral;
  las de lectura limitan el texto a `max-w-3xl` **dentro**, alineado a la izquierda, y con la
  clase `lectura` cada párrafo mide como mucho 58ch, ~77 caracteres (`__tests__/medida-lectura.test.ts`;
  eran ~120). `pagina` añade
  el tope: **48 px de la cabecera al `h1` desde `lg`, 24 en móvil**, así que **nada va antes del
  `h1`** (ni antetítulo ni «← volver»; en `/mercado` el selector de rubro va debajo del `h1`).
  `h1` de página: `.page-title` (28/36 px); `h2` de sección: `h2.section-title` (22 px).
  `components/cascara/Seccion.tsx` es LA sección (`mt-8 lg:mt-16`, h2 opcional; `Piezas` la
  re-exporta). Espacios en la escala 4/8/12/16/24/32/48/64. `e2e/escala.spec.ts` mide a 1440 y 390
  el borde izquierdo (marca, `h1`, pie) y la distancia cabecera→`h1` en `/licitaciones`,
  `/productos`, `/acerca`, `/guias` y una guía (la portada sólo el borde).
- **Sin señales de plantilla** (V10): ni antetítulos ni encabezados en mayúsculas (`uppercase`,
  `tracking-wide*`), ni metadatos con punto medio: «Confianza alta, 90 compras», no «· N=90».
  `__tests__/senales-plantilla.test.ts` los busca en todo `app/` y `components/`, comentarios
  incluidos. Se permite `first-letter:uppercase`. Tampoco bordes laterales gruesos de color
  (`border-l-4` en un aviso o una tarjeta, la señal que más marca el detector de `make diseno`);
  la excepción es el filete de las cifras de la portada (`TiraCifras`).
- **Un solo formato de montos: `monto()`** (`lib/formato.ts`; `formatCurrency` lo envuelve): «$825.000»,
  «$7,2 millones», «$1,5 mil millones», «$2,1 billones». Convivían «$825K», «$7,2M», «$1,5B» (en Chile un
  billón es 10¹²) y «$1.000K». `plata` (`lib/publico.ts`) redondea los millones a entero a propósito, para
  las bandas de precio. `/mercado` también pasa por `monto()`.
- **Las Compras Ágiles se pintan con UNA fila**, `FilaCompraAgil`, en la portada (compacta), `/compra-agil`,
  `/buscar` y la ficha del comprador (con `historia`: región, órdenes de la unidad y «Abrir en Mercado
  Público», porque su dato no trae URL).
- **Cifras y fechas en `es-CL`** (`__tests__/formatos-es-cl.test.ts`): ningún `toLocale*String` ni
  `new Intl.*` sin `'es-CL'`, ni un `format` de date-fns con nombres de mes sin `{ locale: es }`
  («29,586» y «16 Oct 26» salían en producción).
- **Campos a 16 px en móvil**: `.input-field` es `text-base sm:text-sm` (Safari amplía la página
  con menos), y un `text-sm` suelto en el campo lo deshace. `__tests__/campos-moviles.test.ts`.
- **La navegación es UNA lista**, `lib/navegacion.ts` (`SECCIONES`, `GUARDADOS`,
  `enlacesAbiertos`, `mapaDelSitio`, `columnasDelPie`, `esSeccionActiva`): de ahí salen la fila de
  escritorio, el menú móvil y las columnas del pie. «Compra Ágil», no «Hoy» (V12). Una sección nueva se añade ahí y en ningún otro sitio;
  `__tests__/navegacion.test.ts` exige que cada ruta interna tenga su página. **El fichero no
  importa nada**: lo leen también los E2E, que no resuelven `@/`.
- **Cabecera y pie son componentes de servidor** con cuatro islas cliente: `EnlaceSeccion` (sección
  activa con `usePathname` y `aria-current`), `MarcoCabecera` (el `<header>`, con un solo
  `onClick` que cierra el menú móvil al pulsar cualquier enlace), `EnlaceGuardados` (contador con
  `useSyncExternalStore` sobre los almacenes de `/guardados`: licitaciones guardadas o postuladas,
  sin repetir, más búsquedas) y `SelectorTema`, en el pie. **El pie** (`PieSitio`, spec PORTADA_V7
  §6): cuatro columnas desde `lg` y dos en móvil —«Sitio», «Abierto», «Sobre el sitio» (con los
  legales, el costo y el contacto) y, sólo con `AUTOR_NOMBRE`, «Lo hace»—; debajo, la cita
  (`PieAtribucion`, ya sin enlaces), «No estamos afiliados al gobierno de Chile.», «Sitio en el
  commit `abc1234`» (sólo con `VERCEL_GIT_COMMIT_SHA`, enlazado si hay repositorio;
  `commitDelSitio` en `lib/repositorio.ts`) y el selector de tema. `__tests__/cabecera.test.tsx` falla si
  otro fichero de `components/cascara/` se vuelve cliente o usa un color crudo.
  **La marca lleva el pájaro del logo** (`PajaroMarca`): SVG de servidor con los trazos de
  `lib/pajaroImagen.ts` (la misma copia que la tarjeta de vista previa) y los tokens invariantes
  `brand-blue` y `brand-teal`. Sustituye a `TordoLogo`, un componente cliente con siete hex que
  entraba en todas las páginas como una isla que el test no veía; por eso el test exige también
  que la cáscara no importe componentes cliente de fuera salvo `SelectorTema`.
  **Lo que importe una isla viaja en TODAS las páginas**: `EnlaceGuardados` arrastró `date-fns`
  (~6 KB gzip) por `useBusquedasGuardadas` → `filtrosCatalogo` → `licitacionEstado`, sólo para
  contar. `normalizeText` y `shortRegion` viven ahora en `lib/nombresChile.ts` (sin imports) y
  `__tests__/isla-guardados-ligera.test.ts` falla si la isla vuelve a alcanzar `date-fns`,
  `recharts`, `axios` o TanStack Query.
- **Los nombres de Mercado Público se escriben con `normalizeText`** (`lib/nombresChile.ts`): llegan
  en MAYÚSCULAS y salen con mayúscula inicial, pero «de», «del», «la», «las», «los», «y», «e», «o»,
  «en», «a», «al», «por», «para» y «con» en minúscula salvo al principio («Policia de Investigaciones de
  Chile»). Un artículo que es parte de una comuna o región la conserva («Municipalidad de Las
  Condes», `LUGARES_CON_ARTICULO`): ante la duda, mayúscula. Las tildes que faltan no se inventan.
  La ficha del comprador y la tabla de compradores del rubro también lo pasan (analytics trae
  los nombres en mayúsculas). `__tests__/nombres-chile.test.ts`.
- **«Código» sólo con `REPOSITORIO_URL`** (`lib/repositorio.ts`), y por eso la cabecera tiene que
  ser de servidor: en un componente cliente la variable no existe y el enlace no saldría nunca.
- **La fila completa aparece desde `lg` (1024 px), no desde 640**: mide ~720 px y en una tableta
  se partía en dos líneas. Por debajo, marca, guardados, «Apoyar» y un `<details>` «Menú» cerrado:
  una línea, sin JavaScript. **Cualquier enlace de la cabecera —menú, marca, guardados, «Apoyar»— lo cierra al pulsarse** (`MarcoCabecera`): la cáscara no se
  desmonta al navegar y el menú quedaba abierto encima de la página nueva. `e2e/cascara.spec.ts`
  mide la cabecera a 320, 390, 768, 1024 y 1440 px (a 320, «Apoyar» queda sólo con el corazón y su nombre accesible) y saca capturas de `/mercado` y `/licitaciones` en
  claro y oscuro.
- **La cabecera no es fija**: así la barra de filtros de `/mercado` (`RubroFilter`, `sticky top-0`)
  se queda arriba al bajar sin quedar tapada.
- **`InfoTooltip` se alcanza con el teclado** (`tabIndex={0}`) y el globo es su descripción
  (`aria-describedby`). Sin texto es un `<button aria-label="Más información">` (un foco sin
  nombre no dice nada) y **Escape le quita el foco**, con lo que cierra el globo; cerrado es `display: none` y no ocupa sitio (con `opacity-0` ensanchaba
  `/mercado` a 390 px), y abierto se corre lo justo para caber en el viewport.
  `e2e/cascara.spec.ts` abre cada tooltip de `/mercado` a 390 px y mide la caja y el ancho del
  documento.

**Las URL del panel son permanentes desde el lanzamiento: no se renombran.** Hasta entonces
colgaban de `/dashboard/*` (`tenders`, `bi`…), y esas URL ya circulan en lectores de RSS,
marcadores y enlaces compartidos. `next.config.js` las redirige con **308** —el buscador
traspasa lo indexado; un 307 la dejaría indexada para siempre— conservando la query, porque
una búsqueda es su URL. `__tests__/redirecciones-panel.test.ts` fija la tabla y
`e2e/redirecciones.spec.ts` que el servidor la aplica. **No vuelvas a crear `app/dashboard/`**:
la redirección corre antes que las páginas y la dejaría muerta.

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
  (`_historia_del_tope`): como top 50, lo trae una sola. El sitio lo dice junto al monto («Hasta $7,2M»
  y «Tope de Compra Ágil» debajo; `NOTA_TOPE` en `lib/compraAgil.ts`), sin repetir la cifra.
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
- **Revalidación desde los cron**: `POST /api/revalidar` con `X-Revalidar-Secreto`
  (`REVALIDAR_SECRETO`, servidor, sin valor por defecto: sin él responde 503) y
  `{"etiquetas": ["analytics" | "compra-agil"]}` → `revalidateTag(tag, 'max')`. Lo llama
  `Revalidador` en `etl/cron.py`. CI construye con un centinela y `check:secreto` lo busca.
- **Qué se indexa vive en un solo sitio**, `services/publico/indexables.py`, con sus umbrales
  y conteos medidos (≈1.039 compradores, 309 rubros y **7.758 productos**: con el precio unitario
  corregido eran 15.452, y la regla de precio de mercado deja la mitad). El resto existe con
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
- **Todo precio dice cuántos compradores tiene detrás y de cuándo** (`comprasDeOrganismos`,
  `frasePrecio`, `notaCompradores` en `lib/publico.ts`): «46 compras de 40 organismos, abr 2025
  – mar 2026 (12 meses)» en la ficha (el periodo en la cabecera), en `/buscar` (en las cifras de la banda, `CifrasBanda`, con el mismo gráfico que la ficha) y en
  el pie de la lectura de la portada. Con p25 y p75 iguales tras `plata`, nunca «entre $X y $X».
- **Un producto se titula como lo escribe quien lo compra** (`nombreProducto`): la
  `descripcion` de su banda con más compras, sin los códigos del principio, en tipo oración si
  venía en mayúsculas y cortada a 80 caracteres; sin una legible, la firma. La firma sigue siendo
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

**`/buscar?q=` (rediseño 5)** — `app/(publico)/buscar/`: una búsqueda, tres respuestas —cuánto
ha pagado el Estado (`/publico/productos?q=` y la ficha del primero), qué está abierto ahora
(licitaciones con el filtro de `urlCatalogoAbiertas` y «Lo mejor de hoy» con `search`) y quién
lo compra (los compradores de esa ficha)—.
- **Componente de servidor y dinámico que pide como el visitante** (`lib/buscarServidor.ts`, sobre
  `pedirAlBackend` de `lib/rssServidor.ts`): hasta cuatro llamadas por búsqueda **cuentan en el
  límite por IP de quien busca**. No va exenta como un renderizado del servidor: una página
  dinámica, generada por visitante y exenta, sería una forma gratis de saltarse el límite.
- **Pocas filas y tiempo máximo**: 3 productos, 5 licitaciones, 3 Compras Ágiles y una ficha;
  6 s por llamada (`TIEMPO_MAXIMO_BLOQUE_MS`). **Un bloque que falla se oculta con una línea**
  —un 429 dice «espera un momento»— y la página nunca lanza por la API. «No encontramos nada»
  sólo si los tres respondieron vacíos.
- **Con menos de 3 caracteres no llama al backend.** El término se recorta a 100 caracteres y 8
  palabras **antes** de llamar (`prepararBusqueda`, `lib/buscar.ts`): Compra Ágil responde 422
  con más, y el recorte vale para los tres bloques y sus enlaces, así que cada total es el de su
  enlace. `MAXIMO_TERMINOS_BUSCAR` y `MAXIMO_CARACTERES_BUSCAR` copian `limites.py`;
  `backend/tests/test_buscar_limites_del_frontend.py` falla si se separan.
- **Todo «ver todos» sale de un ayudante** (`rutaBusquedaProductos`, `urlCatalogoAbiertas`,
  `rutaCompraAgil`, `rutaProducto`), y los parámetros de `/tenders/` se derivan del propio enlace
  (`paramsLicitacionesAbiertas`): el filtro no puede separarse del total.
- **`noindex` por metadatos, fuera del sitemap y NO en `robots.txt`**: un buscador que no rastrea
  la página no ve su `noindex`. El término va en el `<title>` pero no en `og:title` ni en
  `twitter:title`: las tarjetas de vista previa ignoran `noindex`, y quien compartiera una URL
  fabricada controlaría el texto que se ve.
- **La cabecera no lleva buscador** (spec §6.1). Se llega por el formulario de la portada
  (`BuscadorPortada`, un `<form method="get" action="/buscar">`) y por sus ejemplos,
  `EJEMPLOS_BUSQUEDA` en `lib/buscar.ts` (verificados en producción por 0e), enlazados con
  `rutaBuscar`. **Sin `prefetch` en esos enlaces**: cada vista de la portada costaría hasta 24
  llamadas al backend.

**Explicativos (spec D18)** en `frontend/content/explicativos/*.mdx`: contenido estático, sin
JSX. **Toda cifra sale de un dato medido del repo y su fuente se nombra en el frontmatter**
(`fuentes`); no se inventan estadísticas, ni se publican umbrales legales (montos en UTM):
cambian y se remiten a ChileCompra. `__tests__/explicativos-frontmatter.test.ts` fija el
frontmatter, el largo de la `descripcion` (≤ 155), los enlaces internos permitidos y que no
haya `{`/`<` fuera de código (MDX los lee como JSX).

**Favoritos, búsquedas guardadas y RSS (sin cuentas).** Viven en `localStorage`
(`licit_dashboard_collections_v1`, `tordo_busquedas_v1`). Cada búsqueda guardada tiene su feed:
`/rss/licitaciones?<params del catálogo>` y `/rss/compra-agil` son route handlers de Next (la
API sigue siendo sólo JSON) con caché de CDN de 30 min, lista blanca de parámetros, XML
escapado y la cita de la fuente en cada ítem. Llaman al backend **como el visitante**
(`cabecerasHaciaElBackend(ipDelVisitante(...))`), no como renderizado exento.

**La pantalla de analítica (`app/(panel)/mercado/`, servida en `/mercado`) está ordenada por la decisión, no por lo
que el pipeline sabe calcular**: lo nacional (cuánto compra cada sector, `SectorOverview`, en
barras, con la línea de que los contratos de obra del MOP no están en las órdenes) → un rubro: cómo
está el mercado (resumen, panorama y crecimiento) → dónde mirar primero → un comprador en concreto →
herramientas. **Sin rubro en la URL abre en el de más mercados** (`/bi/rubros` viene por frecuencia;
el elegido por defecto no se escribe en la URL): antes abría con tres recuadros vacíos. La
cabecera del rubro la pinta `PanoramaRubro` desde `GET /bi/panorama`, que es una sola
llamada para las cuatro preguntas de mercado. **Ya no hay Recharts en `/mercado`**: sectores y
proveedores son `components/graficos/BarrasHorizontales.tsx` y los meses y años,
`components/graficos/Columnas.tsx`, que siguen la guía de gráficos (`PROPIOS`). Sin «¿Son
confiables?», sin la insignia «excelente», sin «Probabilidad de compra», sin semáforos: la nota
del comprador es «9,2 de 10» y sus tres números al lado.

**La URL de esa pantalla se lee, no sólo se escribe.** `rubro`, `focus` y `compare` se leen
con `useSearchParams` en un inicializador perezoso —dentro de una frontera de `Suspense`,
que `useSearchParams` exige— y se escriben con `replaceState`. Antes sólo se escribían:
compartir el enlace de un rubro abría el rubro por defecto del que lo recibía.

**Sistema de diseño por tokens** en `app/globals.css`, mapeado a Tailwind en
`tailwind.config.js`. Paleta "Iridiscencia", sacada del propio logo — el tordo es un pájaro
negro con tornasol azul-verdoso:

- **navy = estructura**, **teal = acción**, **verde = liberado para significar "bueno"**.
  Antes `--color-accent` y `--color-success` valían el mismo hex, así que "esto es de TORDO"
  y "este número es bueno" eran indistinguibles.
- Ningún hex único sirve en ambos temas, así que cada color de acción tiene **dos paradas
  invertidas por tema** más un `--color-on-*` que dice qué etiqueta va encima.
- **Dos tokens de dato** (`--color-dato`, `--color-dato-tenue`, y `--color-on-dato` encima):
  cada gráfico pinta en `dato` sólo lo que nombra su conclusión y deja el resto en `dato-tenue`,
  que es decorativo (`SIN_PAR`): nunca lleva texto y el valor va escrito al lado. Claro: el azul
  del cuerpo del pájaro; oscuro: el turquesa del ala.
- Tipografía (identidad de octubre de 2026, `docs/IDENTIDAD_Y_PORTADA_2026-10.md` §4,
  `app/layout.tsx`, `next/font/google`, autoalojada): **Archivo** en todo —titulares, cuerpo,
  interfaz y **todas las cifras**—, variable con eje de ancho. **`h1` y `h2` van semiexpandidos
  (`font-stretch: 112.5%`) y en 800** (`font-display`, por la regla base); el resto, a ancho
  normal (`font-sans`). Las dos utilidades fijan ancho y peso en `@layer utilities` de
  `globals.css`, que Tailwind emite después de las suyas: `font-display` le gana a un
  `font-bold`, y un titular **no lleva clase de peso** (salvo que declare que no es titular
  con `font-sans` o `font-mono`). **IBM Plex Mono** sólo para identificadores (códigos de
  licitación, de comprador, ONU; nunca un monto, y nunca en negrita: está cargada en 400 y 500)
  y **Varien** sólo para la marca, junto al pájaro. `.cifra` va sobre Archivo con `tnum`.
  **Nunca `cifra` junto a `font-display`, ni un `style={{ fontFamily }}`**.
  `__tests__/tipografia.test.ts` y `e2e/tipografia.spec.ts`.
- Fondo de página en tema claro: **blanco** (`--color-background` = `--color-surface`); las
  tarjetas se separan por su borde. **`bg-background` sin borde no se distingue en claro**: para
  un relleno tenue (ítem activo, selector, código en línea, *hover*), `bg-surface-elevated`
  (`contraste-wcag.test.ts` lo exige).
- **Sin bandas de color en la portada** (sustituyen a las cuatro `band-1..4` de la landing
  vieja, ya fuera de CSS y de Tailwind): el color se reserva para el dato y la acción.
- Tema claro por defecto, con selector claro/oscuro/sistema en el pie del sitio
  (`components/SelectorTema.tsx`, dentro de `components/cascara/PieSitio.tsx`).

**La portada v7: se busca a la izquierda, se lee a la derecha** (`docs/PORTADA_V7_Y_NOTAS_2026-10.md` §3,
`app/page.tsx` + `components/portada/`): server component sin JS de cliente propio (las islas son
de la cáscara), con ISR de 30 min. **No le pongas `'use client'`**: Next ignora `metadata` en
componentes cliente y la home perdería título y tarjeta de preview.
- **Dos columnas desde `lg`, `11fr / 10fr`** (48 px entre ellas; «opción 2», decidida el
  2026-10-17), dentro de `Contenedor pagina`: a la izquierda «¿Qué le vendes al Estado?», el
  buscador, las dos cifras y la ficha; a la derecha «Lo que dicen los datos» con **dos lecturas
  apiladas**, que empiezan a la altura del `h1`. Así el primer gráfico empieza a ~230 px a 1440
  (con la banda a lo ancho de antes, a 625). Debajo, a lo ancho: la franja de hoy, «Lo mejor de
  hoy» y las notas de datos, cada una con la separación de `Seccion` (`CLASE_SECCION`). Coste
  aceptado: a 1440 queda un hueco de ~220 px bajo la ficha, porque dos lecturas miden más que
  buscador, cifras y ficha; no se rellena con piezas nuevas.
- **En móvil y tableta, una columna: buscador, cifras, lecturas y ficha** (§3.7): la conclusión de
  la primera lectura tiene que quedar sobre el pliegue a 390×844 (`e2e/portada.spec.ts`). Por eso la
  ficha va después de las lecturas en el DOM; desde `lg` la rejilla la pone en la columna
  izquierda (`lg:row-start-3`, bajo las cifras) y las lecturas a la derecha cubriendo las tres filas
  (`lg:row-span-3`). La fila 3 es `1fr`: lo que las lecturas midan de más cae bajo la ficha, no
  entre el buscador y las cifras. **Un solo ejemplar de cada pieza**: nada se pinta dos veces para
  esconder una.
- **El buscador** (`BuscadorPortada`), un `<form method="get" action="/buscar">` que funciona sin
  JavaScript; el `<h1>` es la etiqueta del campo, de 36 px en móvil y 56 desde `lg`, **en dos líneas
  «¿Qué le vendes / al Estado?»**: lo parte el ancho de la columna y `text-balance` (el E2E mide
  dónde cae «al» a 1024 y 1440). Debajo, `SUBTITULO_PORTADA`; el campo dice
  `PLACEHOLDER_BUSCADOR` (no repite los ejemplos) y el botón es `bg-dato text-onDato`. Los ejemplos
  (`EJEMPLOS_BUSQUEDA`, `rutaBuscar` y los límites del campo, todos de `lib/buscar.ts`) están
  **verificados contra producción**: `scripts/verificar-produccion.sh` pide cada uno, espaciados y
  sin bucle, con una copia literal que `__tests__/portada-ayudantes.test.ts` compara. Un ejemplo
  nuevo se verifica antes en producción y nunca es corto ni alfanumérico («pc», «A4»).
- **Las cifras** (`TiraCifras`: cada bloque entero enlaza al catálogo con el filtro que lo cuenta,
  `urlCatalogoAbiertas`) y **la ficha** (`FichaPortada`, §3.5): **Base** —«5,48 millones de órdenes
  de compra, nov 2023 a oct 2026», `baseDeLaFicha` sobre `GET /bi/sector`: la suma de `n_oc` y la
  ventana mínima y máxima, **nunca escrita a mano**; sin analytics, sin `n_oc` en alguna fila o sin
  ventana, la fila no sale—, **Fuente**, **Se actualiza** (`SE_ACTUALIZA`: «El catálogo, 4 veces al
  día de lunes a viernes y una al día el fin de semana. Los precios y los mercados, cada domingo.»,
  que sale de `HORAS_HABILES` y `HORAS_FIN_DE_SEMANA` vía `FRECUENCIA_CATALOGO`; «de lunes a
  viernes» y no «día hábil», porque el cron corre también los festivos) y **Lo hace** («{nombre}, {rol}», sólo con `AUTOR_NOMBRE`, enlazado a
  `AUTOR_URL`; el rol sale de `AUTOR_ROL` y sin ella va el nombre solo). «Se usa» y «Úsalo como quieras» se fueron (V11): la salida a API, MCP y CSV es la de
  la cabecera y el pie.
- **«Lo que dicen los datos»** (`LecturasPortada`): sobre blanco, el `h2` en chico (18 px) con un
  filete de 2 px en `primary` (el navy en claro) debajo. **Dos lecturas como mucho, apiladas en
  todos los anchos**, cada una con conclusión, gráfico y pie, una tras otra y separadas por un
  borde: **las dos primeras disponibles en el orden precio → cierres → nota**
  (`lecturasDeLaPortada`, `MAXIMO_LECTURAS_PORTADA`). Con todo, precio y cierres (la nota sigue en
  «Notas de datos», más abajo); si falta una, entra la nota; con el backend caído, sólo la nota; sin
  ninguna, la sección no sale. `dato` sólo en lo que la
  conclusión nombra; el resto, `dato-tenue`. **Cada frase sale del dato con una regla de
  `lib/lecturasPortada.ts`**, fijada con sus bordes en `__tests__/lecturas-portada.test.ts`, y
  **cada lectura se oculta entera si le falta su dato**.
  - **Precio** (§3.2, `lecturaPrecio` → `precioDeBanda`): «{nombre}: la mitad se pagó entre p25 y
    p75» —o «la mitad se pagó a $X» si P25 y P75 se escriben igual—, y la conclusión es el enlace al
    producto. **El gráfico** (`components/precio/GraficoPrecio.tsx`, geometría en
    `lib/graficoPrecio.ts`, `__tests__/grafico-precio.test.ts`): SVG de servidor y `aria-hidden`,
    escala logarítmica, la franja P25–P75 con su etiqueta directa «la mitad central», la mediana como una
    raya, la línea fina de P10 a P90 («8 de cada 10»), **un punto por comprador en su mediana** (todos los
    de la banda, de `medianas_compradores`, hasta 200; si la API aún no lo trae —`null`, hasta que la
    semanal materialice su tabla— cae a los de `compradores` con la unidad de la banda, que son diez)
    **sólo con `MINIMO_PUNTOS` (5) o más**, y más chicos cuantos más son (`radioPara`: 8, 5 o 3,5 px) —con menos,
    ninguno, y la franja baja a 44 px: dos puntos de 63 compradores se leían como «los compradores» y el
    pie decía «uno de los 1»—, P25 y P75 en negrita y dos valores redondos de contexto en `muted`. **Sin `viewBox`:
    lo horizontal va en % y lo vertical en px**, así que puntos y rótulos no se deforman; si dos
    puntos se tocan (se apilan) o dos rótulos se pisan (se apartan, o se juntan en uno) se decide al
    ancho más estrecho en que se pinta (`ANCHO_REFERENCIA`, 280 px): más ancho, nada empieza a
    pisarse. Con un solo comprador no hay franja (sólo en la ficha de producto: la portada no lo deja
    pasar). Los valores, como texto `sr-only`.
  - **`PRODUCTO_PORTADA` es `{ slug, nombre }`**, escrito a mano y genérico, sin marca: hoy
    «Impresora multifuncional», elegida el 2026-10-16 con el precio corregido y la regla de precio
    de mercado. **Tiene copia literal en `scripts/verificar-produccion.sh`**, que comprueba con una
    sola petición que sigue indexable y pasando el filtro; `portada-ayudantes.test.ts` compara las dos.
  - **El filtro de la banda** (`lecturaPrecio`): ficha indexable; banda de mercado (`de_mercado ===
    true`, que manda la API); unidad declarada; predictibilidad alta o media; `p25 ≥ 1`; `p75 ≥ p25`;
    y periodo legible. **P25 = P75 ya no la oculta** (antes sí): con varios compradores es un precio
    estable, y la frase lo dice. La copia en `verificar-produccion.sh` aplica el mismo filtro: si
    cambia uno, cambia el otro.
  - **Cierres** (§3.3, `lecturaCierres`): «N de cada 10 Compras Ágiles abiertas cierran hoy o
    mañana» y **una barra de diez celdas con tantas en `dato` como esos décimos** (`decimosDe`, el
    mismo redondeo de la frase), y la tabla de los cuatro tramos con hoy y mañana en negrita. Sin
    hora legible del resumen, no sale (su pie dice de cuándo es: «Contadas el … a las …, por día de
    cierre en hora de Chile.», sin el total de abiertas, que la tira dice al lado). Los tramos
    tienen que sumar las abiertas.
  - **La nota** (§3.4, `lecturaNota`): **la más reciente que trae `antes_despues`**
    (`notaDeLaPortada`; si ninguna lo trae, la más reciente), para que tenga gráfico como las
    otras dos; la lista «Notas de datos» sigue con las cuatro últimas en su orden. Con su resumen y su
    `antes_despues` (`components/notas/AntesDespues.tsx`). Es contenido del repo y está siempre:
    entra cuando falta una de las otras dos, y con el backend caído la sección sigue con ella.
- **El pie de método** (`components/metodo/PieDeMetodo.tsx`, V3) va bajo cada lectura —y bajo el
  gráfico de la ficha de producto—: base y periodo en una frase y los enlaces «Cómo se calcula»
  (guía y ancla), «Ver en la API» (`ORIGEN_API_PUBLICA`) y «Código» (`<REPOSITORIO_URL>/blob/main/<ruta>`,
  sólo con repositorio). **Cada método se declara una vez en `lib/metodo.ts` (`METODOS`)** y
  `__tests__/metodo.test.ts` falla si su fichero ya no existe o si la guía o el ancla cambiaron.
  Las anclas son los `id` que `lib/markdown.ts` (`idDeTitulo`) da a cada título de una guía.
- **Cuatro piezas vivas, pedidas en paralelo desde el servidor**, y **cada una se oculta sola si el
  backend falla o si un campo que se pinta viene mal formado**, y además, por principio 4 (una cifra
  viva sin hora no se publica): «Lo mejor de hoy» sin `actualizado_en` legible se oculta; el
  resumen sin hora legible oculta la tira, la franja **y la lectura de cierres**; el producto, sin
  periodo legible. `pedirParaLaPortada(ruta, validador, bloque, cache)` nunca lanza, y la caché la
  elige quien llama:
  - **lo vivo, media hora y etiqueta `compra-agil`** (la revalida el cron frecuente): el resumen
    (`GET /publico/portada`, `pedirResumenPortada`) —la tira, la lectura de cierres y la franja— y
    «Lo mejor de hoy» (`pedirDestacadas`);
  - **lo de analytics, una semana y etiqueta `analytics`** (la revalida el cron semanal): los
    sectores (`GET /bi/sector`, `pedirSectoresPortada`), que ya no son una lectura sino la fila
    «Base» de la ficha, y la ficha del producto (`pedirProductoPortada`). Con `FEATURE_ANALYTICS`
    apagada responden 503: la fila «Base» y la lectura de precio no salen.
- **La franja de hoy** (`FranjaPortada`, `franjaDeLaPortada`): publicadas hoy («612 licitaciones y
  Compras Ágiles»: cuenta las dos), el organismo que más publica (por nombre; truncado con `title`) y «Actualizado el» con el día —la portada se cachea—.
  Con 0 publicadas hoy (cada madrugada) las dos primeras celdas se ocultan y la que queda primera
  no lleva sangría. Sin enlace: el catálogo no filtra por fecha de publicación.
- **«Lo mejor de hoy», compacto** (`pedirDestacadas`, `BloqueHoy`): filas con nombre, comprador,
  cierre y monto; sin puntaje, sin cocientes y sin la historia de la unidad, que vive en
  `/compra-agil`. `Portada` lee la hora una vez y se la pasa al bloque.
  **Su descripción depende de los datos que tiene al lado** (`descripcionDestacadas(historia_disponible
  === true)`, en la portada, en `/compra-agil` y en el RSS): sin historia por unidad el factor
  comprador vale lo mismo para todas y el orden es sólo tiempo y monto, así que no dice «de
  compradores que compran seguido». `DESCRIPCION_DESTACADAS` suelta describe el método
  (metadatos, `/acerca`) y no el estado.
- **Notas de datos** (`NotasPortada`): las cuatro últimas, con fecha y título y «Arreglo en curso»
  donde toque, y «Todas las notas». A la derecha (5/12) **la ficha del autor** (`FichaAutor`, §3.6,
  sólo con `AUTOR_NOMBRE`): quién lo hace, `hola@tordo.cl` y `AUTOR_URL` nombrado por su sitio
  (`nombreDelEnlace`). Sin autor, la lista ocupa el ancho. **La autoría no es el responsable legal**,
  y la portada nunca enseña el `[[hueco]]` de los documentos legales.
- **Ninguna lanza**, tampoco con un 200 mal formado: cada validador mira los campos que su bloque
  lee y su tipo. Con el backend caído la portada sale con el buscador, la ficha, la lectura de la
  nota y las notas (`__tests__/portada.test.tsx`).
- **Sin «Inteligencia»** en la portada, los metadatos (`openGraph` y `twitter` incluidos) ni la
  tarjeta de vista previa (R10): `__tests__/r10-sin-inteligencia.test.ts`.
- `e2e/portada.spec.ts` mide la portada a 320, 390, 1024 y 1440 px sin desborde y la captura en
  claro y oscuro; a 1024 y 1440, el `h1` en dos líneas y las lecturas a la derecha del buscador,
  empezando más arriba que el campo y apiladas en una sola columna; a 1440×900, la primera
  conclusión y el primer gráfico sobre el pliegue; a 390×844, la primera conclusión sobre el
  pliegue. El fixture del E2E trae la lectura de cierres y la de la nota; la de precio se prueba en
  Vitest.

**La ficha de producto** (`/productos/[slug]`) abre con **«Cuánto se pagó»**: el mismo gráfico de
precio, con su pie de método (spec PORTADA_V7 §6), `precioDeBanda` sobre la unidad con más compras,
titulada con `tituloDeBanda`, sin el filtro de la portada —una banda de un solo comprador dice «todas
las compras son de {comprador}»—; debajo, sus cifras (`CifrasBanda`: mediana, la mitad central, 8 de
cada 10 y la base, con la variación en palabras de `textoVariacion`, sin insignias de color). Con más de
una unidad, una tabla (`TablaUnidades`). Ya no hay tarjeta de P10…P90 encima del gráfico: la ficha
decía la mitad central tres veces. Las tablas de las fichas (`TablaEnlaces`) van con filetes y sin caja.

**Acerca** (`/acerca`, `app/(publico)/acerca/`): lo que la portada dejó de explicar —qué es, de
dónde salen los datos, cómo se financia— y las preguntas frecuentes (`PREGUNTAS`, en
`lib/acerca.ts`). Indexable, en `PAGINAS_FIJAS`, enlazada desde el pie junto a las licencias y
el contacto (no es una sección de la navegación). Las preguntas son `<details>` sin caja, entre
filetes, con el `<summary>` de 44 px como mínimo; «Quién lo hace» es su propia sección y sólo sale
con `AUTOR_NOMBRE` (enlaza a `/notas` y, con `REPOSITORIO_URL`, al código).

**Guías** (`/guias`, `/guias/[slug]`): el contenido vive en `frontend/content/explicativos/*.mdx`
(Markdown plano; el test de frontmatter prohíbe `{` y `<`) y se publica en **`/guias/`** — los
enlaces internos ya apuntan ahí. Se renderiza con `lib/markdown.ts`, sin `@next/mdx`: el
contenido no usa JSX y cinco dependencias para eso no valen la pena. Si una guía necesita algo
que el parser no soporta, se amplía el parser con su test. `guias.test.tsx` comprueba que cada
enlace interno de cada guía resuelve. **Cada título lleva un `id`** (`idDeTitulo`: minúsculas, sin
tildes ni signos), que es el ancla de los «Cómo se calcula»: renombrar un título rompe su ancla, y
`metodo.test.ts` lo dice. El texto dice «TORDO» y se sustituye por `APP_NAME` al
pintar.

**Notas de datos** (`/notas`, `/notas/[slug]`, `/rss/notas`; spec `docs/PORTADA_V7_Y_NOTAS_2026-10.md`
§5): hallazgos medidos sobre los datos —qué vimos, cómo lo medimos, qué cambió y lo que todavía no
sabemos—, en `frontend/content/notas/*.mdx`, con el mismo parser que las guías (`lib/notas.ts`
sobre `lib/markdown.ts`). El slug es el nombre del archivo. Estáticas (`generateStaticParams`,
`dynamicParams = false`), indexables (`PAGINAS_FIJAS` y el sitemap, como las guías) y con su feed,
que lee del disco (`content/notas` va en la traza del sitemap y de `/rss/notas`, `next.config.js`).
«Notas» es la última sección de la navegación.
- **Cada cifra cita un fragmento literal del repo.** `fuentes` es una lista de `ruta: «fragmento»`
  y `__tests__/notas-frontmatter.test.ts` comprueba que el fragmento sigue en ese fichero (sin `**`,
  sin `>` de cita y con los espacios colapsados), y que **toda cifra de «En corto» está en algún
  fragmento**. Si corriges una cifra en `CLAUDE.md` o en un doc que una nota cita, corrige la nota
  en el mismo PR. Nada de rutas del scratchpad ni de informes fuera del repo.
- **`estado: arreglado` exige `cambio`**, y `cambio` sólo puede ser un PR de este repo público
  (`…/cris-middleton/tordo/pull/N`). Lo arreglado antes del 2026-10-15 vive en `saas#N`, que no se
  enlaza: esas notas van como `medido` y cuentan el arreglo en el texto, con la fecha del commit.
  `script`, si está, tiene que existir en el repo; se enlaza a `<REPOSITORIO_URL>/blob/main/<ruta>`
  sólo con `REPOSITORIO_URL`, y entonces el cuerpo lleva «Reprodúcelo».
- **Secciones fijas, en orden**: «En corto» (tres viñetas), «Qué vimos», «Cómo lo medimos», «Qué
  cambió», «Lo que todavía no sabemos» y, con `script`, «Reprodúcelo». `antes_despues` se pinta
  justo bajo «Qué cambió» (`components/notas/AntesDespues.tsx`).
- **La firma** («La escribe {nombre}.») sale de `AUTOR_NOMBRE` (`lib/autor.ts`, servidor, en el
  build) y sin ella no hay línea; `AUTOR_URL` (sólo `https://`) enlaza el nombre.
- Ninguna nota nombra a un proveedor persona natural ni promete trabajo que no esté en un PR
  abierto. `voz-textos.test.ts` las revisa enteras.

**Apoyar** (`/apoyar`): tres enlaces, sin integración (spec §4.2), desde variables de
SERVIDOR — `DONAR_MERCADO_PAGO_URL`, `DONAR_GITHUB_SPONSORS_URL` (https) y `DONAR_TRANSFERENCIA`
(texto). **Los datos de transferencia no van en el HTML**: se piden con un clic a
`GET /api/apoyar/transferencia` (`no-store`, `noindex`), y `check:secreto` busca su centinela
en el bundle. Un medio sin variable no se muestra. **Vercel Web Analytics** es el script
oficial, sin dependencia, sólo cuando `VERCEL=1`.

**El costo, por concepto** (`/apoyar#costos`): la tabla sale de `lib/costos.ts`, y **cada cifra
cita un fragmento literal de un documento del repo** (este archivo, `docs/DESPLIEGUE.md`, la spec
del pivote). `__tests__/costos.test.ts` falla si el fragmento deja de estar o no contiene la
cifra: **si corriges un costo en docs/, corrige la tabla en el mismo PR**. Las filas de uso de
Railway son **medidas** (*Usage*, 2026-10-15, `docs/DESPLIEGUE.md` §13.2, con su método y sus
límites: 1,95 días, con los reinicios por OOM y la primera semanal dentro); lo que no tiene
medición se rotula «Estimado» (hoy, el dominio). El total es una **proyección, ~US$30–31**
(`COSTO_MENSUAL_APROXIMADO`), no una factura y no los US$5 de antes: el plan Hobby de Railway
cuesta US$5 e incluye US$5 de uso, así que se paga el mayor de los dos —el uso medido, ~US$9–10—
más Vercel Pro (US$20, desde el 2026-10-20) y el dominio (~US$1). Se repite al cerrar el primer periodo de facturación (2026-11-13). `/acerca`
y `/apoyar` lo leen de ahí (la prosa de `/apoyar` sale de las mismas constantes). «Cuánto cuesta» está en el pie
(columna «Sobre el sitio»). En `/apoyar` los medios de aporte van antes que el costo (con la tabla
delante, el botón quedaba a 3,5 pantallas en un teléfono), y el total sale dos veces: en la entrada
y en la fila «Total». La tabla es una sola en los dos anchos (`components/apoyar/TablaCostos.tsx`):
desde `sm`, tres columnas con filetes y sin caja; por debajo, cada fila pone concepto y monto en una
línea y «Cómo se sabe» debajo, con los roles de tabla explícitos porque cambia su `display`.

**Abierto** (`/abierto`): API, MCP con una fila de instalación por cliente (una lista con filetes;
en rejilla de dos, la quinta caja quedaba sola), CSV y RSS, código y
licencias (código AGPL-3.0 o posterior, `AGPL-3.0-or-later`; lo que el sitio calcula, CC BY 4.0; el catálogo, condiciones de
ChileCompra — los términos §4 y §7 lo dicen igual). **La dirección pública de la API vive sólo en
`lib/abierto.ts`** (`ORIGEN_API_PUBLICA`, test que lo exige): no es `API_URL`, que es a dónde
habla el proxy. **La URL del MCP se publica siempre con barra final.** Las cuatro herramientas
están copiadas a mano y `backend/tests/test_mcp.py` las compara con el `tools/list` real.
«Código» sólo aparece con `REPOSITORIO_URL` (servidor, en el build, sólo `https://`;
`lib/repositorio.ts`). **Sin botones ni *badges* de terceros**: meterían peticiones que la
política de privacidad no declara; el E2E (`e2e/abierto.spec.ts`) falla si el navegador pide algo
fuera del sitio.

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
- **Sin cuentas.** Lo que había aquí sobre sesión (JWT, refresco con rotación, Google,
  verificación de correo), claves de API, alertas y notificaciones, informe semanal,
  vigilancia de precios, encaje precomputado y planes se fue con el pivote público. Está en
  la historia de git (antes de `3d73beca994e_retirar_cuentas`) si alguna vez vuelve.
- **Exportar es la misma consulta en CSV.** `/bi/exportar/*` devuelve el mismo análisis que
  la pantalla, sin sesión ni cuota desde el pivote público. El archivo va
  **con BOM y separador `;`**: sin BOM Excel en Windows parte las tildes, y con coma Excel en
  configuración regional chilena mete todo en una columna. Un CSV que se abre mal no es un
  entregable, y son dos detalles que un refactor bienintencionado rompe sin que falle nada.
  **La primera línea es la cita de la fuente** y los encabezados van en la segunda (abajo).
  **Un texto que empieza por `=`, `+`, `-` o `@` sale con un apóstrofo delante**
  (`exportar.INICIO_DE_FORMULA`): Excel lo leía como fórmula, y hay ~1.000 descripciones de
  producto que empiezan por «-». La fecha del nombre del archivo es la de Chile.
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
- **BI**: batch en Polars → tablas materializadas en `analytics.*` → consulta con filtros
  empujados a SQL → fallback jerárquico **L0→L0N→L1→L2→L3→L4** con dispersión y tamaño de
  muestra. Hay un golden master (`backend/tests/golden/`) que fija
  el contrato: **cualquier cambio a `services/bi/` tiene que pasarlo**, y corre en CI.
  Si cambias los datos del fixture, recaptura con
  `python tests/golden/capturar_golden_bi.py --desde-golden` — **sin `--desde-golden` el
  script redescubre los casos muestreando los datos** y sobre el fixture recortado produce
  otros distintos (la primera vez pasó de 31 casos a 7).
- **Las personas naturales no salen en ninguna salida de analytics** (spec del pivote §8,
  `etl/analytics/personas.py`). Un proveedor con RUT bajo 50.000.000 es una persona; el RUT
  del proveedor es `RutSucursal` en las OC masivas y `RutProveedor` en LIC.
  - **Se enmascara al LEER, en `data_loader`**, que es el único camino hacia los parquets
    consolidados. Así ninguna columna derivada —`top_proveedor`, la `descripcion` de las
    bandas L0, el índice TF-IDF del harness— puede olvidarlo, incluida la
    próxima que se escriba. **No leas un consolidado con `pl.read_parquet` por tu cuenta.**
  - **Por código y con toda la historia que hay en disco** (en producción, los 39 meses que
    guarda R2: ver el cron `semanal`): un código es persona si cualquiera de sus RUT
    está bajo el umbral **o si no tiene ninguno legible** (66 de 55.297 en los datos locales;
    hay personas con `RutSucursal = "NA"`). Tapar alguna SpA de más es el error barato.
  - **Seudónimo, no un código único.** Colapsarlas en uno las sumaría en un proveedor gigante
    y el HHI mentiría. `PN-` + HMAC-SHA256 con una sal **del proceso** que no se guarda:
    estable dentro de la corrida, distinto entre corridas, irreversible. `run_all --modulo X`
    suelto da seudónimos distintos de los del resto; el cron semanal corre todo en un proceso.
  - Se tapan nombre, código, RUT, `CodigoSucursal`, `Sucursal` y `EspecificacionProveedor`, y
    se borra el nombre de la persona del **texto libre del comprador en sus propias filas**
    (`EspecificacionComprador`, `Nombre`, `Descripcion`). Límite: una mención en una fila
    ajena no se detecta.
  - `etl/tests/test_personas_naturales.py` pasa una persona conocida por `run_all` entero y la
    busca en **cada** archivo de salida, joblib y npz incluidos. Sin el enmascarado aparece en
    once.
  - **El catálogo se limpia al ENTRAR, no al servir** (`personas.enmascarar_payload`). Todo
    payload de la API —listado y detalle de licitaciones, Compra Ágil— pasa por él en el
    transformador o en el loader, y de ahí salen `items`, `informacion_adicional`, el hash del
    detalle y `proveedor_adjudicado`. Lo que la base
    no tiene, ninguna ruta ni ningún `select *` lo puede filtrar (Ley 21.719: minimizar lo
    que se conserva). La forma de esos payloads no está verificada contra producción, así que
    no busca rutas: recorre el JSON y reconoce al proveedor por el **nombre de la clave**
    (`Rut*`/`Nombre*`/`RazonSocial` con «proveedor», «oferente», «sucursal»…, o dentro de
    `Participantes`, `Adjudicacion`, cotizaciones). El lado del comprador no se toca.
    **Si añades una fuente de la API, pásala por ahí antes de guardar nada.**
  - **El detalle ya no trae `datos_completos` ni `participantes`**: eran el payload crudo y la
    lista de oferentes, y nada los usaba (`docs/API_PUBLICA.md`). Desde el paso 7 tampoco se
    guardan.
  - `proveedor_adjudicado` nombra a las empresas, «NOMBRE (RUT)», y añade «Persona natural»
    una vez si ganó alguna — sin contar cuántas: en un payload ya limpio no se distinguen,
    y el texto tiene que salir igual del crudo que del guardado.
  - La migración `6e47ba0cd7c9` limpió lo ya guardado con una **copia congelada** de la regla;
    `etl/tests/test_migracion_personas_catalogo.py` fija que la copia y la viva coinciden.
- **`analytics.compra_agil_mensual`**: Compras Ágiles publicadas y adjudicadas por comprador y
  mes (spec del pivote §6.2). Dos fuentes, porque ninguna tiene las dos cifras:
  - **`adjudicadas / publicadas` NO es una tasa: son dos conteos de cosas distintas**, en
    meses que no se corresponden (la orden sale días después de publicar): en los bordes de
    mes el cociente se desplaza y puede pasar de 1. Lo dicen también los `COMMENT ON COLUMN`
    de la tabla (`TablaAnalytics.comentarios`).
  - `adjudicadas` sale de las OC masivas (`EsCompraAgil = "Si"`) y **cuenta ÓRDENES**, fechadas
    por la orden. Ningún campo enlaza la orden con su Compra Ágil (`CodigoLicitacion` va
    vacío); el texto sí, a veces: el `Nombre` de sistema («…generada por invitación a compra
    ágil: 1510-140-COT24») en el 37,9 % y algún código `-COT` en el texto libre del 78,2 %.
    Donde se enlaza, **1 Compra Ágil → 1 orden en el 99,996 %**: contar órdenes es contar
    adjudicadas; lo que falla es el mes. Sin las canceladas.
  - `publicadas` sale de `licitaciones` (lo que ingiere el ETL), que guarda 30 días y nunca
    purga el mes anterior (`etl/retencion.py`): **se
    acumula**, quedándose cada semana con el máximo por (comprador, mes) entre la tabla
    anterior y lo que se ve ahora. No hay historia previa: se llena desde el despliegue.
  - La Compra Ágil ingerida trae el RUT del comprador, no su código: se traduce con las OC
    (`RutUnidadCompra` → `CodigoOrganismoPublico`, el más frecuente). Lo que no se traduce
    cuenta igual, con código nulo.
- **«Abierta» tiene una sola definición: `esta_abierta()`** (`repositories/licitaciones.py`):
  publicada y con cierre futuro o sin cierre, siempre sobre `activo`. La usan el orden del
  catálogo, el filtro `abiertas` de `GET /tenders/` (`/licitaciones?abiertas=1`), la cuenta de
  `GET /publico/portada` (`contar_abiertas`: «no Compra Ágil» y Compra Ágil) y las candidatas
  de «Lo mejor de hoy». **`estado=Publicada` no es lo mismo**: no mira el cierre.
  `tests/test_licitaciones_abiertas.py` fija que la cuenta y el listado dan el mismo total; el
  enlace de cada cifra sale de `urlCatalogoAbiertas` (`lib/filtrosCatalogo.ts`), no se escribe
  a mano. `contar_abiertas` reparte además las Compras Ágiles abiertas por **día de Chile** de
  cierre (hoy, mañana, 2–3 días, después; sin cierre = después) en la misma pasada, con los
  bordes de `inicio_del_dia()`: los cuatro suman `compra_agil_abiertas`. «Publicadas hoy» y
  «más publica hoy» (`publicadas_del_dia`) son otra consulta —una publicada hoy puede haber
  cerrado ya— y agrupan por `nombre_organismo` normalizado, porque la Compra Ágil no trae
  código (`tests/test_portada_hoy.py`, con un instante fijo de noche).
- **Todo orden con `LIMIT` u `OFFSET` termina en un criterio único.** Sin él, dos filas
  empatadas salen en cualquier orden y la paginación del catálogo repetía una licitación y se
  saltaba otra (el ETL carga en lote: muchas comparten fecha al segundo). `GET /tenders/`
  desempata por `Licitacion.id` en el sentido de la columna (`tests/test_catalogo_desempate.py`,
  60 filas idénticas recorridas de 7 en 7 en cada orden); «Lo mejor de hoy», por
  `codigo_externo`. **Las tablas de analytics no tienen clave única**: `sql_consulta` y
  `sql_busqueda_texto` terminan en `ctid` (`_analytics_sql.DESEMPATE`), la fila física, que no
  cambia mientras la tabla no se reescriba —el pipeline la reemplaza entera cada semana—.
- **Analytics lee una VENTANA de historia, no toda** (`data_loader.VENTANA_ANALYTICS_MESES` = 36;
  las bandas de precio por producto, `VENTANA_BANDAS_PRECIO_MESES` = 12). Medido: **cada**
  módulo sube de RAM con los meses de historia —de 0,04 GB/mes (clustering, hoy retirado) a
  0,5 GB/mes (`product_prices`)—, así que con años en R2 el semanal no cabría en ninguna máquina. Con la
  ventana, el pico proyectado es ~6,3 GB (las bandas, a 12 meses): **servicio semanal de 8 GB**.
  Y es lo correcto en producto: precios o cuotas de hace años describen otro mercado.
  - **Se ancla en el período más reciente de los DATOS, no en hoy**: si ChileCompra se atrasa,
    la ventana se queda con los datos en vez de irse vaciando. `max_date` (harness) la ancla ahí.
  - Se salta por nombre los archivos anteriores (una orden está en el archivo de su mes de
    envío, nunca en uno anterior a su creación) y filtra las filas por `FechaCreacion`.
  - **Las tablas que la llevan lo publican**: `ventana_desde`/`ventana_hasta` en las bandas,
    `price_bands`, `competitors_by_market`, `market_concentration` y `sector_dashboard`, y
    `periodo` en la API de precio, de competidores y en la ficha pública de producto. Una cifra
    sin periodo se lee como «de siempre».
  - **Un año es completo si la ventana lo cubre de enero a diciembre** (`temporal.anios_completos`,
    con la ventana de `competitors_by_market`; sin ella, si la serie trae los doce meses). Antes
    bastaba con que tuviera diciembre, y como la ventana empieza a mitad de año (noviembre de
    2023, p. ej.) el primer año entraba al CAGR con dos meses: un rubro plano salía creciendo un
    ~145 % al año. El CAGR del rubro se calcula en un solo sitio
    (`_compute_cagr_rubro_desde_time_series`), para `/bi/tendencia` y `/bi/resumen`, y el
    tamaño del panorama usa la misma regla (`tests/test_bi_anios_completos.py`).
  - **Los textos del sitio dicen el número de meses con constantes, no a mano**:
    `MESES_ANALISIS`, `MESES_PRECIOS` y `MESES_COMPRA_AGIL` en `frontend/lib/periodo.ts` son copias
    de `VENTANA_ANALYTICS_MESES`, `VENTANA_BANDAS_PRECIO_MESES` y `VENTANA_COMPRA_AGIL_MESES`, y
    `etl/tests/test_ventanas_del_frontend.py` falla si se separan. Las usan el subtítulo y la
    descripción de la portada, `/acerca`, la ficha del comprador y la del rubro. Las «Publicadas» de
    Compra Ágil se rotulan «Publicadas desde oct 2026» mientras la ventana de 6 meses incluya meses
    sin recoger (`etiquetaPublicadas`).
  - **Sin ventana, a propósito**: el harness de evaluación (`meses=None`) y `tfidf_matcher`,
    cuyos splits fija el harness —cambiar su historia es cambiar el modelo.
  - `MIN_YEAR` ya no filtra: queda sólo como origen del índice temporal de `trend_analysis`.
    La descarga masiva sigue guardando TODA la historia en R2, que es barato.
  - `etl/tests/test_ventana_analytics.py` lo fija con cuatro años sintéticos: con los datos
    locales (6 meses) la ventana no recorta nada.
- **`CodigoProveedor` NO es un RUT.** Es el identificador interno de Mercado Público: de
  los 4.204.598 registros de `competitors_by_market`, **cero** llevan guion. La traducción
  RUT → código sale de las OC masivas, que traen los dos (`RutSucursal` y `CodigoProveedor`;
  la tabla `ordenes_compra` que también los tenía se fue en el paso 7). «Tu posición» comparaba el RUT normalizado contra esa columna y **no
  coincidía nunca**; esa pantalla se retiró con las cuentas, pero el dato sigue siendo así.
- **El monto en pesos de una orden se sanea al LEER, en un solo sitio**
  (`data_loader.con_monto_saneado`, que `iter_oc_parquets` aplica antes de
  `con_monto_por_linea`): todo módulo lo hereda. ChileCompra pasa a pesos multiplicando
  `MontoTotalOC` por la UF o la UTM, y hay órdenes marcadas «CLF» o «UTM» con el monto ya en
  pesos: 233,5 millones de pesos de un municipio salían como **$15,7 billones**. Medido el
  2026-10-16 sobre la descarga masiva de los 36 meses de la ventana de producción: Municipalidades
  sumaba ~$14 billones al año contra $4,15 de la cifra oficial de ChileCompra 2025, Obras Públicas
  5,7 contra 3,1 y el total 31,7 contra 20,7. Dos reglas:
  - **(a) Orden en otra moneda con TODOS sus ítems en pesos (`monedaItem`) → vale
    `MontoTotalOC`.** Es la que más pesa: 144 órdenes en 36 meses pasaban de $34 billones a $553
    millones. Costo medido: pólizas de verdad en UF con el ítem marcado en pesos se quedan en unos
    pesos (~$1.000 millones en 36 meses).
  - **(b) Orden en UF o UTM sobre `UMBRAL_PESOS_ORDEN_INDEXADA` ($120.000 millones, ≈ 3 M UF) →
    monto nulo** (la orden cuenta, pero no suma) y un WARNING con código, organismo y monto para
    auditarla. Por encima hay cinco órdenes en 36 meses, todas imposibles. **El umbral de partida
    era 1 M UF y se subió a propósito**: entre 1 y 3 M UF hay cuatro contratos que parecen
    legítimos (pago de pensiones, la red de comunicaciones de salud, el sistema de
    identificación: $314 mil millones) y dos imposibles ($129 mil millones), que se quedan.
  - Con las dos, 2025 cuadra con la cifra oficial: Salud 6,64 (6,56), Gob. Central 5,70 (5,65),
    Municipalidades 4,28 (4,15). **Obras Públicas queda en 0,75 contra 3,09** porque la descarga
    masiva de órdenes no trae los contratos de obra del MOP. De las 920 licitaciones de obra del
    MOP (tipos O1 y O2) adjudicadas en 2025, por $2,60 billones, sólo el 3 % tiene alguna orden en
    los 36 meses; las de obra de MINVU y los SERVIU, el 84 %, y las demás del MOP, el 95 %.
    ChileCompra sí cuenta esas obras: su Cuenta Pública 2026 pone la Ruta 7 de Aysén (US$76
    millones) entre las «órdenes de compra relevantes 2025», y su licitación, la 5048-69-O123,
    adjudicada por $69.900 millones, no tiene orden en la descarga. Sumando lo adjudicado sin
    orden, $2,54 billones, 2025 da 3,29 contra 3,09. Es una diferencia de cobertura de la fuente:
    lo que la descarga trae de Obras Públicas son MINVU, los SERVIU y las compras corrientes del
    MOP. Lo mide `etl/scripts/medir_obras_mop.py`, que baja la descarga pública y hace el cruce.
  - Comparar el total con la suma de las líneas no distingue nada: las imposibles cuadran igual
    (33.047 de 34.912 órdenes en UF o UTM). Un tope por tipo de licitación (LE ≤ 1.000 UTM…)
    atrapa casi sólo lo que ya atrapa (a).
  - `sector_dashboard` **no cuenta las canceladas** (`compra_agil_mensual.ESTADOS_CANCELADOS`,
    la misma tupla, importada). Los demás módulos que suman montos todavía sí.
  - Lo fija `etl/tests/test_monto_saneado.py`, con los casos reales en órdenes sintéticas. El
    cruce de Obras Públicas, `etl/tests/test_medir_obras_mop.py`.
- **`competitors_by_market` tiene una fila por *(organismo, rubro, proveedor)*.** Cualquier
  métrica de rubro **agrega por proveedor primero**. Contar filas decía 128.462 proveedores
  donde hay 77.720, y tomar una fila suelta como representativa daba tres «líderes del
  rubro» con 99,9 %, 99,9 % y 99,0 %… cada uno de un comprador distinto. Lo fija
  `tests/test_bi_metricas.py`, con un mercado de juguete donde el error se ve.
  - **Se agrega en Postgres** (`_base._agregado` y `_totales`, sobre `sql_agregado` y
    `sql_totales`): los grupos de más monto con tope, y los totales con la suma de los
    cuadrados para el HHI. El panorama, el resumen y los competidores de un organismo traían
    todas las filas del rubro a la API (512 MB) para devolver diez; `/mercado` con un rubro, tres
    veces. `tests/test_bi_agregado_sql.py` compara el SQL con el cálculo de Polars de antes.
  - **Sin rubro, `/bi/competidores/{org}` y el panel de una licitación agregan sobre TODO lo que
    compra el organismo**: cuota sobre su monto total, `rank_monto` el puesto en ese total y una
    sola entrada de `concentracion`, sin rubro. Antes se ordenaban las filas del organismo por
    `rank_monto` y salían los n.º 1 de cinco rubros cualesquiera, cada uno con la cuota de su
    rubro. La licitación no trae `RubroN2` (sale de las órdenes), por eso el panel va sin rubro.
  - **`rank_monto` se rankea con `method="min"`** (dos empatados en el 2.º son 2.º). Con el
    `average` de Polars salía 2,5, la columna era Float64 y `Competidor.rank_monto: int`
    devolvía 500; el esquema trunca los decimales de las tablas materializadas antes.
- **La identidad de una entidad es su CÓDIGO. El nombre nunca va en la clave de agrupación**
  (`etl/analytics/identidad.py`). En el histórico de ChileCompra **145 de 1.186 compradores
  (12,2 %) aparecen con más de un nombre** —los cambios de 2021 dejaron a la misma repartición
  como «GOBERNACION PROVINCIAL DE …» y «DELEGACIÓN PRESIDENCIAL PROVINCIAL DE …»— y cuatro
  módulos agrupaban por *(código, nombre, rubro)*. Eso partía un mercado real en varios de
  mentira: 7 de 11 tablas materializadas tenían su clave natural duplicada. El nombre se
  arrastra con `nombre_vigente()`, que se queda con el **más reciente** — un organismo
  renombrado debe salir con su nombre de hoy, y el más frecuente sería siempre el viejo.
- **El HHI tiene una invariante aritmética: con *n* proveedores no puede bajar de 10.000/*n*,
  y la cuota del líder no puede quedar por debajo de 100/*n*.** Las dos se violaban a la vez
  —13,6 % y 98,7 % de las filas— y por separado cada número parecía razonable. De 5.675
  mercados de **un solo proveedor**, 2.700 salían etiquetados en el tramo más abierto del
  índice: un monopolio ofrecido como el mercado con más espacio para entrar. Causas: el
  nombre en la clave, y `top_share_pct` ordenando `rank_monto` al revés, con lo que devolvía
  la cuota del proveedor **más chico** mientras `top_proveedor` traía el nombre del mayor.
  `compute_market_concentration` avisa por log si vuelven a aparecer.
- **Un componente sin dato vale el neutro DE SU ESCALA, no 0,5.** En `opportunity_scorer` los
  cuatro se rellenaban con 0,5; `score_tendencia_raw` es `cagr × r²` y vive en [-0,5; 1,0] con
  mediana 0,0008, así que un mercado sin histórico entraba en el **percentil 98,5** de
  crecimiento. La tabla de neutros es `NEUTRO_POR_COMPONENTE` y un componente nuevo sin
  entrada hace fallar el test.
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
- **`app/core/__init__.py` está vacío a propósito**, por lo mismo que `app/api/__init__.py`:
  re-exportaba nombres de un módulo de seguridad (hoy borrado), así que `from app.core.tiempo
  import ...` arrastraba los modelos de cuenta y cerraba un ciclo.
- **No existe ninguna fecha de pago en el dato de ChileCompra.** `mediana_dias_pago` medía
  `FechaEnvio → FechaAceptacion` —lo que tarda el **proveedor** en aceptar la orden, mediana
  real 1,63 días— y el producto lo publicaba como plazo de pago en la pantalla, en el correo
  y en la landing. Se renombró a `*_aceptacion` en todas partes y **no se muestra como cifra
  suelta**: sólo como bandera cuando se sale de rango. Lo que sí sale del dato y decide algo
  es `tasa_adjudicacion` (cuánto de lo que llama termina adjudicando). `Forma de Pago`
  tampoco sirve de sustituto: el 98,7 % de las órdenes dice lo mismo.
  **La landing fue el último sitio en soltarla**, y estuvo meses prometiéndola después de que
  el correo y el panel del comprador ya la hubieran retirado: `MockupAviso` mostraba «Paga a
  32 días en promedio» y `MockupComprador` un KPI «Paga a». Cuando se retire un dato, hay que
  buscarlo también en la portada (`components/portada/`) y en las guías — es lo que lee quien
  llega por primera vez.
- **Estado hábil (retirado con las cuentas): la API pública no dice si una empresa está
  hábil, ni por qué no lo estaría.** Contrastado en vivo (2026-09-24): `BuscarProveedor` sólo
  responde si el RUT figura en el Registro de Proveedores —y sólo lo encuentra **con puntos**,
  `76.286.670-6`—; «no inscrito» llega como 500 con `Codigo 10200`. Las causas de
  inhabilidad sólo las ve el proveedor en su ficha. Si la feature vuelve, empieza aquí.
- **El tramo bajo del HHI se llama `fragmentado`, no `competitivo`.** El eje que mide el HHI
  es la concentración; «competitivo» se lee al revés de lo que significa. Convivían las dos
  palabras —el ETL una, los servicios otra— y el usuario veía dos nombres para el mismo
  mercado en la misma pantalla. Los cortes 1.500 / 2.500 son los de las guías DOJ/FTC y no
  se mueven por intuición. `market_concentration` se re-materializa una vez por semana, así
  que el frontend **mapea también la palabra vieja** hasta esa corrida.
- **El precio se agrupa por PRODUCTO, no por categoría del catálogo.**
  `codigoProductoONU` es una categoría UNSPSC: medido sobre datos reales, una sola
  categoría en un solo hospital y un solo mes contiene artículos que difieren en cinco
  órdenes de magnitud (un calibrador a $557.062 y un criovial a $1 bajo «Reactivos»).
  Los niveles L0/L0N agrupan por la **firma** de `EspecificacionComprador`
  (`etl/analytics/normalizacion.py`) y dan una banda mucho más estrecha. Medido el
  2026-10-16 (seis meses locales, ventana de 12): **QCD mediano 0,00 en L0, 0,012 en L0N
  y 0,27 en L1**; más de la mitad de las bandas L0 tiene p25 = p75 (un comprador repite el
  precio de su contrato). Lo de L0N engaña por lo mismo: el 58 % de sus bandas es de un solo
  comprador (QCD mediano 0,00); **entre las de mercado (≥ 3 compradores, ninguno sobre la
  mitad) el QCD mediano es 0,12**. L0 cubre el 17–32 % de los ítems (de 1 a 6 meses); del resto
  sigue encargándose L1.
  - **L0 no sirve para listar quién compra un producto**: pide 3 compras por organismo, y un
    producto que compran muchos organismos pocas veces se queda sin casi ninguno. Para eso está
    `product_price_compradores` (ver «Quién lo compra» en las páginas públicas).
  - **El precio unitario es `precioNeto`, tal cual** (`extract_unit_prices`). En las OC
    masivas ya es el precio de una unidad: `precioNeto × cantidad = totalLineaNeto` (±1 %)
    en el 99,98 % de las líneas en pesos. Hasta el 2026-10-16 se dividía otra vez por la
    cantidad, desde el primer commit de analytics, y todas las bandas publicadas eran el
    precio repartido entre las unidades de la orden: «papel higiénico jumbo», a $16.850
    el paquete, salía «entre $843 y $2.106». **Entra sólo la línea en pesos
    (`monedaItem = CLP`; el 0,56 % viene en UF, dólares, UTM o euros) y que cuadra con su
    total** (fuera el 0,018 %: descuentos y cargos de línea). Lo fija
    `etl/tests/test_precio_unitario.py`. Las cifras anteriores de este apartado (QCD
    0,21–0,26 contra 0,57–0,59, cobertura 22–29 %) se midieron con el error.
  - **La firma ordena los tokens y quita cualquiera que contenga un dígito.** Lo primero
    porque el orden de las palabras no cambia el producto; lo segundo porque en los datos
    reales los alfanuméricos son códigos de orden y de guía, y cada uno parte el producto
    en un grupo de una observación. Se pierde el gramaje: es el precio a pagar, medido.
  - **La regla de la firma vive en `backend/app/utils/firma.py`** (Python puro) y el ETL la
    importa por `etl/shared_imports.py` — **no se copia**. La usa también la búsqueda de
    productos (`/publico/productos?q=`, `terminos_de_busqueda`): el término pasa por la misma
    regla, así que «guantes de nitrilo» encuentra `guantes nitrilo talla`, y cada palabra se
    busca al comienzo de una palabra del slug («mesa» no encuentra «parmesano»). Un término sin
    ninguna palabra útil («de la», «pc») da `[]`. `etl/tests/test_normalizacion_precio.py`
    fija la firma byte a byte y que la regla de Python y la de Polars coinciden.
    **Cambiar `RUIDO` cambia firmas, slugs de páginas públicas y búsquedas a la vez.**
  - **La dispersión se mide con QCD, no con CV.** Sobre precios con cola larga la
    desviación estándar mide el outlier que sobrevivió a Tukey, no el mercado.
  - **`predictibilidad` (alta|media|baja) es producto, no diagnóstico interno.** Una banda
    muy dispersa dice que por lo mismo se pagaron precios muy distintos —el dato no dice por
    qué—, y decirlo vale más que inventar un número con aspecto de respuesta. Con el precio
    corregido es «alta» el 82 % de las bandas L0N (antes el 33 %) y el 48 % de las L1 (antes
    el 22 %); «baja», el 8 % y el 34 %. **Los cortes (`QCD_ALTA` 0,25, `QCD_MEDIA` 0,45) son
    absolutos y se quedan**: desde saas#72 se definen por p75/p25 ≤ 1,67 y ≤ 2,6, no por
    percentiles de la distribución, así que el error de precio no los descalibró. El 82 % lo
    infla el comprador único (89 % «alta» entre esas bandas); **entre las de mercado: 70 %
    alta, 18 % media, 12 % baja** — los cortes siguen separando.
  - **Deflactar por inflación: medido con el error de precio unitario, pendiente de
    re-medir.** La medición decía que el CV dentro de un solo mes (0,83–0,88) era el mismo
    que mezclando 2016–2026 (0,88). Con el precio corregido, el CV mediano dentro de un mes
    es 0,51–0,54 en L1 y 0,04–0,08 en L0N; la comparación con la década necesita una
    historia que la copia local no tiene (seis meses). Hasta re-medirla, la conclusión no
    vale.
- **Mecanismo de compra: `tipo_convocatoria`** (`app/models/convocatoria.py`, importado por el
  ETL a través de `etl/shared_imports.py` — **no se copia**). El modelo daba por hecho que todo
  lo ingerido era una licitación; Compra Ágil y Convenio Marco son cerca de la mitad del
  mercado chileno.
  - **Convenio Marco sólo se ve por la orden de compra.** La API de Mercado Público no le da
    endpoint propio: las compras por catálogo llegan como órdenes con `Tipo=9` (§3.1 del
    diccionario de datos oficial). `convocatoria_de_orden` traduce el código; desde el paso 7
    no hay tabla de órdenes en Postgres, así que lo que lo necesite lo lee de las OC masivas.
  - Los tipos `1` (Automática) y `8` (Sin emisión automática) describen **cómo se emitió** la
    orden, no por qué mecanismo se compró: quedan en `NULL` a propósito.
  - **Compra Ágil NO está en la API clásica.** Tiene su propia API (`api2.mercadopublico.cl`,
    v2, ticket por cabecera) — ver `etl/extractors/compra_agil.py`.
  - Un filtro con un mecanismo desconocido devuelve **422**, no el catálogo entero: ignorarlo
    haría creer que no hay compras de ese tipo.
- **Límite por IP en memoria, sobre `/api/v1/*` y `/mcp`** (`app/core/limite_ip.py`).
  `LIMITE_POR_MINUTO` (60), ventana fija de un minuto, `X-RateLimit-*` **también al dejar
  pasar** y 429 con `Retry-After`. No cuenta `/health`, `/docs`, `/openapi.json` ni `/`.
  - **En memoria exige UN worker**: con `WEB_CONCURRENCY=N` cada proceso lleva sus
    contadores y el límite real es N×. Avisa al arrancar si lo ve.
  - **La memoria está acotada**: al cambiar de minuto se tira el diccionario entero, y hay
    techo de 50.000 IP por minuto; pasado, una IP nueva entra sin contarse (no se desaloja a
    las que ya se cuentan, que son las que más piden).
  - **De dónde sale la IP — el modelo de confianza.** `request.client.host` detrás de
    Railway es el balanceador: contar por él metía a todo internet en un cubo. En orden:
    (1) con `X-Tordo-Proxy` == `PROXY_SECRETO` (tiempo constante), la IP de
    `X-Tordo-Visitante`, y **sin ella la petición va exenta** — es un renderizado del
    servidor de Next, y contarlo estrangularía al sitio desde las IP compartidas de Vercel;
    (2) con `CONFIAR_X_FORWARDED_FOR=true`, la **primera** entrada de `X-Forwarded-For`, que
    sólo es de fiar porque el borde de Railway descarta la del cliente (medido por su
    comunidad; **verificarlo al desplegar** con una cabecera inventada); (3) la conexión.
    Sin `PROXY_SECRETO` no se exime ni se cree a nadie: falla cerrada para la confianza,
    abierta para la disponibilidad.
  - IPv6 cuenta por /64. Uvicorn arranca con `--no-proxy-headers`: la regla es una sola.
  - Las capas por clave de API y por cuota diaria se fueron con las cuentas.
  - **Las exentas van en fila** (`MAX_EXENTAS_A_LA_VEZ` = 4): una ficha ISR se genera con el
    slug que trae la URL, así que mil slugs inventados eran mil consultas que el límite no
    contaba. No se rechazan (un error no se cachea): esperan turno.
- **Endurecimiento de toda petición** (`app/core/endurecimiento.py`, el middleware más
  externo): cuerpo de 64 KB como mucho (413; lo único que recibe cuerpo es el MCP, cuyo SDK lo
  lee entero en memoria), ningún `%00` en ruta ni query (422: Postgres no admite el carácter 0
  y salía 500), y `nosniff`, `no-referrer` y `X-Frame-Options: DENY` en toda respuesta. Un
  `X-Request-ID` de fuera sólo se respeta si es `[A-Za-z0-9-]{1,64}`. `/health/ready` no
  devuelve el texto del error de la base, y un 500 lleva `Access-Control-Allow-Origin: *` con
  `CORS_ORIGINS=*` (antes un integrador veía «Network Error»).
- **Sentry no recibe `X-Tordo-Proxy` ni `X-Tordo-Visitante`** (`CABECERAS_PRIVADAS` en
  `app/observability/sentry.py`): `send_default_pii=False` sólo filtra la lista propia de
  Sentry, y el secreto del proxy viajaba en cada error y en cada traza muestreada.
- **La imagen de la API corre sin root** (`USER api` en `backend/Dockerfile`).
- **Las redirecciones de la API son relativas** (`app/core/redirecciones.py`, rediseño 0d).
  Detrás del TLS de Railway la app ve `scheme=http` y `redirect_slashes` escribía
  `Location: http://…` en las 29 redirecciones por barra final: `https://api.tordo.cl/mcp`
  mandaba a `http://…/mcp/`, el cliente repetía el POST en claro y el borde lo devolvía
  convertido en GET. **No se arregla leyendo `X-Forwarded-Proto`**: uvicorn sigue con
  `--no-proxy-headers` y el modelo de confianza es uno solo. Un `Location` propio sale sin
  esquema ni host; uno ajeno, intacto. Y `/mcp` se sirve como `/mcp/` sin redirigir (sigue
  contando en el límite). `tests/test_redirecciones_https.py` barre todas las rutas GET
  detrás de un borde TLS simulado (`tests/borde_tls.py`). El proxy de Next (#155) sigue
  esquivando por host cualquier `Location` absoluto, pero ya no lo necesita para los propios.
- **Todo parámetro público tiene cota** (`app/api/limites.py`): textos con `max_length`,
  enteros con `le=`, `offset` hasta 100.000, ids dentro de un `integer` de Postgres (uno
  mayor llegaba a la base y volvía **500**), y como mucho 8 términos en la búsqueda (catálogo y
  Compra Ágil, `limites.MAX_TERMINOS`). `tests/test_parametros_acotados.py` recorre el OpenAPI y falla con un
  parámetro nuevo sin cota. **Y nada que se pida gratis carga una tabla entera**:
  `/bi/productos?q=` traía `product_price_bands_l3` completa a Polars en cada petición
  (~70 ms con seis meses); ahora filtra en SQL sobre el índice de trigramas, con tope de
  filas (`_base._buscar`), y se queda con la unidad de más compras de cada producto.
  **Y `/mercado` tampoco** (rediseño 0b): `tendencia?rubro=` leía `time_series` entera (301 MB
  en Postgres) y `oportunidades`, `tendencia` y `rubros` sin rubro traían sus tablas
  completas a la vez; la API moría por OOM (11 `Killed` el 2026-10-14 y el servicio en
  `CRASHED`). Los mínimos van como `minimos` de `sql_consulta`, el top-N como `orden`+`limite`
  (con `desempate_texto` cuando el empate se resolvía por una columna de texto), los conteos con
  `contar_por` y `contar_filas`, los valores distintos con `distintos(filtros=)` y lo que agrega
  por proveedor con `agregado`/`totales` (`COLLATE "C"`, el orden de Polars). `_a_polars`
  infiere el esquema con todas las filas: con las 100 primeras, una columna nula ahí y con
  texto después lanzaba `ComputeError`.
  `tests/test_bi_mercado_acotado.py` recorre **las 16 funciones `get_*` de `services/bi`**
  (las llamadas del golden más las de primera visita, sin rubro ni organismo) contra el
  doble de `_load` (y de los agregados) y falla si alguna lee una tabla sin `filtros` ni `limite`, salvo tres
  que se leen enteras por pequeñas, cada una con su motivo escrito en el test
  (`sector_dashboard`, `buyer_scores`, `buyer_risk_flags`). Una función nueva sin llamadas
  en la guarda también la hace fallar. **No cubre** `services/publico/` (las páginas
  indexables también leen analytics con `_load`) ni `repositories/`: ahí la guarda no existe.
- **CORS abierto en producción (`CORS_ORIGINS=*`), sin credenciales**: la API es pública y
  anónima, y limitarla a los dominios del sitio dejaba fuera a los integradores que la
  llaman desde una aplicación web. No abre el MCP: su lista de `Host`/`Origin` es otra
  capa (`tests/test_cors_publico.py`).
- **El MCP es anónimo y tiene la protección contra DNS rebinding ENCENDIDA**, con la lista
  blanca de `MCP_HOSTS_PERMITIDOS` (coma-separada; por defecto `localhost,127.0.0.1`). Estuvo
  apagada mientras cada llamada exigía clave: una petición rebotada llegaba sin credencial.
  Sin clave ese argumento no vale. **Al desplegar, la lista tiene que llevar el dominio
  público**, o `/mcp/` responde 421 a todo.
- **La API pública está declarada, no deducida.** `app/api/documentacion.py` clasifica cada
  grupo de endpoints como `publica` o `interna` y publica la guía dentro del propio OpenAPI
  (la ve quien abre `/docs` o genera un cliente). `tests/test_superficie_publica.py` falla si
  aparece un grupo sin clasificar: sin eso, «la API pública» sería «todo lo que resultó estar
  montado». Ver `docs/API_PUBLICA.md`.
- **Un worker por contenedor — por el límite por IP, ya no por memoria.** Hasta el paso 8
  del pivote, la API cargaba el TF-IDF del ETL en cada proceso: pico de **289 MB con un
  worker** y OOM con 4 en 512 MB. **La API ya no carga ningún artefacto del ETL**
  (`tests/test_api_sin_tfidf.py` falla si `sklearn`, `scipy` o `joblib` se importan al
  arrancar; están en el grupo `etl` de `pyproject.toml`).
  **La medición del 2026-10-12 (103 MB en reposo, 171–176 MB de pico, «cabe en 256 MB») no
  valía para lo que importaba: nunca pidió los `/bi/*` de `/mercado`**, y esa pantalla pide a
  la vez, al abrirse, `rubros`, `oportunidades`, `tendencia` y —con rubro— `panorama` y
  `resumen`. En producción la API murió 11 veces el 14-10 (`Killed`; 9 antes de la
  investigación, las dos últimas provocadas por las peticiones de reproducción).
  Repetida con la ráfaga (`make medir-memoria`, seis meses de analytics locales, 512 MB,
  1 worker): **antes del arreglo, `oom=true exit=137`** (reposo 122,4 MiB); **después,
  reposo 116,2 MiB, `docker stats` 171,5 MiB justo tras la ráfaga y `pico` 217,1 MiB**, sin
  OOM y con las 8 rutas en 200 (`tendencia?rubro=` incluida). Dos límites: el `pico` es
  **una muestra** tras la ráfaga y 40 vueltas, no el máximo de la ráfaga; y **producción lee
  36 meses (12 en las bandas de precio), seis veces los meses medidos en local** — no hay cifras de
  producción de después del arreglo, y «cabe en 256 MB» ya no se afirma. Se deja en 512 MB.
  **`make medir-memoria` pide además la primera visita de `/mercado` a la vez**: la medición
  del 12-10 no la pedía y daba 171 MB mientras producción moría. Railway cobra la memoria
  usada, no la reservada. **No se sube a 2 workers**: el límite por IP vive en memoria de cada
  proceso, así que con `WEB_CONCURRENCY=N` el límite real es N× el anunciado. Subirlo exige
  antes sacar ese contador del proceso. Repetible con `make medir-memoria`.
- **Feature flags**: 1 en `app/config.py` (`feature_analytics`); apagada, el BI devuelve 503
  con mensaje accionable. `feature_tfidf` se fue con el TF-IDF de la API (paso 8 del pivote).

---

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
- **Anónimo** desde el pivote: sin clave ni cuota. Ver «Patrones vigentes» para la
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
