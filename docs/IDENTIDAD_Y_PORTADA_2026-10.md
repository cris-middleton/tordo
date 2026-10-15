# Identidad visual y portada con datos — octubre 2026

> **Estado: revisada por el dueño y corregida tras verificarla contra el código (2026-10-15).**
> Cuando se mergee, sustituye a dos partes de [`REDISENO_PUBLICO_2026-10.md`](REDISENO_PUBLICO_2026-10.md):
> la tipografía y el color (§5) y la portada (§6.3 y §6.6). El resto de ese documento sigue
> vigente.
>
> La ronda de diseño (tono de los textos y colores) ya se hizo sobre la maqueta v6, y su resultado
> está en §5, §6 y §9. **El color del panel es la variante B, recomendada y pendiente de que el
> dueño la confirme.** Cambiar a la A cuesta poco: una clase en el panel y dos valores de token.

La referencia visual es la maqueta v6, variante B ([`assets/portada-v6.png`](assets/portada-v6.png)).
**Sus cifras son reales sólo en parte**: 4.203 y 2.849 son de producción del 2026-10-15, y el gasto
por sector sale de los datos locales de 6 meses, con el formato real del sitio. La banda de precio,
los cierres y la franja inferior son ejemplos.

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
se veía poco: en la cabecera está `TordoLogo`, un componente **cliente** con siete colores crudos y
un aleteo al pasar el ratón, que el test de la cabecera no detectaba. La tarjeta para compartir ya
lo lleva desde el PR #3.

### 1.1 Cómo se llegó a la v6

Hubo seis rondas de maquetas en el compañero visual, todas revisadas por el dueño:

| versión | qué era | veredicto |
|---|---|---|
| v1 | Tres direcciones: A «Instrumento» (tablero denso), B «Atlas» (editorial), C «Cartel» (oscuro, una cifra gigante) | A |
| A refinada | A con una frase de conclusión por gráfico | Peor: dos gráficos grandes y difíciles de leer |
| v3 | Cuatro gráficos compactos, Chile por región a la derecha | Mejor, pero el gráfico de Chile no convence |
| v4 | Los tres gráficos chicos a la derecha y Chile como franja abajo | Faltan zonas delimitadas y espacio en blanco |
| v5 | Panel propio para los gráficos, más aire, color sólo en la conclusión y sin Chile | Aprobada como base |
| **v6** | **La v5 con los textos en la voz de PixelFrame y tres juegos de color** | **Variante B recomendada** |

Se usaron dos skills de diseño: `frontend-design` (Anthropic) y `ui-ux-pro-max` (MIT, auditada
antes de instalarla). Las dos coincidieron en lo mismo: una frase de conclusión por gráfico,
etiquetas directas en vez de leyendas, texto de 13 px o más, y el color reservado a lo que
importa.

---

## 2. Decisiones

