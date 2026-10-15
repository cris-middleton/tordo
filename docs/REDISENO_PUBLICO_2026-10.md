# Rediseño público — octubre 2026

> **Estado:** dirección aprobada (2026-10-14); spec revisada por un revisor independiente contra
> el código y la API en producción. Pendiente de plan de implementación.
> **Origen:** el sitio salió a producción el 2026-10-13 con la piel del SaaS que dejó de ser
> (`PIVOTE_PUBLICO_2026-10.md`). Funciona, pero **parece una app de pago**: quien llega espera
> un «crear cuenta» y un precio. Este documento dice qué cambia para que parezca lo que es
> —gratis, abierto y útil desde el primer segundo— y en qué orden.

---

## 1. El problema, medido

Revisión del sitio en producción (1440 px y 390 px) y de unos 30 sitios comparables,
2026-10-14. Las capturas no se versionan; lo que importa de ellas está aquí.

### 1.1 Lo que hace que parezca de pago

| Señal | Dónde | Por qué pesa |
|---|---|---|
| Barra lateral fija + migas `TORDO › Licitaciones` + caja «Apariencia» abajo a la izquierda (donde va el menú de usuario) | `components/Layout.tsx`, todo `app/(panel)/` | Es la cáscara de un *dashboard* con sesión. **Ningún** sitio libre de la muestra usa barra lateral. |
| Dos cáscaras: cabecera arriba en portada y páginas públicas, barra lateral en el panel | `CabeceraPublica` vs `Layout` | Pasar de una a otra se siente como cruzar a una zona de miembros. |
| Portada en formato *landing* SaaS: hero oscuro con promesa, dos CTA, rejilla «Qué hay en el sitio», FAQ | `components/portada/Portada.tsx` | Es el patrón de GovTribe, HigherGov y Tussell (de pago). Los libres —ProPublica Nonprofit Explorer, Our World in Data, lichess, caniuse— abren con **la herramienta**. |
| Hero navy con tarjetas a la derecha | ídem | Se parece al portal oficial `datos-abiertos.chilecompra.cl`. Parecer oficial no seduce: parece una copia. |
| Vocabulario de venta B2B: «Inteligencia de compras públicas», «Inteligencia de mercado» | portada, navegación, metadatos, imagen OG | — |
| Tipografía Archivo + DM Sans | `app/layout.tsx` | Par limpio *de startup*. Pesa menos que la estructura, pero suma. |
| **Nada** de lo abierto se ve: ni API, ni MCP, ni código, ni licencia | todo el sitio (sólo aparecen en términos y privacidad) | Lo más diferencial —un MCP anónimo y gratis— no lo encuentra nadie. Los competidores de pago (GovTribe, GovSpend) **venden** el MCP en su banner. |

### 1.2 Lo que ya está bien y se conserva

- **El tono de `/apoyar`**: «Tordo es gratis. Mantenerlo, casi.» y «cuesta alrededor de US$5 al
  mes». Es la mejor copia del sitio y marca la voz de todo lo demás.
- El sistema de tokens (`app/globals.css`) y la regla `text-on*`. **El rediseño cambia valores
  y estructura, no el mecanismo.**
- La atribución a ChileCompra en el pie de cada página y en cada CSV.
- Las URL del panel (`/licitaciones`, `/compra-agil`, `/mercado`, `/guardados`), permanentes
  desde el lanzamiento.

### 1.3 Fallos encontrados (se arreglan antes — §8)

1. **«Lo mejor de hoy» casi no ordena.** En las 50 primeras de `GET /compra-agil/destacadas`
   (2026-10-14) hay 14 con puntaje exactamente 1,0 y 26 con exactamente 0,5. La causa principal
   **no** es el comprador:
   - **`competencia` vale 1,0 en casi todo**: en una muestra de 232 abiertas, el 97 % tiene
     `ofertas_recibidas = 0`, incluso publicadas hace 6–7 días y a 5 h del cierre. **Sospecha sin
     verificar**: el conteo no se refresca después de la ingesta.
   - **`comprador` es casi siempre neutro (0,5)**: sólo 7 de 232 tienen `publicadas ≥ 5`
     (`MIN_PUBLICADAS`), porque `publicadas` se acumula sólo desde el despliegue. Cuando sí
     aplica, `min(1, órdenes/publicadas)` satura en 1.
   - `tiempo` satura a las 24 h.

   Además la tarjeta imprime el cociente como «Adjudica 2.953 de 11 en 6 meses», que se lee como
   un error, y la insignia «puntaje 100/100» se repite en todas.
2. **`/mercado` tumba la API.** En la revisión, el proxy devolvió 502 a los 10–12 s en
   `/bi/oportunidades`, `/bi/tendencia` y `/bi/sector` y la página quedó con el *spinner* más de
   30 s. **Diagnosticado el mismo día** (logs de Railway y medición local): la API (512 MB, un
   worker) **murió por memoria 11 veces el 2026-10-14, 9 de ellas por visitas reales a
   `/mercado`**. `get_tendencia` con rubro lee `analytics.time_series` entera a Python (+533 MB
   con 6 meses locales; producción guarda 36), y `get_oportunidades`, `get_tendencia` sin rubro y
   `get_rubros` también leen tablas enteras. El 502 es del borde de Railway, no de Vercel. La
   política de reinicio por defecto se rinde a los 10 reinicios: tras la undécima muerte la API
   quedó caída ~16 min hasta un *redeploy* manual. El pico de 171–176 MB de CLAUDE.md se midió
   sin pedir esos endpoints.
