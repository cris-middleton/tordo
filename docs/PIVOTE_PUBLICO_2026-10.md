# TORDO público — especificación de diseño

**Fecha:** 2026-10-11 · **Estado:** aprobado en sesión de *grilling* (20 decisiones + dos
revisiones), pendiente de plan de implementación · **Sustituye a:** el modelo de
negocio de `tordo_plan_saas.md` y los ADR 0002, 0005 y 0008.

---

## 1. Qué cambia y por qué

TORDO deja de ser un SaaS B2B y pasa a ser un **sitio público y gratuito**: pieza de
portafolio y bien público que sólo tiene que pagar lo que cuesta.

- La producción está pausada y **nunca hubo un usuario pagando** — la decisión no
  renuncia a un ingreso real, sino a uno esperado.
- Costaba ~25.000 CLP/mes (≈ US$27). El objetivo es **≈ US$4–6/mes**.
- La mitad del producto que vale para cualquiera —el BI sobre datos públicos— se
  abre sin cuenta. La mitad que sólo tiene sentido para una empresa identificada
  —cumplimiento, postulaciones, encaje con perfil— se retira.

### Objetivos

1. Toda la inteligencia de mercado accesible **sin cuenta**: bandas de precio,
   competidores, compradores, concentración, oportunidad.
2. **«Lo mejor de hoy en Compra Ágil»**, actualizado durante el día hábil.
3. Que se mantenga **solo**: sin depender del portátil del autor ni de que alguien
   mire. Si se rompe, que avise.
4. Que crezca **solo**: tráfico orgánico por buscadores, sin pagar por visitas.

### No-objetivos

- Cuentas, contraseñas, OAuth, planes, cuotas por plan, cobros.
- Publicidad. **No es una preferencia: es una restricción** (§4.1).
- Foro o wiki editable por terceros — exige moderación permanente.
- Alertas por correo en v1.

---

## 2. Registro de decisiones

| # | Decisión | Motivo corto |
|---|---|---|
| D1 | Etiquetar el último estado SaaS como `saas-v1` y **borrar** ese código de `main` | Código apagado sigue pasando tests, auditorías y confundiendo. La etiqueta lo conserva como evidencia de portafolio |
| D2 | **Sin login.** Favoritos en `localStorage` + **RSS por búsqueda** | Cero datos personales que custodiar, cero servicio de correo |
| D3 | Analytics semanal **en la nube** (cron), parquets en **R2** | «Vive solo» no se cumple si depende de un portátil. R2 ya estaba previsto en la guía de despliegue (`AWS_REGION=auto`) y `boto3` ya está declarado |
| D4 | Postgres guarda **agregados + datos vivos**, no la historia cruda (ver §5.2) | Es la decisión que más pesa en el costo |
| D5 | Financiación **sólo por donaciones** | Con ~US$5/mes que cubrir bastan 2–3 aportes. Los anuncios rinden poco a este tráfico y obligan a Vercel Pro |
| D6 | **API de lectura y MCP abiertos**, sin clave, con límite por IP | El MCP es la pieza más distintiva del portafolio; sin cuotas desaparece el motivo de limitarlo |
| D7 | Compra Ágil: **10, 13, 16 y 19 h** los días hábiles, **12 h** los fines de semana (hora de Chile) | Ver §6.1 — medido |
| D8 | Se mantiene **TORDO** y su sistema de diseño | Ya está hecho; el nombre sale de `APP_NAME` |
| D9 | Frontend en **Vercel Hobby** (gratis) | Las donaciones están permitidas explícitamente en Hobby (§4.1) |
| D10 | ~**7.100 páginas indexadas**, elegidas por **calidad del dato** (§7.2) | Un sitio nuevo no tiene datos de búsqueda; 100k páginas finas arrastran al dominio entero |
| D11 | Sin Cloudflare delante; límite por IP **en memoria** en la API | Vercel no recomienda proxys delante y ya trae CDN y DDoS. La API corre un solo worker |
| D12 | **Las personas naturales se enmascaran en todos los canales públicos** (§8) | Republicar e indexar no es lo mismo que «ya es público». Ley 21.719 |
| D13 | En producción sólo hay cuentas de prueba: **se borran** en la migración | Confirmado por el autor |
| D14 | Orden: **primero quitar, luego construir** (§10) | Cada PR posterior trabaja sobre menos código; producción está pausada, no hay servicio que mantener entre pasos |
| D15 | Se conservan el **golden master** de BI y el **harness de evaluación**; los E2E se reducen al flujo público | El golden protege justo las cifras por las que alguien vendrá |
| D16 | Donaciones: **link abierto de Mercado Pago** + **transferencia** + **GitHub Sponsors** | Lo único con evidencia de funcionar en Chile (§4.2) |
| D17 | Dominio **.cl** propio, ya registrado | — |
| D18 | 6–8 **explicativos** en MDX estático | Posicionan, no cuestan, y el contenido ya está escrito en los docs |
| D19 | **Sentry** (capa gratuita) + **backups diarios** de Railway + **latido** de Healthchecks.io por corrida | Un sitio que vive solo no tiene a nadie mirando |
| D20 | El precio ganador de Compra Ágil sale de las **órdenes de compra masivas**, no de la API de detalle | Ver §6.2 — más historia, cero cuota |

