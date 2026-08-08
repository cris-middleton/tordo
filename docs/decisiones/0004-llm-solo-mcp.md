# 0004 — LLM acotado a un servidor MCP sobre la base histórica

**Estado**: Aceptada, **en pausa** desde 2026-08-07 · **Fecha**: 2026-08-05

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