3. **`/productos?q=` ignora la URL.** `BuscadorProductos` guarda el texto en `useState`: una
   búsqueda no se puede enlazar ni compartir.
4. **Las redirecciones de la API bajan a `http://`.** `https://api.tordo.cl/mcp` →
   `http://api.tordo.cl/mcp/`, y lo mismo `/health` y `/api/v1/tenders` → `http://…/tenders/`:
   **toda** redirección por barra final. Rompe a los clientes MCP; sólo funciona la URL con barra.
5. **La búsqueda de productos no quita palabras vacías.** `buscar_productos`
   (`services/publico/paginas.py`) exige cada subcadena: «guantes de nitrilo» necesita un «de»
   en la firma y no encuentra `guantes-nitrilo-talla` (n = 272); «arriendo de vehículos» devuelve
   `[]`. La portada nueva vive de esta búsqueda.

---

## 2. Lo que se aprendió de los comparables

1. **La herramienta es el hero.** Ningún sitio libre de la muestra pone marketing encima de su
   herramienta. ProPublica Nonprofit Explorer es el modelo más cercano: título, *byline* con
   fecha de actualización, **un buscador con ejemplos clicables**, tres cifras grandes y una
   lista viva.
2. **Lo libre se demuestra, no se declara**: «Donar» en la cabecera, licencia en el pie, fecha
   de actualización, enlaces a API y código, y **el costo de mantenerlo** (lichess publica sus
   costos). Una sola frase de manifiesto con un guiño basta: el «free (*really*)» de lichess.
3. **Una cifra viva sin fecha hace daño** (QuiénEsQuién.wiki muestra contadores de 2022). Toda
   cifra de portada lleva su hora, o no se muestra.
4. **El nicho está vacío.** No apareció ninguna herramienta gratuita y sin cuenta para la PYME
   proveedora que combine bandas de precio y competencia; LicitaLAB es de pago. ChileCompra abrió
   secciones de Compra Ágil y de empresas de menor tamaño (ago-2025) y una API de Compra Ágil
   (may-2026): **la diferencia de TORDO es la pregunta de decisión** —«¿me conviene postular y a
   qué precio?»— y las bandas por producto, que ChileCompra no da.
5. **El MCP se presenta con una caja de instalación por cliente** (el MCP de data.gouv.fr es el
   mejor ejemplo); bundlephobia pone «MCP» directamente en su navegación.
6. **Tipografía de la categoría**: serif editorial en titulares + sans sobria en el cuerpo (Our
   World in Data: Playfair + Lato) se lee como investigación o periodismo, no como producto;
   monoespaciada para identificadores (Hugging Face, caniuse).

---

## 3. Principios

1. **Lo primero que se ve es el dato, no la promesa.** Nada encima de la búsqueda, tampoco en
   móvil.
2. **Un solo sitio, una sola cáscara.** Mismo encabezado en todas las páginas. Sin barra lateral.
3. **Gratis se prueba** con el costo, la licencia, el código, la API y la ausencia de cuentas —no
   con adjetivos—.
4. **Toda cifra viva lleva su hora.** Sin dato fresco, el bloque se oculta (como hoy `BloqueHoy`).
5. **Una audiencia primero**: la PYME que le vende al Estado. Desarrolladores y periodistas tienen
   su página (`/abierto`), no la portada.
6. **Nada se promete que no exista** (regla vigente de `lib/portada.ts`).
7. **Cada enlace nuevo entra en el PR que crea su página.** `e2e/enlaces.spec.ts` recorre los
   enlaces y falla con un 404.
8. **CLAUDE.md y los comentarios que un PR deja falsos se corrigen en ese mismo PR** (regla
   vigente), no al final.

---

## 4. Decisiones

| # | Decisión | Motivo |
|---|---|---|
| R1 | La portada se reconstruye en torno a **un buscador: «¿Qué le vendes al Estado?»** | §2.1 |
| R2 | Nueva página **`/buscar?q=`**: una búsqueda, tres respuestas (precio, abiertas ahora, quién lo compra) | Responde la pregunta de decisión con lo que el backend ya sabe |
| R3 | **Se elimina la barra lateral**; todo el sitio usa una cabecera superior única | §1.1 |
| R4 | Tipografía: **Newsreader** (`h1`, `h2`) + **Public Sans** (todo lo demás, cifras incluidas) + **IBM Plex Mono** (identificadores). Varien se queda para la marca | §5 |
| R5 | Nueva página **`/abierto`**: API, MCP, CSV, RSS, código y licencias | §2.5 |
| R6 | El costo se detalla en **`/apoyar#costos`** (tabla por concepto), sin página nueva | Ya dice «US$5 al mes»; falta el desglose |
| R7 | **Licencias**: código **AGPL-3.0**; **lo que TORDO deriva** (tablas de `analytics`, bandas, puntajes, CSV de análisis) **CC BY 4.0** con la atribución a ChileCompra. El contenido del catálogo sigue bajo las condiciones de ChileCompra | §7.1 — **confirmada por el responsable el 2026-10-14** |
| R8 | El repositorio **sigue privado hasta que la historia esté limpia** (sin `.env`, sin el correo laboral); después se hace público, y sólo entonces se enlaza | §7.3 — decidido el 2026-10-14 |
| R9 | Los fallos de §1.3 se arreglan **primero**, en PR propios | La portada nueva depende de «Lo mejor de hoy», de la búsqueda de productos y de las URL de la API |
| R10 | «Inteligencia de mercado» → **«Mercados»**; «Precios por producto» → **«Precios»**; «Inteligencia de compras públicas» sale de títulos, metadatos e imagen OG | Vocabulario llano |

