# Despliegue

La guía para poner TORDO en producción: **Railway** (API, Postgres y dos cron),
**Cloudflare R2** (parquets), **Vercel Hobby** (el sitio), **Healthchecks.io**
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
el `Host` con el que llegan esas peticiones, y no `tordo.cl`.

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
  despliegue (`git.deploymentEnabled`: `"*": false`, `"main": true`;
  <https://vercel.com/docs/project-configuration/git-configuration>). Sin él, cada rama
  construiría un *Preview* sin variables —una página rota que además gasta minutos de
  build—, y es mejor que esa regla viva en el repo que en un ajuste del panel que hay
  que recordar. Lo demás queda **por defecto**: la región de las funciones ya es
  `iad1` en los proyectos nuevos
  (<https://vercel.com/docs/functions/configuring-functions/region>), y no hay cron en
  Vercel: los dos cron viven en Railway. Repetir un valor por defecto en un archivo sólo
  añade un sitio más donde puede quedar desfasado.

## Variables

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
| `DONAR_MERCADO_PAGO_URL` | | | | ✓ | no | `https://link.mercadopago.cl/…` (**sólo `https://`**) | Mercado Pago → *Link de pago* de monto abierto. Servidor, **se lee en el build**: `/apoyar` se prerenderiza, así que cambiarla exige redeploy. Sin ella, o sin `https://`, el botón no aparece |
| `DONAR_GITHUB_SPONSORS_URL` | | | | ✓ | no | `https://github.com/sponsors/<usuario>` (**sólo `https://`**) | GitHub Sponsors. Servidor, **se lee en el build** (redeploy para cambiarla). Sin ella, no aparece |
| `DONAR_TRANSFERENCIA` | | | | ✓ | no | varias líneas: banco, tipo y número de cuenta, nombre, RUT, correo | los datos de la cuenta. Servidor, **se lee en cada petición**: sólo la sirve `GET /api/apoyar/transferencia` tras el clic de «Ver datos para transferir», sin caché y con `noindex`; nunca va en el HTML. Cambiarla no exige redeploy. Sin ella, el botón no aparece y la ruta da 404 |
| `NEXT_PUBLIC_SENTRY_DSN` | | | | ✓ | no | DSN del proyecto Next.js | Sentry (paso 4). Se inlinea en el bundle |
| `NEXT_PUBLIC_ENVIRONMENT` / `NEXT_PUBLIC_APP_NAME` | | | | ✓ | no | `production` / `Tordo` | fijos |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | | | | ✓ | no | | Sentry (paso 4). Sólo de build: trazas legibles |

`ENVIRONMENT=production` y `LOG_LEVEL=INFO` pueden ponerse también en los cron; no
cambian su comportamiento.

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

1. Proyecto nuevo, región **US East** (spec §3.2).
2. *New → Database → PostgreSQL*.
3. *Settings → Backups*: activa los **diarios** (spec D19).

**Verifica:** el servicio está *Active* y el panel muestra la variable
`DATABASE_URL` del servicio.

## 6. Railway: la API

*New → GitHub repo* → este repo. En *Settings*:

- **Root directory** `/` (el contexto de build es la raíz: ahí viven
  `pyproject.toml` y `uv.lock`). La ruta del Dockerfile va en la variable
  `RAILWAY_DOCKERFILE_PATH=/backend/Dockerfile` (ver la tabla de variables).
- **Start command**: vacío. El `CMD` de la imagen corre `alembic upgrade head` y
  luego uvicorn con **un** worker y `--no-proxy-headers`.
- **Healthcheck path**: `/health/`.
- **Recursos**: límite de **512 MB** de RAM. Medido con `make medir-memoria` y seis
  meses de analytics reales: **171–176 MB de pico** con un worker (cabría en 256 MB, con
  ~30 % de margen). Railway cobra la memoria **usada**, no el límite: bajarlo no ahorra,
  y 512 MB deja margen para la ventana de producción, más larga que la medida.
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
`curl -s 'https://api.tordo.cl/api/v1/tenders/?limit=1'` trae `total` > 0. (Si tu
panel muestra un botón para ejecutar el cron, sirve igual, pero sólo dentro de una de
esas horas: fuera de ellas el script sale sin hacer nada, que es lo correcto.)

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
(`frontend/lib/responsable.ts`).

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

**Cómo lanzarla:** en `cron-semanal`, cambia **temporalmente** el *Cron Schedule* a
una hora UTC de dentro de unos minutos —`M H * * *`; en Chile, UTC va 3 h por delante
en verano y 4 en invierno—. Cuando haya **terminado** (no antes: cambiar un ajuste
vuelve a desplegar el servicio y podría cortarla), vuelve a `0 6 * * 0`. Si tu panel
muestra un botón para ejecutar el cron, sirve igual. Mientras corre, mira:

- **RAM**: el pico de la gráfica de *Metrics*. Proyectado ~6,3 GB; si se acerca a
  8 GB, no subas la máquina sin antes mirar qué módulo manda (el log dice cuánto
  tardó cada uno).
- **Tiempo** total, y el de la descarga masiva aparte.
- **Disco**: en la primera corrida el contenedor tiene a la vez los ZIPs y los
  parquets de los 39 meses (~4,5 GB cada uno, ~9 GB de pico, dentro de los 100 GB del
  plan); en las siguientes, los ~4,5 GB que baja de R2 más tres meses. El bucket
  debería quedar en ~4,5 GB más `analytics/`.

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

**Verifica:** el total es **< 1 GB** (spec §5.2). Si no, la tabla grande de la
segunda consulta dice por dónde seguir; el candidato conocido es
`analytics.time_series`, que crece lineal con la ventana de 36 meses.

---

## 14. Verificación final

```bash
scripts/verificar-produccion.sh https://tordo.cl https://api.tordo.cl
```

Sólo lectura, sin secretos. Una línea ✓/✗ por comprobación, y sale con el número de
fallos:
- **API**: salud, sitemap con datos, frescura de «lo mejor de hoy», cabeceras del
  límite, CORS abierto (`Access-Control-Allow-Origin: *`), 404 para un código
  inventado, el MCP (`initialize`) y la prueba del `X-Forwarded-For` inventado del paso 10.
- **Sitio**: una página de comprador, rubro y producto con canonical, 404 para un
  código inventado, `robots.txt`, `sitemap.xml`, los dos RSS, `/api/revalidar` sin
  secreto (401, no 503), `/apoyar`, `/api/apoyar/transferencia` (200 o 404, nunca en
  caché), `/guias` y una guía, y que una URL del panel anterior redirige
  (`/dashboard/tenders` → 308 → `/licitaciones`).

Lo que no puede ver desde fuera, y hay que mirar a mano: Healthchecks (los dos
chequeos *up*), el log de arranque de la API sin avisos, y el tamaño de Postgres
(paso 13.1).

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

2. **Protección de rama de verdad.**
   *Cuándo:* antes de que haya un segundo par de manos en el repo, o el primer susto.
   `main` no tiene protección: GitHub la reserva a repos públicos o a cuentas Pro, y este
   repo es privado en cuenta gratuita. Lo que hay es `make merge`, que es local y se puede
   saltar (CLAUDE.md, «Ramas y worktrees»). Dos caminos:
   - **GitHub Pro, ~US$4/mes**, y una regla sobre `main` que exija los checks de CI en verde.
   - **Hacer público el repositorio**, que trae la protección gratis — es la decisión que la
     spec deja para después del lanzamiento (§12). Si se toma, no hace falta Pro.

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
| `/mcp/` responde 421 | falta el host en `MCP_HOSTS_PERMITIDOS` (la API avisa al arrancar) |
| El sitio entero recibe 429 a la vez | `PROXY_SECRETO` distinto en Vercel y Railway, o vacío |
| `semanal` falla en segundos con `ETL_ALMACEN` en el `/fail` | variable de R2 ausente o vacía |
| Un cron no arranca: `No module named 'app'` | imagen del ETL vieja (antes de copiar `backend/app`); redeploy |
| Las páginas legales dicen `[[definir RESPONSABLE_LEGAL]]` | variable ausente en el build de Vercel |
| Un cron corre varias veces seguidas tras fallar | *Restart policy* distinta de **Never** en ese servicio (pasos 7 y 8) |
| Un cron falla con `CredencialRechazada` | ticket de Mercado Público inválido o vencido: pide otro y cámbialo en los dos cron |
| `revalidación … HTTP 401` en el log de un cron | `REVALIDAR_SECRETO` distinto en Vercel y en ese cron |
| `revalidación … HTTP 503` | Vercel no tiene `REVALIDAR_SECRETO` |
| Las páginas públicas no cambian tras la semanal | revalidación sin configurar (`… omitida` en INFO): falta `REVALIDAR_URL` o `REVALIDAR_SECRETO` en el cron |
| ¿La revalidación cambia de verdad el contenido? | `make e2e` comprueba que revalidar marca la caché (HIT → STALE → HIT), pero no que cambie el dato. A mano, en una copia local: `next build` + `next start` contra la API con el fixture; visita una ficha de comprador dos veces (`x-nextjs-cache: HIT`); cambia un valor que muestre en Postgres (p. ej. `UPDATE analytics.buyer_scores SET buyer_score = 0.1234 WHERE "CodigoOrganismoPublico" = '<código>'`): sigue HIT con el valor viejo; `POST /api/revalidar` con el secreto y `{"etiquetas":["analytics"]}`; la visita siguiente sale STALE y la otra trae el valor nuevo |
