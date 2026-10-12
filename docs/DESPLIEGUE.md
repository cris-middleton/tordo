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

## Por qué no hay archivos de configuración de Railway ni de Vercel

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
- **Vercel**: lo único que pondría un `vercel.json` es la región de las funciones, y
  **`iad1` ya es el valor por defecto de los proyectos nuevos**
  (<https://vercel.com/docs/functions/configuring-functions/region>). No hay cron en
  Vercel: los dos cron viven en Railway. Un archivo que repite el valor por defecto
  sólo añade un sitio más donde puede quedar desfasado.

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
| `R2_ENDPOINT_URL` | | | ✓ | | sí | `https://<id-de-cuenta>.r2.cloudflarestorage.com` | Cloudflare → R2 (paso 2) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | | | ✓ | | sí | | Cloudflare → R2 → *Manage API tokens* (paso 2) |
| `R2_BUCKET` | | | ✓ | | sí | `tordo-parquets` | el nombre del bucket |
| `REVALIDAR_URL` | | ✓ | ✓ | | recomendada | `https://tordo.cl/api/revalidar` | la URL del sitio. Vacía, los cron no revalidan (y lo dicen en INFO) |
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
misma cuenta.

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
  documenta, ver arriba): `0 * * * *` — **cada hora en UTC**. El script decide si le toca en hora de Chile; si no, sale en
  segundos.
- **Recursos**: 1 GB basta (descarga de la API, sin analytics).