---

## 5. Tipografía y color

### 5.1 Familias

Verificado sobre los `woff2` latinos que sirve Google Fonts (2026-10-14), con `fontTools`, y
comparado en un espécimen renderizado del hero (Archivo + DM Sans, Source Serif 4, Newsreader y
Public Sans sola). `next/font` las sirve desde el propio dominio: **no hay petición nueva a un
tercero** y la política de privacidad no cambia.

| Familia | Uso | `tnum` | Español | Carga | Por qué |
|---|---|---|---|---|---|
| **Newsreader** | `h1` y `h2`, titulares de sección | sí | sí | variable (`wght` y `opsz` completos) | Encargada por Google para lectura de noticias en pantalla: se lee como periodismo de datos. Frente a Source Serif 4 en negrita, menos pesada y con más carácter |
| **Public Sans** | Cuerpo, interfaz, `h3`–`h6`, **todas las cifras** | **sí** | sí | variable | Neutra, diseñada para servicios públicos, y **trae cifras tabulares**: `.cifra` deja de necesitar una segunda familia |
| **IBM Plex Mono** | Códigos de licitación y Compra Ágil (`3926-247-COT26`), RUT, códigos ONU, `curl` y JSON de `/abierto` | (monoespaciada) | sí | **estática**, 400 y 500 | El identificador se ve como dato. **No** se usa para montos: un precio en mono parece un log |
| Varien | Sólo el logotipo | — | — | sin cambio | — |

Descartadas: **Source Sans 3** (el subconjunto de Google no trae `tnum`), DM Sans (tampoco; por
eso hoy `.cifra` usa Archivo), Inter y Geist (firma de *startup*), Playfair Display (demasiado
revista para titulares cortos en español).

**Lo que toca en el código** (todo en el PR de tipografía):
- `app/layout.tsx`: `Newsreader`, `Public_Sans` e `IBM_Plex_Mono` de `next/font/google`, con
  `--font-display`, `--font-sans` y `--font-mono`. Se van Archivo y DM Sans.
- `tailwind.config.js`: `sans` → Public Sans, `display` → Newsreader, nuevo `mono` → Plex Mono.
- `globals.css`:
  - La regla que hoy aplica `font-display` (y `ss01`) a **todos** los `h1`–`h6` pasa a aplicarla
    sólo a `h1` y `h2`; `h3`–`h6` van en Public Sans. Sin esto, todos los subtítulos saldrían en
    serif.
  - Los ejes de Recharts (`.recharts-cartesian-axis-tick`) usan hoy `--font-display`: pasan a
    `--font-sans`, o los ejes saldrían en serif.
  - Las clases de botón, campo y etiqueta que nombran `--font-dm-sans` a mano pasan a
    `--font-sans`.
  - `.cifra` pasa a `var(--font-sans)` con `tabular-nums`, y **se reescribe su comentario**: el
    motivo de usar la familia display era que DM Sans no tenía `tnum`.
- Los usos de `cifra font-display` juntos (p. ej. `components/publico/Piezas.tsx`,
  `BandaPrecio.tsx`) pierden `font-display`: la utilidad gana a la clase, y el precio saldría en
  Newsreader. Regla: **`font-display` significa «titular editorial», nunca «número»**.
- Un test fija: las tres variables de fuente en `layout.tsx`, `.cifra` sobre `--font-sans` con
  `tnum`, y que `cifra` y `font-display` no aparezcan en el mismo `className`.
- `--font-varien` y `@font-face` de Varien, sin cambio.

### 5.2 Color

**La paleta «Iridiscencia» se conserva** —navy estructura, teal acción, verde «bueno»—: Our World
in Data demuestra que el navy puede leerse como dato público. Cambia **dónde** se usa:

- **Fuera**: el bloque hero navy a todo el ancho (PR de portada), las bandas `band-1..4` (PR de
  portada, que es su único consumidor), y el degradado y los tokens de la barra lateral
  (`--color-sidebar-*`, `--shadow-sidebar`, `--color-header-bg`: PR de cáscara).
- **Fondo de página**: un neutro cálido tipo papel en tema claro (nuevo valor de
  `--color-background`); las tarjetas siguen en `--color-surface`.
- **El color se reserva para el dato y la acción**: enlaces, el botón de buscar, el estado de una
  licitación, las bandas de precio.
- **Enlaces de texto subrayados** en el contenido (no en la navegación): la señal más fuerte de
  «hipertexto, no app».
- **«Apoyar» en la cabecera, en color de acento**, con su corazón — sin culpa, como lichess y Our
  World in Data.

**Contraste: hoy no hay un test que lo verifique.** `on-color.test.ts` sólo busca `text-white`; los
166 pares se comprobaron a mano. Cambiar el fondo cambia todos los pares, así que el PR de
tipografía y color **añade un test WCAG** que lee los tokens de `globals.css` y comprueba cada
tinta contra cada superficie en ambos temas (AA: 4,5:1 texto, 3:1 texto grande y bordes de
control). El tema oscuro se mantiene; el selector baja al pie.

---

## 6. Arquitectura de información

### 6.1 Cabecera única (todas las páginas)

Escritorio:
```
TORDO   Hoy · Licitaciones · Precios · Mercados · Guías        API y MCP · Código   🔖 3   ♥ Apoyar
```
Móvil (< 640 px):
```
TORDO                                         🔖 3   ♥ Apoyar   ☰ Menú
```

