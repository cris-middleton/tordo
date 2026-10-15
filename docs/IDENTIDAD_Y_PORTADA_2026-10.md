# Identidad visual y portada con datos — octubre 2026

> **Estado: propuesta para revisión del dueño (2026-10-15).** Sustituye, cuando se apruebe, a
> dos partes de [`REDISENO_PUBLICO_2026-10.md`](REDISENO_PUBLICO_2026-10.md): la tipografía y el
> color (§5) y la portada (§6.3 y §6.6). El resto de ese documento sigue vigente.
>
> **Antes de escribir el plan queda una ronda de diseño**, pedida por el dueño: el tono de los
> textos y los valores de los colores. Esta spec fija la **estructura** (qué hay, de dónde sale
> cada dato, cómo falla). Los textos viven en un solo módulo y los colores en tokens, así que esa
> ronda cambia valores sin tocar la arquitectura (§9).

La referencia visual es la maqueta v5 ([`assets/portada-v5.png`](assets/portada-v5.png)). **Sus
cifras son reales sólo en parte**: 4.203 y 2.849 son de producción del 2026-10-15 y el gasto por
sector, de los datos locales de 6 meses. La banda de precio, el cierre de las Compras Ágiles y
la franja inferior son ejemplos.

---

## 1. Por qué

Dos observaciones del dueño sobre el sitio publicado tras el rediseño:

1. **«Se parece demasiado a una página hecha entera con Claude»**: papel crema, titular en serif y
   etiquetas en mayúsculas espaciadas. Son justo las señales que la skill `frontend-design` de
   Anthropic enumera como genéricas: fondo crema con serif, kits de tarjetas, *eyebrows* en
   mayúsculas y metadatos separados por puntos medios.
2. **«Falta información gráfica desde el principio»**: la portada era un buscador y dos cifras.
   Quien llega no ve qué sabe el sitio hasta que busca algo.

Además, el logo propio (el pájaro azul con el ala turquesa, `public/images/tordo-logo-3-opened.svg`)
no aparecía en ninguna parte del sitio ni en la tarjeta para compartir.

### 1.1 Cómo se llegó a la v5

Hubo cinco rondas de maquetas en el compañero visual, todas revisadas por el dueño:

| versión | qué era | veredicto |
|---|---|---|
| v1 | Tres direcciones: A «Instrumento» (tablero denso), B «Atlas» (editorial), C «Cartel» (oscuro, una cifra gigante) | A |
| A refinada | A con una frase de conclusión por gráfico | Peor: dos gráficos grandes y difíciles de leer |
| v3 | Cuatro gráficos compactos, Chile por región a la derecha | Mejor, pero el gráfico de Chile no convence |
| v4 | Los tres gráficos chicos a la derecha y Chile como franja abajo | Faltan zonas delimitadas y espacio en blanco |
| **v5** | **Panel propio para los gráficos, más aire, color sólo en la conclusión y sin Chile** | **Aprobada como base** |

Se usaron dos skills de diseño: `frontend-design` (Anthropic) y `ui-ux-pro-max` (MIT, auditada
antes de instalarla). Las dos coincidieron en lo mismo: una frase de conclusión por gráfico,
etiquetas directas en vez de leyendas, texto de 13 px o más, y el color reservado a lo que
importa.

---

## 2. Decisiones

