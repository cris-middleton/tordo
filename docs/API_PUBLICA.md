# API pública

> **La referencia de endpoints no está aquí, y es deliberado.** Vive en el propio
> esquema OpenAPI (`/docs`, `/redoc`, `/openapi.json`), que se genera del código:
> una lista de endpoints escrita a mano se queda vieja sin que nada falle.
>
> Este documento explica **lo que el esquema no puede explicar solo**: qué se
> promete, qué no, y por qué las cosas están como están.

## Qué se promete

Cada grupo de endpoints está clasificado como **pública** o **interna** en
`backend/app/api/documentacion.py::SUPERFICIE`, y esa clasificación sale también
en `/docs`.

| pública | interna |
|---|---|
| `tenders`, `bi`, `compra-agil`, `publico` | `health`, `raiz` |

- **Pública** — pensada para integrarse. Dentro de `/api/v1` no se quitan campos
  ni cambia el significado de los que hay.
- **Interna** — sondas y metadatos. Se pueden llamar, pero nadie promete que
  sigan ahí mañana.

`tests/test_superficie_publica.py` **falla si aparece un grupo sin clasificar**.
Es lo que impide que «la API pública» se convierta en «todo lo que resultó estar
montado» — una promesa de estabilidad que nadie decidió dar.

## Acceso

**Anónimo.** Desde el pivote a sitio público (octubre de 2026,
`docs/PIVOTE_PUBLICO_2026-10.md`) no hay cuentas, claves de API ni sesiones:
todo lo que expone la API se lee sin credencial.

```bash
curl "https://<host>/api/v1/tenders/?tipo_convocatoria=compra_agil"
```

Antes había claves de API por empresa, límites por clave y cuotas diarias de BI
según el plan. Se fueron con las cuentas.

## Límites

Toda la superficie pública —`/api/v1/*` y el MCP (`/mcp/`)— se limita **por IP y
por minuto**: 60 peticiones en una ventana fija de un minuto. `/health` y `/docs`
no cuentan.

Cada respuesta limitada lleva, **también cuando se deja pasar**:

| cabecera | qué es |
|---|---|
| `X-RateLimit-Limit` | peticiones por minuto |
| `X-RateLimit-Remaining` | las que quedan en este minuto |
| `X-RateLimit-Reset` | segundos hasta que empieza el minuto siguiente |

Al pasarse, la respuesta es **429** con `Retry-After` en segundos (lo que falta para
el minuto siguiente). Un cliente bien hecho mira `X-RateLimit-Remaining` y no llega
al 429.

Un cliente IPv6 cuenta por su /64. El límite vive en memoria de la API, que corre un
solo proceso; los detalles y el modelo de confianza sobre la IP están en
`backend/app/core/limite_ip.py`.

Los CSV de `/bi/exportar/*` llevan además un **tope de 5.000 filas**. Cuando se
corta, la última línea lo dice —`# recortado a 5000 filas`— para que nadie sume
una columna creyendo tener el total; con pandas, `comment="#"` la salta.

## Personas naturales

Un proveedor con RUT bajo 50.000.000 es una persona natural, y **ninguna
respuesta lo nombra**: ni el catálogo, ni el BI, ni el MCP, ni los CSV. Sale como
«Persona natural»; en el BI, con un código `PN-…` que lo distingue de otras
personas dentro del mismo análisis, pero que cambia cada semana y no permite
volver a identificarlo. La regla vive en `etl/analytics/personas.py` y se aplica
**al guardar**, no al servir: lo que la base no tiene, ninguna ruta lo puede
filtrar.

**Por eso el detalle de una licitación dejó de traer `datos_completos` y
`participantes`** (octubre de 2026): eran el payload crudo de Mercado Público y la
lista de oferentes, publicaban el nombre y el RUT de personas naturales —también
de las que no ganaron—, y ni el sitio ni nadie integrado los usaba. Los ganadores
siguen en `detalle.proveedor_adjudicado` y en `items[].Adjudicacion`, ya limpios.
Desde el paso 7 del pivote, ni siquiera se guardan.

## Campos retirados de `v1`

`v1` sólo ha quitado campos dos veces, y en ningún caso se perdió un dato que
alguien pudiera estar usando:

