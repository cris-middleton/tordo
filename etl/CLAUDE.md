# CLAUDE.md — `etl/`

> Complementa al `CLAUDE.md` de la raíz, que se carga siempre; este lo carga Claude Code al
> trabajar en `etl/`. Vale la misma regla: **describe el código real, no el objetivo**. Si
> encuentras una diferencia, gana el código y se corrige aquí en el mismo PR.
>
> Los modelos y las reglas compartidas (firma, RUT, `tipo_convocatoria`) viven en
> `backend/app/` y se importan por `etl/shared_imports.py`: sus patrones de API están en
> `backend/CLAUDE.md`.

## Los cron

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
(`test_una_corrida_cualquiera_que_falla_no_deja_hueco`). **Tras una caída, la ventana parte
de la última escritura en Postgres** (`ultimas_escrituras`, por `tipo_convocatoria`, leída
antes de escribir nada): Compra Ágil nunca desde después de la última fila escrita menos 1 h
(tope `RECUPERACION_COMPRA_AGIL`, 72 h, por el límite de tasa), y el barrido de licitaciones
desde el día de la última licitación escrita (tope `DIAS_RECUPERACION_LICITACIONES`, 5
días); si la primera de hoy no escribió nada, barre la corrida siguiente. Con el cron sano no
cambia nada. Una caída más larga que esos topes sí deja hueco.
**El listado de la API clásica no trae `Moneda`**: el transformador la deja en `None` y la pone
el detalle (el upsert no pisa con nulos). La Compra Ágil se guarda siempre en CLP
(`monto_disponible_clp`), con la moneda original en `informacion_adicional.moneda_original`.
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

**El 429 de Compra Ágil es un límite de TASA, no una cuota diaria** (corregido el 2026-10-24).
Responde «Se ha superado el límite de tasa de solicitudes» y el mismo día vuelve a dejar pasar:
el 10-23 cortó tras 141 peticiones a las 13 UTC y tras 4 a las 16, y dejó pasar 605 a las 19 y
una corrida entera a las 22. El cliente lo tomaba por la cuota del día y no reintentaba: dos
listados perdidos y una corrida «terminada con errores» con el listado ya cargado. Ahora espera
y reintenta (`ESPERAS_TRAS_429`: 30, 60 y 120 s, o lo que pida `Retry-After`; como mucho
`ESPERA_MAXIMA_POR_CORRIDA_S`, 10 min por corrida) y luego lanza `LimiteDeTasa`. **En el cron,
sólo el listado cortado es fallo**; un detalle cortado deja el resto para la pasada siguiente.

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
  analytics (ver «Analytics lee una VENTANA de historia», más abajo): **servicio
  semanal de 8 GB** en Railway. No lo arregles subiendo la máquina. **En producción
  (2026-10-13), con la ventana entera: 7,23 GB de pico y 15,5 minutos** — un 10 % de
  margen, y lo que manda sigue siendo `product_price_bands`. Los módulos de LIC
  (`buyers` incluido) no se pudieron medir: no hay parquets de LIC en local.

**La pasada horaria es `--horario`**: licitaciones publicadas hoy, Compra Ágil de las
últimas 2 h y detalles nuevos. La tarea «horaria» corría `--only-extraer-nuevos`, que sólo
pide el detalle de lo que ya está en la base: lo nuevo entraba una vez al día.

## Patrones de datos y analytics

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
    (`EspecificacionComprador`, `Nombre`, `Descripcion`). Además se borra, en toda fila, el número de un RUT de persona escrito en ese texto
    (`borrar_ruts_de_personas`: con puntos de miles o tras «RUT», bajo 50.000.000; sin ninguna de
    las dos se deja, porque casi siempre es un código de artículo o BIP). Límite: el nombre de una
    persona en una fila ajena no se detecta.
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
    cuenta igual, con código nulo, y **el código nulo es una clave más** al acumular
    (`join_nulls=True`): sin eso no casaba con el de la semana anterior y cada corrida añadía
    otra fila (nulo, mes). Las ya duplicadas se colapsan al leer la tabla anterior, con el máximo.