| # | Decisión | Motivo |
|---|---|---|
| D1 | **Archivo** sustituye a Newsreader y Public Sans en todo el sitio | Una sola familia variable con eje de ancho: titulares expandidos (`wdth` 112–115, peso 800) y cuerpo normal. Trae cifras tabulares. Es la tipografía de las maquetas aprobadas |
| D2 | **IBM Plex Mono se queda, sólo para identificadores**; **Varien, para la marca**, ahora junto al pájaro en la cabecera | Ninguno de los dos estaba en la queja. El pájaro es la marca y no se veía en ningún sitio |
| D3 | **Fondo de página blanco** en tema claro; se va el papel cálido (`#F7F4EC`) | Es la primera señal de «hecho con Claude». El panel de gráficos usa `--color-surface-elevated` (`#F1F4F9`), que ya existe |
| D4 | **Dos tokens de dato**: `--color-dato` (el azul del logo, `#2849AD`) y `--color-dato-tenue` (`#C9D3E8`), con sus paradas de tema oscuro | Cada gráfico pinta en color sólo su conclusión y deja el resto apagado. Así el panel no compite con el titular |
| D5 | **La portada se parte en dos columnas desde `lg`**: a la izquierda se busca, a la derecha se lee | Lo que el dueño aprobó en la v5 |
| D6 | **Tres lecturas**: gasto por sector, la banda de precio de un producto y las Compras Ágiles según cuándo cierran | Responden lo que pregunta quien vende: quién compra, a qué precio y qué cierra pronto |
| D7 | **Cada frase de conclusión sale del dato, con reglas y tests** | «Salud y municipios compran casi lo mismo» es verdad hoy y puede no serlo el domingo. Una frase escrita a mano sobre un dato vivo termina mintiendo |
| D8 | **Gráficos en HTML y CSS, dibujados en el servidor**: sin Recharts y sin JavaScript de cliente | La portada no tiene JS propio (regla vigente) y Recharts pesa ~100 KB. Tres barras no lo justifican |
| D9 | **El gráfico de Chile por región sale de la portada** | El dueño no lo vio necesario y coincido: es un dato curioso, pero no ayuda a decidir a quien vende. Puede vivir en `/mercado` (fuera de alcance) |
| D10 | **Fuera «gratis y sin cuenta»** de títulos, descripciones y lemas | Suena a SaaS: dice lo que *no* cobra, no lo que es. Lo sustituye «Datos abiertos, código abierto» (cabecera) y, en la tarjeta para compartir, «Datos públicos de ChileCompra» (ya publicada en su propio PR) |
| D11 | **La franja inferior muestra «publicadas hoy» en vez de «monto estimado abierto»** | Muchas licitaciones no publican el monto estimado, y una suma que deja fuera a la mitad se lee como total. Contar las publicadas hoy no tiene ese problema |

---

## 3. La portada

### 3.1 Estructura (≥ 1024 px)

```
┌ cabecera (cáscara única): pájaro + TORDO · navegación · «Datos abiertos, código abierto» ┐
├──────────────────────────────────────┬──────────────────────────────────────────────────┤
│ ¿Qué le vendes al Estado?   (h1)     │ ┌ panel (surface-elevated, radio 14 px) ───────┐ │
│ Cuánto ha pagado, qué está abierto   │ │ Lectura 1: gasto por sector                  │ │
│ hoy y quién lo compra.               │ │ ──────────────────────────────────────────── │ │
│ [ buscador ................ Buscar ] │ │ Lectura 2: banda de precio de un producto    │ │
│ ejemplos                             │ │ ──────────────────────────────────────────── │ │
│ 4.203 licitaciones │ 2.849 C. Ágiles │ │ Lectura 3: Compras Ágiles según su cierre    │ │
│ ✓ Sin registro ✓ API y MCP ✓ CSV     │ └──────────────────────────────────────────────┘ │
├──────────────────────────────────────┴──────────────────────────────────────────────────┤
│ Publicadas hoy: N │ Más publica hoy: organismo │ Actualizado a las HH:MM                   │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Lo mejor de hoy (BloqueHoy, como hoy) · Úsalo como quieras · Cómo se sostiene            │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

- Contenedor `max-w-6xl` (hoy `max-w-4xl`), con 56 px entre columnas y 48 px de margen
  vertical en el hero.
- **Por debajo de `lg`, una columna**: buscador, cifras y checks, y después el panel con las
  lecturas apiladas. La franja inferior pasa a tres líneas. A 320 px nada se sale del ancho:
  `e2e/cascara.spec.ts` ya mide 320, 390, 768, 1024 y 1440, y se le añade la portada.
- Los tres checks enlazan a `/acerca`, `/abierto#mcp` y `/abierto#datos` (las anclas que ya existen). La línea del lema
  (`lemaPortada`) desaparece de la portada porque su contenido pasa a la cabecera.