---

## 3. Arquitectura

```
                    ┌─────────────── Railway · cron (facturado sólo mientras corre) ───────────────┐
                    │  cron-frecuente   cada hora UTC, se autolimita a 10/13/16/19 h de Chile       │
                    │                   → Compra Ágil + licitaciones nuevas → ranking del día       │
                    │                   → revalida las páginas afectadas en Vercel                  │
                    │  cron-semanal     domingo → descarga masiva OC → Polars → materializa         │
                    │                   → revalida las ~7.100 páginas indexadas                     │
                    │  ambos            → latido a Healthchecks.io al terminar                      │
                    └───────────┬─────────────────────────────────────────┬────────────────────────┘
                                │ parquets                                  │ escribe
                                ▼                                           ▼
                          R2 (≤ 10 GB gratis)                  Postgres (Railway, < 1 GB)
                                                                            ▲ lee
 visitante ──► Vercel Hobby: Next 16 (ISR + caché) ──[cabecera secreta]──► FastAPI de sólo lectura
               sitemap · RSS · MDX · Web Analytics                          (Railway, 1 worker,
               favoritos en localStorage                                    sin TF-IDF en memoria)
                                                                            ▲
 integrador / modelo ──────────── API pública + MCP, límite por IP ─────────┘
```

### Qué desaparece

Redis, `celery_worker`, `celery_beat`, Flower, MinIO, el servidor de Next en Railway,
el modelo TF-IDF en el proceso de la API. Y del dominio: billing (MercadoPago, Stripe,
webhooks), `PLAN_QUOTAS` y su gating, auth (JWT, refresco, Google, verificación,
recuperación), empresas, roles y claves de API, documentos, estado hábil,
postulaciones, alertas, notificaciones, informe semanal, vigilancia de precios,
«Tu posición» y el encaje personalizado.

### 3.1 Los dos cron (revisión final)

- **Dos servicios, no uno.** Railway **descarta** una ejecución si la anterior sigue
  activa: si el reconstruido semanal compartiera servicio con las corridas
  frecuentes, una tarde de domingo se comería las de Compra Ágil.
- **Railway programa en UTC, y Chile cambia de hora.** Un horario fijo en UTC se
  corre una hora dos veces al año. El cron frecuente **se dispara cada hora** y el
  propio script decide con `hoy_chile()`/hora de `America/Santiago` si es una de
  sus horas; si no, sale en segundos. Arrancar un contenedor para nada cuesta
  centavos al mes; equivocarse de hora, que el ranking llegue tarde medio año.
- **Los cron se configuran en el panel, no en `railway.json`.** Hay un fallo
  reconocido por Railway con crons definidos como código que los deja bloqueados
  en *Active*.
- Cada corrida **termina y cierra sus conexiones** — si no, Railway la da por
  activa y bloquea la siguiente.

### 3.2 Regiones

Railway no tiene región en Sudamérica. La API y Postgres van en **US East**, y las
funciones de Vercel se fijan en **`iad1`** para que un fallo de caché sea un salto
corto. Lo que ve el visitante sale del CDN de Vercel, que sí está cerca.