- **Componente de servidor con dos islas cliente pequeñas**: el contador de guardados (lee
  `localStorage` con `useSyncExternalStore`, como `lib/almacenLocal.ts`) y la marca de sección
  activa (`usePathname`). Todo lo demás, sin JS.
- **En móvil**, las secciones van dentro de un `<details>` («Menú»), cerrado por defecto: la
  cabecera ocupa una línea y la búsqueda de la portada queda en la primera pantalla (principio 1).
- **Guardados**: ícono con contador y texto accesible «Guardados en este navegador» —dice, de
  paso, que no hay cuenta—. Sale de la lista de secciones.
- **«API y MCP»** apunta a `/abierto` y **se añade en el PR que crea `/abierto`** (principio 7).
  **«Código»** apunta al repositorio y sólo aparece con la variable de servidor `REPOSITORIO_URL`
  (mismo patrón que los medios de `/apoyar`): el sitio puede desplegarse antes de que el repo sea
  público sin un enlace roto.
- Se elimina `components/Layout.tsx` (barra lateral, migas, «Apariencia»). `app/(panel)/layout.tsx`
  envuelve con la cabecera y el pie comunes. Los grupos `(panel)` y `(publico)` pueden seguir
  existiendo como carpetas; **el requisito es una sola cáscara**, y que `legal-enlazado` siga
  encontrando el pie en toda página.
- `/mercado` conserva su columna de filtros **dentro de la página**.

### 6.2 Pie único

Atribución a ChileCompra (`PieAtribucion`, sin cambios) · licencias (cuando §7 aplique) ·
Términos · Privacidad · Cuánto cuesta (`/apoyar#costos`, en el PR de R6) · Acerca (`/acerca`, en
el PR de portada) · Contacto · selector de tema (`SelectorTema`, isla cliente dentro del pie de
servidor).

### 6.3 Portada (`/`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ¿Qué le vendes al Estado?                                    (Newsreader)     │
│ [ resma carta, guantes de nitrilo, tóner…                       ] [ Buscar ] │
│ Ej.: resma carta · tóner · guantes de nitrilo · …                            │
│ Gratis (de verdad). Sin cuentas, sin publicidad. Código y API abiertos.       │
│ 4.232 licitaciones abiertas · 2.714 Compras Ágiles abiertas · actualizado 11:00│
├──────────────────────────────────────────────────────────────────────────────┤
│ Lo mejor de hoy en Compra Ágil — las 5 primeras, en filas compactas  Ver todas│
├──────────────────────────────────────────────────────────────────────────────┤
│ Úsalo como quieras: API · MCP para Claude y ChatGPT · CSV · RSS · Código      │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tordo es gratis. Mantenerlo, casi. ~US$5/mes · hecho por <nombre>  ♥ Apoyar   │
└ pie único ───────────────────────────────────────────────────────────────────┘
```
(Cifras de ejemplo medidas en producción el 2026-10-14; las definitivas salen de §6.6.)

- **Sin hero de color, sin rejilla de funciones, sin FAQ.** «Qué es», «de dónde salen los
  datos», «cómo se financia» y las preguntas frecuentes (`PREGUNTAS`) se mudan a **`/acerca`**,
  página nueva y mínima.
- **El buscador es un `<form method="get" action="/buscar">`**: funciona sin JS y la portada
  sigue siendo componente de servidor. **No se le pone `'use client'`** (regla vigente).
- **Ejemplos clicables**: enlaces fijos a `/buscar?q=…` en `lib/portada.ts`. **Los ejemplos
  evitan nombres de producto cortos o alfanuméricos** («pc», «tv», «A4», «4x4», «UV», «3M»): la
  búsqueda descarta las palabras de menos de tres letras y las que llevan dígitos, así que no
  encontrarían nada. **Se eligen y se
  verifican contra producción**, no contra el fixture del golden (que sólo trae cinco firmas
  sintéticas): `scripts/verificar-produccion.sh` comprueba que cada ejemplo devuelve al menos un
  producto indexable. Requiere §8.5.
- **La tira de cifras** sale de `GET /publico/portada` (§6.6), una sola llamada con la caché de
  la portada (ISR 30 min, etiqueta `compra-agil`). **Si falla, la tira se oculta**; la portada no
  se cae por la API.
- **«Lo mejor de hoy»** reutiliza `BloqueHoy` en filas compactas (nombre, comprador, monto,
  cierre, cotizaciones), **sin «puntaje N/100» ni cocientes**. **Regla única** para el caso en que
  §8.1 no llegue a un orden creíble: el bloque se titula «Cierran pronto», se ordena por cierre y
  no lleva número de posición. No se publica un ranking que no ordena.
- **«Hecho por»** usa un ayudante nuevo en `lib/responsable.ts` que devuelve `null` sin
  `RESPONSABLE_LEGAL`: el `'[[definir RESPONSABLE_LEGAL]]'` que usan términos y privacidad **no**
  puede llegar a la portada. Sin nombre, la línea dice sólo lo demás.
- Metadatos, `app/opengraph-image.tsx` (texto y `alt`), `twitter-image` y la descripción del
  layout raíz pierden «Inteligencia de compras públicas» (R10). La imagen OG no incrusta fuentes:
  el cambio tipográfico no la toca.

### 6.4 Búsqueda (`/buscar?q=`)

Vive en `app/(publico)/buscar/`. Una búsqueda, tres respuestas, en este orden:

1. **Cuánto ha pagado el Estado** — `GET /publico/productos?q=` (el orden real es indexables
   primero y luego por `n`): los 3 primeros; para el primero, su banda de la unidad más comprada
   (`GET /publico/productos/{slug}` → `unidades[0]`: P25–P50–P75 y `predictibilidad`) con enlace
   a su ficha. Los otros dos, como enlaces, más «ver todos» → `/productos?q=…` (requiere §8.3).
2. **Qué está abierto ahora** — licitaciones abiertas que no son Compra Ágil (definición de §6.6;
   las 5 primeras y el total, con enlace a `/licitaciones?search=…` **con los mismos filtros**,
   que esa pantalla ya lee de la URL en `lib/filtrosCatalogo.ts`) y
   `GET /compra-agil/destacadas?search=` (las 3 primeras, enlace a `/compra-agil?search=…`, que
   también lo lee).
3. **Quién lo compra** — `compradores` del primer producto (hasta 5), **todos enlazados** a
   `/compradores/[codigo]`, como ya hace la ficha de producto.

Reglas:
- **Componente de servidor** que pide al backend **como el visitante**, reutilizando
  `pedirAlBackend` de `lib/rssServidor.ts` (con la barra final de las rutas del catálogo, p. ej.
  `/tenders/`). Cuenta en el límite por IP: hasta cuatro llamadas por búsqueda.
- **Orden de las llamadas**: la búsqueda de productos, las licitaciones y la Compra Ágil van en
  paralelo; la ficha del primer producto depende de la primera y va después.
- **Un bloque que falla se oculta** con una línea que lo dice; los demás se pintan.
- **`q`**: entre 3 y `limites.TEXTO` caracteres (`/publico/productos` acepta `min_length=2`, pero la firma descarta las palabras de menos de tres letras y los números: con dos letras la respuesta es siempre `[]`, y la pantalla no debe invitar a buscar eso). Para
  Compra Ágil, como mucho `MAX_TERMINOS` (8) palabras: se recorta antes de llamar, o el backend
  responde 422.
- **`noindex`** por metadatos. **No** se añade a `NO_RASTREAR` de `robots`: un buscador que no
  rastrea la página no ve su `noindex`.
- Sin resultados en ninguno de los tres: lo dice y ofrece los ejemplos de la portada.
- La página repite arriba el formulario de búsqueda, con el término puesto.

### 6.5 `/abierto`

Vive en `app/(publico)/abierto/`, se añade a `PAGINAS_FIJAS` del sitemap (`lib/publico.ts`) y es
indexable. Cinco secciones con ancla:

- **`#api`** — qué es público (`docs/API_PUBLICA.md`), enlace a `https://api.tordo.cl/docs`,
  límite por IP (60/min) y un `curl` de ejemplo en Plex Mono.