| # | Decisión | Motivo |
|---|---|---|
| D1 | **Archivo** sustituye a Newsreader y Public Sans en todo el sitio | Una sola familia variable con eje de ancho: titulares expandidos (`wdth` 112–115, peso 800) y cuerpo normal. Trae cifras tabulares. Es la tipografía de las maquetas aprobadas y la que ya usa la tarjeta para compartir |
| D2 | **IBM Plex Mono se queda, sólo para identificadores**; **Varien, para la marca**, junto al pájaro en la cabecera. El pájaro pasa a ser un componente de **servidor** con los colores del logo en tokens (`PajaroMarca`) y sustituye a `TordoLogo` | Ninguna de las dos familias estaba en la queja. `TordoLogo` era una isla cliente con hex crudos en una cabecera que debe ser de servidor; se pierde el aleteo al pasar el ratón |
| D3 | **Fondo de página blanco** en tema claro; se va el papel cálido (`#F7F4EC`) | Es la primera señal de «hecho con Claude» |
| D4 | **El panel de lecturas es una superficie oscura**: `dark bg-brand-navy`, el patrón que el sitio ya tiene para eso (los tokens se invierten solos dentro) | Variante B de la v6. Separa las dos zonas sin bordes ni sombras, que era lo que le faltaba a la v4, y usa los dos colores del logo: el navy de fondo y el turquesa del ala en la conclusión |
| D5 | **Dos tokens de dato**: `--color-dato` y `--color-dato-tenue`, con sus paradas por tema (§5) | Cada gráfico pinta en color sólo su conclusión y deja el resto apagado |
| D6 | **La portada se parte en dos columnas desde `lg`**: a la izquierda se busca, a la derecha se lee | Lo que el dueño aprobó en la v5 |
| D7 | **Tres lecturas**: gasto por sector, la banda de precio de un producto y las Compras Ágiles según cuándo cierran | Responden lo que pregunta quien vende: quién compra, a qué precio y qué cierra pronto |
| D8 | **Cada frase de conclusión sale del dato, con reglas y tests** | «Salud y municipios compran casi lo mismo» es verdad hoy y puede no serlo el domingo. Una frase escrita a mano sobre un dato vivo termina mintiendo |
| D9 | **Gráficos en HTML y CSS, dibujados en el servidor**: sin Recharts y sin JavaScript de cliente | La portada no tiene JS propio (regla vigente) y Recharts pesa ~100 KB. Tres barras no lo justifican |
| D10 | **El gráfico de Chile por región sale de la portada** | El dueño no lo vio necesario: es un dato curioso, pero no ayuda a decidir a quien vende. Puede vivir en `/mercado` (fuera de alcance) |
| D11 | **Fuera «gratis y sin cuenta»** de títulos, descripciones y lemas | Suena a SaaS: dice lo que *no* cobra, no lo que es |
| D12 | **La franja inferior muestra «publicadas hoy» en vez de «monto estimado abierto»** | Muchas licitaciones no publican el monto estimado, y una suma que deja fuera a la mitad se lee como total |
| D13 | **Los textos siguen la voz de PixelFrame** (§6.1) | La pidió el dueño. Su guía de voz nombra los cuatro vicios que hacen sonar a máquina un texto, y el sitio tenía varios |
| D14 | **Los tres checks pasan a ser una ficha** (Fuente, Se actualiza, Se usa) | Una lista de ✓ es el patrón de una página de precios de SaaS. Una ficha con datos concretos es lo que hace PixelFrame en su portada (piezas, formato, armado) |

---

## 3. La portada

### 3.1 Estructura (≥ 1024 px)

```
┌ cabecera (cáscara única): pájaro + TORDO · navegación · «Datos abiertos, código abierto» ┐
├──────────────────────────────────────┬──────────────────────────────────────────────────┤
│ ¿Qué le vendes al Estado?   (h1)     │ ┌ panel (dark bg-brand-navy, radio 14 px) ─────┐ │
│ Escribe lo que vendes. Te mostramos… │ │ Lectura 1: gasto por sector                  │ │
│ [ Un producto o un servicio  Buscar ]│ │ ──────────────────────────────────────────── │ │
│ Por ejemplo: …                       │ │ Lectura 2: banda de precio de un producto    │ │
│ 4.203 licitaciones │ 2.849 C. Ágiles │ │ ──────────────────────────────────────────── │ │
│ Fuente · Se actualiza · Se usa       │ │ Lectura 3: Compras Ágiles según su cierre    │ │
│                                      │ └──────────────────────────────────────────────┘ │
├──────────────────────────────────────┴──────────────────────────────────────────────────┤
│ Publicadas hoy: N │ Más publica hoy: organismo │ Actualizado el día, HH:MM                 │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Lo mejor de hoy (BloqueHoy, como hoy) · Úsalo como quieras · Cómo se sostiene            │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

- Contenedor `max-w-6xl` (hoy `Portada.tsx` usa `max-w-4xl`), con 56 px entre columnas y 48 px de
  margen vertical en el hero.
- **Por debajo de `lg`, una columna**: buscador, cifras y ficha, y después el panel con las
  lecturas apiladas. La franja inferior pasa a tres líneas. A 320 px nada se sale del ancho.
- El `h1` sigue siendo la etiqueta del campo (`BuscadorPortada`), y el campo sigue siendo un
  `<form method="get" action="/buscar">` que funciona sin JavaScript.
- **El *placeholder* del campo deja de repetir los ejemplos**: dice «Un producto o un servicio». Los
  ejemplos ya están debajo (`EJEMPLOS_BUSQUEDA`); repetirlos dentro del campo es el defecto que
  la guía de PixelFrame llama «repetir la ficha de al lado».
- **La ficha** (D14) es un `<dl>` de tres filas:
  - *Fuente*: «ChileCompra».
  - *Se actualiza*: «{n} veces cada día hábil», con `n = HORAS_HABILES.length` de
    `lib/compraAgil.ts` (hoy 4). Sale de la constante, no se escribe: si el cron cambia de
    horario, la frase cambia con él.
  - *Se usa*: «Aquí, por API, por MCP o en CSV. Sin registro». «API» enlaza a `/abierto`, «MCP» a
    `/abierto#mcp` y «CSV» a `/abierto#datos` (las anclas ya existen).