| campo | dónde | cuándo | por qué |
|---|---|---|---|
| `datos_completos`, `participantes` | `detalle` de una licitación | octubre de 2026 | personas naturales (ver arriba) |
| `organismo_id` | cada licitación del catálogo | octubre de 2026 | **siempre fue nulo**: la tabla de organismos que lo llenaría nunca se llenó. El comprador está en `codigo_organismo` y `nombre_organismo` |
| `similarity_score` | cada licitación del catálogo | octubre de 2026 | **siempre fue nulo** desde que la búsqueda pasó a `ts_rank` (paso 8 del pivote); el orden por relevancia ya es el orden de la lista |

## Cuánto guarda el catálogo

`/tenders` es lo que se puede postular **hoy**, no un archivo histórico: la
historia completa de compras vive en el análisis (`/bi/*`), que sale de la
descarga masiva de ChileCompra.

- **Compra Ágil**: los últimos **30 días** desde su publicación, y nunca menos que
  el mes anterior completo (entre 30 y ~62 días).
- **Licitaciones**: abiertas, y cerradas hasta **90 días** después del cierre.

Lo anterior se purga una vez por semana, y su código responde **404** igual que uno
que nunca existió.

Para quedarse sólo con lo que se puede postular **ahora**, `GET /tenders/?abiertas=true`:
publicadas, sin cierre o con cierre futuro. `estado=Publicada` no basta —no mira el
cierre—. Es la misma definición que cuenta `GET /publico/portada`.

`search=` (en `/tenders/` y en `/compra-agil/destacadas`) exige todas sus palabras,
sin importar tildes ni mayúsculas. Una palabra coincide entera, con sus plurales, o
por su comienzo en el nombre: «valvul» encuentra «válvula» y «bus» encuentra «buses»,
pero no «combustible». `GET /bi/productos?q=` y `GET /publico/productos?q=` buscan
también desde el comienzo de una palabra y sin tildes: «mesa» no encuentra «parmesano»
y «valv» encuentra «Válvula».

## «Lo mejor de hoy» en Compra Ágil

`GET /api/v1/compra-agil/destacadas?limite=20&region=…&search=…` devuelve las
Compras Ágiles abiertas que **cierran en más de 2 horas** (menos no da tiempo a
cotizar), de mejor a peor puntaje. `limite` va de 1 a 50 (otro valor: 422).

`codigo_organismo=<código>` deja sólo las de ese comprador (lo usa su página
pública). Una Compra Ágil sólo trae el RUT del comprador, y el código se alcanza
por la tabla RUT → código del análisis: **sin análisis materializado, la lista
sale vacía** —no se puede saber de quién es cada una—, nunca el listado entero.

**El puntaje es una heurística, no un modelo.** No hay todavía una verdad contra
la que evaluarlo —no sabemos qué Compra Ágil le convenía cotizar a nadie—, así
que ordena, no predice, y no es una probabilidad. La respuesta trae **cuatro
factores** en [0, 1] por separado en `factores`, pero **el puntaje es el producto
de tres**: la competencia se informa y no pesa (más abajo).

| factor | cálculo | sin dato | en el puntaje |
|---|---|---|---|
| `comprador` | `percentil_ordenes` de la **unidad de compra** (su RUT) en la ventana: la parte de las unidades con Compra Ágil que emitió menos órdenes | 0 si la unidad no tiene órdenes en la ventana; 0,5 si aún no hay historia (ver abajo) | sí |
| `tiempo` | `min(1, horas hasta el cierre / 72)` | — (sin cierre no entra) | sí |
| `monto` | `0,5 + 0,5 · m / (m + 708.050)` sobre `monto_estimado`, en [0,5; 1) | 0,75 (también con monto 0 y con el tope de Compra Ágil, `monto_es_tope`) | sí |
| `competencia` | `1 / (1 + cotizaciones recibidas)` | 0,5 | **no**, sólo informativo |

Un factor sin dato vale **el centro de su escala**, no cero ni uno: inventarle
una ventaja o un castigo a quien no tiene historia sesgaría la lista. **El
comprador distingue dos casos que no son lo mismo:**

- **La historia por unidad aún no está disponible** (`historia_disponible: false`
  en la respuesta: entre el despliegue y la primera corrida semanal que la
  calcula, la tabla no existe o está vacía). No se sabe nada de ninguna unidad:
  `factores.comprador` vale 0,5 para todas, `comprador` viene `null` en cada ítem
  y **no significa que la unidad no compre**. El orden es sólo tiempo × monto.