---

## 4. Financiación

### 4.1 La restricción de Vercel Hobby

Las *Fair Use Guidelines* de Vercel (actualizadas 2026-09-14) definen como comercial
«cualquier método de solicitar o procesar pagos de los visitantes» y «la inclusión
de anuncios, incluido Google AdSense» — y dicen explícitamente: **«Asking for
Donations does not fall under commercial usage»**.

**Consecuencia: anuncios = Vercel Pro (US$20/mes)**, que es tres veces el costo de
todo lo demás. Reabrir la publicidad es reabrir el hosting.

### 4.2 Medios de donación

| medio | ¿funciona en Chile? | costo | |
|---|---|---|---|
| Link de pago **abierto** de Mercado Pago (+ suscripción de monto abierto para aporte mensual) | ✅ oficial | 3,19 % + IVA al instante; 2,89 % + IVA a 10 días | **principal** |
| Transferencia bancaria | ✅ el medio más común | 0 % | datos **tras un clic** («ver datos»), no en el HTML |
| GitHub Sponsors | ✅ Chile en la lista oficial | 0 % | para el público técnico |
| Ko-fi | ⚠️ sin evidencia de retiro a banco chileno | — | descartado |
| Buy Me a Coffee | ❌ sólo Stripe | — | descartado |

Los tres son **enlaces**: sin integración, sin webhooks, sin código que mantener.

**Antes de activar el link de Mercado Pago:** lo recibido bajo RUT de persona
natural se informa al SII. A estos montos es menor, pero conviene confirmarlo con
quien lleve la contabilidad.

---

## 5. Costos y datos

### 5.1 Costo mensual estimado

Tarifas de Railway: ~US$10 por GB de RAM, ~US$20 por vCPU y ~US$0,15 por GB de
volumen, al mes; el plan Hobby cuesta US$5 **e incluye US$5 de uso**.

| pieza | hoy | objetivo |
|---|---|---|
| Postgres | ~$4–6 | ~$3 |
| API | ~$3–4 | ~$1–2 |
| Celery + Redis + Flower | ~$7–9 | $0 |
| Dos cron | — | < $1 (decenas de horas al mes, no 720) |
| Frontend | ~$2–3 | **$0** (Vercel Hobby) |
| MinIO / R2 | ~$1 | $0 (≤ 10 GB) |
| Dominio .cl | — | ~$1 |
| **Total** | **~$20–27** | **~$4–6**, casi todo dentro de los US$5 incluidos |

### 5.2 Qué vive en Postgres (revisión C4)

Medido sobre los datos reales: **~417.000 líneas de OC al mes** y **~5.000 Compras
Ágiles por día hábil**. Doce meses de crudo serían varios GB.

| se guarda en Postgres | se queda en parquet (R2) |
|---|---|
| tablas `analytics.*` materializadas (~340 MB hoy) | órdenes de compra crudas, toda la historia |
| licitaciones **abiertas** y recientes | Compra Ágil cruda más allá de 30 días |
| Compra Ágil de los **últimos 30 días** | |
| `compra_agil_mensual` (comprador, mes, publicadas, adjudicadas) — revisión C5 | |
| «últimas N órdenes por comprador», precalculada | |

Objetivo: **< 1 GB**. El tamaño real de producción no se pudo medir (está pausada;
la copia local está recortada) — se mide en el paso 6 del orden (§10).

### 5.3 Presupuesto de la API de Mercado Público

La *Declaración de Uso de Datos Oficiales* fija **10.000 solicitudes diarias por
usuario**, y ChileCompra separa la cuota de Compra Ágil de la de la API clásica.
El listado de Compra Ágil son ~10 solicitudes por corrida (ventanas de 1 hora,
~600 filas en la hora punta, bajo el tope de 10.000 del buscador). **El listado
corre siempre primero**: nada de lo que se añada después puede dejarlo sin cuota.

---

## 6. Compra Ágil

### 6.1 Frecuencia — medido en vivo (2026-10-03 a 10-10)

