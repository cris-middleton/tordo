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
| `tenders`, `bi` | `health`, `raiz` |

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

## Lo que todavía no está

Dicho claro, porque son las preguntas que hace cualquiera que integre:

- **No hay webhooks salientes ni avisos.** Para enterarse de una licitación
  nueva hay que consultar. El ETL corre cada hora, así que sondear más seguido no
  aporta.
- **No hay paginación por cursor.** Los listados usan `offset`/`limit`; sobre un
  catálogo que cambia mientras se pagina, eso puede repetir o saltarse un
  elemento.
- **No hay entorno de pruebas.** No existe staging (ver `CLAUDE.md`).