- **La historia está disponible y la unidad no figura** (`comprador: null` con
  `historia_disponible: true`): no tuvo órdenes de Compra Ágil en la ventana. Eso
  es un dato, no un hueco: `factores.comprador` vale 0. Una unidad que no podemos
  casar con ninguna orden cuenta como «sin historia» y va al final. El puntaje 0 no se
  infla ni se muestra, pero los empates (los ceros incluidos) se ordenan por
  tiempo × monto, y luego por cierre y código.

- **`comprador` mide cuánto compra la unidad, no si adjudica lo que publica.**
  Lo trae `comprador.percentil_ordenes` (0–1; nulo si la unidad no tuvo órdenes o la historia aún no está disponible) y sale de
  `analytics.compra_agil_unidad`, por RUT de la unidad: la FACh, por ejemplo,
  son 14 unidades bajo un solo código de organismo, y cada una lleva su
  historia, no la del organismo. `órdenes / publicadas` ya no se usa: no es una
  tasa de adjudicación (la orden sale días después de publicar y no dice de qué
  Compra Ágil viene) y, con `publicadas` acumulándose sólo desde el despliegue,
  saturaba en 1 para casi todos. **`comprador.publicadas` es siempre `null`**;
  el campo se conserva para no romper a quien integra. Las publicadas por
  organismo siguen en `GET /publico/compradores/{codigo}`.
- **`monto` pesa en el puntaje, no sólo desempata**: en los extremos de la
  instantánea medida el 2026-10-14 ($80.000 a $7.000.000, sin contar el tope) el
  factor va de ~0,55 a ~0,95, hasta ~1,7× el puntaje con los demás factores iguales. Está porque el
  criterio de orden sólo se cumple con él (mayor empate entre las 50 primeras: 6
  sin monto, 2 con él; puntajes distintos: 37 contra 49). Es una decisión de
  producto —a igual esfuerzo de cotizar, más monto vale más—, no una verdad
  medida, y se revisa. La referencia 708.050 es la mediana del monto total por orden
  de Compra Ágil (OC 2025-10 a 2026-03, 365.299 órdenes).
- **El tope de Compra Ágil no cuenta como monto** (`monto_es_tope: true`). El monto
  es el disponible que declara el comprador, y muchos declaran el tope de la
  modalidad (100 UTM) en vez de lo que piensan gastar: ese monto no dice cuánto se
  va a comprar, y premiarlo ponía arriba a quien declaró el tope (el 2026-10-16, las
  cinco primeras valían $7,2 millones). Vale 0,75, como sin monto. La UTM cambia
  cada mes, así que el tope no es una constante: es el mayor `monto_estimado`, desde
  $6.000.000, que declaran al menos tres Compras Ágiles guardadas (un monto mal
  tipeado aparece una vez; el tope, cientos). Sin ninguno, no hay tope.
  `monto_es_tope` marca lo que queda a menos de un 2 % de él, por arriba o por abajo. `monto_estimado`
  viaja igual.
- **`competencia` se informa, no pesa** (compuerta G1, cerrada; ver abajo). El
  único dato de competencia de una Compra Ágil abierta es
  `ofertas_recibidas` (cotizaciones recibidas), y `ofertas_al` dice **cuándo se
  escribió por última vez la fila** (hora de Chile): es la mejor cota de cuándo
  se vio ese conteo, no una lectura garantizada, y uno viejo puede haber subido.
  Léelo con esa hora.

**Compuerta G1, cerrada (2026-10-15): el conteo de cotizaciones NO se refresca
tras la primera ingesta.** Medido en producción, en sólo lectura: de 1.785
Compras Ágiles abiertas, ninguna subió su conteo en ~3 h que cruzaron la corrida
de las 13:00, porque el cron frecuente sólo lista lo publicado en su ventana; el
82,9 % de las abiertas dice cero y las cerradas tienen mediana 5. Por eso la
competencia **no entra en el puntaje** (`EN_EL_PUNTAJE` en
`repositories/compra_agil.py`) y el sitio **no muestra el conteo**
(`MOSTRAR_COTIZACIONES = false` en `frontend/lib/compraAgil.ts`). Mostrarlo exige
antes un refresco del conteo de las abiertas en el ETL (hoy no existe; tendría que
caber en la cuota de la API de Compra Ágil); con él, se pone esa constante en
`true` y la tarjeta y el RSS lo siguen solos.
**Volver a pesar la competencia en el puntaje es una decisión de producto
aparte**, no un efecto de haber cerrado G1: se añade a `EN_EL_PUNTAJE`, se pasa el
criterio de orden de `backend/tests/test_orden_destacadas_instantanea.py` y se
cambian la descripción y la guía «Lo mejor de hoy».