- **~5.000 publicaciones por día hábil**; 55–195 los fines de semana.
- **95 % entre 08:00 y 18:00**, con picos a las 09–13 h y 15–17 h.
- **Ninguna cierra antes de 24 h**; mediana 42 h. Pero **un tercio de los primeros
  llamados cierra casi exactamente a las 24 h**.
- La API **devuelve fechas pasadas, también cerradas**: una corrida perdida no
  pierde datos si la siguiente cubre el hueco.

Dos corridas no pierden nada pero dejan, en el peor caso, ~6 h para cotizar. Cuatro
dejan que nada espere más de ~3 h. Las marcas de tiempo de la API vienen en hora de
Chile aunque digan `Z`.

### 6.2 «Lo mejor de hoy»

Sin perfil de empresa no hay encaje personal: es un **ranking público** por
*pocos competidores esperados × comprador que efectivamente adjudica × tiempo
restante*, con el **precio ganador típico de ese comprador** al lado.

- **Precio ganador:** de la descarga masiva de OC, donde Compra Ágil ya viene
  marcada (`EsCompraAgil = Si`, `Tipo = AG`): **172.621 líneas sólo en marzo de 2026**,
  con comprador, proveedor, producto y precio unitario. Años de historia y cero cuota.
- **Competencia:** proveedores distintos que ganan Compra Ágil a ese comprador en ese
  rubro, con el cálculo de concentración que ya existe.
- **Tasa de adjudicación:** `compra_agil_mensual`.
- **v2, opcional:** si el número real de cotizaciones resulta importar, un
  enriquecimiento con la API de detalle **con tope** (~200/día), siempre después del
  listado. La memoria del proyecto ya apunta que el detalle trae todas las
  cotizaciones con precio.

---

## 7. Producto público

### 7.1 Sin cuenta

- **Favoritos** en `localStorage`, con `useSyncExternalStore` (la regla de siempre).
- **Cada búsqueda guardada tiene su URL de RSS**: es su forma de persistir y de
  avisar. Caché de CDN ~30 min.
- **Riesgo reconocido:** las PYMES chilenas usan poco RSS, y las alertas eran lo que
  más valoraba el producto anterior. Si Web Analytics muestra demanda (visitas a la
  ayuda del RSS, búsquedas guardadas), v2 añade **resumen por correo con enlace
  mágico** — sin contraseñas.

### 7.2 Páginas indexadas (medido sobre la copia local)

| página | cuántas | ¿se indexa? |
|---|---|---|
| Comprador | 1.041 | ✅ todas |
| Rubro N2 | 310 | ✅ todos |
| Producto (firma con n ≥ 10 y predictibilidad alta/media) | 5.733 | ✅ |
| Producto disperso o con pocas observaciones | ~100k | ❌ `noindex`, accesible por búsqueda |
| Comprador × rubro | 42.163 (9.534 con ≥ 20 transacciones) | ❌ en v1; se promueven con datos de Search Console |
| Proveedor **empresa** | ~34k | ❌ `noindex` en v1 |
| Proveedor **persona natural** | ~14k | **no existe la página** (revisión final) |
| Compra Ágil de hoy + explicativos | pocas | ✅ |

- Se generan **al primer pedido y quedan en caché** (ISR); nada se construye en el
  deploy.
- El **cron semanal revalida** las indexadas tras materializar; el **frecuente**
  revalida la página de Compra Ágil.
- La sección «Compra Ágil abiertas de este comprador» se pide **aparte, con caché
  corta**, en vez de revalidar 1.041 páginas cuatro veces al día (revisión G4).
- `sitemap.xml` sale de la base con el mismo filtro de calidad.
- **Cómo crece solo:** cuando Search Console muestre impresiones, las combinaciones
  comprador × rubro que la gente busca se promueven a indexadas. Lo decide el dato.

### 7.3 Búsqueda (revisión C6)

`sort_by=relevance` usa hoy los artefactos TF-IDF dentro de la API (~105 MB). Pasa a
**la búsqueda de Postgres que ya existe** (`busqueda` tsvector + trigrama, vía
`_coincide_termino()`), ordenada con `ts_rank`. Si TF-IDF se conserva para algo
(«licitaciones similares»), se calcula en el cron y se guarda.

### 7.4 API y MCP abiertos