- **La línea del lema (`lemaPortada`) sale de la portada**: lo que decía queda en la ficha y en la
  píldora de la cabecera. La píldora dice «Datos abiertos, código abierto» con `REPOSITORIO_URL`
  y sólo «Datos abiertos» sin ella, como el lema de hoy.

### 3.2 Una lectura

Una lectura tiene siempre cuatro partes:

1. **Conclusión** (`h3`): una frase generada por una función pura de `lib/lecturasPortada.ts`.
2. **Pie**: la base y el periodo («Precio por caja, 184 compras, oct 2025 – oct 2026 (12 meses)»)
   y, a la derecha, un enlace a la página donde se profundiza. El periodo sale siempre de
   `textoPeriodo` (`lib/periodo.ts`), el de las páginas públicas: la ventana termina donde terminan
   los datos, no hoy, así que «últimos 12 meses» (lo que dice la maqueta) podría mentir.
3. **Gráfico**: barras en `div` con su valor escrito al lado. Las barras van con `aria-hidden` y
   los valores, como texto. Un lector de pantalla lee la conclusión y la lista de valores, sin
   descripciones de colores.
4. **Color**: `dato` sólo en lo que la conclusión nombra; el resto, `dato-tenue`. Dentro del
   panel oscuro los dos toman su parada de tema oscuro (§5).

**Si una lectura no tiene dato, se oculta entera** (principio 4 del rediseño). Si faltan las
tres, se oculta el panel y la portada queda con el buscador, las cifras y la ficha. Ninguna
lectura lanza una excepción, tampoco con un 200 mal formado: se valida cada campo que se pinta,
con el mismo criterio que `pedirDestacadas`.

**Cómo se piden.** La portada ya tiene `pedirParaLaPortada` (`lib/publicoServidor.ts`), que nunca
lanza, con caché de media hora y la etiqueta `compra-agil`. Las lecturas 1 y 2 leen analytics,
que cambia una vez por semana: se piden con la misma garantía de no lanzar pero con la caché y la
etiqueta de analytics (`SEGUNDOS_CACHE_ANALYTICS`, `ETIQUETA_ANALYTICS`). Se generaliza
`pedirParaLaPortada` para recibir caché y etiqueta, en vez de escribir una segunda función. Las
tres peticiones salen en paralelo con las dos que ya hace la portada.

### 3.3 Lectura 1: quién compra

- **Dato**: `GET /api/v1/bi/sector` (**ya existe**, `services/bi/mercado.get_sector`; su esquema `SectorItem` gana
  `ventana_desde` y `ventana_hasta`, o FastAPI las descartaría): los
  sectores de `analytics.sector_dashboard` ordenados por `monto_total`. Hay 7: Salud,
  Municipalidades, «Gob. Central, Universidades», Obras Públicas, FFAA, Otros y «Legislativo y
  judicial». No hace falta un endpoint nuevo.
- **Se pintan los cuatro primeros sin «Otros» ni «NA»** (el sector sin clasificar, que aparece en el
  fixture del golden): una barra así no le dice nada a quien vende. Si cae entre los cuatro
  primeros, se salta y entra el siguiente. Las dos sí cuentan en la suma de los $100.
- **Periodo**: `sector_dashboard` **no publica su ventana**, y en producción la ventana son 36 meses,
  no los 6 de la maqueta. Se le añaden `ventana_desde` y `ventana_hasta` con `con_ventana()` de
  `data_loader`, como ya hacen las bandas de precio y `competitors_by_market`, y `get_sector` las
  devuelve (su lista de columnas ya filtra por las que existan, así que el golden no cambia: el
  fixture no las tiene). **Sin ventana, la lectura se oculta**: una cifra sin periodo se lee como
  «de siempre». El pie dice «Órdenes de compra, {periodo}».
- **Regla de la frase**:
  - Si el segundo está a menos del 5 % del primero (`(A − B) / A < 0,05`): «{A} y {B} compran casi
    lo mismo». Se pintan los dos.
  - Si no: «{A} gasta ${P} de cada $100 del Estado», con `P` = el monto de A sobre la suma de **los
    siete** sectores, redondeado a entero. Se pinta uno. La frase no repite el monto que la barra
    ya escribe al lado: dice algo que las barras no dicen.
  - Con los datos locales sale «Salud y municipios compran casi lo mismo» (Salud 2,98 billones,
    Municipalidades 2,95: un 1,1 % de diferencia).
