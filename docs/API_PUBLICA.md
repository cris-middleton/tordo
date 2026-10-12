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
| `tenders`, `bi`, `compra-agil` | `health`, `raiz` |

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

## «Lo mejor de hoy» en Compra Ágil

`GET /api/v1/compra-agil/destacadas?limite=20&region=…&search=…` devuelve las
Compras Ágiles abiertas que **cierran en más de 2 horas** (menos no da tiempo a
cotizar), de mejor a peor puntaje. `limite` va de 1 a 50 (otro valor: 422).

**El puntaje es una heurística, no un modelo.** No hay todavía una verdad contra
la que evaluarlo —no sabemos qué Compra Ágil le convenía cotizar a nadie—, así
que ordena, no predice, y no es una probabilidad. Es el producto de tres
factores en [0, 1], que la respuesta trae por separado en `factores`:

| factor | cálculo | sin dato |
|---|---|---|
| `competencia` | `1 / (1 + cotizaciones recibidas hasta ahora)` | 0,5 |
| `comprador` | `min(1, órdenes / publicadas)` del comprador en la ventana | 0,5 (también con < 5 publicadas) |
| `tiempo` | `min(1, horas hasta el cierre / 24)` | — (sin cierre no entra) |

Un factor sin dato vale **el centro de su escala**, no cero ni uno: inventarle
una ventaja o un castigo a quien no tiene historia sesgaría la lista.

`órdenes / publicadas` **no es una tasa de adjudicación**: la orden de compra sale
días después de publicar y no dice de qué Compra Ágil viene, así que sólo se usa
sobre la ventana entera y acotado a 1. La historia del comprador (`comprador`, nulo
si no tiene) cubre **seis meses** anclados en el último mes con datos
(`ventana_desde`/`ventana_hasta`), y sale de las órdenes de compra de la descarga
masiva: órdenes vigentes, proveedores distintos, cuota del que más gana y el monto
típico **por orden**. **Ningún dato de proveedor**: sólo conteos.

`actualizado_en` es la última ingesta de Compra Ágil, en hora de Chile. Si es
vieja, la corrida falló y la lista puede incluir cosas que ya no están abiertas.

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