- Sin clave. Las herramientas del MCP pierden todo lo que dependía de la empresa.
- **Límite por IP en memoria** (un worker), anunciado con `X-RateLimit-*`.
- **El servidor de Next manda una cabecera secreta que lo exime** (revisión C3): si
  no, todas las páginas que Vercel renderiza saldrían desde las IP compartidas de
  Vercel y el límite estrangularía al propio sitio.
- La lista blanca anti-DNS-rebinding del MCP incluye el dominio .cl.
- La exportación CSV se mantiene (BOM y `;`), **con tope de filas**.

### 7.5 Lo que se retira del BI

«Tu posición» y la oportunidad personalizada dependen de una empresa. Se retiran, y
**sus casos salen del golden master en el mismo PR**.

---

## 8. Datos personales

### 8.1 La regla del RUT, verificada

Sobre las OC de marzo de 2026: **6.529 de 22.509 proveedores (29 %) tienen RUT bajo
50.000.000**, y sólo el **0,14 %** de ellos tiene un nombre con aspecto de empresa —
y esos son falsos positivos («ESPARZA» contiene «SPA»). Bajo 50M es persona natural.

Sobre 50M hay EIRL y SpA unipersonales con nombre de persona («Claudio Andrés»):
**son personas jurídicas y se muestran**.

### 8.2 Dónde se aplica (revisiones C1, C2)

- **En la fuente, una sola vez:** el pipeline de analytics reemplaza nombre **y**
  `CodigoProveedor` de las personas naturales por «Persona natural» antes de
  materializar. Afecta también a `top_proveedor` de `market_concentration` y a
  cualquier columna derivada.
- **Se calcula desde los parquets**, no desde Postgres: `competitors_by_market` va por
  `CodigoProveedor` (que **no** es un RUT), y la traducción código → RUT sale de las
  OC, cuya historia ya no vive en Postgres (§5.2).
- Así, **ningún canal puede olvidarlo**: web, API, MCP, CSV y RSS leen lo mismo.
- El fixture del golden master se **recaptura** tras el cambio
  (`capturar_golden_bi.py --desde-golden`).

### 8.3 Lo que no se guarda

Sin cuentas no hay correos, contraseñas ni perfiles. Quedan las IP en los logs y lo
que reciba Sentry (`sendDefaultPii: false`, como hoy). Web Analytics de Vercel **no
usa cookies**, así que no hace falta banner.

---

## 9. Legal y atribución

- **Atribución obligatoria** según la *Declaración de Uso de Datos Oficiales*, en el
  pie de cada página y en el CSV:
  «Fuente: Dirección de Compras y Contratación Pública (ChileCompra / Mercado
  Público)», y que **ChileCompra no participa ni respalda** el proyecto.
- La Declaración dice que los datos «no son modificados en su contenido». Enmascarar
  a personas naturales **omite**, no altera; la Declaración se actualiza para decirlo.
- **Términos y privacidad se reescriben.** El worktree `terminos-y-privacidad` se
  escribió para el SaaS (nombra a Mercado Pago como pasarela de cobro). La Ley 21.719
  entra en vigor en diciembre de 2026: **va antes del lanzamiento**.

---

## 10. Orden de ejecución

Un PR por paso, cada uno con `make ci` en verde, y cada uno actualiza `CLAUDE.md` y
sus tests **en el mismo PR**, como exige el repo.

1. **Esta especificación + etiqueta `saas-v1`.**
2. **BI anónimo:** las 20 rutas de BI que no dependen de una empresa dejan de pedir
   sesión y cuota. Las 6 personales siguen como están hasta el paso 3.
3. **Fuera las cuentas — backend:** billing, planes, auth, empresas, cumplimiento,
   alertas, notificaciones, informe, vigilancia de precios, las 6 rutas personales de
   BI; catálogo y MCP anónimos. Migración que borra esas tablas (y con ellas las
   cuentas de prueba).
4. **Fuera las cuentas — frontend:** login, registro, onboarding, pantallas de
   empresa y cumplimiento, el proxy de cookies, planes, candados y el 402.
5. **Celery y Redis → los dos cron**, con el autolímite horario, el latido y el
   límite por IP en memoria (con la IP real tras el proxy de Railway).