- **`#mcp`** — «Pregúntale a Claude por el mercado público». Una caja por cliente:
  - Claude Code: `claude mcp add --transport http tordo https://api.tordo.cl/mcp/`
  - Claude.ai / Claude Desktop: *Settings → Connectors → Add custom connector*, pegar la URL.
  - ChatGPT: conector personalizado con la URL y «sin autenticación» (modo desarrollador).
  - Cursor: enlace profundo `cursor://anysphere.cursor-deeplink/mcp/install?name=TORDO&config=<base64 de {"url":"https://api.tordo.cl/mcp/"}>`.
  - VS Code / genérico: `{"servers":{"tordo":{"type":"http","url":"https://api.tordo.cl/mcp/"}}}`.
  - Las cuatro herramientas, una línea cada una. Sin clave, sin cuota.
  - **La URL publicada lleva siempre la barra final**: es la canónica.
- **`#datos`** — CSV desde cada análisis (`/bi/exportar/*`, BOM y `;`), RSS de búsquedas
  guardadas y de Compra Ágil, y de dónde salen los datos (enlace a la guía).
- **`#codigo`** — repositorio (si `REPOSITORIO_URL`), licencia, cómo reportar un problema. **Sin
  botones de terceros** (`buttons.github.io`, shields.io): meterían peticiones que la política de
  privacidad no declara.
- **`#licencias`** — §7.1, con su límite: lo derivado es CC BY 4.0; el catálogo, de ChileCompra.

`/acerca` (PR de portada) también va en `app/(publico)/` y en `PAGINAS_FIJAS`.

### 6.6 Backend: `GET /publico/portada`

Endpoint nuevo, anónimo, en el router `publico` (grupo ya clasificado en
`app/api/documentacion.py`), esquema en `app/schemas/publico.py`, consulta en `repositories/`:

```json
{
  "licitaciones_abiertas": 4232,
  "compra_agil_abiertas": 2714,
  "actualizado_en": "2026-10-14T11:00:00-03:00"
}
```

- **Una sola definición de «abierta», la del catálogo**: `Licitacion.activo` y `esta_abierta`
  de `repositories/licitaciones.py` (estado publicado **y** `fecha_cierre` futura), separada por
  `tipo_convocatoria`. **La misma** la usan la tira, el bloque de `/buscar` y su enlace al
  catálogo. Hoy `GET /tenders?estado=` sólo compara el estado (no mira el cierre): si `/buscar`
  lo usa, el plan añade al router un filtro «abiertas» que reutilice `esta_abierta`, en vez de
  crear una tercera definición.