**Variables:** las de la columna **frecuente** de la [tabla de variables](#variables).

**Verifica:** en *Deployments*, lanza una ejecución a mano con el start command
`python -m etl.cron frecuente --forzar`. Termina sin `Traceback`, el log dice
`frecuente: terminada`, y en Healthchecks `tordo-frecuente` pasa a *up*.
Luego `curl -s 'https://api.tordo.cl/api/v1/tenders/?limit=1'` trae `total` > 0.

Hasta el paso 9 no hay Next al que avisar: la línea `revalidación … ERROR` del
log es esperada y no hace fallar la corrida.

Un ticket inválido o vencido **hace fallar la corrida**: la API clásica lo dice
con un HTTP 203 y Compra Ágil con un 401, y los dos llegan al `/fail` como
`CredencialRechazada` (sin el ticket en el texto).

## 8. Railway: `cron-semanal`

Un tercer servicio, igual que el anterior salvo:

- **Start command**: `python -m etl.cron semanal`
- **Cron schedule**: `0 6 * * 0` (domingo 06:00 UTC: 02:00 en Chile en invierno,
  03:00 en verano; da igual, no compite con `frecuente`, que es otro servicio).
  No necesita el ticket de Mercado Público: la descarga masiva es pública.
- **Recursos**: **8 GB** de RAM (decidido el 2026-10-11; pico proyectado ~6,3 GB
  con las ventanas de 36 y 12 meses — CLAUDE.md, «Analytics lee una VENTANA»).

**Variables:** las de la columna **semanal** de la [tabla de variables](#variables).

Con `ETL_ALMACEN=r2` y una credencial que falte, la corrida falla **al
construirse**, antes de descargar nada, y el `/fail` dice qué variable es. Una
revalidación que falla (Next caído, secreto distinto) queda en ERROR en el log
pero **no** hace fallar la corrida: la página sólo se queda una semana más vieja.

**Verifica:** el servicio construye. La primera corrida es el paso siguiente.

### 8.1 La primera corrida semanal — antes de abrir el dominio

**El dominio no se abre hasta que esta corrida termine bien.** Las páginas
públicas muestran nombres de proveedores que salen de `analytics.*`, y sólo lo
que reconstruye esta corrida lleva a las personas naturales tapadas (seudónimos
`PN-…`). **Nunca materialices en producción los parquets de analytics de una
máquina local**: son anteriores al enmascarado. Hasta que termine, no crees en
Cloudflare los registros de `tordo.cl` del paso 9 (las comprobaciones de los
pasos 9 y 10 pueden hacerse contra el dominio `*.vercel.app`). Mientras tanto,
`REVALIDAR_URL` puede apuntar a ese mismo `*.vercel.app/api/revalidar`, o fallar
en ERROR sin consecuencias.

Es la que llena R2 y `analytics.*`: con el bucket vacío, descarga los 39 meses
de la ventana (las siguientes, sólo los 3 recientes). Es la primera vez que corre
con años de datos, y **nada de lo que sigue está medido con esa escala** (en
local sólo había 6 meses). Lánzala a mano (*Deployments → Run*), mirando:

- **RAM**: el pico de la gráfica de *Metrics*. Proyectado ~6,3 GB; si se acerca a
  8 GB, no subas la máquina sin antes mirar qué módulo manda (el log dice cuánto
  tardó cada uno).
- **Tiempo** total, y el de la descarga masiva aparte.
- **Disco**: en la primera corrida el contenedor tiene a la vez los ZIPs y los
  parquets de los 39 meses (~4,5 GB cada uno, ~9 GB de pico); en las siguientes,
  los ~4,5 GB que baja de R2 más tres meses. Compáralo con el disco efímero del
  servicio. El bucket debería quedar en ~4,5 GB más `analytics/`.

**Verifica:** termina con `/fail` ausente en Healthchecks (`tordo-semanal` *up*),
R2 tiene `consolidated/` y `analytics/`, y el panel de inteligencia de mercado de
sitio muestra datos. Anota RAM, tiempo y tamaño en el PR o issue del
lanzamiento. Recién entonces, el paso 9 completo con el dominio.

## 9. Vercel: el sitio

*Add New → Project* → este repo.

- **Root directory**: `frontend`. Framework: Next.js.
- **Functions region**: `iad1` (Washington), junto a Railway US East (spec §3.2). Es
  el valor por defecto de Vercel para proyectos nuevos: sólo compruébalo en
  *Settings → Functions → Function Regions*.
- **Domains**: `tordo.cl` y `www.tordo.cl` (redirige uno al otro); crea en
  Cloudflare los registros que indique Vercel, sin proxy — **sólo después de que
  termine la primera corrida semanal** (paso 8.1).
- **Analytics → Web Analytics**: actívalo (sin cookies; spec §4).

**Variables** (*Settings → Environment Variables*, entorno **Production**): las de la columna
**Vercel** de la [tabla de variables](#variables).

Sin `RESPONSABLE_LEGAL` las páginas legales muestran `[[definir RESPONSABLE_LEGAL]]`
(`frontend/lib/responsable.ts`).

**Verifica:**
- `https://tordo.cl` carga, y el catálogo muestra las licitaciones del paso 7.
- `/terminos` y `/privacidad` muestran el nombre del responsable, no el marcador.
- En el log de la API, las peticiones del sitio llegan sin aviso de `PROXY_SECRETO`.

## 10. Comprobar en vivo de qué IP cuenta el límite

El modelo de confianza (`backend/app/core/limite_ip.py`) da por hecho dos cosas que
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

La migración `e3afe71ab019` (paso 7) borra tablas y columnas, y la retención borra
filas cada semana. `DROP TABLE` libera el espacio enseguida; **el de las columnas
borradas y las filas purgadas no vuelve hasta un `VACUUM FULL`**, que bloquea la
tabla mientras corre: hazlo fuera de las horas de `frecuente`.

```sql
VACUUM FULL licitaciones;
VACUUM FULL licitaciones_detalle;

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

Sólo lectura, sin secretos. Una línea ✓/✗ por comprobación: salud de la API, sitemap
de la API con datos, una página de comprador, rubro y producto con canonical, un 404
para un código inventado (en la API y en el sitio), `robots.txt`, `sitemap.xml`, los
dos RSS, la frescura de «lo mejor de hoy», el MCP, las cabeceras del límite, la
prueba del `X-Forwarded-For` inventado del paso 10, `/api/revalidar` sin secreto
(401, no 503) y `/apoyar`. Sale con el número de fallos.

Lo que no puede ver desde fuera, y hay que mirar a mano: Healthchecks (los dos
chequeos *up*), el log de arranque de la API sin avisos, y el tamaño de Postgres
(paso 13.1).

**Verifica:** `✓ Todo en orden.`

## Si algo falla

| síntoma | causa probable |
|---|---|
| Todo `/bi/*` responde 503 | `FEATURE_ANALYTICS` no está en `true` |
| `/mcp/` responde 421 | falta el host en `MCP_HOSTS_PERMITIDOS` (la API avisa al arrancar) |
| El sitio entero recibe 429 a la vez | `PROXY_SECRETO` distinto en Vercel y Railway, o vacío |
| `semanal` falla en segundos con `ETL_ALMACEN` en el `/fail` | variable de R2 ausente o vacía |
| Un cron no arranca: `No module named 'app'` | imagen del ETL vieja (antes de copiar `backend/app`); redeploy |
| Las páginas legales dicen `[[definir RESPONSABLE_LEGAL]]` | variable ausente en el build de Vercel |
| Un cron falla con `CredencialRechazada` | ticket de Mercado Público inválido o vencido: pide otro y cámbialo en los dos cron |
| `revalidación … HTTP 401` en el log de un cron | `REVALIDAR_SECRETO` distinto en Vercel y en ese cron |
| `revalidación … HTTP 503` | Vercel no tiene `REVALIDAR_SECRETO` |
| Las páginas públicas no cambian tras la semanal | revalidación sin configurar (`… omitida` en INFO): falta `REVALIDAR_URL` o `REVALIDAR_SECRETO` en el cron |
