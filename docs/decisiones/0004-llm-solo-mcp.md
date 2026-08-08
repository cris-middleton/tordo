# 0004 — LLM acotado a un servidor MCP sobre la base histórica

**Estado**: Aceptada · **en pausa** 2026-08-07 → **construido** 2026-08-08 · **Fecha**: 2026-08-05

## Contexto
`docs/SPEC.md` descartó los LLM por costo ("TF-IDF sobre historial OC, sin LLM"). LicitaLab
lanzó "LIA", que analiza las bases de licitación, y también un servidor MCP.

## Decisión
Se incorpora **un servidor MCP de sólo lectura sobre la base histórica**, simple, medido y
cobrado dentro del plan de quien lo consume. Para después de F2.

**No** se incorpora un chat conversacional sobre datos estructurados.

## Consecuencias
- Después de F2 el MCP es casi gratis: consulta las mismas tablas Postgres que sirve la API,
  y el medidor por plan ya existe (`check_bi_quota_dep` sobre Redis).
- Un chat encima de los datos estructurados sería una interfaz peor que los 22 endpoints de
  BI, que ya responden esas preguntas de forma determinista, más rápida y más barata.

## Pendiente de reevaluar
La **extracción estructurada sobre las bases de licitación** (PDF/DOC) quedó fuera, pero es
el único uso de LLM con valor claro: extrae documentos exigidos, criterios de evaluación,
garantías y causales de rechazo — lo único que no se puede derivar de los datos de OC/LIC, y
que alimentaría el checklist automáticamente en vez de con plantillas estáticas. La economía
es por documento (se cachea y se amortiza entre suscriptores), no por consulta de usuario.
**Reevaluar después de F3**, cuando el plan por empresa permita cobrarlo por capacidad.
Ver `docs/ARQUITECTURA_REVISION_2026-08.md` §14.

> **Resuelto el 2026-08-08 en el [ADR 0010](0010-extraccion-de-bases-con-llm.md): aplazada.**
> La API no entrega las bases **ni los datos que se iban a extraer de ellas** —en su
> diccionario oficial, «Adjunt…», «Garantía», «Criterio» y «Ponderaci…» aparecen cero veces—,
> así que el proyecto no era «extraer con LLM» sino «construir y mantener un scraper del
> portal», con la duda legal que eso trae. El LLM era la última parte y la barata.

---

# Pausa · 2026-08-07

**El MCP queda especificado y sin construir.** Los cimientos sí se hicieron; el servidor no.

## Por qué se pausa

Tres razones, en orden de peso.

**1. No es una capacidad, es un canal.** La propuesta de valor es responder *"¿me conviene
postular, y a qué precio?"*. El MCP no la responde mejor: la hace accesible desde otro sitio.
Compra Ágil y Convenio Marco —volumen de mercado chileno que hoy los usuarios no ven— sí son
capacidad nueva, y siguen sin construirse.

**2. Alcanza a una fracción del ICP.** Un servidor MCP remoto sólo sirve a quien ya tiene un
cliente MCP, que hoy va por planes de pago de LLM. El ICP son PYMES a CLP 11.900/mes: no todas
pagan además un Claude. La IA dentro de la web llega a todas — y cuesta tokens, que es
justamente la razón de haber elegido MCP primero.

**3. El SDK acaba de sacar un 2.0.** `mcp 2.0.0` es reciente y el protocolo se mueve rápido.
Adoptarlo ahora significa seguir sus roturas para sostener una feature que no es core.

La razón original —*"LicitaLab ya lanzó el suyo"*— es imitar a un competidor, no resolver un
problema propio. No basta.

## Lo que sí se construyó, y no se pierde

- **Claves de API** (`tordo_<prefijo>_<secreto>`). Eran prerequisito: la única autenticación
  era un JWT de 30 minutos, que ningún cliente sin navegador puede sostener. **El plan tenía
  el orden invertido** — las listaba en F6.4, después del MCP. También son prerequisito de la
  API pública, que sí llega a todos.