- **La serie de gasto (`time_series`, `trend_by_market`) cuenta por mes de CREACIÓN y sólo
  meses completos** (`trend_analysis.py`): desde el período del primer archivo leído hasta el
  penúltimo (el último es el mes en curso). Por mes de archivo, el primer mes de la ventana
  perdía las órdenes creadas antes de ella (un 9 % del archivo, medido en local). La regresión
  rellena con ceros los meses sin compras, y el CAGR compara el primer y el último **año de
  calendario** del rango; con menos de 24 meses va nulo (`opportunity_scorer` le pone su neutro).
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
- **Los números de la descarga masiva se leen en `data_loader`, no en cada módulo**
  (`con_numeros`, con `NUMERICAS_OC` y `NUMERICAS_LIC`). Vienen como texto, con coma decimal y,
  en licitaciones, en notación científica («2,5e+07»): con un `cast(Float64, strict=False)` por
  módulo se perdía el 53 % de las filas de órdenes y **el 21 % de los presupuestos de licitación**
  (95.158 de 450.922 en 42 meses), sesgado hacia los redondos. `discount_by_context` pasó de
  280.827 a 366.942 licitaciones adjudicadas con descuento calculable. **Un módulo no vuelve a
  convertir un número que ya llega convertido.** `etl/tests/test_numeros_licitaciones.py`.
  - **Un parquet que no se puede leer hace fallar la corrida** (`_iterar`, y la clasificación
    de personas naturales con el nombre del archivo). Antes se saltaba con un WARNING, el módulo
    terminaba bien y publicaba un mes menos con el latido en verde. `scan_oc` y `scan_lic`, que
    no saneaban el monto ni lo repartían por línea y sólo usaban los tests, se borraron: el
    único camino a los consolidados es `iter_oc_parquets` / `iter_lic_parquets`.
- **Un percentil de la ventana sale de todas sus observaciones, nunca de promediar los de
  cada archivo mensual** (`price_bands`, `sector_dashboard.ticket_mediana`, los días de
  aceptación de `buyer_scoring`; `etl/tests/test_percentiles_de_la_ventana.py`). Se
  promediaban ponderando por `n`: en un par que compra una vez al mes, p10, mediana y p90 de
  cada mes son esa compra, y la banda de 36 meses salía con p10 = p90. Medido en local (6
  meses): el p10 de `price_bands` cambia más de un 20 % en el 84 % de los pares.
- **El archivo de licitaciones trae una fila por (línea, oferta)**: el ganador es `Oferta
  seleccionada = "Seleccionada"`, nunca la primera fila; una licitación «Publicada» trae
  `NumeroOferentes = 0` porque sus ofertas no se han abierto, y no cuenta como «sin
  competencia».
- **Estacionalidad: el z-score cuenta los meses sin compras, y la consistencia divide por los
  años en que ese mes está en los datos** (`etl/tests/test_estacionalidad.py`). La tabla sólo
  guarda los meses con compras: quien la suma (`services/bi/temporal._estacionalidad_sumada`)
  rellena los doce con cero antes de calcular nada.
- **Ninguna salida de analytics cuenta las órdenes canceladas**
  (`data_loader.ESTADOS_CANCELADOS`): `iter_oc_parquets` las quita al leer, enteras, antes de
  sanear y repartir el monto. Una orden cancelada no es un precio pagado ni una cuota de
  mercado. Hasta el 2026-10-21 sólo `sector_dashboard` las quitaba. Las piden con
  `canceladas=True` `buyer_scoring` (sólo para su tasa de cancelación y su denominador: el
  volumen, `n_oc_total`, las quita) y el modelo de
  referencia del harness (`tfidf_matcher`, `evaluation/`), cuyo entrenamiento no cambia. Una
  orden sin estado se queda. `etl/tests/test_canceladas.py` pasa un mercado entero de
  canceladas por cinco módulos y lo busca en cada salida.
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
  - Lo fija `etl/tests/test_monto_saneado.py`, con los casos reales en órdenes sintéticas. El
    cruce de Obras Públicas, `etl/tests/test_medir_obras_mop.py`.