- `actualizado_en` = el que ya expone «Lo mejor de hoy» (`compra_agil.actualizado_en`).
- Sin parámetros: `test_parametros_acotados.py` no exige nada. Entra en
  `test_superficie_publica.py` por su grupo.

### 6.7 Qué se elimina

- `components/Layout.tsx` y los tokens de la barra lateral.
- En la portada: hero navy, `ACCESOS`, el bloque «De dónde salen los datos / Cómo se financia»
  (a `/acerca`), `PREGUNTAS` (a `/acerca`), las bandas `band-1..4`.
- La insignia «puntaje N/100» de `TarjetaDestacada`.
- «Adjudica X de Y en 6 meses»: se sustituye por datos separados («524 órdenes en 6 meses» y su
  monto mediano). **Nunca un cociente leído como tasa** (CLAUDE.md, `compra_agil_mensual`).
- Archivo y DM Sans.

---

## 7. Abrir el código

### 7.1 Licencias (R7)

- **Código: AGPL-3.0.** Es la única licencia común que obliga a quien sirva una versión
  modificada como sitio web a publicar sus cambios: adopción libre, sin un clon cerrado de pago
  —el SaaS que TORDO dejó de ser—. La usan lichess y mySociety (FixMyStreet, Alaveteli).
  Alternativa: **MIT** si se prefiere máxima adopción sin condiciones. Mientras el autor sea el
  único titular puede relicenciar después; deja de poder en cuanto acepte contribuciones sin
  CLA o DCO.
- **Lo que TORDO deriva: CC BY 4.0** —tablas de `analytics`, bandas, puntajes, los CSV de
  análisis y esas mismas cifras en la API—, exigiendo conservar la atribución a ChileCompra.
  **El contenido del catálogo** (nombres, descripciones y campos de licitaciones tal como los
  publica ChileCompra) **no lo licencia TORDO**: sigue bajo las condiciones de ChileCompra, que
  pide citar la fuente y no impone no-comercial ni compartir-igual (`chilecompra.cl/api`,
  `chilecompra.cl/terminos-y-condiciones-de-uso`; datos.gob.cl admite CC BY 4.0). **No es
  asesoría legal**; las condiciones del ticket de la API no se revisaron.

> **R7 confirmada (2026-10-14).** Punto 3 de §7.3 resuelto: el empleador no tiene derechos (proyecto
> personal, confirmado por el dueño).

### 7.2 Archivos del repositorio

`LICENSE`, `README.md` escrito para el público (qué es, captura, cómo correrlo, licencias, cómo
contribuir, una línea que explique que la historia incluye la etapa SaaS), `SECURITY.md` (con el
reporte privado de vulnerabilidades de GitHub), `CONTRIBUTING.md` en español (CI en verde,
`make ci`, DCO) y `CODE_OF_CONDUCT.md` (Contributor Covenant en español). En GitHub: *topics*
(`chilecompra`, `mercado-publico`, `open-data`, `civic-tech`, `mcp-server`), imagen social
1280×640 y Discussions.

### 7.3 Antes de hacerlo público (R8) — bloqueante

1. **Hay credenciales en la historia.** `backend/.env` estuvo versionado de `fef3a9a`
   (2025-11-08) a `d3c7592` (2026-08-05): `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` (sandbox),
   `JWT_SECRET`, `DB_URL`. **Twilio: resuelto** — las credenciales estaban vivas (cuenta de prueba
   activa); el dueño cerró la cuenta el 2026-10-14 y el token responde 401. El
   JWT ya no firma nada (cuentas retiradas); comprobar que la URL de base no sea la de producción.
   También estuvo `frontend/.env.local` (sólo `NEXT_PUBLIC_API_URL`, inocuo).
2. **Escanear la historia completa** con `gitleaks git -v --redact .` y
   `trufflehog git file://. --results=verified,unknown`. La revisión manual no lo sustituye.
3. **129 commits llevan el correo laboral del autor.** El empleador no tiene derechos sobre el código
   (proyecto personal, confirmado el 2026-10-14); queda la privacidad. Si el correo no
   debe quedar público, sólo lo oculta reescribir la historia o publicar un repositorio nuevo
   aplanado (`.mailmap` no basta).
4. **Revisar antes de publicar**: `docs/tordo_plan_saas.pdf`, `docs/COMPETENCIA_KAPTOR_2026-08.md`,
   los parquets del fixture del golden (`backend/tests/golden/fixture_analytics/`: lo anterior al
   11-10 no estaba enmascarado) y cualquier `*.log` versionado.