- **FastAPI 0.104→0.141 y pydantic 2.5→2.13.** El SDK de MCP no resolvía contra las versiones
  fijadas. Hacía falta igual: todo el conjunto llevaba 33 meses congelado.

---

# Especificación, para cuando se retome

## Dónde vive

**Dentro de la app FastAPI, no como cliente de su API.** Una puerta de entrada más, no un
consumidor.

Así hereda las tres cosas que importan: la autenticación por clave, la autorización y la cuota
por dependencias, y `services/bi/` llamado directo, sin dar un salto de red hacia sí mismo.

La razón de fondo no es rendimiento: **reimplementar la autorización es de donde salió la fuga
de `/licitacion-match`**, que se saltaba el gating por plan porque su autorización estaba
escrita a mano en vez de declarada. Un MCP cliente externo repetiría ese riesgo en toda su
superficie.

Queda descartado un proceso aparte leyendo la base directamente: sin pasar por las
dependencias no hay medidor, y la decisión fue que se cobre dentro del plan de quien lo
consume.

## Transporte

**HTTP remoto (streamable).** El usuario pega una URL y su clave; nada que instalar, y el
medidor corre en infraestructura propia, que es la única forma de que sea fiable.

Un envoltorio local por stdio tiene sentido **después**, como compatibilidad para clientes que
no soporten servidores remotos. **Ése sí sería un cliente de la API.**

## Autenticación

La clave de API que ya existe, por `Authorization: Bearer tordo_…`. La clave **fija la
empresa**, así que el MCP no necesita que el cliente sepa su `empresa_id` ni puede saltar a
otra.

## Herramientas: de grano GRUESO

Es la decisión de diseño que hay que respetar, y la razón es económica.

Un humano hace ~3 consultas de BI para evaluar una licitación; **un LLM encadena ~15** para
responder una sola pregunta. Con las cuotas actuales (`basico` 3/día, `pyme` 50/día) una
conversación agota el plan.

Salida elegida: **menos herramientas que devuelvan más**. En vez de exponer los 22 endpoints
uno a uno, exponer algo como:

| herramienta | qué devuelve |
|---|---|
| `panel_de_licitacion(codigo)` | precio, competidores, ventana, comprador y score en **una** llamada — ya existe como `/licitacion/{codigo}/panel` |
| `precio_de_producto(codigo, organismo?)` | bandas con confianza y tamaño de muestra |
| `perfil_de_comprador(organismo)` | comportamiento histórico del organismo |
| `buscar_productos(texto)` | catálogo, para que el modelo encuentre el código |

Menos llamadas, respuestas más útiles para el modelo, y el medidor sigue significando lo
mismo. **Si se exponen los 22 endpoints uno a uno, hay que rehacer las cuotas primero.**

## Medición

Cada llamada a herramienta descuenta de `bi_queries_per_day` de la empresa de la clave,
reutilizando `_exigir_cuota_bi`. Si se decide otro medidor para MCP, va en `PLAN_QUOTAS`, que
es la única tabla de límites.

## Lo que hay que respetar de las respuestas

Las funciones de `services/bi/` ya devuelven **confianza y tamaño de muestra** junto al dato.
**No los quites al envolverlas**: un LLM que recibe una banda de precio sin saber que se
calculó con 4 observaciones la presentará como un hecho.

## Cuándo retomarlo

- Si aparecen clientes pidiéndolo por nombre, no por curiosidad.
- Si la API pública ya está y el MCP pasa a ser una envoltura fina sobre ella.
- Si el SDK de MCP se estabiliza y deja de romper entre versiones menores.


---

# Construido · 2026-08-08

**Se retomó porque se cumplió la condición que el propio documento puso**: *«si la
API pública ya está y el MCP pasa a ser una envoltura fina sobre ella»*. F6.4 la
dejó hecha —declarada, documentada y con límite por clave—, así que el MCP dejó
de ser una superficie nueva para ser otra puerta a la misma.