- La píldora de la cabecera sólo dice «código abierto» con `REPOSITORIO_URL`, como el lema de
  hoy. Sin la variable dice «Datos abiertos».

### 3.2 Una lectura

Una lectura tiene siempre cuatro partes:

1. **Conclusión** (`h3`): una frase generada por una función pura de `lib/lecturasPortada.ts`.
2. **Pie**: el periodo y la base («últimos 12 meses, 184 órdenes») y, a la derecha, un enlace
   a la página donde se profundiza.
3. **Gráfico**: barras en `div` con su valor escrito al lado. Las barras van con `aria-hidden`
   y los valores, como texto. Un lector de pantalla lee la conclusión y la lista de valores, sin
   descripciones de colores.
4. **Color**: `--color-dato` sólo en lo que la conclusión nombra; el resto, `--color-dato-tenue`.

**Si una lectura no tiene dato, se oculta entera** (principio 4 del rediseño). Si faltan las
tres, se oculta el panel y la portada queda como hoy: buscador y cifras. Ninguna lectura lanza
una excepción, tampoco con un 200 mal formado: se valida con el mismo criterio que
`pedirDestacadas`.

### 3.3 Lectura 1: quién compra

- **Dato**: los cuatro sectores de mayor `monto_total` en `analytics.sector_dashboard` (hay 7:
  Salud, Municipalidades, Gob. Central y Universidades, Obras Públicas, FFAA, Otros, Legislativo
  y judicial).
- **Periodo**: `sector_dashboard` **no publica su ventana**, y en producción la ventana son
  36 meses, no los 6 de la maqueta. Hay que añadirle `ventana_desde` y `ventana_hasta`, como ya
  tienen `price_bands` y `competitors_by_market`, porque una cifra sin periodo se lee como «de
  siempre». El pie dice «Monto de órdenes de compra, {periodo}».
- **Regla de la frase**:
  - Si el segundo sector está a menos del 5 % del primero: «{A} y {B} compran casi lo mismo».
    Se pintan los dos.
  - Si no: «{A} compra más que nadie: {monto}». Se pinta uno.
- **Nombres**: un mapa corto en `lib/lecturasPortada.ts` traduce el nombre del dato al de
  pantalla («Gob. Central, Universidades» → «Gob. central»). Un sector que no esté en el mapa sale
  con su nombre tal cual.
- **Montos**: con `plata()` de `lib/publico.ts`, la que ya usan las páginas públicas («$3 billones»).
  La maqueta abreviaba «bill.»; se usa la palabra entera, como en el resto del sitio.
- **Enlace**: «Ver mercados» → `/mercado`.
- **Backend**: `GET /publico/sectores`, que lee `sector_dashboard` entera (7 filas; ya está en la
  lista de lecturas enteras permitidas de `test_bi_mercado_acotado.py`). Se pide con ISR semanal y
  la etiqueta `analytics`, como las páginas públicas. Va sin `FEATURE_ANALYTICS`: si está apagada,
  la lectura se oculta.

### 3.4 Lectura 2: a qué precio

- **Dato**: la ficha de un producto fijo, `PRODUCTO_PORTADA` en `lib/lecturasPortada.ts`
  (propuesta: el slug de «guantes de nitrilo», el primer ejemplo del buscador). Se toma la unidad
  con más compras (`unidades[0]`).
- **Gráfico**: un riel tenue de p10 a p90, la banda de p25 a p75 en `--color-dato` y la mediana
  marcada con su rótulo. **No se muestran el mínimo ni el máximo**: son los valores que el Tukey
  de las bandas ya trata como atípicos.