- **Nombres**: un mapa corto en `lib/lecturasPortada.ts` da a cada sector un nombre para la barra
  y otro para la frase (Municipalidades → «Municipalidades» en la barra y «municipios» en la
  frase; «Gob. Central, Universidades» → «Gob. central»). Un sector que no esté en el mapa sale
  con su nombre tal cual en los dos sitios.
- **Montos**: con `plata()` de `lib/publico.ts`, la que ya usan las páginas públicas: «$3 billones»,
  «$2,9 billones». La maqueta v5 abreviaba «bill.»; se usa la palabra entera, como en el resto del
  sitio.
- **Enlace**: «Ver mercados» → `/mercado`.
- **Fallo**: con `FEATURE_ANALYTICS` apagada `/bi/sector` responde 503, y con la tabla ausente
  `disponible: false`. En los dos casos la lectura se oculta.

### 3.4 Lectura 2: a qué precio

- **Dato**: la ficha pública de un producto fijo, `PRODUCTO_PORTADA` en `lib/lecturasPortada.ts`
  (el slug de «guantes de nitrilo», el primer ejemplo del buscador; el slug exacto se toma de
  producción con una sola petición antes de escribirlo). Se usa la unidad con más compras
  (`unidades[0]`: la API ya las ordena de más a menos `n`).
- **Gráfico**: un riel tenue de p10 a p90, la banda de p25 a p75 en `dato` y la mediana marcada con
  su rótulo. **No se muestran el mínimo ni el máximo**: son los valores que el Tukey de las bandas
  ya trata como atípicos.
- **Frase**: «{Producto}: la mitad se pagó entre {p25} y {p75}». Es cierta por definición del
  rango intercuartílico.
- **Pie**: «Precio por {unidad}, {n} compras, {periodo}».
- **Periodo**: `GET /publico/productos/{slug}` **hoy no lo devuelve** (`ProductoPublico` no tiene
  `periodo`), aunque las bandas sí guardan su ventana (12 meses). Se añade
  `periodo: PeriodoPublico | None` a `ProductoPublico`, leído de la ventana de la banda. Es un
  campo opcional: un cliente viejo lo ignora.
- **Enlace**: «Ver el producto» → `rutaProducto(slug)`.
- **Fallo**: si la ficha da 404, no es indexable, no trae p25 y p75 o no trae periodo, la lectura se
  oculta.
- **Verificación**: `scripts/verificar-produccion.sh` comprueba que el slug existe y es indexable
  en producción, con una petición espaciada, como ya hace con los ejemplos del buscador.
  `__tests__/portada-ayudantes.test.ts` compara la copia literal del slug.

### 3.5 Lectura 3: qué cierra pronto

- **Dato**: las Compras Ágiles abiertas repartidas por día de cierre **en hora de Chile**: hoy,
  mañana, en 2 o 3 días y después. Usa la misma definición de «abierta» (`esta_abierta()` sobre
  `activo`), así que **los cuatro números suman `compra_agil_abiertas`**, y un test lo exige.
- **Backend**: `contar_abiertas` ya filtra por `activo` y `esta_abierta()` en una sola pasada con
  `count(*) FILTER`. Se le añaden cuatro `FILTER` más sobre `fecha_cierre`, con los límites de día
  calculados en Python desde `hoy_chile()`. Es la misma consulta, no una nueva. Una Compra Ágil sin
  `fecha_cierre` (abierta por no tener cierre) cuenta en «después».
- **Frase**, con `r` = (hoy + mañana) / abiertas y `N` = `r × 10` redondeado:
  - `r = 0`: «Ninguna Compra Ágil abierta cierra hoy ni mañana». No se pinta ninguna barra.
  - `N = 0` con `r > 0`: «Menos de 1 de cada 10 Compras Ágiles abiertas cierra hoy o mañana».
  - `N = 10` con `r < 1`: «Casi todas las Compras Ágiles abiertas cierran hoy o mañana».
  - `r = 1`: «Todas las Compras Ágiles abiertas cierran hoy o mañana».
  - Si no: «{N} de cada 10 Compras Ágiles abiertas cierran hoy o mañana».
  - En todos los casos con `r > 0` se pintan «hoy» y «mañana». Con 0 abiertas, la lectura se oculta.