6. **Parquets a R2 y analytics en la nube**, con el enmascarado en la fuente y
   `compra_agil_mensual`. Medir la RAM del reconstruido semanal.
7. **Adelgazar Postgres** (§5.2) y medir su tamaño real.
8. **TF-IDF fuera de la API**: búsqueda por `ts_rank`.
9. **«Lo mejor de hoy» en Compra Ágil**, RSS y favoritos.
10. **Páginas públicas**, sitemap, `noindex`, exención de Next en el límite por IP,
    revalidación desde los cron.
11. **Legal:** términos, privacidad, atribución, Declaración actualizada.
12. **Lanzamiento:** donaciones, Web Analytics, despliegue (Vercel + Railway + DNS),
    y el `CLAUDE.md` y el ADR del pivote.

**Por qué «quitar las cuentas» va en tres pasos y no en uno** (revisión al planificar):
el BI se puede abrir sin tocar nada más, y es lo que más valor libera. Las cuentas se
retiran por capa: entre el paso 3 y el 4 el frontend compila y pasa sus tests, pero sus
pantallas de cuenta llaman a rutas que ya no existen. Es aceptable **sólo porque
producción está pausada** — y por eso el paso 4 va inmediatamente después y no se
despliega nada entre medias.

---

## 11. Riesgos

| riesgo | mitigación |
|---|---|
| El reconstruido semanal necesita más RAM de la estimada | Medir en el paso 5; el costo escala por hora de ejecución, no por mes |
| Los cron de Railway se quedan en *Active* | Configurar en el panel; cerrar conexiones; el latido avisa |
| El RSS no lo usa nadie | Medir; v2 con enlace mágico (§7.1) |
| Google trata las páginas como finas | Filtro de calidad (§7.2) y expansión guiada por Search Console |
| ChileCompra cambia la API de Compra Ágil | El latido detecta la corrida fallida; la descarga masiva de OC sigue sosteniendo el BI |
| Raspado masivo por la API abierta | Límite por IP, tope de filas en CSV, CDN delante de las páginas |

---

## 12. Decisión aplazada: ¿repositorio público?

**Se decide al final, después del lanzamiento.** Ningún paso de §10 depende de ella, y
es la única decisión del plan que no tiene vuelta atrás: un repositorio privado se
puede publicar mañana; uno público ya clonado no se puede retirar.

**La pregunta que la decide:** ¿hay una posibilidad real de volver a cobrar por esto en
uno o dos años? Si no, público bajo **AGPL-3.0** (cualquiera puede usarlo, nadie puede
convertirlo en un producto cerrado). Si quizá, privado con una página de caso de estudio.

Que un competidor lea el código cuesta poco: el sitio gratuito ya entrega los
resultados, y lo que añadiría el código es *cómo* se calculan. Lo que sí se pierde es la
opción de venderlo.

A favor de hacerlo público, y encaja con «portafolio»:

- GitHub ofrece **protección de rama gratis** en repos públicos — justo lo que hoy
  falta y `make merge` suple a medias.
- **Actions es gratis e ilimitado** en repos públicos: desaparece el bloqueo por
  facturación que tiene Actions caído desde 2026-09-24.

**Condición previa:** auditar **toda la historia** con un escáner de secretos
(gitleaks o equivalente) y **rotar** lo que aparezca — quitarlo del árbol no lo
borra de la historia. Pendiente de confirmación del autor.

---

## Fuentes

- [Vercel — Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
- [Railway — Pricing](https://www.railway.com/pricing) · [Railway — Cron Jobs](https://docs.railway.com/cron-jobs)
- [Mercado Pago Chile — Link de pago](https://www.mercadopago.cl/herramientas-para-vender/link-de-pago) · [Suscripciones](https://www.mercadopago.cl/herramientas-para-vender/suscripciones)
- [GitHub Sponsors — regiones soportadas](https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors)
- `docs/Declaración de Uso de Datos Oficiales.pdf`
- Mediciones propias: API de Compra Ágil en vivo (2026-10-03 a 10-10), OC de marzo de
  2026 (`etl/data/consolidated/oc/2026-3.parquet`), base local de analytics.
