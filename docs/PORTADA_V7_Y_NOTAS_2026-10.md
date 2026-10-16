# Portada v7, escala de espacios y notas de datos — octubre 2026

> **Estado:** decidida y construida el 2026-10-16 (PR #16 escala y cáscara, #17–#18 notas, #19 portada). **Sustituye** a §3.1 (estructura), §3.3 (lectura de
> sectores) y a la parte de §5 que describe el panel oscuro de `IDENTIDAD_Y_PORTADA_2026-10.md`.
> El resto de ese documento (Archivo, tokens de dato, el pájaro, la voz) sigue en vigor.
> Maqueta: `docs/assets/portada-v7.png` (escritorio) y `docs/assets/portada-v7-390.png` (móvil).
> Las cifras de la maqueta son de producción del 16-10; los puntos por comprador y el nombre del
> autor son ilustrativos.

## 1. Por qué

Una pasada de auditoría sobre producción (2026-10-16, ocho informes, ~30 cargas espaciadas)
encontró tres familias de problemas. El dueño añadió una cuarta.

1. **Datos mal publicados.** El precio unitario se dividía dos veces (arreglado en el PR #10).
   Los sectores estaban inflados por órdenes en UF mal convertidas. El 56 % de las bandas
   indexables venía de un solo comprador. Y «Lo mejor de hoy» premiaba a quien declaraba el tope
   de Compra Ágil. Cada uno tiene su PR aparte; esta spec sólo toma lo que cambia en pantalla.
2. **El panel oscuro no funciona.** Mide 524×391 px y sólo el 8–13 % es tinta de dato. Las barras
   secundarias quedan a 1,8:1 sobre el navy. El dueño: «los gráficos con un fondo muy fuerte,
   ocupan un espacio muy corto». En móvil empieza en y = 765 de 844: ningún gráfico en la primera
   pantalla. Y la lectura de cierres se contradice: «6 de cada 10 cierran hoy o mañana» con la
   barra de «Mañana» más baja que la de «En 2 o 3 días».
3. **El espaciado no tiene regla.** La portada usa 11 valores de espacio y 6 separaciones entre
   secciones (20–48 px). A 1440 px el contenido arranca en cuatro bordes izquierdos (168, 176, 192
   y 232 px), y el `h1` empieza a 16, 32 o ~90 px de la cabecera según la página.
4. **«No parece la página de un data scientist».** El sitio no tiene autor: firma «Tordo». El
   pipeline, el enmascarado, el harness y los dos errores encontrados esta semana viven sólo en
   el repo. Los doce referentes revisados (Our World in Data, Brasil.IO, The Pudding, Datasette,
   OpenSanctions, Ember, Simon Willison…) se leen como trabajo serio de datos por **procedencia
   visible**, no por estética: quién lo hizo, de qué base sale cada número, cómo se calcula,
   dónde se baja y qué errores se corrigieron, con fecha. TORDO ya hace casi todo eso; falta
   enseñarlo.

## 2. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| V1 | **Fuera el panel navy.** Las lecturas van sobre blanco, en una banda a lo ancho bajo el buscador, con un filete navy de 2 px bajo su título. El navy queda en la marca, el filete y la tarjeta de vista previa. | El dueño pidió menos fondo y más espacio para los gráficos. A 1440 la banda da ~350 px de ancho por gráfico contra ~470 del panel entero hoy. |
| V2 | **Tres lecturas: precio, cierres y la última nota de datos.** La de sectores sale de la portada. | La de sectores está oculta en producción (la tabla no publica su ventana) y su cifra estaba inflada. La nota es la pieza que más dice «aquí hay alguien revisando el dato», y no depende de la API. |
| V3 | **Cada gráfico lleva un pie de método** (`PieDeMetodo`): base, periodo y tres enlaces («Cómo se calcula», «Ver en la API», «Código»). | Es lo que comparten los referentes. Hoy sólo hay una línea de periodo. |
| V4 | **Notas de datos** en `/notas`: hallazgos medidos con su método y su arreglo, en MDX, con RSS y en la navegación. | Convierten el sitio en portafolio sin decirlo. Las primeras ya están medidas en el repo. |
| V5 | **Firma con nombre y oficio**, desde variables de servidor nuevas `AUTOR_NOMBRE` y `AUTOR_URL`. Sin la variable no se pinta nada. | La autoría no es lo mismo que el responsable legal: así se puede firmar sin tocar los términos. Ningún dato personal en el repo. |
| V6 | **Escala del dato en la ficha**: «5,48 millones de órdenes de compra, nov 2023 a oct 2026», calculada desde `GET /bi/sector` (suma de `n_oc` y su ventana), nunca escrita a mano. | Open Opportunities y OWID ponen la escala junto al buscador. Una cifra escrita a mano se queda vieja sin que nada falle. |
| V7 | **Precio con un punto por comprador** sobre la franja P25–P75, en escala logarítmica, con los compradores que ya trae la ficha (`compradores[].p50`, hasta 10). | Hace visible lo que escondía la tabla: si la banda es de 44 compradores o de uno. |
| V8 | **Cierres como una barra de diez celdas** («6 de cada 10» se cuenta a la vista), más la tabla de los cuatro tramos con su cifra. | Arregla la lectura contradictoria: el texto cuenta décimos y el gráfico también. |
| V9 | **Una escala de espacios y un contenedor único** para todo el sitio (§4). | Un solo borde izquierdo y una sola separación entre secciones. |
| V10 | **Fuera las señales de plantilla que quedan**: *eyebrows* en mayúsculas («PRECIO DE REFERENCIA», «ACERCA», «ABIERTO»), encabezados de tabla en versalitas con tracking y metadatos con punto medio («Confianza alta · N=90», «Tordo · Chile · …»). | El dueño ya las vetó; siguen en `/productos`, `/acerca`, `/abierto`, las guías y el pie. |
| V11 | **Una sola salida a API/MCP/CSV** (la cabecera y el pie) y una sola a «Apoyar» (cabecera y pie). Fuera `UsosAbiertos` y la fila «Se usa» de la ficha. | Hoy aparecen 3–4 veces cada una. |
| V12 | **Navegación**: «Compra Ágil» en lugar de «Hoy», y «Notas» al final. | «Hoy» no dice qué es. |

**Lo que se descartó, y por qué:**
- Mantener el navy con gráficos más grandes (maqueta m2 de la auditoría): sigue siendo un fondo
  fuerte, que es lo que el dueño rechazó.
- Una página `/metodo` con anclas ahora: duplicaría las guías. «Cómo se calcula» enlaza a la
  sección de la guía que ya lo explica; `/metodo` queda para cuando haya más de un enlace por guía.
- Una página `/estado` con cada corrida: exige que el cron escriba una tabla nueva. Se queda en
  «datos hasta» y el commit en el pie.
- «Sobre mí» con foto, trayectoria, logos de empleadores o *badges* de tecnologías: convierte el
  sitio en un CV y mete peticiones a terceros.
- Carrusel de lecturas en móvil: esconde dos de cada tres.

## 3. La portada

### 3.1 Estructura, escritorio (≥ 1024 px)

Dentro del contenedor (§4), de arriba abajo:

1. **Fila de entrada**, dos columnas (7/5 de 12, 48 px entre ellas):
   - Izquierda: `h1` «¿Qué le vendes al Estado?», partido **siempre** en «¿Qué le vendes / al
     Estado?». El salto lo da el ancho máximo del `h1` más `text-wrap: balance`, y el E2E lo
     comprueba a 1024 y 1440. Después el subtítulo, el buscador y los ejemplos en una fila.
   - Derecha: las dos cifras (`TiraCifras`, sin cambios de comportamiento) y debajo la ficha
     (§3.5).
2. **«Lo que dicen los datos»** (`h2`), con la frase «Cada lectura dice de dónde sale, cómo se
   calcula y dónde bajarla.» a la derecha en `muted`, y un filete de 2 px en `brand-navy` debajo.
   Tres columnas iguales separadas por un borde vertical (`border`): precio (§3.2), cierres (§3.3) y
   nota (§3.4). Si una lectura falta, las demás se reparten el ancho; si faltan las tres, la banda
   no sale.
3. **La franja de hoy** (`FranjaPortada`), como hoy.
4. **Lo mejor de hoy en Compra Ágil** (`BloqueHoy`), como hoy (con lo que traiga el PR del tope).
5. **Notas de datos**: a la izquierda (7/12) la lista de las cuatro últimas notas (fecha y título,
   con «Arreglo en curso» donde toque) y «Todas las notas»; a la derecha (5/12) la ficha del autor
   (§3.6). Sin `AUTOR_NOMBRE`, la lista ocupa el ancho.

Lo que se va: `PanelLecturas`, `UsosAbiertos`, la lectura de sectores y `CierrePortada` (su «hecho
por» pasa a la ficha y a la ficha del autor; «Cuánto cuesta» ya está en el pie).

### 3.2 Lectura de precio

- Conclusión (`h3`, la regla actual de `lecturaPrecio`, con lo que traiga el PR de compradores):
  «Impresora multifuncional: la mitad se pagó entre $151.000 y $240.000».
- Gráfico: eje horizontal logarítmico; la franja P25–P75 en `dato-tenue` con la etiqueta directa
  «la mitad central»; un punto en `dato` por comprador en su `p50` (de los que trae `compradores`,
  con la unidad de la banda pintada; los de otra unidad no se dibujan); marcas y valores de P25 y
  P75 en negrita, y dos marcas de contexto en `muted`. Los puntos se apilan en columnas si
  coinciden (sin solaparse). Sin leyenda.
- Con un solo comprador en la unidad, no hay franja que comparar: el gráfico es un punto y la
  frase cambia («Todas las compras son de {comprador}»), si es que la lectura pasa el filtro de
  compradores. Con P25 = P75, la frase dice «se pagó a $X» y la franja es una línea.
- Pie de método: «{n} compras de {k} compradores, {periodo}. Cada punto es lo que pagó un
  comprador (su mediana); la franja, la mitad central de las compras.» Enlaces: «Cómo se calcula»
  (la guía de bandas de precio), «Ver en la API» (`/api/v1/publico/productos/{slug}` en
  `ORIGEN_API_PUBLICA`), «Código» (`etl/analytics/product_price_bands.py`). «Ver el producto»
  sigue siendo el enlace de la conclusión.
- Accesibilidad: el SVG es `aria-hidden`; los valores van como texto (P25, P75 y «{k} compradores»).

### 3.3 Lectura de cierres

- Conclusión: la regla actual de `lecturaCierres` («6 de cada 10 Compras Ágiles abiertas cierran
  hoy o mañana»).
- Gráfico: una barra de **diez celdas**: tantas en `dato` como décimos de «hoy o mañana»
  (redondeo al entero más cercano, el mismo que usa la frase), el resto en `dato-tenue`; etiquetas
  «hoy o mañana» y «después» debajo. Luego una tabla de cuatro filas (Hoy, Mañana, En 2 o 3 días,
  Después) con la cifra a la derecha; las dos primeras en negrita.
- Pie de método: «{abiertas} abiertas el {día} a las {hora}, por día de cierre en hora de Chile.»
  Enlaces: «Las que cierran primero» (el de hoy), «Ver en la API» (`/api/v1/publico/portada`),
  «Código» (`backend/app/repositories/licitaciones.py`).

### 3.4 Lectura de la nota

- La nota más reciente de `/notas` (§5): «Nota de datos, {fecha}», su título como `h3`, su resumen
  (`resumen` del frontmatter, ≤ 220 caracteres) y, si el frontmatter trae `antes_despues`, un
  gráfico de dos barras con etiqueta y valor («Antes 33 %», «Después 82 %») y su rótulo.
- Pie de método: el `medido_sobre` del frontmatter. Enlaces: «Leer la nota», «El script» (si
  trae `script`) y «El cambio» (si trae `cambio`, la URL del PR).
- Es contenido estático: nunca falla. Si no hay notas, la lectura no sale.

### 3.5 La ficha

Filas, en este orden (etiqueta en `muted`, valor en `text`):

| Etiqueta | Valor | Si falta el dato |
|---|---|---|
| Base | «{N} millones de órdenes de compra, {desde} a {hasta}» (suma de `n_oc` de `GET /bi/sector`, con la ventana mínima y máxima de sus filas; redondeo a dos decimales con coma) | La fila no sale |
| Fuente | «Datos abiertos de ChileCompra» | — |
| Se actualiza | `SE_ACTUALIZA`, reescrito como «El catálogo, {n} veces cada día hábil. El análisis, cada domingo.» | — |
| Lo hace | «{AUTOR_NOMBRE}, data scientist», el nombre enlazado a `AUTOR_URL` si existe | La fila no sale |

«Se usa» sale (V11). El pedido a `GET /bi/sector` sigue como hoy (`pedirSectoresPortada`, una
semana, etiqueta `analytics`), pero ahora alimenta la fila «Base», no una lectura. Con
`FEATURE_ANALYTICS` apagada o sin ventana, la fila no sale.

### 3.6 Ficha del autor

Sólo con `AUTOR_NOMBRE`. Un recuadro con borde: «**{Nombre}** hace {APP_NAME}. Es data scientist y
escribe las notas de datos.» y «Si un número no cuadra con Mercado Público, escríbele: cada
corrección sale como nota.» Enlaces: `hola@tordo.cl` y `AUTOR_URL` (con el nombre de su dominio:
«GitHub», «LinkedIn» o el dominio, por una función con test).

### 3.7 Móvil (< 1024 px)

Una columna, en este orden: `h1`, subtítulo, buscador, ejemplos (pueden partirse en dos líneas),
las dos cifras, **las tres lecturas** (precio, cierres, nota, cada una con su pie), la ficha, la
franja, Lo mejor de hoy, Notas y la ficha del autor. La conclusión de la lectura de precio tiene
que quedar **sobre el pliegue a 390×844** (E2E). Entre 640 y 1023 px, las lecturas van en dos
columnas si caben y la tercera debajo.

### 3.8 Textos de la portada

- Subtítulo: «Antes de cotizar, mira a qué precio se compró en los últimos 12 meses, quién lo
  compra y qué puedes postular hoy.»
- Ejemplos (`EJEMPLOS_BUSQUEDA`): «lápiz pasta», «cloro», «agua mineral», «impresora», «pendón»,
  «cambio de aceite». Verificados en producción el 16-10 (ficha indexable para los seis); van a la
  copia de `scripts/verificar-produccion.sh` en el mismo PR.
- El resto de textos nuevos están en §3.2–3.6. Todos siguen la voz (CLAUDE.md).

## 4. Escala de espacios y contenedor

- **Escala**: 4, 8, 12, 16, 24, 32, 48 y 64 px (clases de Tailwind 1, 2, 3, 4, 6, 8, 12 y 16).
  Nada fuera de ella en la cáscara, la portada ni las páginas que toque este trabajo.
- **Un contenedor**: `components/cascara/Contenedor.tsx`, `mx-auto w-full max-w-6xl px-4 sm:px-6
  lg:px-8`. Toda página lo usa (la cabecera y el pie también), así que el borde izquierdo es uno
  solo. Las páginas de lectura (`(publico)`, guías, notas, legales) limitan su texto a `max-w-3xl`
  **dentro** del contenedor, alineado a la izquierda, no centrado.
- **`Seccion`** (`components/cascara/Seccion.tsx`): un `<section>` con `h2` opcional y el espacio
  entre secciones: 64 px en escritorio, 32 en móvil (`mt-8 lg:mt-16`). Las secciones de la
  portada y de las páginas tocadas lo usan.
- **Tope de página**: 48 px en escritorio, 24 en móvil, desde la cabecera hasta el `h1`, en toda
  página.
- **Tamaños**: `h1` de página 36/28 px (escritorio/móvil); el de la portada, 56/36; `h2` 22 px;
  `h3` de lectura 17 px en negrita (sin `font-display`).
- **Campos de formulario a 16 px en móvil** (Safari hace zoom por debajo): `/licitaciones`,
  `/compra-agil` y el buscador.
- Test: un E2E que mide, a 1440 y 390, el borde izquierdo del `h1` y la distancia
  cabecera–`h1` en la portada, `/licitaciones`, `/productos`, `/acerca`, `/notas` y una guía, y
  falla si difieren.

## 5. Notas de datos

- **Contenido**: `frontend/content/notas/*.mdx`, Markdown plano como las guías (mismo parser,
  `lib/markdown.ts`; sin `{` ni `<` fuera de código). Frontmatter:
  `titulo`, `fecha` (AAAA-MM-DD), `resumen` (≤ 220), `estado` (`arreglado` | `en-curso` |
  `medido`), `medido_sobre` (qué datos y cuándo), `fuentes` (como las guías: de dónde sale cada
  cifra en el repo), y opcionales `cambio` (URL de un PR del repo público), `script` (ruta en el
  repo) y `antes_despues` (`{rotulo, antes: {etiqueta, valor}, despues: {etiqueta, valor}}`, valores
  en 0–100). Un test como `explicativos-frontmatter.test.ts` lo fija, y además: `cambio` empieza
  por `https://github.com/cris-middleton/tordo/pull/`, `script` existe en el repo y el `estado`
  `arreglado` exige `cambio`.
- **Secciones fijas** del cuerpo: «En corto» (tres viñetas con cifra), «Qué vimos», «Cómo lo
  medimos», «Qué cambió», «Lo que todavía no sabemos» y, si hay script, «Reprodúcelo».
- **Páginas**: `/notas` (lista de fecha y título, sin tarjetas, de la más nueva a la más vieja) y
  `/notas/[slug]` (línea de autor si hay `AUTOR_NOMBRE`, fecha, estado, el cuerpo). Indexables,
  en el sitemap y en `PAGINAS_FIJAS`. RSS en `/rss/notas` (route handler como los otros, caché de
  CDN de 30 min).
- **Navegación**: «Notas» al final de `SECCIONES`.
- **Las primeras notas**, todas con cifras ya medidas en el repo o en los PR de datos:
  1. «Dividíamos el precio unitario dos veces» (PR #10; `arreglado`; dice que el sitio lo muestra
     desde el análisis del domingo 18 de octubre).
  2. «Unas pocas órdenes en UF inflaban lo que compran los municipios» (PR de montos;
     `en-curso` hasta mergearlo, entonces `arreglado`).
  3. «2.700 mercados de un solo proveedor salían como los más abiertos» (CLAUDE.md, HHI;
     `arreglado`).
  4. «El 12 % de los compradores aparece con más de un nombre» (CLAUDE.md, identidad;
     `arreglado`).
  5. «ChileCompra no publica cuándo paga el Estado» (CLAUDE.md, fecha de pago; `medido`).
  Ninguna nota nombra a un proveedor persona natural. Cada una dice sobre qué datos y en qué
  fecha se midió. No prometen trabajo futuro que no esté en un PR abierto.

## 6. El resto del sitio en este trabajo

- **Pie** en cuatro columnas desde `lg` (dos en móvil): «Sitio» (las secciones y Guardados),
  «Abierto» (API y MCP, Código, Licencias), «Sobre el sitio» (Acerca, Cuánto cuesta, Apoyar,
  Términos, Privacidad, Contacto) y, si hay `AUTOR_NOMBRE`, «Lo hace» con el nombre. Debajo, la
  atribución a ChileCompra en su línea, el selector de tema y «Sitio en el commit `abc1234`»
  (`VERCEL_GIT_COMMIT_SHA` en el build, enlazado al commit si hay `REPOSITORIO_URL`; sin la variable,
  no sale). Sin puntos medios: «No estamos afiliados al gobierno de Chile.» es una frase.
- **«Hecho por»** de `/acerca`: pasa a `AUTOR_NOMBRE` («Lo hace {Nombre}, data scientist, a
  título personal.»). `/terminos` y `/privacidad` siguen con `RESPONSABLE_LEGAL`.
- **Formatos**: todo número y fecha visibles con `es-CL` («29.586», «16 oct 2026»), con test que
  busque `toLocaleString()` sin locale en `app/`, `components/` y `lib/`.
- **Ficha de producto**: el gráfico de §3.2 (con los mismos componentes) encima de «Quién lo
  compra», y el pie de método.

## 7. Variables nuevas

| Variable | Servicio | Obligatoria | Formato | Qué hace |
|---|---|---|---|---|
| `AUTOR_NOMBRE` | Vercel (servidor, build) | No | Texto, ≤ 60 | La firma de la portada, `/acerca`, las notas y el pie. Sin ella, no se firma. |
| `AUTOR_URL` | Vercel (servidor, build) | No | `https://` | El enlace del nombre. |

Sin prefijo `NEXT_PUBLIC_`. Van a la tabla de `docs/DESPLIEGUE.md` y a `.env.example`.
`VERCEL_GIT_COMMIT_SHA` la pone Vercel sola.

## 8. Orden de los PR

1. Esta spec (sólo docs y las dos maquetas).
2. **Escala y cáscara**: `Contenedor`, `Seccion`, tope y tamaños (§4), el pie (§6), la limpieza de
   señales de plantilla (V10), la navegación (V12, sin «Notas»), `AUTOR_NOMBRE`/`AUTOR_URL` en
   `/acerca` y el pie, formatos `es-CL` y campos a 16 px.
3. **Notas de datos** (§5), con las notas 1, 3, 4 y 5 (la 2 entra con el PR de montos) y «Notas»
   en la navegación.
4. **Portada v7** (§3) y el gráfico de precio en la ficha de producto.

Cada uno después de los PR de datos que toquen sus ficheros (compradores por banda, tope de Compra
Ágil): el de la portada consume sus reglas.

## 9. Tests que cambian o se añaden

- `portada.test.tsx`, `portada-hoy.test.tsx`, `lecturas-portada.test.ts`: sin panel ni sectores;
  la ficha con «Base» y «Lo hace» (y sin ellas); la lectura de la nota; los diez décimos.
- `contraste-wcag.test.ts`: fuera los pares sobre `brand-navy` que ya no se pintan (se quedan los
  de la tarjeta de vista previa).
- Nuevo `notas-frontmatter.test.ts` y `notas.test.tsx` (lista, página y RSS).
- Nuevo `metodo.test.ts`: cada «Código» de un `PieDeMetodo` apunta a un fichero que existe y cada
  «Cómo se calcula» a una guía y un ancla que existen.
- `e2e/portada.spec.ts`: la banda a 1024 y 1440 (tres columnas, sin desborde), la conclusión de
  precio sobre el pliegue a 390×844, el `h1` en dos líneas.
- Nuevo `e2e/escala.spec.ts` (§4).
- `voz-textos.test.ts` cubre `content/notas/` y los componentes nuevos.

## 10. Riesgos

- **Publicar errores propios asusta.** Es lo que más confianza da en los referentes, siempre que
  cada nota cierre con lo que cambió para quien usa el sitio.
- **La cifra de escala depende de `sector_dashboard`**: hasta que el PR de montos y la semanal
  la rehagan, `n_oc` incluye canceladas. Como conteo es buena (cuadra con los 1,87 M de órdenes al
  año oficiales).
- **Exponer al autor** es decisión del dueño: por eso va por variable y sin ella no sale nada.
- **Los puntos por comprador son sólo los diez que más compran**: el pie dice «de {k}
  compradores» con el total de la banda, y el gráfico enseña hasta diez. Si el total es mayor, el
  texto lo dice («los 10 que más compran»).