- **Pie**: «{abiertas} abiertas, por día de cierre».
- **Enlace**: «Ver las que cierran primero» → el catálogo con Compra Ágil abierta ordenado por cierre
  ascendente. Sale de `urlCatalogoAbiertas`, que gana un parámetro de orden opcional: todo «ver
  todos» sale de un ayudante. (La maqueta v5 enlazaba a «Lo mejor de hoy», que no ordena por
  cierre y además descarta lo que cierra en menos de 2 horas.)

### 3.6 Franja inferior

- **«Publicadas hoy»**: licitaciones y Compras Ágiles activas con `fecha_publicacion` dentro del día
  de Chile. **No cabe en la pasada de `contar_abiertas`**, que filtra por abiertas, y una publicada
  hoy puede haber cerrado ya. Va en una consulta nueva (abajo). **Sin enlace**: el catálogo no
  tiene filtro por fecha de publicación (`api/tenders.py`).
- **«Más publica hoy»**: el organismo con más publicaciones del día. **Se agrupa por
  `nombre_organismo` normalizado, no por código**: las Compras Ágiles no traen
  `codigo_organismo` (sólo nombre y RUT; ver `etl/transformers/compra_agil_transformer.py`), así
  que agrupar por código las juntaría todas en un nulo. Límite conocido: si una licitación y una
  Compra Ágil escriben el mismo organismo de dos formas, cuentan como dos. El error es quedarse
  corto con el primero, nunca inventar uno. Las filas sin nombre cuentan en el total y no compiten
  por el primer puesto.
- **Una sola consulta para las dos**: `GROUP BY` el nombre normalizado sobre el rango del día por
  el índice de `fecha_publicacion`, con `sum(count(*)) OVER ()` para el total, ordenada por
  «nombre nulo al final» y conteo descendente, `LIMIT 1`. El nombre largo se corta con elipsis y el
  `title` lleva el nombre entero. El frontend lo pasa por `normalizeText`, como al comprador de
  «Lo mejor de hoy»: el backend lo manda tal como se guardó.
- **Con 0 publicadas hoy**, las dos celdas se ocultan (pasa cada madrugada: la primera corrida del
  día es a las 10:00).
- **«Actualizado el …»**: el `actualizado_en` que ya existe, escrito con `actualizadoEnPalabras`
  («Actualizado el mié, 14 oct, 13:17»). Lleva el día a propósito: la portada se cachea, y «a las
  13:17» a secas no diría si es de hoy o de ayer. La maqueta lo abreviaba.

### 3.7 Lo que queda debajo, sin cambios de fondo

«Lo mejor de hoy» (`BloqueHoy`), «Úsalo como quieras» (`UsosAbiertos`) y «Cómo se sostiene»
(`CierrePortada`) siguen ahí, con la tipografía y los tokens nuevos y los textos de §6.2.

---

## 4. Tipografía (sustituye a §5.1 del rediseño)

| Familia | Uso | Carga |
|---|---|---|
| **Archivo** | Todo: titulares (`h1`–`h2` a `wdth` 112–115 y peso 800; `h3` a 100 y 700), cuerpo, interfaz y **todas las cifras** (`tnum`) | variable, `wght` 400–800 y `wdth` 62–125, por `next/font/google` (autoalojada, sin petición a un tercero) |
| **IBM Plex Mono** | Sólo identificadores, sin cambio | estática, 400 y 500 |
| **Varien** | Sólo la marca, junto al pájaro | sin cambio |

- Se van Newsreader y Public Sans. `font-display` pasa a significar «Archivo expandido» y la regla
  de que **nunca va junto a `cifra`** se mantiene.
- `__tests__/tipografia.test.ts` y `e2e/tipografia.spec.ts` se reescriben con las familias nuevas.
- Los ejes de Recharts (`/mercado`) heredan Archivo sin cambios.

## 5. Color (sustituye a §5.2 del rediseño)

- **Fondo claro blanco** (`--color-background` = `#FFFFFF`). Las tarjetas siguen en
  `--color-surface`, que también es blanco, así que pasan a definirse por su borde
  (`--color-border`), que ya llevan.
- **Tokens nuevos**, mapeados en Tailwind como `dato` y `dato-tenue`:

  | token | tema claro | tema oscuro (y dentro del panel) |
  |---|---|---|
  | `--color-dato` | `#2848AD` (`40 72 173`), el azul del cuerpo del pájaro, el mismo de `brand-blue` | `#3DB9BB`, el turquesa del ala |
  | `--color-dato-tenue` | `#C9D3E8` | `#34508F` |
  | `--color-on-dato` | `#FFFFFF` | `#102858` |