La historia de la unidad (`comprador`, nulo si no tiene) cubre **seis meses**
anclados en el último mes con datos (`ventana_desde`/`ventana_hasta`), y sale de
las órdenes de compra de la descarga masiva: órdenes vigentes, proveedores
distintos, cuota del que más gana y el monto típico **por orden**. **Ningún dato de
proveedor**: sólo conteos.

`actualizado_en` es la última ingesta de Compra Ágil, en hora de Chile. Si es
vieja, la corrida falló y la lista puede incluir cosas que ya no están abiertas.

## Páginas públicas: comprador, rubro y producto

`/api/v1/publico/*` es lo que sirve las páginas indexables del sitio (paso 10 del
pivote): una por comprador, por rubro y por producto, más su sitemap. Son
**pública** y se pueden integrar, pero están pensadas para pintar una página: cada
respuesta trae ya los enlaces a las demás.

| ruta | qué devuelve |
|---|---|
| `GET /publico/sitemap` | `actualizado` y los códigos y slugs **indexables** de cada tipo |
| `GET /publico/compradores/{codigo}` | el perfil de `/bi/comprador`, su Compra Ágil y sus 10 rubros de más monto |
| `GET /publico/rubros/{slug}` | el panorama de `/bi/panorama` y sus 10 compradores de más monto |
| `GET /publico/productos/{slug}` | una banda nacional por unidad de medida —con cuántos organismos la compran (`compradores`), la fracción del mayor (`cuota_mayor`) y si es un precio de mercado (`de_mercado`), más `medianas_compradores`: `{n, p50}` de cada organismo detrás de la banda, las de más compras primero y como mucho 200, `null` si todavía no se calculan—, los 10 compradores que más lo compran —una fila por comprador y unidad, con sus compras (`n`, desde 1) y la mediana de lo que pagó (`p50`), sobre las mismas compras que la banda— y el `periodo` de las bandas (12 meses) |
| `GET /publico/productos?q=&limite=` | búsqueda por palabras, también de los no indexados, con la `descripcion` de cada producto (cómo lo escribe el comprador) |
| `GET /publico/mercado` | el gasto mensual del Estado por sector y en cuántos mercados (un comprador en un rubro) un solo proveedor se lleva la mitad o más, con la cuota del líder en diez tramos |
| `GET /publico/portada` | cuántas licitaciones (no Compra Ágil) y Compras Ágiles se pueden postular ahora, las Compras Ágiles abiertas por día de cierre, cuántas se publicaron hoy y qué organismo publicó más, y la hora de la última ingesta de Compra Ágil |

`/publico/portada` no lee el análisis sino el catálogo: responde aunque el BI esté apagado.
Cada conteo es el `total` de `GET /tenders/?abiertas=true` con su `tipo_convocatoria`.

`compra_agil_por_cierre` reparte `compra_agil_abiertas` por el **día de Chile** en que
cierran —`hoy`, `manana`, `dos_tres_dias` (pasado mañana o el día siguiente) y `despues`
(desde el cuarto día, o sin cierre)— y los cuatro suman la cifra. `publicadas_hoy` cuenta
las licitaciones y Compras Ágiles vigentes publicadas hoy, abiertas o no, y
`mas_publica_hoy` es el organismo que más publicó, **agrupado por su nombre** (la Compra
Ágil no trae código; un organismo escrito de dos formas cuenta como dos) y escrito como lo
guarda ChileCompra; nulo si no hubo publicaciones con nombre. Los tres son opcionales: un
cliente que no los conoce los ignora.

`/publico/mercado` no lleva parámetros y trae dos bloques, cada uno `null` mientras la
corrida semanal no haya escrito su tabla (y 503 con el BI apagado, como las fichas):

- **`gasto_mensual`**: una fila por mes y sector —`anio`, `mes`, `sector`, `monto` (CLP) y
  `n_oc`—, en orden de mes y de sector. El sector vacío se suma a `Otros`. Sale de las
  órdenes de compra: el último mes puede estar a medias, y los contratos de obra del MOP no
  están, porque la descarga masiva de órdenes no los trae.