- **Frase**: «{Producto}: la mitad se pagó entre {p25} y {p75}». Es cierta por definición del
  rango intercuartílico.
- **Pie**: «Precio por {unidad}, {n} compras, {periodo}».
- **Enlace**: «Ver el producto» → `/productos/{slug}`.
- **Fallo**: si la ficha da 404, no es indexable o no trae p25 y p75, la lectura se oculta.
- **Verificación**: `scripts/verificar-produccion.sh` comprueba que el slug existe y es indexable
  en producción, con una petición espaciada, como ya hace con los ejemplos del buscador.
  `__tests__/portada-ayudantes.test.ts` compara la copia literal del slug.

### 3.5 Lectura 3: qué cierra pronto

- **Dato**: las Compras Ágiles abiertas repartidas por día de cierre **en hora de Chile**
  (`hoy_chile()`): hoy, mañana, en 2 o 3 días y después. Usa la misma definición de «abierta»
  (`esta_abierta()` sobre `activo`), así que **los cuatro números suman `compra_agil_abiertas`**,
  y un test lo exige.
- **Frase**: «{N} de cada 10 Compras Ágiles abiertas cierran hoy o mañana», con N redondeado. Se
  pintan «hoy» y «mañana». Si N es 0, la frase pasa a ser «Ninguna Compra Ágil abierta cierra hoy
  ni mañana» y no se pinta ninguna.
- **Enlace**: «Ver las de hoy» → `/compra-agil`.
- **Backend**: se añade `compra_agil_por_cierre: {hoy, manana, dos_tres_dias, despues}` a
  `GET /publico/portada` dentro de la **misma pasada** de `contar_abiertas`, con `count(*) FILTER`
  y los límites de día calculados en Python. No es una consulta nueva sobre la tabla.

### 3.6 Franja inferior

Todo en `GET /publico/portada`, que lee el catálogo y no analytics:

- **«Publicadas hoy»**: licitaciones y Compras Ágiles con `fecha_publicacion` en el día de Chile,
  en la misma pasada, con otro `FILTER`. **Va sin enlace**: el catálogo no tiene filtro por fecha de
  publicación (`api/tenders.py`), y crearlo queda fuera de alcance.
- **«Más publica hoy»**: el organismo con más publicaciones del día. Es una consulta aparte,
  `GROUP BY codigo_organismo ORDER BY count DESC LIMIT 1`, sobre el índice de
  `fecha_publicacion`. El nombre largo se corta con elipsis y el `title` lleva el nombre entero.
  Si hoy no hay publicaciones, este hueco se oculta.
- **«Actualizado a las»**: el `actualizado_en` que ya existe.

### 3.7 Lo que queda debajo, sin cambios de fondo

«Lo mejor de hoy» (`BloqueHoy`), «Úsalo como quieras» y «Cómo se sostiene» siguen ahí, con la
tipografía y los tokens nuevos. «Úsalo como quieras» pierde el «Sin clave y sin cuenta» (D10).

---

## 4. Tipografía (sustituye a §5.1 del rediseño)

| Familia | Uso | Carga |
|---|---|---|
| **Archivo** | Todo: titulares (`h1`–`h2` a `wdth` 112–115 y peso 800; `h3` a 100 y 700), cuerpo, interfaz y **todas las cifras** (`tnum`) | variable, `wght` 400–800 y `wdth` 62–125, por `next/font/google` (autoalojada, sin petición a un tercero) |
| **IBM Plex Mono** | Sólo identificadores, sin cambio | estática, 400 y 500 |
| **Varien** | Sólo la marca, junto al pájaro | sin cambio |

- Se van Newsreader y Public Sans. `font-display` pasa a significar «Archivo expandido» y la
  regla de que **nunca va junto a `cifra`** se mantiene.
