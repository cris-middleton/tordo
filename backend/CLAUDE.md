# CLAUDE.md — `backend/`

> Complementa al `CLAUDE.md` de la raíz, que se carga siempre; este lo carga Claude Code al
> trabajar en `backend/`. Vale la misma regla: **describe el código real, no el objetivo**. Si
> encuentras una diferencia, gana el código y se corrige aquí en el mismo PR.
>
> La arquitectura por capas está en el `CLAUDE.md` de la raíz («Backend — `backend/app/`»);
> lo de analytics y el ETL, en `etl/CLAUDE.md`.

## Patrones vigentes

- **Exportar es la misma consulta en CSV.** `/bi/exportar/*` devuelve el mismo análisis que
  la pantalla, sin sesión ni cuota desde el pivote público. El archivo va
  **con BOM y separador `;`**: sin BOM Excel en Windows parte las tildes, y con coma Excel en
  configuración regional chilena mete todo en una columna. Un CSV que se abre mal no es un
  entregable, y son dos detalles que un refactor bienintencionado rompe sin que falle nada.
  **La primera línea es la cita de la fuente** y los encabezados van en la segunda (abajo).
  **Un texto que empieza por `=`, `+`, `-` o `@` sale con un apóstrofo delante**
  (`exportar.INICIO_DE_FORMULA`): Excel lo leía como fórmula, y hay ~1.000 descripciones de
  producto que empiezan por «-». La fecha del nombre del archivo es la de Chile.
- **BI**: batch en Polars → tablas materializadas en `analytics.*` → consulta con filtros
  empujados a SQL → fallback jerárquico **L0→L0N→L1→L2→L3→L4** con dispersión y tamaño de
  muestra. Hay un golden master (`backend/tests/golden/`) que fija
  el contrato: **cualquier cambio a `services/bi/` tiene que pasarlo**, y corre en CI.
  Si cambias los datos del fixture, recaptura con
  `python tests/golden/capturar_golden_bi.py --desde-golden` — **sin `--desde-golden` el
  script redescubre los casos muestreando los datos** y sobre el fixture recortado produce
  otros distintos (la primera vez pasó de 31 casos a 7).
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
- **`app/core/__init__.py` está vacío a propósito**, por lo mismo que `app/api/__init__.py`:
  re-exportaba nombres de un módulo de seguridad (hoy borrado), así que `from app.core.tiempo
  import ...` arrastraba los modelos de cuenta y cerraba un ciclo.
- **Estado hábil (retirado con las cuentas): la API pública no dice si una empresa está
  hábil, ni por qué no lo estaría.** Contrastado en vivo (2026-09-24): `BuscarProveedor` sólo
  responde si el RUT figura en el Registro de Proveedores —y sólo lo encuentra **con puntos**,
  `76.286.670-6`—; «no inscrito» llega como 500 con `Codigo 10200`. Las causas de
  inhabilidad sólo las ve el proveedor en su ficha. Si la feature vuelve, empieza aquí.
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
  - **Las exentas van en fila** (`MAX_EXENTAS_A_LA_VEZ` = 8; la portada sola pide cinco a la
    vez): una ficha ISR se genera con el slug que trae la URL, así que mil slugs inventados
    eran mil consultas que el límite no contaba. Esperan turno **como mucho 5 s**
    (`ESPERA_MAXIMA_EXENTA_S`) y luego reciben 503 con `Retry-After`, que Next no cachea; sin
    tope, la portada se cacheaba media hora sin sus bloques. `pedirPublico` corta a los 10 s.
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
  enteros con `le=`, `offset` hasta 100.000, ids dentro de un `bigint` de Postgres (uno
  mayor llegaba a la base y volvía **500**), montos hasta `MONTO_MAX` (10¹³, `min_amount` y
  `max_amount`: `1e308` o `inf` eran un 500), y como mucho 8 términos en la búsqueda (catálogo y
  Compra Ágil, `limites.MAX_TERMINOS`). Los parámetros numéricos también llevan `le=`. `tests/test_parametros_acotados.py` recorre el OpenAPI y falla con un
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
  en la guarda también la hace fallar. **`/publico/*` tiene su propia guarda**,
  `tests/test_publico_acotado.py`, ruta por ruta: toda ruta de `api/publico.py` tiene llamadas
  en ella o una exención con motivo (`/portada`, que cuenta el catálogo), y una ruta nueva la
  hace fallar hasta que alguien decida qué lee. Cada lectura de una petición va acotada, salvo
  las de `LECTURA_ENTERA_PERMITIDA` (los dos agregados en SQL de `/publico/mercado`, que
  registra aparte porque no pasan por `_load`, y `buyer_risk_flags`); lo que es de la tabla
  entera por naturaleza —el índice de páginas, `LECTURAS_DEL_INDICE`— sólo lo lee
  `indexables.construir`, y con el índice en caché ninguna ruta vuelve a leerlo (el sitemap no
  lee nada). Sigue sin cubrir `repositories/` de catálogo (`licitaciones`, `compra_agil`).