Las otras dos razones de la pausa siguen siendo ciertas y no se han resuelto:
sigue siendo un canal y no una capacidad, y sigue alcanzando sólo a quien ya paga
un cliente MCP. Lo que cambió es el costo de construirlo, no el tamaño del
premio. Y el orden importaba: **Compra Ágil y Convenio Marco se hicieron
primero**, que era el argumento principal de la pausa.

## Se siguió la especificación, punto por punto

- **Dentro de la app** (`app/mcp/`, montado en `/mcp`), no como cliente de su
  propia API.
- **HTTP remoto**, `stateless_http` — el despliegue puede tener réplicas y una
  sesión en memoria haría que la segunda petición cayera en un proceso que no
  sabe nada de la primera.
- **Clave de API**, y **sólo** clave: un JWT de sesión se rechaza con un mensaje
  que lo explica.
- **Cuatro herramientas de grano grueso**, con un test que falla si aparece una
  quinta sin que alguien lo decida.
- **Cada llamada descuenta cuota de BI**, y la regla vive en **una** función
  (`plan_limits.consumir_cuota_bi`) que usan los dos canales. Escrita dos veces,
  una de las dos se habría quedado atrás — y habría sido la que no cobra.
- **`confianza` y `n` no se filtran**, y las instrucciones del servidor le piden
  al modelo que los mencione.

## Lo que el SDK 2.0 confirmó

La tercera razón de la pausa era *«el SDK acaba de sacar un 2.0 y el protocolo se
mueve rápido»*. Se confirmó al escribirlo: **`mcp.server.fastmcp` ya no existe**
en 2.0 — la clase pasó a llamarse `MCPServer`. Por eso la dependencia se fija a
la mayor (`mcp>=2,<3`) y no a un rango abierto.

Además arrastra `anyio 3.7.1 → 4.14.2`, un salto de major en la base asíncrona de
toda la aplicación. Se verificó antes de dar por buena la decisión: la suite
entera pasa.

## Dos fallos que sólo se ven por HTTP

Los dos habrían llegado a producción con los tests pasando en verde:

1. **Montar una app ASGI dentro de otra no ejecuta su ciclo de vida.** Sin el
   gestor de sesiones, el servidor acepta la conexión y revienta en la primera
   herramienta. Se arregla pasando su ciclo de vida al de FastAPI.
2. **La protección contra DNS rebinding viene activada, y su lista blanca sólo
   trae `localhost`.** Servido desde un dominio real, **todas** las peticiones
   habrían respondido `421 Misdirected Request`. Se apaga a propósito: lo que
   protege es una página web alcanzando un servidor **local** del visitante, y
   éste es remoto y exige clave en cada llamada.

Por eso `tests/test_mcp.py` habla el protocolo por HTTP en vez de llamar a las
funciones: ninguno de los dos lo detecta un test que importe el módulo.

## Lo que costó, medido

- **Memoria en reposo: 107 MiB de 512** (21 %), con el contenedor real limitado a
  512 m. El presupuesto sigue holgado; lo que lo aprieta es el modelo TF-IDF
  (~105 MB por proceso), que no cambia.
- **Disco**: `mcp` 2,9 MB + `mcp-types` 0,7 + `httpx2` 0,8 + `sse-starlette` 0,1
  ≈ **4,5 MB** sobre un entorno de 785 MB. `httpx2` es un segundo cliente HTTP
  conviviendo con `httpx`: no rompe nada, pero es bulto que hay que saber que
  está.
- **`anyio 3.7.1 → 4.14.2`**, arrastrado por el SDK. Es un salto de major en la
  base asíncrona de toda la aplicación, así que se verificó **antes** de dar la
  decisión por buena: la suite entera y los tests de extremo a extremo pasan. De
  paso quita de encima una dependencia que llevaba 37 meses sin actualizar.