5. **Camino decidido (2026-10-14): limpiar la historia con el repositorio todavía privado, y
   después hacerlo público.** Con `git filter-repo`: fuera `backend/.env` y `frontend/.env.local`
   de todos los commits, y el correo laboral reescrito al personal (`--mailmap`), más lo que
   encuentre el escaneo del punto 2 y lo que se decida en el punto 4. Consecuencias que hay que
   asumir:
   - **Cambian todos los hashes.** Los números de PR (#155…) siguen valiendo —los PR viven en
     GitHub—, pero los enlaces a commits concretos y los hashes citados en los documentos dejan de
     resolver. Los documentos se revisan en el mismo PR.
   - Exige *force push* a `main` y **re-clonar o rehacer cada worktree**: los worktrees comparten
     el `.git` del checkout principal y quedarían apuntando a commits que ya no existen. Se hace
     sin PR abiertos ni worktrees con trabajo a medias.
   - **Limpiar no sustituye a rotar**: si el token de Twilio sigue vivo, se revoca igual (regla de
     CLAUDE.md: una credencial que llegó a un commit se rota).
   - El escaneo se repite **después** de reescribir, sobre la historia nueva, y sólo con cero
     hallazgos se voltea a público.

**Beneficio colateral:** en un repo público la protección de rama y los minutos de Actions son
gratis. Desaparecen dos rodeos documentados en `CLAUDE.md` —`make merge` como única guarda y los
bloqueos de Actions por facturación—. Al publicar se activan la protección de `main` y el *secret
scanning* con *push protection*, y CLAUDE.md se corrige en el mismo PR.

### 7.4 Registros MCP

Tras publicar `/abierto#mcp`: registro oficial de MCP (`mcp-publisher`, espacio de nombres
`cl.tordo/…` verificado por DNS o por `tordo.cl/.well-known/mcp-registry-auth`, *remote*
`streamable-http` a `https://api.tordo.cl/mcp/`), Smithery (`smithery.ai/new`) y Glama (categoría
*Government Data*).

---

## 8. Fase 0 — arreglos previos (R9)

Cada uno en su PR, antes de tocar la piel.

### 8.1 El orden de «Lo mejor de hoy»

1. **Primero, el dato.** Verificar si `total_ofertas_recibidas` se actualiza después de la
   ingesta (`etl/transformers/compra_agil_transformer.py`, sincronización por `cambio_desde`). Si
   no se actualiza, **ese es el arreglo principal**: el factor `competencia` no puede ordenar con
   un conteo congelado en cero. Si se actualiza y de verdad el 97 % tiene cero cotizaciones, el
   factor no discrimina y hay que decirlo en vez de pesarlo.
2. **`comprador`**: definir qué mide y que la copia lo diga igual. Hoy `BloqueHoy` y `PREGUNTAS`
   prometen «compradores que adjudican lo que publican». Candidatas, a elegir en el plan con los
   datos a la vista: (a) el cociente acotado sólo cuando `publicadas` cubra la ventana entera
   —honesto, pero neutro para casi todos durante meses—; (b) el percentil del comprador en
   órdenes de Compra Ágil de 6 meses —discrimina desde hoy, pero mide «compra mucho», y la copia
   tiene que cambiar a eso—.
3. **`tiempo`**: saturar más tarde (p. ej. 72 h) si sigue empatando.
4. **Criterio medible y reproducible**: sobre una **instantánea guardada** de las candidatas
   (`tiempo` depende de `now()`; la instantánea fija el reloj), el **mayor grupo de empate** y el
   **número de puntajes distintos** entre las 50 primeras, antes y después. Objetivo: ningún grupo
   de empate mayor que 5 y al menos 30 puntajes distintos en 50. Si no se alcanza, se aplica la
   regla de §6.3 («Cierran pronto»).
5. Sigue siendo una heurística sin verdad contra la que evaluar: **ordena, no predice**. El
   docstring de `repositories/compra_agil.py` y la guía «Lo mejor de hoy en Compra Ágil» se
   corrigen en el mismo PR.
6. Test con un catálogo de juguete donde la versión vieja empata y la nueva ordena.

### 8.2 La memoria de la API (`/mercado`)

**Requisitos:** (1) ningún endpoint de BI carga una tabla de analytics entera: filtros, cotas y
agregados en SQL, con un test que falle si una lectura grande no lleva filtro ni límite;
(2) `make medir-memoria` pide la ráfaga real de `/mercado` y reproduce la muerte antes del arreglo;
(3) la API se reinicia siempre tras una caída (política «Always» en Railway, con autorización del
dueño, y en `docs/DESPLIEGUE.md`); (4) la pantalla nunca queda en un *spinner* indefinido: tiempo
máximo en el cliente y un error accionable con «Reintentar». El golden master de BI tiene que
pasar.

### 8.3 `/productos?q=`

El término vive en la URL: `BuscadorProductos` lo lee con `useSearchParams` en un inicializador
perezoso dentro de `Suspense` y lo escribe con `replaceState` (el patrón de `/mercado`). Test:
abrir `/productos?q=resma` muestra resultados sin escribir nada.

### 8.4 Redirecciones a `http://`

**Requisito:** **ninguna** respuesta de la API lleva un `Location` con esquema `http://` cuando la
petición llegó por HTTPS — `/mcp`, `/health` y toda redirección por barra final de `/api/v1/*`.
Que el plan elija el arreglo (Location relativo, rutas sin redirección, o el esquema correcto
detrás de Railway) **sin reabrir el modelo de confianza de IP**: uvicorn sigue con
`--no-proxy-headers`. El test simula la terminación TLS de la plataforma y comprueba el
`Location`. Relacionado: #155, el mismo síntoma del lado del proxy de Next.

### 8.5 Búsqueda de productos con palabras vacías

`buscar_productos` aplica al término **la misma regla que construye la firma**
(`backend/app/utils/firma.py`): fuera los tokens de menos de `MIN_TOKEN` (3) letras —ahí
caen «de», «la», «en»— y los de `RUIDO`, con la misma normalización de tildes. Así la búsqueda y
la firma hablan el mismo idioma. **La regla no se copia**: vive en un módulo sin dependencias
que importan los dos lados (el ETL por `etl/shared_imports.py`, como `app/models/convocatoria.py`).
Test: «guantes de nitrilo» encuentra la firma `guantes nitrilo …`. Sin esto, los ejemplos de la
portada devuelven vacío.

---

## 9. Orden de los PR

| Paso | PR | Depende de |
|---|---|---|
| 0a | §8.1 orden de «Lo mejor de hoy», sin «X de Y» ni «puntaje N/100» | — |
| 0b | §8.2 memoria de la API, reinicio y errores de `/mercado` — **el más urgente** | — |
| 0c | §8.3 `/productos?q=` en la URL | — |
| 0d | §8.4 redirecciones a `http://` | — |
| 0e | §8.5 búsqueda de productos sin palabras vacías | — |
| 1 | **Tipografía y color** (§5) + test WCAG de tokens | — |
| 2 | **`/abierto`** (§6.5) + desglose de costos en `/apoyar` (R6), con la cabecera **actual** de `(publico)` | 0d |
| 3 | **`GET /publico/portada`** (§6.6), con el filtro «abiertas» del catálogo si hace falta | — |
| 4 | **Cáscara única** (§6.1, §6.2): cabecera (con «API y MCP» → `/abierto`), pie, adiós a `Layout.tsx` y a los tokens de la barra lateral, «Mercados» y «Precios» en la navegación | 1, 2 |
| 5 | **`/buscar`** (§6.4) | 0c, 0e, 3, 4 |
| 6 | **Portada nueva** + `/acerca` (§6.3), con su enlace en el pie; adiós a `band-*`; metadatos e imagen OG (R10) | 0a, 3, 4, 5 |
| 7 | **Abrir el código** (§7): escaneo, limpieza de la historia, re-escaneo, archivos, publicar, `REPOSITORIO_URL`, protección de `main` | §7.3 (Twilio y empleador ya resueltos) |
| 8 | Registros MCP (§7.4) | 2, 0d |

0a–0e, 1 y 3 son independientes entre sí: pueden ir en paralelo, cada uno en su worktree. **Cada
PR corrige CLAUDE.md y los comentarios que deja falsos** (principio 8): el de tipografía, la
sección de tokens y `.cifra`; el de cáscara, la barra lateral, los «tres marcos» del pie y los
comentarios de `PieAtribucion` y `legal-enlazado`; el de portada, la sección de la portada.

---

## 10. Tests que cambian

| Test | Qué cambia |
|---|---|
| `__tests__/portada.test.tsx`, `e2e/portada.spec.ts` | Se reescriben: buscador como `<form>` GET, tira que se oculta si el backend falla, «Lo mejor de hoy» compacto (o «Cierran pronto»), «hecho por» sin el hueco `[[…]]`, sin promesas de cuentas (esa aserción se conserva) |
| `__tests__/legal-enlazado.test.tsx` | Los marcos con pie pasan a la cáscara única + `DocumentoLegal`; la regla sigue: toda página lleva `PieAtribucion` |
| `__tests__/on-color.test.ts` | Sin cambio de regla |
| nuevo: contraste WCAG | Lee los tokens de `globals.css` y comprueba cada tinta contra cada superficie, en ambos temas |
| nuevo: tipografía | Tres variables de fuente; `.cifra` sobre `--font-sans` con `tnum`; nunca `cifra` + `font-display` |
| `__tests__/redirecciones-panel.test.ts`, `e2e/redirecciones.spec.ts` | Sin cambio: las URL del panel no se mueven |
| `e2e/enlaces.spec.ts` | Sin cambio de regla; recorre los enlaces nuevos de cabecera y pie |
| `__tests__/compra-agil-destacadas.test.tsx` | Sin «puntaje N/100» ni «X de Y» |
| `__tests__/buscador-productos.test.tsx` | `?q=` en la URL (§8.3) |
| `__tests__/sitemap-robots.test.ts` | `/abierto` y `/acerca` en el sitemap; `/buscar` fuera del sitemap y **no** bloqueada en `robots` |
| nuevos | `buscar.test.tsx` (tres bloques, uno que falla se oculta, `noindex`, recorte a 8 términos), `abierto.test.tsx` (cajas MCP con la URL con barra; «Código» sólo con `REPOSITORIO_URL`), `e2e/buscar.spec.ts`, tests del endpoint `/publico/portada`, de las redirecciones (§8.4), de palabras vacías (§8.5) y del orden (§8.1) |
| `backend/tests/test_docs_indexadas.py` | Este documento, clasificado en `docs/README.md` |

---

## 11. Fuera de alcance

- Cambiar qué calcula el producto o sus fuentes de datos (salvo §8.1 y §8.5).
- Un *changelog* público: la hora de actualización ya prueba que el sitio está vivo. Se reabre si
  aparecen colaboradores.
- Contadores de estrellas de GitHub en el sitio.
- Rediseñar por dentro `/mercado`, las fichas públicas o las guías: heredan tipografía, color y
  cáscara, nada más.
- Cuentas, cobros o cualquier cosa que dependa de quién llama (ADR 0011).

## 12. Riesgos

- **«Lo mejor de hoy» puede no tener arreglo rápido** si el conteo de cotizaciones está congelado
  en origen. Por eso la regla de §6.3 («Cierran pronto») está escrita de antemano.
- **Tres familias de fuente** suben el peso inicial. Medir el LCP de la portada antes y después
  (Vercel Web Analytics ya está); si empeora, Plex Mono se carga sólo en las páginas que lo usan.
- **Cambiar el fondo cambia los 166 pares de contraste**; sin el test WCAG nuevo, el error es
  invisible en el tema que se revisa por defecto (ya pasó con `.alert-info`).
- **Abrir el código expone la historia del SaaS** (planes de precio, competencia). No es secreto,
  pero es la foto de otro producto; el README lo explica en una línea.