- `__tests__/tipografia.test.ts` y `e2e/tipografia.spec.ts` se reescriben con las familias
  nuevas.
- Los ejes de Recharts (`/mercado`) heredan Archivo sin cambios.

## 5. Color (sustituye a §5.2 del rediseño)

- **Fondo claro blanco** (`--color-background` = `#FFFFFF`). Las tarjetas siguen en
  `--color-surface`, así que se pierde el contraste entre fondo y tarjeta: las tarjetas pasan a
  definirse por su borde (`--color-border`), que ya llevan.
- **Tokens nuevos**: `--color-dato` (`#2849AD` en claro y `#8FA8E8` en oscuro) y
  `--color-dato-tenue` (`#C9D3E8` en claro y `#2A3550` en oscuro). Los mapea Tailwind como
  `dato` y `dato-tenue`.
- **El botón de buscar** pasa a `--color-dato`, como en la maqueta, con `text-onDato` (nuevo
  `--color-on-dato`) por la regla de «nunca `text-white` sobre un token».
- **`contraste-wcag.test.ts`** gana los pares nuevos: `dato` sobre `surface` y sobre
  `surface-elevated` (3:1, elemento gráfico), `on-dato` sobre `dato` (4,5:1) y las tintas de
  texto sobre `surface-elevated`. `dato-tenue` se declara decorativo (`SIN_PAR`): nunca lleva
  texto encima y el valor va siempre escrito al lado.
- **Tema oscuro**: mismas reglas y sus paradas. Se revisa con capturas en el E2E de la cáscara
  (ya existe la captura en oscuro) antes de mergear.

---

## 6. Textos (D10)

Los textos de la portada viven en `lib/portada.ts` y `lib/lecturasPortada.ts`, y los demás en
sus módulos de hoy. Se reemplaza «gratis y sin cuenta», o «sin registrarte», en:

`app/page.tsx` (título y descripción), `app/layout.tsx`, `app/(publico)/abierto/page.tsx`,
`app/(publico)/apoyar/page.tsx`, `app/(publico)/acerca/page.tsx`, `app/(panel)/guardados/page.tsx`,
`app/privacidad/page.tsx`, `app/(panel)/mercado/layout.tsx`,
`components/portada/UsosAbiertos.tsx`, `lib/acerca.ts` y `lib/rss.ts`.

**Criterio**: describir lo que el sitio *es* (datos públicos de ChileCompra, abiertos; código
abierto) y no lo que no cobra. «Sin registro» se queda como respuesta concreta a una duda
concreta (el check de la portada y la pregunta frecuente), no como lema. En `/privacidad` y
`/apoyar`, donde «gratis» y «sin cuenta» describen hechos (qué datos se tratan y cómo se
financia), se conservan si la frase es descriptiva y no promocional.

## 7. Backend: resumen de cambios

| Cambio | Dónde | Coste |
|---|---|---|
| `compra_agil_por_cierre` y `publicadas_hoy` | `repositories/licitaciones.contar_abiertas` → `GET /publico/portada` | 0 consultas nuevas: más `FILTER` en la misma pasada |
| `mas_publica_hoy` | consulta nueva en `repositories/licitaciones.py` | una agregación sobre las publicadas de un día, por el índice de `fecha_publicacion` |
| `GET /publico/sectores` | `api/publico.py` y `services/publico/` | lee 7 filas de analytics, con ISR semanal |
| `ventana_desde` y `ventana_hasta` en `sector_dashboard` | `etl/analytics/sector_intelligence.py` | dos columnas; se llenan en la semanal siguiente |

Todos los campos nuevos de `/publico/portada` son **opcionales** en el esquema: un frontend nuevo
contra un backend viejo oculta la lectura en vez de romper. `docs/API_PUBLICA.md` se actualiza
en el mismo PR. **Ninguna lectura de la portada puede traer una tabla entera de analytics salvo
`sector_dashboard`**: la API de producción ya cayó por OOM (memoria `api-produccion-oom`).

