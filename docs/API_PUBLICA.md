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
| `tenders`, `bi`, `alerts`, `empresas`, `postulaciones`, `documentos`, `estado_habil` | `dashboard`, `authentication`, `users`, `billing`, `webhooks`, `health`, `data-inspection`, `files`, `raiz` |

- **Pública** — pensada para integrarse. Dentro de `/api/v1` no se quitan campos
  ni cambia el significado de los que hay.
- **Interna** — la usa la aplicación web y puede cambiar sin aviso. Se puede
  llamar, pero nadie promete que siga ahí mañana.

`tests/test_superficie_publica.py` **falla si aparece un grupo sin clasificar**.
Es lo que impide que «la API pública» se convierta en «todo lo que resultó estar
montado» — una promesa de estabilidad que nadie decidió dar.

## Empezar

### 1. Emitir una clave

Con una sesión de `owner` o `admin`:

```bash
curl -X POST https://<host>/api/v1/empresas/<empresa_id>/api-keys \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"nombre": "ERP de facturación"}'
```

```json
{ "id": "…", "nombre": "ERP de facturación", "prefijo": "a1b2c3d4",
  "clave": "tordo_a1b2c3d4_…" }
```

**`clave` sólo aparece aquí.** En la base queda su hash; si se pierde, se revoca
y se emite otra. El `prefijo` se guarda en claro justamente para poder decir *«la
clave `tordo_a1b2c3d4…` no se usa desde marzo»* sin conocer el secreto.

### 2. Usarla

```bash
curl https://<host>/api/v1/tenders/?tipo_convocatoria=compra_agil \
  -H "Authorization: Bearer tordo_a1b2c3d4_…"
```

Va en el mismo `Authorization: Bearer` que un JWT: se distinguen por el prefijo
`tordo_`, sin consultar la base.

### 3. Respetar el límite

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 118
```

Las cabeceras llegan **en las respuestas correctas**, no sólo en el 429: una
integración sólo puede espaciarse si sabe cuánto le queda, y enterarse por el
corte es enterarse tarde.

## Límites

| plan | peticiones/minuto por clave | consultas BI/día |
|---|---|---|
| Básico | 30 | 3 |
| PYME | 60 | 50 |
| Pro | 120 | sin límite |
| Enterprise | 600 | sin límite |

Los números viven en `PLAN_QUOTAS` (`backend/app/core/plan_limits.py`) y esta
tabla es una copia para leer: **si difieren, manda el código**.

Dos límites distintos, por dos motivos distintos:

- **Por minuto y por clave** — protege el servicio de una integración mal
  escrita. Se cuenta por clave y no por IP porque un ERP sale por una sola IP de
  oficina: limitar ahí metería a toda la empresa en el mismo cubo, y quien
  quisiera saltárselo sólo tendría que usar varias IP.
- **Por día y por empresa, sólo en BI** — es la capacidad que se vende. Una
  consulta de BI cuesta bastante más que leer una licitación.

La ventana del límite por minuto es **fija**, no deslizante: en el borde de dos
minutos caben hasta el doble en un segundo. Para lo que protege, la simplicidad
vale más que la exactitud.

**Si Redis no responde, se deja pasar.** Quedarse sin límite un rato es peor que
dejar sin API a quien paga — y en ese caso no se mandan cabeceras, porque
cualquier número sería inventado.

## Aislamiento entre empresas

Una clave **pertenece a una empresa y la fija**. Pedir datos de otra devuelve
**403 aunque quien la creó pertenezca a las dos**: si la barrera fuera la
pertenencia del usuario, filtrar una clave expondría todas las empresas de esa
persona.

Por eso tampoco hace falta mandar `empresa_id`: si no se indica, se usa la de la
clave.

## Versionado

Todo cuelga de `/api/v1`, y el prefijo lo pone la aplicación al montar los
routers — publicar una v2 es montarlos bajo otro prefijo, no editar catorce
ficheros (ver [ADR 0009](decisiones/0009-api-versionada-y-sin-envelope.md)).

Dentro de `v1`:

- **no** se quitan campos ni cambia el significado de los que hay;
- **sí** se añaden campos, y eso se considera compatible: un cliente no debe
  romperse ante un campo que no conoce;
- un cambio incompatible estrena prefijo.

## Errores

Respuestas **planas, sin sobre**: el éxito lo lleva el código HTTP. Los errores
traen `detail`.

| código | qué significa | qué hacer |
|---|---|---|
| 401 | credencial ausente, inválida, revocada o caducada | emitir otra clave |
| 403 | válida, pero no alcanza a esa empresa o ese rol | revisar a qué empresa está fijada |
| 402 | tope del plan | `detail.upgrade_sugerido` dice cuál lo levanta |
| 404 | no existe **o** no es de tu empresa | no se distinguen a propósito |
| 422 | parámetros inválidos | `detail` nombra el campo |
| 429 | límite por minuto | esperar lo que diga `Retry-After` |

El 402 es el único con `detail` estructurado, porque es el único que el cliente
puede resolver solo:

```json
{ "detail": { "bloqueada_por_plan": true, "mensaje": "…",
              "plan_actual": "pyme", "limite": 50, "usado": 51,
              "upgrade_sugerido": "pro" } }