- **El panel** (D4) es `dark bg-brand-navy`. `brand-navy` es invariante de tema (`#102858`), así que
  el panel se ve igual en los dos temas y, dentro, todo toma la parada oscura: conclusión en
  turquesa, barras apagadas en `#34508F`, texto claro y enlaces en `accent` (`#3DB9BB` en oscuro).
  Los divisores entre lecturas van en `dato-tenue`: el `--color-border` oscuro (`#1E2736`) no se ve
  sobre navy.
- **El botón de buscar** deja `btn-accent` (turquesa, «acción») y pasa a `bg-dato text-onDato`,
  como en la maqueta, por la regla de «nunca `text-white` sobre un token».
- **`contraste-wcag.test.ts`** gana los pares nuevos: `on-dato` sobre `dato` (4,5:1), `dato` sobre
  `brand-navy` (3:1, elemento gráfico) y las tintas oscuras de texto (`text`, `muted`, `accent`)
  **sobre `brand-navy`**, porque esa es la superficie real del panel. `dato-tenue` se declara
  decorativo (`SIN_PAR`): nunca lleva texto encima y el valor va siempre escrito al lado.
- **CLAUDE.md** dice hoy que no queda ninguna superficie oscura en el sitio; el PR de la portada lo
  corrige.

### 5.1 Las otras dos variantes (por si el dueño elige otra)

- **A · Azul del logo** (la v5): panel en `--color-surface-elevated` (`#F1F4F9`) sin clase `dark`;
  `dato` y `dato-tenue` en sus paradas claras. Más sobria; la separación de zonas depende del gris.
- **C · Turquesa en el dato**: descartada. El turquesa ya significa «acción» en el sitio (botones,
  enlaces), y usarlo en el dato mezcla los dos sentidos.

---

## 6. Textos

### 6.1 La voz (D13)