- **`concentracion`**: `mercados` (los que tienen cuota del líder), `sobre_la_mitad` (el líder
  se lleva el 50 % o más), `un_proveedor`, `monto_total`, `monto_sobre_la_mitad`, `tramos`
  —diez de 10 puntos, `{desde, hasta, mercados, monto}`; el 100 % cae en el último, y suman
  `mercados` y `monto_total`— y `ventana_desde`/`ventana_hasta` (36 meses), nulas si la tabla
  no las publica.

Todo se agrega en la base: la respuesta son unas decenas de filas.

Las cifras del análisis llevan su periodo: `periodo` en `/publico/productos/{slug}` (12
meses) y `ventana_desde`/`ventana_hasta` en cada sector de `/bi/sector` (36 meses), nulos
mientras la corrida semanal no los haya escrito.

**Rubros y productos van por `slug`**, porque no tienen código: sin tildes,
minúsculas, todo lo demás a `-`, hasta 80 caracteres. **El slug lo da la API**;
un cliente no lo calcula ni lo deshace, y la ruta sólo acepta el slug exacto
(`Equipos-Medicos` es 404). Si dos nombres dan el mismo slug —pasa con
«Servicios Legales» y «Servicios legales»—, gana el de más órdenes y el otro no
tiene página.

**`indexable`** dice si la página tiene datos suficientes para ofrecerla a un
buscador; el criterio está escrito, con sus cifras, en
`backend/app/services/publico/indexables.py`:

- comprador: al menos 50 órdenes y algún mercado en la ventana de análisis;
- rubro: todos;
- producto: alguna banda nacional con 10 compras o más, predictibilidad alta o
  media y **precio de mercado** (`de_mercado`): al menos 3 organismos compradores y
  ninguno con más de la mitad de las compras. Una banda de un solo comprador es el
  precio de su contrato. Las tres condiciones, en la misma banda.

Una página no indexable **responde igual, con 200**: existe, pero el sitio la marca
`noindex`. Sólo lo que no existe es 404. La búsqueda de productos ignora tildes,
mayúsculas y el orden de las palabras, y devuelve primero los indexables.
Aplica al término la misma regla que construye la firma: no cuentan los artículos ni el
relleno («de», «la», «según detalle adjunto»), las palabras de menos de tres
letras ni las que llevan dígitos. Un término hecho sólo de esas palabras («de la»)
responde `[]`.

Como el resto: **ningún dato de proveedor** que identifique a nadie. Los líderes de
un rubro salen por nombre (las personas naturales, con su seudónimo `PN-`), sin
código ni RUT.

## Licencias

Las cifras que calcula el sitio —bandas de precio, puntajes, indicadores de competencia y de
compradores, y los CSV de análisis— se publican bajo **CC BY 4.0**: se pueden reutilizar,
también con fines comerciales, citando el sitio y conservando la cita de ChileCompra. Los campos
del catálogo, tal como los publica ChileCompra, **no** los licencia el sitio: siguen las
condiciones de ChileCompra. El código de la API, del sitio y del ETL se publica bajo **AGPL-3.0 o
posterior** (`AGPL-3.0-or-later`). El detalle, en `/abierto#licencias`.

## Versionado

Todo cuelga de `/api/v1`, y el prefijo lo pone la aplicación al montar los
routers — publicar una v2 es montarlos bajo otro prefijo, no editar cada router
(ver [ADR 0009](decisiones/0009-api-versionada-y-sin-envelope.md)).

Dentro de `v1`:

- **no** se quitan campos ni cambia el significado de los que hay;
- **sí** se añaden campos, y eso se considera compatible: un cliente no debe
  romperse ante un campo que no conoce;
- un cambio incompatible estrena prefijo.

## Errores

Respuestas **planas, sin sobre**: el éxito lo lleva el código HTTP. Los errores
traen `{"detail": "…"}`.

| código | qué significa | qué hacer |
|---|---|---|
| 404 | no existe | revisar el código o identificador |
| 422 | parámetros inválidos | `detail` nombra el campo |
| 429 | límite por minuto | esperar lo que diga `Retry-After` |
| 503 | el módulo está desactivado en este despliegue | no depende del cliente |

Toda respuesta lleva `X-Request-ID`. **Cítalo al reportar un problema**: es lo
que permite encontrar la traza del servidor.

## Servidor MCP