## 8. Tests que cambian o se añaden

- **`lib/lecturasPortada.ts`**: cada regla de frase con sus bordes: empate al 5 % exacto, un solo
  sector, N = 0, N = 10, y nombres fuera del mapa.
- **Backend**: los cuatro tramos suman `compra_agil_abiertas`; los bordes del día de Chile (una
  Compra Ágil que cierra a las 23:30 de Santiago es «hoy» aunque en UTC ya sea mañana, como
  `test_reloj_chile.py`); «más publica hoy» vacío; `/publico/sectores` sin la tabla da 503 o
  vacío, y la portada oculta la lectura.
- **`portada.test.tsx`**: con cada lectura faltante o mal formada se oculta sólo esa; sin las
  tres, sin panel; y el buscador siempre.
- **`tipografia`**, **`contraste-wcag`** y **`on-color`**: las familias y los tokens nuevos.
- **`r10-sin-inteligencia`**, sin cambio; y un test nuevo que falla si «gratis y sin cuenta»
  vuelve a un `title`, una `description` o al lema.
- **E2E**: la portada a 320, 390, 1024 y 1440 px, sin desborde horizontal, con captura en claro y
  oscuro.

## 9. Lo que se decide en la ronda de diseño (antes del plan)

El dueño quiere iterar dos cosas sobre la v5 antes de construir. Ninguna cambia la estructura:

1. **El tono de los textos.** El dueño dio una referencia («pixelframe») que hay que identificar
   con él antes de la ronda. Se reescriben en la maqueta el `h1`, el subtítulo, las tres frases
   de conclusión (sus plantillas), los checks, la píldora y la franja. Las plantillas de §3.3–3.5
   se ajustan sin cambiar las reglas.
2. **Los valores de color**: `--color-dato`, `--color-dato-tenue`, el fondo del panel y el acento
   de las cifras. Son tokens: cambiar un valor no toca un componente, y el test de contraste dice
   si el valor nuevo vale.

Lo que salga de la ronda se escribe en esta spec antes del plan.

## 10. Orden de los PR

1. **Backend**: los campos de `/publico/portada`, `/publico/sectores` y la ventana de
   `sector_dashboard`. No cambia nada visible.
2. **Identidad**: Archivo, fondo blanco, tokens de dato y el pájaro en la cabecera. Cambia todo
   el sitio, así que va solo y con las capturas E2E revisadas.
3. **Portada**: dos columnas, el panel con las tres lecturas y la franja.
4. **Textos**: fuera «gratis y sin cuenta» (§6), con su test.

La tarjeta para compartir (opción 3, «Datos públicos de ChileCompra») va aparte y antes: no
depende de nada de esto.

## 11. Fuera de alcance

- El gráfico de Chile por región (D9). Si vuelve, va a `/mercado`.
- Las cotizaciones de Compra Ágil: la compuerta G1 sigue cerrada (`MOSTRAR_COTIZACIONES = false`).
- Un filtro por fecha de publicación en el catálogo (hoy no existe).
- Rediseñar las demás páginas más allá de lo que cambian la tipografía y los tokens.

## 12. Riesgos

- **Archivo en todo el sitio cambia cada pantalla a la vez.** Se mitiga con el PR de identidad
  solo y las capturas de la cáscara en los dos temas.
- **Las cifras de producción no serán las de la maqueta**: 36 meses en vez de 6. Las frases salen
  de reglas, así que se adaptan; lo que hay que mirar tras desplegar es que los nombres de los
  sectores quepan.
- **Una lectura vacía al desplegar**: `sector_dashboard` no tendrá su ventana hasta la semanal
  siguiente. **Mientras tanto, la lectura se oculta**: una cifra sin periodo es justo lo que §3.3
  quiere evitar. El backend devuelve el sector sin ventana como «sin dato».