Sale de la guía de voz de PixelFrame (su `CLAUDE.md`, «The site's voice», y su brief de marca).
Se escribe en `CLAUDE.md` de TORDO en el PR de textos, para que valga también para lo que se
escriba después:

- **Chileno, en segunda persona y concreto.** Cifras, plazos y objetos con nombre antes que
  adjetivos.
- **Frases cortas y afirmativas.** Sin signos de exclamación y sin emojis.
- **Suena a quien confía en lo que hace, no a una tienda que necesita vender.**
- **Los cuatro vicios**, que se revisan antes de dar un texto por bueno:
  1. *La antítesis*: definir algo diciendo primero lo que no es («no es X, es Y»).
  2. *El par vacío*: dos o tres negaciones seguidas para decir una cosa («sin cuentas, sin planes
     y sin publicidad»).
  3. *El cierre que resume*: una última frase que repite lo que el párrafo ya dijo.
  4. *La frase que hay que releer*: dice en una cláusula lo que cabe en cuatro palabras.
- **No repetir la ficha de al lado**: un texto no dice lo que ya está escrito a doscientos píxeles.
- **No describir lo que el sitio no hace**: no se promete un aviso, una alerta o un dato que no
  existe.

El motivo para tratarlo como regla y no como gusto, según la misma guía: una frase difícil de leer
se juzga **menos verdadera**, no sólo menos agradable (fluidez de procesamiento, Reber y Schwarz,
1999).

### 6.2 Los textos que cambian

| Dónde | Antes | Después |
|---|---|---|
| Subtítulo de la portada | (hoy no hay; el de la maqueta v5 era «Cuánto ha pagado, qué está abierto hoy y quién lo compra. Con los datos de ChileCompra.») | Escribe lo que vendes. Te mostramos cuánto ha pagado el Estado, quién lo compra y qué está abierto hoy. |
| *Placeholder* del buscador (`BuscadorPortada.tsx`) | Ej.: resma de papel carta, guantes de nitrilo, tóner | Un producto o un servicio |
| Checks (sólo existían en las maquetas) | ✓ Sin registro · ✓ API y MCP abiertos · ✓ Descarga en CSV | La ficha de §3.1 |
| Lema bajo el buscador (`lemaPortada`) | Gratis (de verdad). Sin cuentas, sin publicidad. Código y API abiertos. | Sale de la portada |
| Título de la portada (`app/page.tsx`) | {APP_NAME} — Compras públicas de Chile, gratis y sin cuenta | {APP_NAME} — Qué compra el Estado de Chile y a qué precio |
| Descripción de la portada | … Con datos de ChileCompra, gratis y sin registrarte. | Busca lo que vendes y mira cuánto ha pagado el Estado, quién lo compra y qué está abierto hoy. Con los datos públicos de ChileCompra. |
| Descripción del sitio (`app/layout.tsx`) | … Compra Ágil. Gratis y sin cuenta | … Compra Ágil. Con los datos públicos de ChileCompra. |
| «Úsalo como quieras» (`UsosAbiertos`) | Sin clave y sin cuenta: desde otro programa, desde un asistente de IA o en una planilla. | Desde otro programa, desde un asistente de IA o en una planilla. |
| `/apoyar`, subtítulo | Sin cuentas, sin planes y sin publicidad. Lo sostienen los aportes de quienes lo usan. | Lo sostienen los aportes de quienes lo usan. |
| `/apoyar`, descripción | {APP_NAME} es gratis, sin cuentas y sin publicidad. Se mantiene con aportes voluntarios. | {APP_NAME} se mantiene con aportes voluntarios. Aquí está lo que cuesta, concepto por concepto. |
| `/abierto`, subtítulo | Todo lo que muestra {APP_NAME} se puede leer sin cuenta y sin clave: … | Todo lo que muestra {APP_NAME} se puede leer desde otro programa, desde un asistente de IA o en una planilla. |
| `/licitaciones` y `/mercado`, descripciones | … Sin cuenta. / … Con datos de ChileCompra, sin cuenta. | Se quita la coletilla. |
| `/acerca`, qué es | Es gratis y sin cuentas: no hay registro, ni planes, ni publicidad, y lo que guardas se queda en tu navegador. | Es gratis y no pide registro: lo que guardas se queda en tu navegador. |

Las tres frases de conclusión, sus pies y sus enlaces son los de §3.3–3.5.

**Lo que se queda, a propósito:**

- **«{APP_NAME} es gratis. Mantenerlo, casi.»** (`CierrePortada` y el título de `/apoyar`). Es la
  frase con más voz del sitio y habla de cómo se financia, que es un hecho, no un lema.
- **Lo descriptivo**: «Se guardan en este navegador, sin cuenta» (`/guardados`), la pregunta
  frecuente «¿Cómo me entero de lo nuevo sin cuenta?» y la respuesta «sin registrarte» de
  `lib/acerca.ts`. Responden una duda concreta donde se tiene.
- Los comentarios de código (`lib/rss.ts`, `app/privacidad/page.tsx`) no se tocan: no los ve nadie.

**Fuera de alcance**: reescribir el resto del sitio en la voz nueva. La regla queda en
`CLAUDE.md` y se aplica a lo que se escriba o se toque desde ahora.

## 7. Backend: resumen de cambios

| Cambio | Dónde | Coste |
|---|---|---|
| `compra_agil_por_cierre: {hoy, manana, dos_tres_dias, despues}` | `repositories/licitaciones.contar_abiertas` → `GET /publico/portada` | 0 consultas nuevas: cuatro `FILTER` más en la misma pasada |
| `publicadas_hoy` y `mas_publica_hoy` | consulta nueva en `repositories/licitaciones.py` → `GET /publico/portada` | una agregación sobre las publicadas de un día, por el índice de `fecha_publicacion` |
| `ventana_desde` y `ventana_hasta` en `sector_dashboard` | `etl/analytics/sector_intelligence.py`, y las devuelve `get_sector` | dos columnas; se llenan en la semanal siguiente |
| `periodo` en `ProductoPublico` | `schemas/publico.py` y `services/publico/paginas.producto` | se lee de la ventana de la banda, que ya existe |

Ningún endpoint nuevo. Todos los campos nuevos son **opcionales** en el esquema: un frontend nuevo
contra un backend viejo oculta la lectura en vez de romper. `docs/API_PUBLICA.md` se actualiza en
el mismo PR. **Ninguna lectura de la portada trae una tabla entera de analytics salvo
`sector_dashboard`** (7 filas, ya en la lista de lecturas enteras permitidas de
`test_bi_mercado_acotado.py`): la API de producción ya cayó por OOM.

## 8. Tests que cambian o se añaden

- **`lib/lecturasPortada.ts`**: cada regla con sus bordes: el 5 % justo (no es empate), «Otros»
  entre los cuatro primeros, un solo sector, el reparto de $100 con decimales, los cinco casos de
  la frase de cierre (`r = 0`, `N = 0`, `N = 10` con `r < 1`, `r = 1`, normal), 0 abiertas y
  nombres fuera del mapa.
- **Backend**:
  - los cuatro tramos suman `compra_agil_abiertas`;
  - los bordes del día de Chile: una Compra Ágil que cierra a las 23:30 de Santiago es «hoy»
    aunque en UTC ya sea mañana, y una publicada a las 23:30 de Santiago cuenta en «publicadas
    hoy» (con un instante fijo, como `test_reloj_chile.py`);
  - «más publica hoy» sin publicaciones, con un empate y con nombres nulos;
  - `sector_dashboard` escribe su ventana (en el estilo de `etl/tests/test_ventana_analytics.py`);
  - `get_sector` devuelve la ventana cuando la tabla la tiene, y el golden pasa sin recapturar;
  - `ProductoPublico.periodo` sale de la ventana de la banda.
- **`portada.test.tsx`**: con cada lectura faltante o mal formada se oculta sólo esa; sin las tres,
  sin panel; con 0 publicadas hoy, sin las dos celdas; y el buscador siempre.
- **`tipografia`**, **`contraste-wcag`** y **`on-color`**: las familias y los tokens nuevos.
- **`r10-sin-inteligencia`**, sin cambio. Un test nuevo falla si «gratis y sin cuenta» (o «sin
  registrarte») vuelve a un `title`, una `description` o a la portada, y si un texto de la portada
  (`lib/portada.ts`, `lib/lecturasPortada.ts`) lleva un signo de exclamación.
- **E2E**: `e2e/portada.spec.ts` mide la portada a 320, 390, 1024 y 1440 px sin desborde
  horizontal, con captura en claro y en oscuro.

## 9. Ronda de diseño (hecha, 2026-10-15)

- **Tono**: el dueño dio como referencia PixelFrame (`pixelframe.cl`, otro proyecto suyo). Su guía
  de voz está en su repositorio: los cuatro vicios, las dos reglas mecánicas y los ejemplos de
  copy calibrado. El resultado es §6.
- **Color**: tres juegos sobre la misma maqueta (v6): A, el azul del logo; B, el panel noche; y C,
  el turquesa en el dato. **Se recomienda la B** (D4, §5) y el dueño la confirma al revisar el
  plan.

## 10. Orden de los PR

1. **Backend**: los campos de `/publico/portada`, la ventana de `sector_dashboard` y el periodo del
   producto. No cambia nada visible.
2. **Identidad**: Archivo, fondo blanco, tokens de dato y el pájaro en la cabecera. Cambia todo el
   sitio, así que va solo y con las capturas E2E revisadas.
3. **Portada**: dos columnas, el panel oscuro con las tres lecturas, la ficha y la franja.
4. **Textos**: §6, la voz en `CLAUDE.md` y su test.

La tarjeta para compartir ya está publicada (PR #3, «Datos públicos de ChileCompra»).

## 11. Fuera de alcance

- El gráfico de Chile por región (D10). Si vuelve, va a `/mercado`.
- Las cotizaciones de Compra Ágil: la compuerta G1 sigue cerrada (`MOSTRAR_COTIZACIONES = false`).
- Un filtro por fecha de publicación en el catálogo (hoy no existe).
- Rediseñar las demás páginas más allá de lo que cambian la tipografía y los tokens.
- Reescribir en la voz nueva los textos que §6.2 no lista.

## 12. Riesgos

- **Archivo en todo el sitio cambia cada pantalla a la vez.** Se mitiga con el PR de identidad
  solo y las capturas de la cáscara en los dos temas.
- **Las cifras de producción no serán las de la maqueta**: 36 meses en vez de 6. Las frases salen
  de reglas, así que se adaptan; lo que hay que mirar tras desplegar es que los nombres de los
  sectores quepan.
- **La lectura de sectores vacía al desplegar**: `sector_dashboard` no tendrá su ventana hasta la
  semanal siguiente (domingo). Mientras tanto la lectura se oculta, que es lo que pide §3.3.
- **«Más publica hoy» por nombre**: un organismo escrito de dos formas cuenta como dos (§3.6). Si
  el primer puesto sale mal en producción, la celda se quita; no se arregla adivinando nombres.
- **El panel oscuro en tema oscuro**: navy sobre el fondo casi negro se separa menos que en claro.
  Se revisa con la captura en oscuro del E2E antes de mergear.