- **La identidad de una entidad es su CÓDIGO. El nombre nunca va en la clave de agrupación**
  (`etl/analytics/identidad.py`). En el histórico de ChileCompra **145 de 1.186 compradores
  (12,2 %) aparecen con más de un nombre** —los cambios de 2021 dejaron a la misma repartición
  como «GOBERNACION PROVINCIAL DE …» y «DELEGACIÓN PRESIDENCIAL PROVINCIAL DE …»— y cuatro
  módulos agrupaban por *(código, nombre, rubro)*. Eso partía un mercado real en varios de
  mentira: 7 de 11 tablas materializadas tenían su clave natural duplicada. El nombre se
  arrastra con `nombre_vigente()`, que se queda con el **más reciente** — un organismo
  renombrado debe salir con su nombre de hoy, y el más frecuente sería siempre el viejo.
  - **«Más reciente» es por fecha, no por texto.** `_periodo_archivo` es el nombre del ZIP,
    «2026-3», sin cero: como texto «2025-9» > «2025-12». `nombre_vigente`, `periodo_maximo` y
    `periodo_minimo` ordenan por `clave_periodo` (año·12 + mes); hasta el 2026-10-21 una ventana
    que cruzaba septiembre y diciembre se quedaba con el nombre de septiembre, y
    `provider_diversification.ultimo_periodo` decía «2026-9» a quien vendió en octubre.
  - Lo cumplen también las bandas de precio L0–L3, `competitor_forecast_l1` y
    `buyer_transparency`, que agrupaban por nombre de organismo, de sector o de producto. El
    nombre genérico de un producto llega truncado de dos formas («…personal sanitari»): 770
    códigos traen dos nombres el mismo mes. **La excepción es Convenio Marco**: toda su línea
    lleva el código de producto «0» (400.896 de 2,48 M líneas en los seis meses locales) y el
    producto es su nombre de catálogo, así que L1–L3 agrupan por `_producto` (el código, o «0|»
    más el nombre). Las tablas conservan sus columnas y su orden.
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
- **No existe ninguna fecha de pago en el dato de ChileCompra.** `mediana_dias_pago` medía
  `FechaEnvio → FechaAceptacion` —lo que tarda el **proveedor** en aceptar la orden, mediana
  real 1,63 días— y el producto lo publicaba como plazo de pago en la pantalla, en el correo
  y en la landing. Se renombró a `*_aceptacion` en todas partes y **no se muestra como cifra
  suelta**: sólo como bandera cuando se sale de rango. Lo que sí sale del dato y decide algo
  es `tasa_adjudicacion` (cuánto de lo que llama termina adjudicando), **contada por
  licitación**: el archivo trae una fila por (línea, oferta), y por filas daba 93,2 % donde
  por licitaciones es 84,2 % (42 meses). Igual `prom_oferentes`. **`pct_trato_directo` sale de las
  órdenes** (`etl/analytics/trato_directo.py`, `Tipo = "TD"`, por orden y sin canceladas): la
  descarga de licitaciones no trae ningún trato directo, y buscarlo ahí lo dejaba en 0 % para todo
  comprador, en la ficha pública y en la nota. Mediana local, 3,7 % de las órdenes. `Forma de Pago`
  tampoco sirve de sustituto: el 98,7 % de las órdenes dice lo mismo.
  **La landing fue el último sitio en soltarla**, y estuvo meses prometiéndola después de que
  el correo y el panel del comprador ya la hubieran retirado: `MockupAviso` mostraba «Paga a
  32 días en promedio» y `MockupComprador` un KPI «Paga a». Cuando se retire un dato, hay que
  buscarlo también en la portada (`components/portada/`) y en las guías — es lo que lee quien
  llega por primera vez.
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
    `product_price_compradores` (ver «Quién lo compra» en las páginas públicas, en el `CLAUDE.md` de la raíz).
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
    ninguna palabra útil («de la», «500») da `[]`; «pc» lleva a computadores por sinónimo
    (`app/utils/sinonimos.py`). `etl/tests/test_normalizacion_precio.py`
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
