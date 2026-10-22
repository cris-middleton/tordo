# Despliegue

La guía para poner TORDO en producción: **Railway** (API, Postgres y dos cron),
**Cloudflare R2** (parquets), **Vercel Pro** (el sitio; Hobby hasta el 2026-10-20, §13.4), **Healthchecks.io**
(latido de los cron) y **Sentry**. Sustituye a las guías del SaaS
(`deploy_steps/`), que describen otro sistema.

Es una lista **en orden**: cada paso usa algo del anterior. Las variables de todos
los servicios están en **una sola tabla** ([Variables](#variables)); los secretos
compartidos los genera `scripts/generar-secretos.sh` (paso 0) y la comprobación
final la hace `scripts/verificar-produccion.sh` (paso 14). Cada uno termina con
una línea **Verifica**; si no se cumple, no sigas. Los nombres de variables y los
comandos salen del código (`backend/Dockerfile`, `etl/Dockerfile`,
`backend/app/config.py`, `etl/config.py`, `etl/cron.py`, `etl/almacen.py`,
`frontend/`); si cambian allí, esta guía se corrige en el mismo PR.

**Nunca copies un secreto en este archivo, en un commit ni en un issue.** Se
generan donde se usan y se pegan en el panel de cada servicio.

---

## Antes de empezar

- Dominio `tordo.cl` registrado en NIC Chile.
- Ticket de la API de Mercado Público **propio** (el de demostración es compartido
  y devuelve 429 con frecuencia): <https://api.mercadopublico.cl>.
- Cuentas: Railway, Vercel, Cloudflare, Healthchecks.io, Sentry.
- `main` con CI en verde.

**Los nombres de host que usa esta guía** (cámbialos en todos los pasos si eliges
otros):

| host | sirve | dónde |
|---|---|---|
| `tordo.cl` (y `www.tordo.cl`) | el sitio | Vercel |
| `api.tordo.cl` | la API pública y el MCP (`/api/v1/*`, `/mcp/`) | Railway |

La API necesita un nombre propio porque **los integradores y los modelos hablan
con ella directamente**, no a través de Vercel (spec §3): el proxy de Next sólo
lo usa el navegador. Por eso `MCP_HOSTS_PERMITIDOS` lleva `api.tordo.cl`, que es
el `Host` con el que llegan esas peticiones, y no `tordo.cl`. Si cambias el host de la API,
cámbialo también en `frontend/lib/abierto.ts` (`ORIGEN_API_PUBLICA`): es lo que `/abierto`
publica como URL de la API y del MCP.

---

## Por qué casi no hay archivos de configuración de Railway ni de Vercel

- **Railway**: su «Config as Code» (`railway.json` / `railway.toml`) está
  **deprecado**: *«New services cannot opt into Config as Code»*, y los archivos
  existentes dejan de leerse el **2026-12-01**. Su sustituto, «Infrastructure as
  Code» (`.railway/railway.ts`, aplicado con la CLI), **no documenta** cron, ruta del
  Dockerfile, política de reinicio ni límites de memoria — justo lo que hace falta
  aquí. Así que los tres servicios se configuran en el panel, con los valores
  exactos de los pasos 6–8. La ruta del Dockerfile sí tiene una forma documentada
  fuera del panel: la variable `RAILWAY_DOCKERFILE_PATH`.
  Fuentes: <https://docs.railway.com/config-as-code>,
  <https://docs.railway.com/infrastructure-as-code/reference>,
  <https://docs.railway.com/cron-jobs>, <https://docs.railway.com/builds/dockerfiles>
  (consultadas el 2026-10-12).
- **Vercel**: hay un `frontend/vercel.json` y hace **una sola cosa**: que sólo `main`
  despliegue (`git.deploymentEnabled`: `"**": false`, `"main": true`;
  <https://vercel.com/docs/project-configuration/git-configuration>). **`**` y no `*`**:
  Vercel compara las ramas con un glob y `*` no cruza una `/`, así que con `"*"` toda rama
  `feat/…` siguió construyendo (100 *Preview* del 13 al 19-10;
  `frontend/__tests__/vercel-json.test.ts` lo fija). Sin él, cada rama
  construiría un *Preview* sin variables —una página rota que además gasta minutos de
  build—, y es mejor que esa regla viva en el repo que en un ajuste del panel que hay
  que recordar. Lo demás queda **por defecto**: la región de las funciones ya es
  `iad1` en los proyectos nuevos
  (<https://vercel.com/docs/functions/configuring-functions/region>), y no hay cron en
  Vercel: los dos cron viven en Railway. Repetir un valor por defecto en un archivo sólo
  añade un sitio más donde puede quedar desfasado.

## Variables

> **Una variable nueva no llega a un cron hasta que se redespliega.** Cada ejecución
> programada corre sobre el **último despliegue**, con las variables que tenía
> entonces. En el lanzamiento, las de R2 se pusieron con `--skip-deploys` y la primera
> semanal falló en 10 s con `AlmacenMalConfigurado: … faltan: R2_ACCESS_KEY_ID,
> R2_SECRET_ACCESS_KEY` — el fallo rápido y con nombre que se buscaba, pero evitable:
> tras tocar variables, *Redeploy* el servicio antes de lanzarlo.
>
> **Y un redeploy corta la ejecución en curso.** Un push a `main` que toque los
> *watch paths* de un cron lo redespliega, y Railway **mata** la corrida que estuviera
> en marcha (estado `REMOVED`): en el lanzamiento cortó el relleno inicial a los 19
> minutos. No mergees nada que toque `etl/` o `backend/app/` el domingo entre las
> 06:00 y las ~07:00 UTC, mientras corre la semanal.

Una fila por variable y una columna por servicio: **API**, **frecuente** y
**semanal** son los tres servicios de Railway; **Vercel**, el sitio. «Obligatoria»
quiere decir que sin ella algo deja de funcionar o queda inseguro; las demás tienen
un valor por defecto razonable o desactivan algo prescindible.

| variable | API | frecuente | semanal | Vercel | ¿obligatoria? | ejemplo / formato | cómo se obtiene |
|---|:-:|:-:|:-:|:-:|---|---|---|
| `RAILWAY_DOCKERFILE_PATH` | ✓ | ✓ | ✓ | | sí | `/backend/Dockerfile` (API) · `/etl/Dockerfile` (los dos cron) | fijo |
| `DATABASE_URL` | ✓ | ✓ | ✓ | | sí | `${{Postgres.DATABASE_URL}}` | referencia a la variable del servicio Postgres de Railway (red privada) |
| `ENVIRONMENT` | ✓ | | | | sí | `production` | fijo. Activa los avisos de arranque de la API |
| `FEATURE_ANALYTICS` | ✓ | | | | **sí** | `true` | fijo. Por defecto `false`: todo `/bi/*` y las páginas públicas responden 503 |
| `PROXY_SECRETO` | ✓ | | | ✓ | sí | 64 caracteres hex | `scripts/generar-secretos.sh` — **el mismo** en la API y en Vercel |
| `CONFIAR_X_FORWARDED_FOR` | ✓ | | | | sí | `true` | fijo; se comprueba en vivo en el paso 10 |
| `MCP_HOSTS_PERMITIDOS` | ✓ | | | | sí | `api.tordo.cl` | el dominio de la API (paso 6). Sin él el MCP responde 421 |
| `CORS_ORIGINS` | ✓ | | | | sí | `*` | **`*`**: la API es pública, anónima y de sólo lectura (spec D6). Limitarla a los dominios del sitio bloqueaba a los integradores que la llaman desde una aplicación web. Va sin credenciales (no hay cookie ni sesión), el límite por IP no cambia, y el MCP sigue protegido por su lista de `Host`/`Origin`, que CORS no toca (`tests/test_cors_publico.py`) |
| `LIMITE_POR_MINUTO` | ✓ | | | | no | `60` | por defecto 60 |
| `WEB_CONCURRENCY` | ✓ | | | | no | `1` | **déjala en 1**: el límite por IP vive en memoria de cada worker |
| `SENTRY_DSN` | ✓ | | | | no | `https://…@….ingest.sentry.io/…` | Sentry → proyecto de la API → *Client Keys* (paso 4). Vacía, sin Sentry |
| `LOG_JSON` / `LOG_LEVEL` | ✓ | | | | no | `true` / `INFO` | por defecto `true` / `INFO` |
| `MERCADO_PUBLICO_TICKET` | | ✓ | | | **sí** | UUID | <https://api.mercadopublico.cl>. Sin valor por defecto: el extractor no arranca sin él |
| `COMPRA_AGIL_TICKET` | | ✓ | | | no | UUID | vacía usa `MERCADO_PUBLICO_TICKET` |
| `LATIDO_URL_FRECUENTE` | | ✓ | | | recomendada | `https://hc-ping.com/<uuid>` (sin barra final) | Healthchecks.io, chequeo `tordo-frecuente` (paso 3) |
| `LATIDO_URL_SEMANAL` | | | ✓ | | recomendada | `https://hc-ping.com/<uuid>` | Healthchecks.io, chequeo `tordo-semanal` |
| `ETL_ALMACEN` | | | ✓ | | **sí** | `r2` | fijo. Sin valor por defecto, a propósito |
| `LOG_FILE` | | ✓ | ✓ | | no | vacío | vacía: los logs sólo a stdout, que es lo que muestra Railway. Por defecto el ETL escribe además `etl.log` dentro del contenedor, que no sirve de nada (como en `infra/docker-compose.yml`) |
| `R2_ENDPOINT_URL` | | | ✓ | | sí | `https://<id-de-cuenta>.r2.cloudflarestorage.com` | Cloudflare → R2 (paso 2) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | | | ✓ | | sí | | Cloudflare → R2 → *Manage API tokens* (paso 2) |
| `R2_BUCKET` | | | ✓ | | sí | `tordo-parquets` | el nombre del bucket |
| `REVALIDAR_URL` | | ✓ | ✓ | | recomendada | `https://<proyecto>.vercel.app/api/revalidar` (paso 9a) → `https://tordo.cl/api/revalidar` (paso 9c) | la URL del endpoint del sitio. Vacía, los cron no revalidan (y lo dicen en INFO) |
| `REVALIDAR_SECRETO` | | ✓ | ✓ | ✓ | recomendada | 64 caracteres hex | `scripts/generar-secretos.sh` — **el mismo** en los dos cron y en Vercel. Sin él en Vercel, `/api/revalidar` responde 503 |
| `API_URL` | | | | ✓ | sí | `https://api.tordo.cl` | el dominio de la API. Servidor: **sin** `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | | | | ✓ | sí | `https://tordo.cl` | el dominio del sitio (canonical, sitemap, tarjetas). Se lee en el build |
| `RESPONSABLE_LEGAL` | | | | ✓ | sí, para publicar | `Nombre Apellido` | quien responde por el sitio. Se lee en el build; sin ella `/terminos` y `/privacidad` muestran `[[definir RESPONSABLE_LEGAL]]` |
| `AUTOR_NOMBRE` | | | | ✓ | no | `Nombre Apellido` (≤ 60 caracteres) | quien hace el sitio: el «Lo hace» de la portada, de `/acerca` y del pie. Servidor, **se lee en el build**. Sin ella no se firma nada (ni un hueco). Es la autoría, no el responsable legal: los términos siguen con `RESPONSABLE_LEGAL` |
| `AUTOR_ROL` | | | | ✓ | no | `ingeniero que construye productos con datos` (≤ 80 caracteres) | el rol tras el nombre en el «Lo hace» de la portada, en `/acerca` y en la ficha del autor. Servidor, **se lee en el build**. Sin ella se firma sólo con el nombre (no hay rol por defecto); sin `AUTOR_NOMBRE` no sale |
| `AUTOR_URL` | | | | ✓ | no | `https://github.com/<usuario>` (**sólo `https://`**) | el enlace del nombre en el pie. Servidor, en el build. Sin ella, o sin `https://`, el nombre sale sin enlace |
| `VERCEL_GIT_COMMIT_SHA` | | | | ✓ | — | la pone Vercel sola | «Sitio en el commit `abc1234`» del pie, enlazado al commit si hay `REPOSITORIO_URL`. Sin ella (local, E2E) la línea no sale |
| `DONAR_MERCADO_PAGO_URL` | | | | ✓ | no | `https://link.mercadopago.cl/…` (**sólo `https://`**) | Mercado Pago → *Link de pago* de monto abierto. Servidor, **se lee en el build**: `/apoyar` se prerenderiza, así que cambiarla exige redeploy. Sin ella, o sin `https://`, el botón no aparece |
| `DONAR_GITHUB_SPONSORS_URL` | | | | ✓ | no | `https://github.com/sponsors/<usuario>` (**sólo `https://`**) | GitHub Sponsors. Servidor, **se lee en el build** (redeploy para cambiarla). Sin ella, no aparece |
| `DONAR_TRANSFERENCIA` | | | | ✓ | no | varias líneas: banco, tipo y número de cuenta, nombre, RUT, correo | los datos de la cuenta. Servidor, **se lee en cada petición**: sólo la sirve `GET /api/apoyar/transferencia` tras el clic de «Ver datos para transferir», sin caché y con `noindex`; nunca va en el HTML. Cambiarla no exige redeploy. Sin ella, el botón no aparece y la ruta da 404 |
| `REPOSITORIO_URL` | | | | ✓ | no | `https://github.com/cris-middleton/tordo` (**sólo `https://`**) | el repositorio público (puesta el 2026-10-15). Servidor, **se lee en el build**: `/abierto` se prerenderiza, así que cambiarla exige redeploy. Sin ella, o sin `https://`, «Código» no aparece en la cabecera ni en el pie de ninguna página, y `/abierto` dice que aún no está publicado |
| `NEXT_PUBLIC_SENTRY_DSN` | | | | ✓ | no | DSN del proyecto Next.js | Sentry (paso 4). Se inlinea en el bundle |
| `NEXT_PUBLIC_ENVIRONMENT` / `NEXT_PUBLIC_APP_NAME` | | | | ✓ | no | `production` / `Tordo` | fijos |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | | | | ✓ | no | | Sentry (paso 4). Sólo de build: trazas legibles |

`ENVIRONMENT=production` y `LOG_LEVEL=INFO` pueden ponerse también en los cron; no
cambian su comportamiento.

**`REPOSITORIO_URL`** (puesta en Production el 2026-10-15): los términos de uso (§7) y
`/abierto#codigo` la leen solos; al cambiarla basta redeployar el frontend (se lee en el build)
y comprobar que los dos enlazan el repositorio. **Sólo con un repo público**: a uno privado
GitHub responde 404 y el sitio enseñaría un enlace roto.

**El costo que publica `/apoyar#costos`** (`frontend/lib/costos.ts`) cita este archivo y la spec
del pivote. Si corriges aquí una cifra de costo (§13.1: tamaño de la base, memoria, tarifas),
corrige la tabla en el mismo cambio; `__tests__/costos.test.ts` falla si la cita se desincroniza.

## 0. Generar los secretos

```bash
scripts/generar-secretos.sh
```

Imprime `PROXY_SECRETO` y `REVALIDAR_SECRETO` y dice en qué servicios va cada uno.
**No los escribe en ningún archivo**: cópialos de la terminal al panel de cada
servicio a medida que los pasos los pidan. Si pierdes uno, vuelve a correr el script
y reemplázalo en **todos** sus destinos.

**Verifica:** tienes los dos valores a mano (sin guardarlos en el repo).

---

## 1. DNS en Cloudflare

Delega `tordo.cl` a Cloudflare (NIC Chile → servidores de nombres que indique
Cloudflare). Cloudflare da además el reenvío de correo del paso 11, y R2 vive en la
misma cuenta. **Hazlo primero**: el cambio en NIC Chile puede tardar horas en
propagarse, y los pasos 6 (dominio de la API) y 11 dependen de él. Mientras tanto,
avanza con los pasos 2 a 5.

- Los registros hacia Vercel y Railway van **sin proxy** («DNS only», nube gris):
  los dos emiten su propio certificado y necesitan ver el tráfico directo. Con el
  proxy de Cloudflare delante, además, el `X-Forwarded-For` que llega a Railway
  dejaría de ser el del visitante (paso 10).

**Verifica:** `dig NS tordo.cl +short` devuelve los servidores de Cloudflare.

## 2. R2: el bucket de los parquets

1. Cloudflare → R2 → *Create bucket*: `tordo-parquets` (región automática).
2. R2 → *Manage API tokens* → *Create API token*: permiso **Object Read & Write**,
   limitado a ese bucket. Guarda `Access Key ID`, `Secret Access Key` y el
   endpoint de la cuenta (`https://<id-de-cuenta>.r2.cloudflarestorage.com`).

El cron semanal guarda en R2 `analytics/` y **sólo los meses de `consolidated/`
que lee** —la ventana de 36 meses más los 3 que rehace, `MESES_EN_R2` en
`etl/cron.py`—; lo anterior ni se baja ni se queda en el bucket, y `raw/` no se
sube (`etl/almacen.py`). Medido sobre la descarga masiva entera: 2007–2026 son
~26 GB (18 de OC, 8 de LIC); los 39 meses, **~4,5 GB**. Cabe en la capa gratuita
de 10 GB con margen.

**Verifica:** el bucket aparece vacío en el panel y el token sólo tiene acceso a él.

## 3. Healthchecks.io: un chequeo por cron

Dos chequeos. Cada cron manda `/start` al empezar, la URL sola al terminar bien y
`/fail` con la cola del error al fallar (`etl/cron.py`). Un `frecuente` que sale
por la puerta horaria **no hace ping**: no es una corrida.

| chequeo | horario | gracia |
|---|---|---|
| `tordo-frecuente` | *Simple*, período **1 día** | **2 h** |
| `tordo-semanal` | *Cron* `0 6 * * 0`, zona **UTC** (la misma expresión que Railway, paso 8) | **12 h** |

`frecuente` corre a las 10, 13, 16 y 19 h los días hábiles y a las 12 h el fin de
semana: el hueco más largo es de 24 h (sábado → domingo a mediodía), de ahí el
período. La gracia del semanal es larga porque la corrida dura horas y, con
`/start`, Healthchecks cuenta el tiempo hasta el ping de fin.

Añade una integración de aviso (correo, como mínimo) a los dos. Copia las URL de
ping, **sin barra final**.

**Verifica:** los dos chequeos están en estado *new* y la integración de correo
manda la notificación de prueba.

## 4. Sentry: dos proyectos, sin IP

1. Un proyecto **Python/FastAPI** (la API) y otro **Next.js** (el sitio).
2. En **cada** proyecto: *Settings → Security & Privacy* → activa **Prevent
   Storing of IP Addresses**. El código ya manda `send_default_pii=False`
   (backend y `frontend/lib/sentry-comun.ts`), pero Sentry deduce la IP de la
   conexión del navegador si no se le prohíbe en el servidor.
3. Guarda el DSN de cada uno. Para que las trazas del navegador lleguen legibles:
   *Settings → Auth Tokens* → un token con `project:releases`
   (`SENTRY_AUTH_TOKEN`, sólo de build), más `SENTRY_ORG` y `SENTRY_PROJECT`.

Los cron **no** mandan a Sentry: su canal es el latido.

**Verifica:** la opción aparece activada en los dos proyectos.

## 5. Railway: Postgres

1. Proyecto nuevo, región **US East** (spec §3.2). **Railway crea los servicios en
   la región por defecto del workspace, que puede ser otra** (en el lanzamiento fue
   `us-west2`): revisa *Settings → Deploy → Regions* en **cada** servicio, Postgres
   incluido, y ponlos todos en US East antes de cargar datos.
2. *New → Database → PostgreSQL*.
3. **Límite de memoria: 1 GB** (*Settings → Resources*). Con el de serie (8 GB)
   Postgres se quedó en **2,85 GB** tras la primera semanal: es caché de archivos que
   nada le obliga a soltar, y Railway cobra la memoria usada (~US$10/GB-mes). Con el
   límite la suelta; Postgres con su configuración por defecto cabe de sobra.
4. **Sin respaldos programados en Hobby.** *Settings → Backups* sólo existe en el plan
   Pro (US$20/mes; la API responde «Manual backups and backup schedules are only
   available for Pro workspaces»). La spec (D19) los daba por incluidos. No se paga Pro
   por ellos: `analytics.*` —incluida `compra_agil_mensual`, la única tabla que
   acumula— se reconstruye cada domingo desde R2, y lo único que se perdería es el
   catálogo de licitaciones abiertas, que los cron vuelven a traer de la API.

**Verifica:** el servicio está *Active*, en US East, y el panel muestra la variable
`DATABASE_URL` del servicio.

## 6. Railway: la API

*New → GitHub repo* → este repo. En *Settings*:

- **Root directory** `/` (el contexto de build es la raíz: ahí viven
  `pyproject.toml` y `uv.lock`). La ruta del Dockerfile va en la variable
  `RAILWAY_DOCKERFILE_PATH=/backend/Dockerfile` (ver la tabla de variables).
- **Start command**: vacío. El `CMD` de la imagen corre `alembic upgrade head` y
  luego uvicorn con **un** worker y `--no-proxy-headers`.
- **Healthcheck path**: `/health/`.
- **Recursos**: límite de **512 MB** de RAM. Medido con `make medir-memoria` el
  2026-10-14, **con la ráfaga de la primera visita de `/mercado`** y seis meses de
  analytics locales: antes del arreglo la API moría (`oom=true exit=137`, reposo
  122,4 MiB); después, reposo **116,2 MiB**, **171,5 MiB** justo tras la ráfaga y
  `pico` **217,1 MiB** (una muestra tras la ráfaga y 40 vueltas, no su máximo), sin
  OOM. **Producción lee 36 meses (12 en las bandas de precio), seis veces los meses
  medidos**, y no hay cifra de producción posterior al arreglo: por eso 512 MB y no
  256 (la medición anterior, 171–176 MB, nunca pidió `/mercado`). Railway cobra la
  memoria **usada**, no el límite: bajarlo no ahorra.
- **Restart policy: Always.** Con «On Failure» Railway reinicia 10 veces y a la
  11.ª muerte deja el servicio `CRASHED` hasta un redeploy manual: el 2026-10-14
  la API quedó caída ~16 min así tras once OOM de `/mercado` (nueve de ellos antes
  de que empezara la investigación). Una API pública tiene que volver sola; los que
  sí llevan **Never** son los cron (pasos 7 y 8). Se fijó el 2026-10-14 (21:10 UTC)
  por la API GraphQL de Railway (`environmentPatchCommit`): el CLI
  (`railway environment edit --service-config api deploy.restartPolicyType ALWAYS`)
  responde «No changes to apply» **sin aplicar nada**. Compruébalo, sólo lectura:
  `railway environment config --environment production --json` y mira
  `services.<id de la API>.deploy.restartPolicyType` (`ALWAYS`; los cron, `NEVER`).
- **Networking → Custom domain**: `api.tordo.cl`. Crea en Cloudflare el `CNAME`
  que indique Railway (sin proxy).
- *Opcional* — **Watch paths** `backend/**`, `pyproject.toml`, `uv.lock`: un cambio sólo
  del frontend, del ETL o de la documentación no reconstruye ni reinicia la API.

**Variables:** las de la columna **API** de la [tabla de variables](#variables).

En producción la API **avisa en el log al arrancar** si falta `PROXY_SECRETO`, si
`CONFIAR_X_FORWARDED_FOR` es `false`, si hay más de un worker o si
`MCP_HOSTS_PERMITIDOS` sólo tiene `localhost`/`127.0.0.1`.

**Verifica:**
- `curl -s https://api.tordo.cl/health/` responde 200.
- El log de arranque **no** tiene ninguno de esos avisos.
- `curl -s https://api.tordo.cl/api/v1/tenders/ -o /dev/null -w '%{http_code}'`
  responde 200 (con el catálogo vacío: los cron aún no corrieron).

## 7. Railway: `cron-frecuente`

*New → GitHub repo* → el mismo repo, **otro servicio**. En *Settings*:

- **Root directory** `/`, y `RAILWAY_DOCKERFILE_PATH=/etl/Dockerfile` en sus variables.
- **Start command**: `python -m etl.cron frecuente`
- **Cron schedule** (*Settings → Cron Schedule*; es el único sitio donde Railway lo
  documenta, ver arriba): `0 * * * *` — **cada hora en UTC**. El script decide si le
  toca en hora de Chile; si no, sale en segundos.
- **Restart policy: Never.** Railway reinicia por defecto un servicio que sale con
  error («On Failure», hasta 10 veces), y los cron salen con error **a propósito**
  cuando fallan, para que el latido se ponga en rojo. Con el valor por defecto, una
  corrida rota se repetiría hasta 10 veces en la misma hora gastando cuota de la API.
- **Recursos**: 1 GB basta (descarga de la API, sin analytics).
- *Opcional* — **Watch paths** `etl/**`, `backend/app/**`, `pyproject.toml`, `uv.lock`:
  así un cambio sólo del frontend o de la documentación no reconstruye el servicio.

**Variables:** las de la columna **frecuente** de la [tabla de variables](#variables).
`REVALIDAR_URL` todavía no tiene a quién apuntar: se pone en el paso 9a.

**Verifica:** espera a la siguiente hora programada —10, 13, 16 o 19 h de Chile los
días hábiles, 12 h el fin de semana; Railway la lanza en el minuto 0— y mira esa
ejecución en *Deployments*: termina sin `Traceback`, el log dice `frecuente:
terminada` y en Healthchecks `tordo-frecuente` pasa a *up*. Luego
`curl -s 'https://api.tordo.cl/api/v1/tenders/?limit=1'` trae `total` > 0.

**Para no esperar a la hora programada** (lo que se hizo en el lanzamiento): cambia
el *Start command* a `python -m etl.cron frecuente --forzar`, redespliega y lanza
`railway cron run -s cron-frecuente --yes` (la CLI de Railway; el panel también
tiene el botón). Cuando termine, **devuelve el Start command** a
`python -m etl.cron frecuente`: con `--forzar` correría cada hora. Sin `--forzar`,
fuera de sus horas el script sale sin hacer nada, que es lo correcto.

**La primera vez, rellena el catálogo hacia atrás.** `frecuente` sólo mira hoy (y la
primera del día, también ayer): con la base vacía el catálogo abre con un par de días.
En el lanzamiento se hizo una pasada única con el mismo truco del *Start command*:

```
python -m etl.main --fecha-desde <hoy − 21 días> --fecha-hasta <ayer> --detalles-limit 3000
```

Un listado por día (~700 licitaciones cada uno) más el detalle de hasta 3.000 de las
publicadas, dentro de la cuota de 10.000 diarias de la API clásica; el resto lo
completan las corridas normales. **Después, devuelve el Start command** a
`python -m etl.cron frecuente`: el *Cron Schedule* lo volvería a lanzar cada hora.

Un ticket inválido o vencido **hace fallar la corrida**: la API clásica lo dice
con un HTTP 203 y Compra Ágil con un 401, y los dos llegan al `/fail` como
`CredencialRechazada` (sin el ticket en el texto).

## 8. Railway: `cron-semanal`

Un tercer servicio, igual que el anterior —**Restart policy: Never** incluida, y con
los mismos *watch paths* opcionales— salvo:

- **Start command**: `python -m etl.cron semanal`
- **Cron schedule**: `0 6 * * 0` (domingo 06:00 UTC: 02:00 en Chile en invierno,
  03:00 en verano; da igual, no compite con `frecuente`, que es otro servicio).
  No necesita el ticket de Mercado Público: la descarga masiva es pública.
- **Recursos**: **8 GB** de RAM (decidido el 2026-10-11; pico proyectado ~6,3 GB
  con las ventanas de 36 y 12 meses — CLAUDE.md, «Analytics lee una VENTANA»). El
  plan Hobby admite hasta **48 GB de RAM y 100 GB de disco efímero por servicio**
  (docs.railway.com/reference/pricing/plans): caben los 8 GB y el pico de disco de la
  primera corrida.

**Variables:** las de la columna **semanal** de la [tabla de variables](#variables);
`REVALIDAR_URL`, como en `frecuente`, en el paso 9a.

Con `ETL_ALMACEN=r2` y una credencial que falte, la corrida falla **al
construirse**, antes de descargar nada, y el `/fail` dice qué variable es. Una
revalidación que falla (Next caído, secreto distinto) queda en ERROR en el log
pero **no** hace fallar la corrida: la página sólo se queda una semana más vieja.

**Verifica:** el servicio construye. La primera corrida es el paso 9b, con el sitio
ya arriba para mirar el resultado.

## 9. Vercel y la primera corrida semanal — el dominio, al final

Tres partes en orden: el sitio en su dirección provisional `*.vercel.app` (9a), la
primera corrida semanal (9b) y, sólo si sale bien, el dominio (9c).

### 9a. Vercel, sin dominio

*Add New → Project* → este repo.

- **Root directory**: `frontend`. Framework: Next.js.
- **Functions region**: `iad1` (Washington), junto a Railway US East (spec §3.2). Es
  el valor por defecto de Vercel para proyectos nuevos: sólo compruébalo en
  *Settings → Functions → Function Regions*.
- **Sin despliegues de *Preview***: los apaga `frontend/vercel.json` (sólo despliega
  `main`; ver arriba). No hay nada que tocar. Si alguna vez apareciera uno, el respaldo
  en el panel es *Settings → Build and Deployment → Ignored Build Step* → «Only build
  production». **No copies los secretos al entorno Preview.**
- **Analytics → Web Analytics**: actívalo (sin cookies; spec §4).
- **Domains**: todavía **no**. El sitio queda en `https://<proyecto>.vercel.app`.

**Variables** (*Settings → Environment Variables*, entorno **Production**): las de la
columna **Vercel** de la [tabla de variables](#variables). `NEXT_PUBLIC_SITE_URL` ya
con `https://tordo.cl`: es lo que irá en los canonical y en el sitemap.

Sin `RESPONSABLE_LEGAL` las páginas legales muestran `[[definir RESPONSABLE_LEGAL]]`
(`frontend/lib/responsable.ts`); la portada y `/acerca` simplemente no firman.

Luego, en **los dos cron** de Railway: `REVALIDAR_URL=https://<proyecto>.vercel.app/api/revalidar`.

**Verifica** en `https://<proyecto>.vercel.app`:
- la portada carga, y `/licitaciones` muestra lo que trajo el paso 7;
- `/terminos` y `/privacidad` muestran el nombre del responsable, no el marcador;
- `/mercado` todavía no tiene datos: los trae el paso 9b.

### 9b. La primera corrida semanal

**El dominio no se abre hasta que esta corrida termine bien.** Las páginas
públicas muestran nombres de proveedores que salen de `analytics.*`, y sólo lo
que reconstruye esta corrida lleva a las personas naturales tapadas (seudónimos
`PN-…`). **Nunca materialices en producción los parquets de analytics de una
máquina local**: son anteriores al enmascarado.

Es la que llena R2 y `analytics.*`: con el bucket vacío, descarga los 39 meses
de la ventana (las siguientes, sólo los 3 recientes). Es la primera vez que corre
con años de datos, y **nada de lo que sigue está medido con esa escala** (en
local sólo había 6 meses).

**Cómo lanzarla:** `railway cron run -s cron-semanal --yes` (o el botón del panel).
Tarda unos minutos en aparecer en `railway cron list -s cron-semanal`. Mientras corre, mira:

- **RAM**: el pico de la gráfica de *Metrics*. Proyectado ~6,3 GB; si se acerca a
  8 GB, no subas la máquina sin antes mirar qué módulo manda (el log dice cuánto
  tardó cada uno).
- **Tiempo** total, y el de la descarga masiva aparte.
- **Disco**: en la primera corrida el contenedor tiene a la vez los ZIPs y los
  parquets de los 39 meses (~4,5 GB cada uno, ~9 GB de pico, dentro de los 100 GB del
  plan); en las siguientes, los ~4,5 GB que baja de R2 más tres meses. El bucket
  debería quedar en ~4,5 GB más `analytics/`.

**Medido en el lanzamiento (2026-10-13):** **15,5 minutos** en total; descarga y
consolidación de los 39 meses en ~5; **pico de RAM 7,23 GB de 8** (en
`product_price_bands`); R2 quedó en **4,79 GB** (4,58 de `consolidated/`, 0,2 de
`analytics/`); 27 tablas y 6,5 millones de filas materializadas. El margen de RAM es
de un 10 %: si una semanal muere por memoria, mira primero `product_price_bands`.

**La API puede no ver las tablas nuevas hasta reiniciarse** si arrancó antes de esta
corrida (corregido en #156: ahora sólo se recuerda que una tabla existe). Si
`/api/v1/publico/sitemap` sigue vacío diez minutos después, *Redeploy* la API.

**Verifica:** termina con `/fail` ausente en Healthchecks (`tordo-semanal` *up*),
R2 tiene `consolidated/` y `analytics/`, y `https://<proyecto>.vercel.app/mercado`
muestra datos. Anota RAM, tiempo y tamaño en el PR o issue del lanzamiento. Y el
*Cron Schedule* de vuelta en `0 6 * * 0`.

### 9c. El dominio

- Vercel → *Settings → Domains*: `tordo.cl` y `www.tordo.cl` (redirige uno al otro);
  crea en Cloudflare los registros que indique Vercel, **sin proxy**.
- En **los dos cron**: `REVALIDAR_URL=https://tordo.cl/api/revalidar`.

**Verifica:**
- `https://tordo.cl` carga, con certificado válido.
- `curl -sI https://tordo.cl/dashboard/tenders` responde **308** con
  `location: /licitaciones`: las URL del panel anterior siguen llevando a su sitio.

## 10. Comprobar en vivo de qué IP cuenta el límite

Después del 9c, con el dominio ya abierto. El modelo de confianza
(`backend/app/core/limite_ip.py`) da por hecho dos cosas que
sólo se pueden ver desplegado: que el borde de Railway **reescribe**
`X-Forwarded-For` (así un cliente no puede inventarse otra IP) y que el proxy de
Vercel manda la IP del visitante.

`scripts/verificar-produccion.sh` (paso 14) hace la prueba A sola; aquí está a
mano, para entender qué mira.

**A. Un `X-Forwarded-For` inventado no cambia de cubo.** Desde tu máquina:

```bash
URL=https://api.tordo.cl/api/v1/tenders/
curl -s -o /dev/null -D - "$URL" | grep -i x-ratelimit-remaining
curl -s -o /dev/null -D - -H 'X-Forwarded-For: 203.0.113.7' "$URL" | grep -i x-ratelimit-remaining
curl -s -o /dev/null -D - "$URL" | grep -i x-ratelimit-remaining
```

**Verifica:** los tres valores bajan de uno en uno (59, 58, 57): las tres cuentan
en **tu** cubo. Si el segundo vuelve a 59, el borde dejó pasar la cabecera
inventada → pon `CONFIAR_X_FORWARDED_FOR=false` en Railway y avisa (cualquiera
podría saltarse el límite rotando IP falsas).

**B. El sitio cuenta a cada visitante, no a Vercel.** Justo después de A:

```bash
curl -s -o /dev/null -D - 'https://tordo.cl/api/proxy/api/v1/tenders' | grep -i x-ratelimit-remaining
```

Sin barra final a propósito: con ella Next responde un 308 antes de llegar al
proxy, y ese 308 no trae las cabeceras del límite.

**Verifica:** sigue la cuenta de A (56): el proxy mandó tu IP con el secreto. Si
vuelve a 59, el backend está contando a Vercel → revisa que `PROXY_SECRETO` sea
idéntico en los dos lados.

## 11. Correo: `hola@tordo.cl`

Es el contacto que publican la privacidad y la declaración de uso de datos. Sólo
reenvío, sin buzón propio: Cloudflare → *Email → Email Routing* → activa, añade
los registros MX y TXT que propone, y una regla `hola@tordo.cl` → tu correo
personal (verifícalo desde el enlace que llega).

**Verifica:** un correo enviado a `hola@tordo.cl` desde otra cuenta llega a tu
bandeja.

## 12. MCP

**Verifica:** desde un cliente MCP, o a mano:

```bash
MCP=(-s https://api.tordo.cl/mcp/ -H 'Accept: application/json, text/event-stream'
     -H 'Content-Type: application/json')
curl "${MCP[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verificacion","version":"0"}}}'
curl "${MCP[@]}" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

la segunda devuelve las **cuatro** herramientas. Un `421` significa que `api.tordo.cl` no está
en `MCP_HOSTS_PERMITIDOS`.

Y sin barra, que es la URL que la gente pega en su cliente:

```bash
curl -s -o /dev/null -w '%{http_code} [%{redirect_url}]\n' -X POST https://api.tordo.cl/mcp \
  -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verificacion","version":"0"}}}'
```

responde `200 []`: sin redirección.

### 12.1 Registros MCP

La ficha es **`server.json`** en la raíz (`tests/test_server_json.py` la valida contra el
esquema oficial y comprueba que su URL es `URL_MCP` de `frontend/lib/abierto.ts`). **Todavía no
está publicada en ningún registro**; esto es el procedimiento para cuando el dueño lo decida.
Dónde estaría:

| Registro | Cómo llega | Retirada |
|---|---|---|
| Registro oficial (`registry.modelcontextprotocol.io`) | `mcp-publisher publish`, espacio de nombres `cl.tordo/…` verificado por **DNS** | `mcp-publisher status --status deleted --all-versions …` (oculta; los metadatos no se borran nunca) |
| Glama (`glama.ai/mcp/connectors/…`) | **Sola**, desde el registro oficial; se reclama por DNS | soltar la reclamación; pedir la baja a `support@glama.ai` |
| Smithery | `smithery.ai/new` con la URL | borrar desde su panel (permanente) |

**Nada de esto se ejecuta sin el «sí» del dueño, paso por paso.** El registro oficial **nunca
borra metadatos** y sus versiones son inmutables: un nombre publicado queda para siempre, como
mucho oculto.

**Versiones.** **`1.0.0` se publicó el 2026-10-15 sin `repository`** (el repo aún era privado:
una URL privada daría un 404 a quien la siga). **`1.1.0` añade `repository`**
(`https://github.com/cris-middleton/tordo`) y ya está en `server.json`; se publica después de
mergear el PR que la sube (rediseño 7b), con el «sí» del dueño. Es una versión nueva, no una
edición de la anterior.

**La clave del espacio de nombres.** Ed25519, generada con `openssl@3` de Homebrew (el `openssl`
de macOS no la trae). La privada vive en el gestor de contraseñas del dueño y en
`~/.config/tordo-mcp-registry/key.pem` (`chmod 600`), **nunca en el repo**. La pública va en un
TXT en el **apex** de `tordo.cl` en Cloudflare: `v=MCPv1; k=ed25519; p=<base64>`. En un
subdominio (`_mcp-auth.tordo.cl`) no se ve. **Rotar**: TXT nuevo y **borrar el viejo** (se prueba
primero y rompe la verificación). Sin la privada no se publica una versión nueva ni se retira.

**Una versión nueva.** Las versiones son inmutables: cualquier cambio en `server.json` (la URL,
la descripción, el `repository`) exige subir `version`. Luego:

```bash
mcp-publisher validate server.json
mcp-publisher login dns --domain tordo.cl --private-key "$(…hex de la privada…)"
mcp-publisher publish
curl -s "https://registry.modelcontextprotocol.io/v0.1/servers?search=cl.tordo" | python3 -m json.tool
```

Glama recoge el cambio solo (nombre, descripción y URL vienen del registro oficial). Smithery no:
se edita en su panel.

**Si cambia el dominio de la API**: `frontend/lib/abierto.ts`, `MCP_HOSTS_PERMITIDOS`,
`server.json` con versión nueva, y la URL en Smithery.

**Verifica: UNA llamada, nunca un bucle** (la API tiene 512 MB y ya cayó por ráfagas):

```bash
curl -s https://api.tordo.cl/mcp/ -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python3 -c 'import json,sys; print(sorted(t["name"] for t in json.load(sys.stdin)["result"]["tools"]))'
```

→ `['buscar_productos', 'panel_de_licitacion', 'perfil_de_comprador', 'precio_de_producto']`. El
servidor es sin estado (`stateless_http`), así que basta esa llamada; si fallara por sesión, se
usan **una vez** las dos de §12.

**Lo que llega de los registros.** El oficial no documenta ninguna comprobación del remoto.
Glama comprueba la salud periódicamente (frecuencia no documentada; se supone `initialize` +
`tools/list`, que no tocan la base). Smithery escanea al publicar (`User-Agent: SmitheryBot/1.0`,
desde Cloudflare Workers) y **proxea** el tráfico de quien instala desde allí: esas peticiones
llegan desde IP compartidas de Cloudflare y pueden repartirse un mismo cubo de 60/min. Tras cada
ficha nueva, 24 h de HTTP Logs de Railway filtrando `/mcp`: si un mismo origen pasa de **60
peticiones por hora sostenidas**, o aparecen `tools/call` de un rastreador, se avisa al dueño
antes de tocar nada.

## 13. Después del primer despliegue

### 13.1 Postgres: recuperar el espacio y medirlo

**Dónde se corre el SQL:** Railway → servicio Postgres → *Data* (consola de consultas),
o desde tu máquina con `railway connect Postgres`, que abre `psql`.

**El tamaño se mide siempre**; el `VACUUM FULL` sólo sirve si **reutilizaste la base
anterior**. La migración `e3afe71ab019` (paso 7 del pivote, no de esta guía) borra
tablas y columnas, y la retención borra filas cada semana. `DROP TABLE` libera el
espacio enseguida; el de las columnas borradas y las filas purgadas no vuelve hasta
un `VACUUM FULL`, que bloquea la tabla mientras corre: hazlo fuera de las horas de
`frecuente`. En una base nueva (paso 5) no hay nada que recuperar: sáltalo.

```sql
-- Sólo si reutilizaste la base anterior:
VACUUM FULL licitaciones;
VACUUM FULL licitaciones_detalle;

-- Siempre:
SELECT pg_size_pretty(pg_database_size(current_database()));

SELECT schemaname, relname, n_live_tup,
       pg_size_pretty(pg_total_relation_size(relid)) AS total
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC;
```

**Medido en el lanzamiento (2026-10-13):** la base, **1,4 GB** (`competitors_by_market`
497 MB, `time_series` 301 MB, `seasonality_patterns` 156 MB) más **1 GB de WAL**: 2,9 GB
de un volumen de 4,88 GB. Por encima del objetivo de la spec, pero estable —la ventana
de analytics no crece— y a ~US$0,15/GB-mes. **Sin puerto público ni llave SSH no hay
`psql` desde fuera**: se midió con el truco del *Start command* en `cron-semanal`
(`python -c "…"` con `psycopg2` y `DATABASE_URL`), devolviéndolo después.

**Verifica:** el total es **< 1 GB** (spec §5.2). Si no, la tabla grande de la
segunda consulta dice por dónde seguir; el candidato conocido es
`analytics.time_series`, que crece lineal con la ventana de 36 meses.

### 13.2 Costo medido (2026-10-15)

Lo que se publica en `/apoyar#costos` y en la portada sale de aquí, con fecha. Antes eran
los objetivos de la spec del pivote, y el uso real resultó mayor.

**Método:** la pestaña *Usage* de Railway, leída por su API GraphQL (sólo lectura,
`usage(groupBy: SERVICE_ID)`), proyecto `tordo-publico`. Periodo de facturación del 2026-10-13
02:58 UTC al 2026-11-13; transcurrido: 2.814 minutos, **1,95 días**. Lo que Railway informa
como uso del periodo: **US$0,83**. Recalculado con las tarifas de Hobby (memoria
US$10/GB-mes, CPU US$20/vCPU-mes, egreso US$0,05/GB, volumen US$0,15/GB-mes) da US$0,81:
el modelo cuadra.

| Servicio | RAM media | Costo en 1,95 días | Ritmo mensual |
|---|---|---|---|
| Postgres | 0,41 GB | US$0,27 (+ US$0,03 de volumen) | ~US$4,5 |
| api | 0,35 GB | US$0,23 | ~US$3,5 |
| cron-frecuente | 0,03 GB | US$0,02 | ~US$0,3 |
| cron-semanal | no aplica | US$0,27 (una corrida, la primera, que sube a R2) | ~US$0,4–1,2 |

Las dos tareas suman ~US$1 al mes (US$0,7–1,5): las siguientes corridas semanales suben
menos a R2 que la primera. Lo que más pesa es la memoria **usada** de Postgres y de la API,
~US$7,5 de los ~US$9–10.

**Proyección:** uso de Railway de ~US$9–10 al mes. El plan Hobby cuesta US$5 e incluye US$5
de uso, así que se paga el mayor de los dos: como el uso pasa de los US$5 incluidos, la
factura de Railway es el uso, ~US$9–10. Con el dominio (~US$1), **~US$10–11 al mes**.

**Límites de la medición:** sólo 1,95 días, así que es una proyección y no una factura;
incluye las muertes por OOM del 14-10 (la API reinició varias veces) y la primera corrida
semanal, la más pesada en egreso. La RAM media de la API después del arreglo de `/mercado`
no está medida aparte. Se repite leyendo *Usage* al cerrar el primer periodo (2026-11-13) y,
si la cifra cambia, se corrige aquí y en `frontend/lib/costos.ts` en el mismo PR.

### 13.3 «Lo mejor de hoy» y la primera semanal tras el rediseño 0a

El orden de «Lo mejor de hoy en Compra Ágil» lee `analytics.compra_agil_unidad`, una tabla
**nueva** que sólo crea y llena la **primera corrida semanal con este código**. Entre el
despliegue de la API y esa corrida la tabla no existe: la API lo sabe
(`historia_disponible: false` en `GET /compra-agil/destacadas`), el factor del comprador
vale 0,5 para todas, **el orden es sólo tiempo × monto y la tarjeta no dice nada del
comprador** (ni «Sin historial» ni cifras). No hay error ni hace falta lanzar nada a mano:
el primer domingo la llena y el orden y los textos pasan solos a su forma completa.

**Verifica** tras esa corrida: `historia_disponible` es `true` y las tarjetas muestran
«Esta unidad: N órdenes de Compra Ágil en 6 meses». Aprovecha para repetir la medición
del orden (`INSTANTANEA_DESTACADAS`, ver `backend/tests/test_orden_destacadas_instantanea.py`):
la de 2026-10-14 usó percentiles por organismo como aproximación de los de unidad.


### 13.4 La cuenta de Vercel, pausada por la caché (2026-10-19)

El 2026-10-19 a las 14:36 (Santiago) Vercel pausó **la cuenta entera** por 30 días: tordo.cl
y pixelframe.cl respondían `402 Payment required` con `x-vercel-error: DEPLOYMENT_DISABLED`.
El equipo traía `softBlock.reason = FAIR_USE_LIMITS_EXCEEDED` y
`blockedDueToOverageType = dataCacheWrite`, con `unpauseAt` el 2026-11-18. En Hobby no hay
aviso con margen ni tope de gasto: pasarse de una cuota pausa todos los proyectos.

**Qué lo causó, medido** (uso por hora de Vercel y registros HTTP de la API en Railway):

- **No fueron los despliegues.** 168 en la semana (68 a producción, 100 *Preview*), pero las
  23 horas con un despliegue a producción escribieron 0,43 MB por hora en promedio y las 136
  sin despliegue, 0,89. El 92 % de lo escrito (121 de 131 MB) cayó en horas sin despliegue.
- **Fueron ráfagas de rastreo, de madrugada.** Las horas de más escritura (4 a 8 h de
  Santiago, los días 13, 16, 18 y 19) traían de 10.000 a 26.000 peticiones, casi todas sin
  caché: el 16-10 a las 7 h, 23.315 fallos de caché contra 2.919 aciertos; el 18-10 a las
  5 h, 10.563 contra 34. El 19-10 entre las 3 y las 5 h, Vercel pidió a la API **580 rutas
  distintas**: 335 rubros, 220 productos y 23 compradores, cada una una ficha nueva en caché.
- **Quién rastreaba tordo.cl no se sabe**: Hobby guarda una hora de registros. A la API le
  llegaban directo, esas mismas horas, los rastreadores de Perplexity, Claude, Kimi, Cohere y
  You.com.

**Lo que se cambió**: `robots.txt` aparta las fichas bajo pedido (`/productos/`,
`/compradores/`, `/rubros/`) de los rastreadores de entrenamiento (`RASTREADORES_DE_ENTRENAMIENTO`
en `frontend/lib/publico.ts`); los buscadores y los asistentes que responden a una persona
siguen entrando. Es un pedido, no una barrera: un rastreador que ignore `robots.txt` sigue
igual, y para eso está el Firewall.

**El Firewall, aplicado el 2026-10-20 y sólo en `log`**: no bloquea a nadie. Una regla que
**registra** a quien pide más de 120 fichas por minuto desde una IP, para saber quién es antes
de bloquear nada, y el conjunto *AI Bots* también en **Log**:

```bash
cd frontend && vercel link --yes --project tordo   # una vez (ver abajo)
vercel firewall rules add "Fichas: ráfagas por IP" \
  --condition '{"type":"path","op":"re","value":"^/(productos|compradores|rubros)/"}' \
  --action rate_limit \
  --rate-limit-window 60 --rate-limit-requests 120 --rate-limit-keys ip \
  --rate-limit-action log --yes
vercel firewall diff          # revisar
vercel firewall publish --yes
# AI Bots en Log: el CLI no lo tiene, va por la API del Firewall
vercel api -X PATCH "/v1/security/firewall/config?projectId=<proyecto>&teamId=<equipo>" \
  --input <(echo '{"action":"managedRules.update","id":"ai_bots","value":{"active":true,"action":"log"}}')
```

`vercel link` baja además un `frontend/.env.local` con las variables de Vercel y añade una
línea al `.gitignore`: borra el primero y deshaz la segunda. Tras unos días de tráfico,
la vista filtrada por la regla dice qué agentes e IP llenan la caché; sólo entonces se pasa
la acción a `rate_limit` (429) o `challenge`. **Ninguna regla por `user_agent` a secas**:
`bot` o `crawler` atrapan también a Googlebot y a las vistas previas de enlaces.

**Pro desde el 2026-10-20.** El plan Pro de Vercel cuesta **US$20 al mes** e incluye US$20 de
uso; lo que pase de ahí se cobra, en vez de pausar la cuenta. Con él, el sitio cuesta
**~US$30–31 al mes**: los ~US$10–11 de §13.2 más los US$20 de Vercel. Es la cifra de
`frontend/lib/costos.ts` y `/apoyar#costos`. *Spend Management* se configura en el panel
(*Settings → Billing*; la API pública no lo tiene): avisos al 50, 75 y 100 % de un monto
mensual, **sin pausar los proyectos**, porque una pausa es la misma página 402 que se quería
evitar. En Pro, cada petición que evalúa la regla de límite se cobra (US$0,50 el millón):
con las ráfagas medidas, centavos. *Observability → ISR* dice qué rutas escriben más en la
caché.

**Lo que ve un visitante con la cuenta pausada** es el texto plano de Vercel («Payment
required», `DEPLOYMENT_DISABLED` y un id), y no se puede cambiar: lo sirve el borde de Vercel
antes de llegar al proyecto. Las páginas de error propias de Vercel cubren los errores de la
plataforma (500, 502, 504) y son de Enterprise.

**Verifica**: `vercel api /v2/teams/cris-middleton-s-projects` sin `softBlock`, y
`curl -sI https://tordo.cl` en 200.

---

## 14. Verificación final

```bash
scripts/verificar-produccion.sh https://tordo.cl https://api.tordo.cl
```

Sólo lectura, sin secretos. Una línea ✓/✗ por comprobación, y sale con el número de
fallos:
- **API**: salud, sitemap con datos, frescura de «lo mejor de hoy», cabeceras del
  límite, CORS abierto (`Access-Control-Allow-Origin: *`), 404 para un código
  inventado, el MCP (`initialize`), que las redirecciones de la API (`/health`,
  `/api/v1/tenders`, `/api/v1/bi/rubros/`) llevan un `Location` relativo y que `/mcp` sin
  barra responde 200 sin redirigir (rediseño 0d), la prueba del `X-Forwarded-For` inventado del paso 10
  y que `/mercado` no tumba la API (`tendencia?rubro=` y `oportunidades` responden 200 en
  menos de 5 s y `/health/` sigue en 200; **sólo con el arreglo del rediseño 0b
  desplegado**, que antes de él esas peticiones la mataban por memoria), y que cada ejemplo de
  búsqueda de la portada encuentra un producto indexable (seis GET espaciados, uno por ejemplo).
- **Sitio**: una página de comprador, rubro y producto con canonical, 404 para un
  código inventado, `robots.txt`, `sitemap.xml`, los dos RSS, `/api/revalidar` sin
  secreto (401, no 503), `/apoyar`, `/api/apoyar/transferencia` (200 o 404, nunca en
  caché), `/abierto`, la portada con su buscador (`action="/buscar"`), `/guias` y una guía, `/buscar?q=resma` (200 con `noindex`, aunque la API falle), y
  que una URL del panel anterior redirige
  (`/dashboard/tenders` → 308 → `/licitaciones`).

Lo que no puede ver desde fuera, y hay que mirar a mano: Healthchecks (los dos
chequeos *up*), el log de arranque de la API sin avisos (y sin `Killed`), la
*Restart policy* de la API en `ALWAYS` (paso 6) y el tamaño de Postgres (paso 13.1).

**Verifica:** `✓ Todo en orden.`

## 15. Retirar el proyecto SaaS pausado

> **Decisión del dueño, e IRREVERSIBLE.** Recomendada, y **sólo después de que el
> paso 14 pase entero en el sitio nuevo**.

La producción anterior sigue pausada en Railway, y su base todavía tiene las tablas
del SaaS, las órdenes de compra crudas con nombre y RUT de los proveedores y los
payloads de la API sin enmascarar. No hace falta reutilizar nada de ahí:

- **El código** está en la etiqueta `saas-v1` del repo.
- **Los datos de ChileCompra** se vuelven a descargar (el paso 9b ya lo hizo).
- **Las cuentas de prueba** ya las borró la migración que retiró las cuentas.

Y conservarla es guardar datos personales que el sitio nuevo decidió no tener (Ley
21.719, minimización; spec §8), además de seguir pagándola.

1. *Opcional*: un respaldo, **fuera del repo**:
   `pg_dump "<DATABASE_PUBLIC_URL del Postgres viejo>" -Fc -f saas-v1.dump` (la URL
   pública está en las variables de ese servicio). Ponle fecha de borrado (p. ej. 30
   días) y bórralo también entonces: tiene los mismos datos personales.
2. Railway → el proyecto viejo → configuración del proyecto → borrar el proyecto.
3. Si había un dominio o una variable apuntando ahí (Vercel, Cloudflare, Healthchecks),
   quítalos.

**Verifica:** el proyecto ya no aparece en Railway ni en su facturación, y el
`scripts/verificar-produccion.sh` del paso 14 sigue en `✓ Todo en orden.`

## Después del lanzamiento

Lo que queda pendiente a propósito: nada de esto bloquea abrir el sitio, pero cada
punto tiene su momento. En orden.

1. **Search Console: verificar el dominio y enviar el sitemap.**
   *Cuándo:* el mismo día que se abre el dominio.
   Agrega `tordo.cl` como propiedad de **dominio** (cubre `www` y `https`); Google pide un
   registro TXT, que va en Cloudflare (DNS). Luego *Sitemaps* → `https://tordo.cl/sitemap.xml`.
   **Verifica:** el sitemap aparece como «Correcto» con las URL descubiertas.
   Sin esto no hay datos para los puntos 4 y 5.

2. ~~**Protección de rama de verdad.**~~ **Hecho el 2026-10-15**: el repo es público y
   `main` tiene un ruleset que exige los checks de CI (CLAUDE.md, «Ramas y worktrees»).

3. **Las vulnerabilidades de desarrollo del frontend.**
   *Cuándo:* en el primer mes, con calma; ninguna llega al sitio.
   `npm audit --omit=dev` está en 0. Quedan 10 de **desarrollo** (8 altas, 2 moderadas),
   todas atadas a un salto de versión mayor:
   - **Tailwind 3 → 4**: arregla `braces`, `chokidar`, `micromatch`, `picomatch` y los dos de
     `postcss-*`. Es una **migración**, no un parche: cambia la configuración
     (`tailwind.config.js` pasa a CSS) y conviene revisarla pantalla por pantalla, con los
     tokens de color y el contraste que exige CLAUDE.md.
   - **`eslint-config-next`**: npm propone *bajarlo* a 14.2.35 para arreglar
     `@next/eslint-plugin-next` y `fast-glob`. No tiene sentido con Next 16: se espera a que
     la serie 16 publique el arreglo y se sube entonces.
   **Verifica:** `make audit` sin vulnerabilidades del frontend.

4. **¿Alguien usa el RSS? → resumen por correo (v2).**
   *Cuándo:* tras ~2 meses de datos de Web Analytics.
   Las PYMES usan poco RSS, y las alertas eran lo que más valoraba el producto anterior
   (spec §7.1). Mira en Web Analytics las visitas a `/guardados` (donde se copian
   las URL de RSS) y a la ayuda del RSS, y en el uso de Vercel las peticiones a `/rss/*`. Si
   hay demanda, la v2 añade un **resumen por correo con enlace mágico, sin contraseñas**; no
   reabre el ADR 0011, pero una cuenta con contraseña sí. Si no la hay, se deja como está.

5. **Promover las páginas comprador × rubro que la gente busca.**
   *Cuándo:* cuando Search Console muestre impresiones, del orden de 2–3 meses después del
   punto 1.
   Hoy se indexan comprador, rubro y producto; las **42.163** combinaciones comprador × rubro
   (9.534 con al menos 20 transacciones) no tienen página propia indexada (spec §7.2). En
   *Rendimiento → Consultas*, busca las que mezclan un organismo con un rubro («aseo
   municipalidad de …»): esas son las que conviene construir e indexar primero. Lo decide el
   dato, no una lista: 42.000 páginas finas arrastrarían al dominio entero (D10).

## Si algo falla

| síntoma | causa probable |
|---|---|
| Todo `/bi/*` responde 503 | `FEATURE_ANALYTICS` no está en `true` |
| Un cliente MCP falla con `https://…/mcp` y funciona con `/mcp/`, o un `Location: http://` en la API | imagen anterior al rediseño 0d (redirecciones relativas); redeploy |
| `/mcp/` responde 421 | falta el host en `MCP_HOSTS_PERMITIDOS` (la API avisa al arrancar) |
| El sitio entero recibe 429 a la vez | `PROXY_SECRETO` distinto en Vercel y Railway, o vacío |
| `semanal` falla en segundos con `ETL_ALMACEN` en el `/fail` | variable de R2 ausente o vacía |
| Un cron no arranca: `No module named 'app'` | imagen del ETL vieja (antes de copiar `backend/app`); redeploy |
| Las páginas legales dicen `[[definir RESPONSABLE_LEGAL]]` | variable ausente en el build de Vercel |
| `verificar-produccion`: «<ejemplo>» sin productos indexables | la semanal cambió firmas o umbrales de indexación: elige otro ejemplo, verifícalo contra producción y cámbialo en `frontend/lib/buscar.ts` y en el script |
| `502 Application failed to respond` con `x-railway-fallback: true`, y `Killed` en el log de la API | OOM: alguna consulta se trae una tabla entera. `make medir-memoria` con `ANALYTICS_DIR` lo reproduce |
| La API en `CRASHED` y no vuelve | *Restart policy* distinta de **Always** (paso 6): agotó los reintentos. Redeploy (`railway redeploy -s api`) y corrígela |
| Un cron corre varias veces seguidas tras fallar | *Restart policy* distinta de **Never** en ese servicio (pasos 7 y 8) |
| `frecuente` estuvo parado más de un día (una pausa de Railway, un ticket vencido) | no hay que hacer nada si vuelve en menos de 72 h: la primera corrida parte de la última escritura en Postgres —Compra Ágil hasta 72 h atrás, licitaciones hasta 5 días— y lo dice en un WARNING (`la ventana se amplía`). Para una caída más larga, las licitaciones se recuperan a mano con `uv run python -m etl.main --fecha-desde <día> --fecha-hasta <día>`; la Compra Ágil anterior a esas 72 h sólo vuelve si cambia de estado |
| Un cron falla con `CredencialRechazada` | ticket de Mercado Público inválido o vencido: pide otro y cámbialo en los dos cron |
| tordo.cl responde `402` con `DEPLOYMENT_DISABLED` | la cuenta de Vercel está pausada por una cuota de uso (§13.4): `vercel api /v2/teams/<equipo>` dice cuál en `softBlock` |
| `revalidación … HTTP 401` en el log de un cron | `REVALIDAR_SECRETO` distinto en Vercel y en ese cron |
| `revalidación … HTTP 503` | Vercel no tiene `REVALIDAR_SECRETO` |
| Las páginas públicas no cambian tras la semanal | revalidación sin configurar (`… omitida` en INFO): falta `REVALIDAR_URL` o `REVALIDAR_SECRETO` en el cron |
| ¿La revalidación cambia de verdad el contenido? | `make e2e` comprueba que revalidar marca la caché (HIT → STALE → HIT), pero no que cambie el dato. A mano, en una copia local: `next build` + `next start` contra la API con el fixture; visita una ficha de comprador dos veces (`x-nextjs-cache: HIT`); cambia un valor que muestre en Postgres (p. ej. `UPDATE analytics.buyer_scores SET buyer_score = 0.1234 WHERE "CodigoOrganismoPublico" = '<código>'`): sigue HIT con el valor viejo; `POST /api/revalidar` con el secreto y `{"etiquetas":["analytics"]}`; la visita siguiente sale STALE y la otra trae el valor nuevo |