Para clientes de modelos de lenguaje. Vive en **`/mcp/`**, fuera de `/api/v1`:
MCP versiona su propio protocolo, y colgarlo de nuestra versión REST prometería
que una v2 nuestra lo cambia —falso— y que no cambia sin que cambiemos la v
—también falso—.

Es **anónimo**:

```json
{ "mcpServers": { "tordo": { "url": "https://<host>/mcp/" } } }
```

También responde en `https://<host>/mcp`, sin barra y sin redirigir. Las demás
redirecciones de la API (barra final de `/api/v1/*` y `/health`) llevan un `Location`
relativo: se resuelven contra la URL pedida y nunca bajan a `http://`.

En producción, **`https://api.tordo.cl/mcp/` — con la barra final**, que es la canónica. Cómo
conectarlo desde Claude, ChatGPT, Cursor y VS Code, en el sitio: `/abierto#mcp`.

**Cuatro herramientas, no veinte**, y es la decisión de diseño que sostiene todo
lo demás:

| herramienta | qué devuelve |
|---|---|
| `panel_de_licitacion` | comprador, ventana, competidores y precios de una licitación, **en una llamada** |
| `precio_de_producto` | bandas P10–P90 con nivel usado, confianza y tamaño de muestra |
| `perfil_de_comprador` | el comportamiento de un organismo y sus señales de riesgo |
| `buscar_productos` | del nombre al código ONU |

Una persona hace unas tres consultas de BI para evaluar una licitación; **un
modelo encadena unas quince** para responder una sola pregunta. Nació para no
agotar una cuota diaria en una conversación; ya no hay cuotas, pero cada llamada
sigue siendo carga sobre la base. Menos herramientas que devuelvan más.

Tres cosas más que conviene saber:

- **Protección contra DNS rebinding, encendida.** El servidor sólo acepta los
  `Host` de `MCP_HOSTS_PERMITIDOS` (por defecto `localhost,127.0.0.1`); cualquier
  otro recibe **421**. Estuvo apagada mientras cada llamada exigía una clave —una
  petición rebotada llegaba sin credencial y no obtenía nada—; desde que el MCP es
  anónimo, ese argumento ya no vale. **Al desplegar, la lista tiene que incluir
  el dominio público.**
- **Ninguna herramienta acepta `empresa_id`.** No hay empresas, y un modelo
  rellenaría ese hueco con lo que le pareciera.
- **Las bandas de precio llegan siempre con `confianza` y `n`**, y las
  instrucciones del servidor le piden al modelo que los mencione. Una mediana de
  cuatro órdenes presentada como precio de mercado es el error más caro posible
  aquí.

Los errores llegan como resultado de la herramienta, no como fallo de protocolo:
«esa licitación no existe» es algo que el modelo puede contarle al usuario.

## Lo que se retiró

El pivote a sitio público quitó endpoints dentro de `v1`, que es justo lo que la
promesa de arriba dice que no pasa. Se dice aquí para que nadie lo descubra con
un 404:

- **Todo lo que dependía de una cuenta** (usuarios, empresas, alertas,
  documentos, postulaciones, cobro), con las cuentas.
- **`/bi/matching`** (texto libre → proveedores históricos parecidos). Lo
  calculaba un modelo TF-IDF cargado dentro de la API, ~165 MB por proceso, y un
  texto arbitrario no se puede precalcular. Quién vende en un rubro lo responde
  `/bi/panorama`; a un comprador concreto, `/bi/competidores/{organismo_id}`.
- **`/bi/clusters`**, que leía un archivo del ETL desde la API y ninguna
  pantalla usaba.

`sort_by=relevance` en `/tenders/` **sigue**, pero ahora lo ordena Postgres
(rango de texto completo sobre nombre y descripción, sin tildes). El campo
`similarity_score`, que era el coseno del modelo, quedó siempre en `null` y se
retiró después (ver «Campos retirados de `v1`»).

## Lo que todavía no está

Dicho claro, porque son las preguntas que hace cualquiera que integre:

- **No hay webhooks salientes ni avisos.** Para enterarse de una licitación
  nueva hay que consultar. El ETL corre cada hora, así que sondear más seguido no
  aporta.
- **No hay paginación por cursor.** Los listados usan `offset`/`limit`; sobre un
  catálogo que cambia mientras se pagina, eso puede repetir o saltarse un
  elemento.
- **No hay entorno de pruebas.** No existe staging (ver `CLAUDE.md`).
