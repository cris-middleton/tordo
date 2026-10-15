# 0010 — Extracción de bases con LLM: aplazada por falta de fuente

**Estado**: Aceptada · **Fecha**: 2026-08-08
**Reevalúa**: el punto pendiente del [ADR 0004](0004-llm-solo-mcp.md) y §14 de
`../ARQUITECTURA_REVISION_2026-08.md`.

## Contexto

El ADR 0004 dejó fuera el chat conversacional pero marcó como **el único uso de LLM con valor
claro** la extracción estructurada sobre las bases de licitación: documentos exigidos,
criterios de evaluación con ponderaciones, garantías y causales de rechazo. Es lo único que no
se puede derivar de los datos de órdenes de compra y licitaciones, y ataca el pilar de
compliance — *«que no te rechacen por forma»*.

El plan lo puso como F6.6 con una condición explícita: **reevaluar después de F3**, cuando el
plan por empresa permitiera cobrarlo por capacidad. F3 está hecho. Esta es la reevaluación.

## Lo que se comprobó, y que cambia la decisión

**1. La API no entrega las bases. Ni siquiera lo que contienen.**

El diccionario de datos oficial («Documentación API Mercado Público - Licitaciones», de ChileCompra; ya no se versiona en `docs/`)
describe unos 80 campos por licitación. Buscando en su texto:

| término | apariciones |
|---|---|
| `Licitaci…` | 260 |
| `Adjunt…` | **0** |
| `Garantía` | **0** |
| `Criterio` | **0** |
| `Ponderaci…` | **0** |

Lo único parecido es `Adjudicacion/Tipo`, que es el **acto administrativo que adjudica**
(resolución, decreto…), no las bases. Es decir: **no sólo faltan los archivos — faltan también
los datos que el LLM iba a extraer de ellos.** No hay atajo estructurado.

**2. Nada del sistema ingiere adjuntos.**

`licitaciones` guarda `url_licitacion` y `url_acta`, que son **enlaces a la ficha del portal**,
no a archivos. Los tres extractores del ETL (`mercado_publico_licitaciones`,
`mercado_publico_ordenes`, `compra_agil`) no descargan ningún documento.

**3. La premisa que sostenía la urgencia era falsa.**

§14 argumentaba que el checklist era el módulo más flojo porque dependía de
`PlantillaChecklist`, *«plantillas estáticas que puede que ni siquiera estén sembradas»*.
Comprobado contra la base: **`plantillas_checklist` tiene 29 filas**. El módulo funciona.

## Decisión

**No se construye ahora.** El punto F6.6 queda **reevaluado y aplazado**, no pendiente.

## Por qué

Porque **el proyecto no es el que parecía**. §14 razonó la economía como «costo por documento,
que se amortiza entre los suscriptores que miren esa licitación», y con eso la respuesta era
obviamente sí. Pero ese cálculo da por supuesto que el documento está disponible. No lo está.

Lo que hay que construir, en orden de costo real:

1. **Un scraper del portal** `mercadopublico.cl` para bajar las bases. Es un ASP.NET WebForms
   con `viewstate`: frágil, y se rompe cuando cambian la ficha.
2. **La pregunta legal.** Consumir la API está sancionado y tiene su declaración de uso de
   datos oficiales; **automatizar el portal web no es lo mismo**, y no está resuelto.
3. **Almacenamiento** de los archivos.
4. **Y al final, la extracción con LLM** — que es la parte barata y la única que el ADR 0004
   tenía en la cabeza.

Construir 1–3 para llegar a 4 es un proyecto entero, con una dependencia frágil y una duda
legal, para mejorar un módulo que **hoy funciona**. No es lo siguiente que hay que hacer.

## Qué lo convertiría en un sí

Cualquiera de estas tres, en este orden de preferencia:

1. **Que exista una fuente autorizada de los archivos.** ChileCompra publica datos abiertos y
   procesos en formato OCDS, y OCDS **sí** contempla un array `documents` con URL por proceso.
   **No pude verificar si el publicado por ChileCompra lo trae**: el portal de datos abiertos
   es una aplicación JavaScript sin contenido servido, y `desarrolladores.mercadopublico.cl`
   rechazó la conexión. **Es la única comprobación que falta**, y si sale que sí, esta decisión
   se reabre de inmediato: desaparecen el scraper y la duda legal, y queda sólo la parte barata.
2. **Que un usuario pida el checklist real** y no le baste el de plantilla. Hoy no hay usuarios
   pagando, así que es una preferencia sobre una necesidad supuesta.
3. **Que ChileCompra estructure garantías y criterios en la API.** Entonces no haría falta ni
   el LLM.

## Consecuencias

- **F6 queda cerrado.** Sus seis puntos están resueltos: cinco construidos y éste decidido.
- **El ADR 0004 deja de tener un pendiente abierto.** Su nota «reevaluar después de F3» se
  resuelve aquí.
- **El checklist se queda con las plantillas por tipo de licitación**, que están sembradas y
  funcionan. No se degrada nada: no había nada mejor esperando.
- **Sigue sin haber ninguna dependencia de un proveedor de LLM** en el sistema, ni clave, ni
  costo variable, ni datos saliendo hacia un tercero.

## Lo que NO dice esta decisión

No dice que la extracción de bases no valga. Dice que **la parte cara no es el LLM**, y que la
decisión de §14 se tomó sin ese dato. Con una fuente autorizada de los archivos, el cálculo de
§14 vuelve a ser correcto y la respuesta vuelve a ser sí.