```

Toda respuesta lleva `X-Request-ID`. **Cítalo al reportar un problema**: es lo
que permite encontrar la traza del servidor.

## Servidor MCP

Para clientes de modelos de lenguaje. Vive en **`/mcp/`**, fuera de `/api/v1`:
MCP versiona su propio protocolo, y colgarlo de nuestra versión REST prometería
que una v2 nuestra lo cambia —falso— y que no cambia sin que cambiemos la v
—también falso—.

Se configura con la **misma clave de API**:

```json
{ "mcpServers": { "tordo": {
    "url": "https://<host>/mcp/",
    "headers": { "Authorization": "Bearer tordo_a1b2c3d4_…" } } } }
```

**Cuatro herramientas, no veintidós**, y es la decisión de diseño que sostiene
todo lo demás:

| herramienta | qué devuelve |
|---|---|
| `panel_de_licitacion` | comprador, ventana, competidores y precios de una licitación, **en una llamada** |
| `precio_de_producto` | bandas P10–P90 con nivel usado, confianza y tamaño de muestra |
| `perfil_de_comprador` | cómo paga un organismo y sus señales de riesgo |
| `buscar_productos` | del nombre al código ONU |

Una persona hace unas tres consultas de BI para evaluar una licitación; **un
modelo encadena unas quince** para responder una sola pregunta. Con `basico` a 3
consultas/día, exponer los 22 endpoints uno a uno agotaría el plan en una
conversación — y la culpa parecería del plan. Menos herramientas que devuelvan
más. **Si algún día se exponen uno a uno, hay que rehacer las cuotas primero.**

Tres cosas más que conviene saber:

- **Cada llamada a herramienta descuenta de la cuota diaria de BI**, con la misma
  función que usa la API. No se cobra por conversación.
- **La empresa sale de la clave, no de un argumento.** Ninguna herramienta acepta
  `empresa_id`: un modelo rellenaría ese hueco con lo que le pareciera.
- **Las bandas de precio llegan siempre con `confianza` y `n`**, y las
  instrucciones del servidor le piden al modelo que los mencione. Una mediana de
  cuatro órdenes presentada como precio de mercado es el error más caro posible
  aquí.

Los errores llegan como resultado de la herramienta, no como fallo de protocolo:
«no te queda cuota» es algo que el modelo puede contarle al usuario.

## Lo que todavía no está

Dicho claro, porque son las tres preguntas que hace cualquiera que integre:

- **No hay webhooks salientes.** Para enterarse de una licitación nueva hay que
  consultar. El ETL corre cada hora, así que sondear más seguido no aporta.
- **No hay paginación por cursor.** Los listados usan `offset`/`limit`; sobre un
  catálogo que cambia mientras se pagina, eso puede repetir o saltarse un
  elemento.
- **No hay entorno de pruebas.** No existe staging (ver `CLAUDE.md`), así que se
  integra contra producción con una clave propia.