- **El índice de páginas públicas se agrega en Postgres** (`services/publico/indexables.py`).
  Es de la tabla entera por naturaleza (una fila por comprador, rubro y firma) y se construye
  una vez cada 10 min por proceso (`TTL_SEGUNDOS`, con cerrojo), pero leía `market_concentration`
  entera y las bandas L0N enteras con cinco columnas para agrupar en Polars. Ahora son
  `GROUP BY` con `_agregado(limite=None)` —`None` hay que escribirlo, y trae los grupos por
  trozos de 10.000 con un cursor de servidor (`analytics_sync._por_trozos`)— más las bandas que
  ya pasan `n` y predictibilidad en SQL, sobre las que se aplica `de_mercado()` en Polars (la
  regla no se duplica en SQL). Las consultas de `consultar` y `agregado` construyen el
  DataFrame **por columnas** (`_resultado_a_polars`), sin un diccionario por fila. Medido el
  2026-10-21 con las tablas locales (49.000 firmas): **de +79–97 MiB de RSS por construcción a
  +41–45**; a tres veces esa escala (~144.000 firmas, sintético), **de +207–248 MiB a +88–95**.
  El tiempo no cambia de forma apreciable (~0,3 s y ~0,9 s; el ruido de la máquina es mayor que
  la diferencia). `tests/test_publico_indice_sql.py` compara el índice con el cálculo de
  antes (tablas aleatorias en el doble y el fixture en Postgres) y la construcción por columnas
  y por trozos con la de siempre, tabla a tabla.
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
- **Las sesiones de asyncpg planifican con los parámetros** (`OPCIONES_DE_SESION` en
  `app/db/__init__.py`: `plan_cache_mode=force_custom_plan`). asyncpg reutiliza sentencias
  preparadas y Postgres, desde la sexta ejecución, puede pasar a un plan genérico que no pliega
  el término de búsqueda: `GET /tenders/?search=de` pasaba de ~55 ms a ~800 ms con 61.000
  licitaciones (medido el 2026-10-22). Una medición de rendimiento del catálogo tiene que
  repetir la petición más de cinco veces. `tests/test_plan_a_medida.py`.
- **Los 422 de validación llevan cada `msg` en español** (`app/core/errores_validacion.py`);
  la lista de Pydantic (`type`, `loc`, `ctx`) no cambia de forma.
- **`/health/` y `/health/ready` responden también a HEAD**: muchos monitores preguntan así, y
  un 405 se lee como caído.
- **La API tiene su `robots.txt`** (`main.ROBOTS_TXT`): rastrear `/docs` y `/redoc` sí, y
  `/openapi.json`, que las dos piden con JavaScript; los datos no. Lo pedían a diario y respondía 404, así que nada apartaba a un rastreador de
  `/api/v1/bi/*`. Va fuera de la versión, como `/` y `/health`.
- **`GET /tenders` sin barra responde sin redirigir** (una ruta oculta junto a `/tenders/`). El
  navegador pide `/api/proxy/…/tenders/`, Next quita la barra y el proxy llega sin ella: con el
  307 de `redirect_slashes`, el límite por IP contaba las dos peticiones y cada consulta del
  catálogo gastaba dos de las 60 por minuto. Una ruta nueva con barra final que el frontend
  pida necesita lo mismo. `tests/test_tenders_sin_barra.py`.
