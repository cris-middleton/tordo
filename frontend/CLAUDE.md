@AGENTS.md

# CLAUDE.md — `frontend/`

> Complementa al `CLAUDE.md` de la raíz, que se carga siempre; este lo carga Claude Code al
> trabajar en `frontend/`. Vale la misma regla: **describe el código real, no el objetivo**. Si
> encuentras una diferencia, gana el código y se corrige aquí en el mismo PR.
>
> «Lo mejor de hoy» y las páginas públicas indexables cruzan backend, ETL y frontend, así que
> viven en el `CLAUDE.md` de la raíz. Los patrones de la API (límite por IP, cotas,
> redirecciones) están en `backend/CLAUDE.md`.

## Reglas de trabajo

- **No hay sesión en el navegador, y es deliberado (pivote público).** Todo el tráfico va
  por `/api/proxy`, que **sólo reenvía**: no lee ni pone cookies, no añade `Authorization`
  y no reenvía las cabeceras del navegador (le pasaría a un tercero las cookies de este
  dominio). Existe por dos motivos: la URL del backend es de servidor, y las redirecciones
  internas de FastAPI se siguen ahí y no en el navegador. `__tests__/proxy-sin-sesion.test.ts`
  lo fija.
  - **Sólo reenvía `GET` bajo `/api/v1/`** (el prefijo sale de `lib/versionApi.ts`), que es
    todo lo que pide el navegador. Lo demás da 404 sin llamar al backend, y cualquier otro
    método, 405 (Next arma `HEAD` con el mismo manejador). Reenviaba cualquier ruta y
    método: `/api/proxy/docs` servía el Swagger en el origen del sitio, y `/mcp` o un `POST`
    llegaban por ahí. Un segmento con `..`, barra, `?`, `#` o `%` también es 404, y una
    redirección del backend fuera de `/api/v1/` no se sigue. `__tests__/proxy-solo-api.test.ts`.
  - **La URL del backend es `API_URL`, de SERVIDOR.** Cualquier variable `NEXT_PUBLIC_*` se
    inlinea en el bundle.
  - **El proxy le dice al backend quién es el visitante** (`lib/backendServidor.ts`):
    `X-Tordo-Visitante` con la IP que da la plataforma y `X-Tordo-Proxy` con `PROXY_SECRETO`.
    Sin eso el límite por IP del backend contaba a todo el sitio como UN cliente. **Una
    cabecera propia y no `X-Forwarded-For`**: el borde de Railway la reescribe, y lo que
    mandara el proxy no llegaría. Sin IP manda `desconocido`, no nada — sin visitante, el
    backend lo tomaría por un renderizado del servidor y lo eximiría.
    `__tests__/proxy-ip-visitante.test.ts` lo fija.
  - **`PROXY_SECRETO` es de SERVIDOR y no puede llegar al navegador.** CI construye con un
    centinela y `npm run check:secreto` lo busca en `.next/static` y en las páginas
    prerenderizadas (comprobado que salta si se filtra por el `env` de `next.config`). El
    módulo que lo lee no se importa desde un componente cliente.
  - El proxy devuelve `Content-Disposition` y las cabeceras del límite: sin la primera cada CSV se descargaba con el nombre
    genérico.
- **No hay planes, candados ni 402 en el frontend.** Todo lo que el producto calcula se ve
  entero, sin cuenta. Si un día vuelve algo de pago, el límite vive en el backend y llega por
  la API: una copia en TypeScript se desincroniza sin que nada falle.
- **Un 401, 402 o 403 no manda al visitante a ninguna parte** (`__tests__/errores-de-api.test.ts`):
  no hay login al que redirigir. El 429 dice «espera un momento».
- **Ninguna consulta espera para siempre**: axios corta a los 15 s y TanStack reintenta una
  sola vez, sólo 5xx o red, nunca un timeout (`lib/reintentos.ts`). Una sección que falla
  pinta `ErrorDeCarga` con «Reintentar». Antes eran tres intentos sin tope (un *spinner* de
  más de 30 s) y cada reintento repetía la consulta que había matado al proceso.
- **Sentry cubre los tres runtimes** (navegador, Node y edge) y las opciones salen de un solo
  sitio, `lib/sentry-comun.ts`. Ponerlas en dos de los tres es la forma fácil de equivocarse,
  así que hay un test estructural que exige que las tres partan de `OPCIONES_COMUNES`.
  - **`sendDefaultPii: false`**, como el backend: por aquí pasan RUTs, montos y documentos.
    Cambiarlo no rompe nada y empieza a mandar datos personales a un tercero —
    `__tests__/sentry-privacidad.test.ts` lo fija.
  - **Sin replay de sesión**, a propósito: graba la pantalla. Un `maskAllText` es una
    salvaguarda que hay que acertar; no grabar no hay que acertarlo.
  - `AbortError` y los 401 se descartan: cancelar peticiones es el comportamiento **correcto**
    (TanStack Query cancela lo obsoleto) y reportarlo convierte lo normal
    en alarma.
  - **`app/error.tsx` y `app/global-error.tsx`.** No existía ninguna frontera de error: un
    fallo al renderizar dejaba una página en blanco y **nada registrado**. `global-error`
    lleva sus estilos en línea porque si lo que falló es el layout, las hojas de estilo
    pueden no haber llegado. **«Reintentar» llama a `retry()`, no a `reset()`**: en Next 16
    `retry()` vuelve a pedir el segmento al servidor y `reset()` sólo repinta lo que ya había.
- **`NEXT_PUBLIC_*` se inlinea en el BUILD, no en ejecución.** Ponerlo en el `environment`
  del contenedor no llega al navegador: van como `ARG` en el Dockerfile y como `build.args`
  en el compose. Es el motivo por el que `API_URL` **no** lleva ese prefijo, y por el que el
  DSN de Sentry **sí** lo lleva (para reportar un error del navegador, el navegador tiene que
  saber a dónde mandarlo; un DSN sólo permite escribir eventos, no leerlos).
  `SENTRY_AUTH_TOKEN` es `ARG` y nunca `ENV`: un `ENV` lo deja escrito en los metadatos.
- **Nunca hardcodear un color.** La paleta vive en tokens (`app/globals.css`) y se consume por
  Tailwind. Los componentes tenían 112 hexes; los últimos, los de los Recharts de `/mercado`, se
  fueron con ellos (pasada micro de octubre de 2026). Un token en un estilo en línea va dentro de `rgb()`: es
  un triplete, y `var(--color-x)` a secas no es un color (el tooltip de `PriceBandChart` salía sin
  fondo).
- **Los globos también se abren con el teclado** (`components/graficos/teclado.ts`, `teclasDeRecorrido`):
  la red, el gasto mensual y la concentración son un grupo con `tabIndex={0}` y nombre; las flechas
  recorren las marcas, Inicio y Fin van a los extremos y Escape suelta, y una región `sr-only` con
  `aria-live` anuncia el valor. En la escalera, el foco en el nombre de una fila abre su globo.
  `__tests__/graficos-teclado.test.tsx`.
- **Los gráficos siguen `docs/GUIA_GRAFICOS.md`** (reglas con test y criterios para leer, con sus
  fuentes): `__tests__/guia-graficos.test.tsx` exige que todo fichero que dibuje datos esté
  declarado como propio o como deuda, y fija en los propios tokens `dato`/`dato-tenue`, sin
  leyendas ni adornos, texto de 12 px y el dibujo `aria-hidden` con los valores en texto.
- **Ningún texto bajo 12 px** (`text-xs`): `__tests__/texto-minimo.test.ts`.
- **Nunca `text-white` sobre un fondo de token.** Los rellenos se invierten con el tema: en
  claro `bg-accent` es teal oscuro con etiqueta blanca, en oscuro es teal claro con etiqueta
  navy. Usa `text-onAccent`, `text-onPrimary`, `text-onGold`… `__tests__/on-color.test.ts`
  falla si alguien lo olvida, y hace falta: **el error es invisible en tema claro**, que es el
  que se revisa por defecto, porque ahí `on-accent` justamente ES blanco.
- **Si tocas un token de color, el test de contraste lo comprueba.**
  `__tests__/contraste-wcag.test.ts` lee `:root` y `.dark` de `app/globals.css` y comprueba
  134 pares contra WCAG AA (4,5:1 texto, 3:1 bordes de control): cada tinta sobre cada
  superficie, cada `on-*` sobre su relleno, cada tinta sobre su tenue, y los cuatro de la
  tarjeta de vista previa. Los cinco que medían tintas sobre `brand-navy` se fueron con el panel
  oscuro de la portada (portada v7, V1): nada pinta ya texto sobre navy. **Un token nuevo lo hace
  fallar** hasta que alguien decida sus pares (o lo declare decorativo en `SIN_PAR`). Antes eran
  «166 pares verificados» a mano, y el bug de `.alert-info` (texto invisible en tema claro) nació
  de cambiar un token a ojo.
- **Los enlaces dentro de un texto corrido llevan `className="enlace"`** (subrayado): es la
  señal de «hipertexto, no aplicación». La navegación, las tarjetas y los botones no se
  subrayan. `__tests__/enlaces-contenido.test.ts`.
- Una superficie que deba verse oscura siempre se marca con la clase `dark` sobre
  `bg-brand-navy`, y los tokens se invierten solos dentro. No repintes a mano. **Hoy no hay
  ninguna**: el panel de lecturas de la portada era la única y se fue con la portada v7 (el dueño:
  «los gráficos con un fondo muy fuerte ocupan un espacio muy corto»). Una superficie oscura nueva
  mete sus tintas sobre `brand-navy` en `contraste-wcag.test.ts`: `subtle` no pasa (4,18:1) y el
  `border` oscuro no se ve sobre navy.
- **El tema claro declara `color-scheme: only light`; el oscuro, `dark`** (`app/globals.css`, más
  `<meta name="color-scheme" content="only light">` desde `viewport` en `app/layout.tsx`). Con
  `light` a secas, Chrome en Android con «oscurecer sitios web» invertía la portada entera en el
  tema claro. next-themes lleva `enableColorScheme={false}`: su `style` en línea dice `light` y le
  gana a la hoja. Con el sistema en claro, el `FORCE_DARK_ONLY` de algunas WebView oscurece igual
  y ninguna declaración lo evita. `__tests__/oscurecido-forzado.test.ts` y
  `e2e/oscurecido-forzado.spec.ts`.
- **La tarjeta de vista previa** (`app/opengraph-image.tsx`, la misma para X en `twitter-image.tsx`)
  es un panel `brand-blue` (el azul del cuerpo del pájaro, invariante de tema; lo pinta también el
  pájaro de la cabecera) con
  el pájaro, la marca en Varien y el dominio, y un lienzo blanco con «Cuánto paga el Estado por lo
  que vendes» (el titular de la portada) en navy y la píldora «Datos públicos de ChileCompra». Sin subtítulo: casi siempre se ve a 260 px.
  Se dibuja sin CSS, así que sus colores son copias de tokens en `lib/coloresImagen.ts`
  (`colores-imagen.test.ts` vigila la copia) y sus pares de texto, `PARES_IMAGEN`, los mide
  `contraste-wcag.test.ts`. Los trazos del pájaro están copiados del logo en `lib/pajaroImagen.ts`
  (`pajaro-imagen.test.ts`), y las fuentes van en WOFF (Satori no lee WOFF2 ni ejes variables): dos
  instancias estáticas de Libre Franklin (800 y 700) en `assets/fuentes-imagen/` (cómo rehacerlas, en
  `lib/fuentesImagen.ts`) y Varien desde `public/fonts/varien/WOFF/`. **Rutas literales** al leerlas:
  una ruta armada empaqueta el proyecto entero en el servidor (aviso de Turbopack).
- **El estado de servidor va en TanStack Query, sin excepciones.** Las consultas y sus claves
  viven en `lib/queries.ts`, en un solo sitio: las claves son lo que permite invalidar con
  precisión tras una mutación. Los hooks envuelven `lib/api.ts`, no `fetch`: el transporte
  se cambia en un solo sitio sin tocar una pantalla.
  **`react-hooks/set-state-in-effect` e `immutability` son `error`**: reintroducir el patrón
  `useEffect` + `setState` para pedir datos no compila.
- **Nada de `useEffect` + `setState` para leer algo que vive fuera de React.** Para
  `localStorage`, `matchMedia` o un evento del navegador, la API correcta es
  `useSyncExternalStore` — ya lo usan `useMediaQuery`,
  `SelectorTema` y los favoritos y búsquedas guardadas (`lib/almacenLocal.ts`). Además de dejar el lint limpio, arregla un fallo que el efecto tenía:
  **sólo corría al montar**, así que un cambio externo no llegaba a las pantallas ya montadas.
- **No queda ninguna excepción a esa regla.** Las tres que había (`bi/page`, `settings` y
  `AuthContext`) desaparecieron: las dos últimas con las cuentas, y la de `bi/page` con un
  inicializador perezoso. Si necesitas una, escribe por qué en su línea — nunca desactives la
  regla globalmente.
- **Ninguna pantalla pasa de 700 líneas.** Las tres que lo hacían están partidas por su
  seam natural: el detalle de licitación en `components/licitacion/` + `lib/licitacionDetalle.ts`,
  el listado en `FilaLicitacion` + `lib/licitacionEstado.ts`, y las herramientas de BI en
  `app/(panel)/mercado/components/herramientas/` (una pestaña por fichero). **Los ayudantes de estado y formato
  van en `lib/`, no dentro del componente**: definidos dentro se reconstruían en cada render
  y no se podían reutilizar desde la tarjeta.
- **Tests de extremo a extremo: `make e2e`.** Monta la pila entera contra una base
  efímera y corre Playwright. Encontró **tres fallos que ninguna otra capa veía**, y los
  tres compilaban y pasaban el lint:
  - el proxy entraba en **bucle de redirecciones** con cualquier ruta terminada en `/`
    (Next quita la barra, FastAPI la vuelve a pedir), así que rutas como `/api/v1/tenders/`
    **nunca cargaban**;
  - `sort_by=relevance` **sin artefactos TF-IDF ignoraba el término** y devolvía el
    catálogo entero — el estado normal de un despliegue nuevo;
  - **`params` es una Promesa desde Next 16**, y las dos páginas de detalle la leían como
    objeto: pedían `/codigo/undefined`. Rotas desde la actualización.
  - En un componente cliente el parámetro de ruta se lee con **`useParams()`**.
  - **Una licitación que no está responde 404 de verdad**: `licitaciones/[codigo]/layout.tsx`
    pregunta al backend (`licitacionExiste`, como el visitante, 2 s de tope) y llama a
    `notFound()` en el layout y no en `generateMetadata`, que puede salir con la respuesta ya
    empezada en 200. `licitaciones/not-found.tsx` dice que la retención la sacó y enlaza a
    Mercado Público; con el backend caído la ficha se pinta igual y el navegador reintenta.
  - **La revalidación se prueba ahí** (`e2e/revalidacion.spec.ts`): el contrato de
    `/api/revalidar` y que revalidar `analytics` pasa una ficha de HIT a STALE y de vuelta a
    HIT, sobre el servidor standalone del build de producción. `scripts/e2e.sh` genera
    `REVALIDAR_SECRETO` como `PROXY_SECRETO`. Que el dato cambie de verdad se comprueba a
    mano (docs/DESPLIEGUE.md, «Si algo falla»).
- **Accesibilidad con axe** (`e2e/accesibilidad.spec.ts`, `@axe-core/playwright`): reglas
  WCAG 2.0 y 2.1 A y AA sobre el DOM pintado de la portada, `/licitaciones` y una licitación,
  `/compra-agil`, `/mercado`, `/productos`, `/notas` y una nota, `/guias` y una guía, `/acerca`,
  `/apoyar`, `/abierto` y el 404, en claro y oscuro, a 1440 y 390. Ve lo que el test de tokens
  no ve: nombres accesibles, ARIA prohibido, regiones con desplazamiento sin teclado. **Lo que
  marque se arregla en el componente**; una exclusión va en `EXCLUSIONES`, con regla, selector
  exacto y motivo, nunca una regla entera. Hoy está vacía. axe no decide el contraste del texto
  dentro de un SVG de Recharts (lo da por «incompleto», no por fallo), así que ahí no vigila
  nada. `__tests__/selects-con-nombre.test.ts` cubre los `<select>` que axe no ve porque no se
  pintan al abrir la página.
- **Comparación de capturas** (`e2e/capturas.spec.ts`): la portada y `/licitaciones` a 1440 y
  390 en claro, con `toHaveScreenshot`. **Sólo corre en Linux, y las líneas base
  (`capturas.spec.ts-snapshots/*-chromium-linux.png`) salen del runner de CI**: macOS rasteriza
  el texto distinto, y un Mac con Apple Silicon no es el x86-64 del runner. En un Mac se salta.
  Fechas, horas y días de la semana se reescriben en el DOM antes de capturar (la semilla fecha
  relativo a la hora en que corre), y la semilla separa un minuto cada publicación (el catálogo ya
  desempata por `id`, pero el orden sería el inverso al de carga y habría que rehacer las líneas
  base). **Un cambio visual en esas dos pantallas, una nota
  nueva incluida (la portada lista las cuatro últimas), exige rehacer la línea base**: borra el
  PNG, empuja, y el test falla dejando la captura nueva con su nombre en el artefacto
  «playwright» (`gh run download <id> -n playwright`); se copia a `capturas.spec.ts-snapshots/`
  y se revisa a ojo antes de commitearla. En CI una captura sin línea base falla
  (`updateSnapshots: 'none'`): con el valor por defecto el primer intento la escribía y el
  reintento pasaba comparándola consigo misma.
- **El navegador de los E2E se elige solo** (`E2E_NAVEGADOR=auto`): nativo si puede
  lanzarse, y si no, la imagen oficial de Playwright. En una máquina de trabajo
  `playwright install --with-deps` pide sudo; en CI no, y **bajar la imagen de 2 GB desde
  Actions tardaba cuatro minutos y moría con `connection reset by peer`** — por eso el job
  instala Chromium y fuerza `nativo`. Lo único que cambia entre los dos caminos es de dónde
  sale el binario: misma versión, mismos tests, misma pila.
- **En los E2E, Next arranca DENTRO del contenedor** del navegador, y el backend vive en el
  host escuchando en `0.0.0.0`. Hacía falta por las cookies `Secure` de la sesión, que ya no
  existe; se conserva porque funciona y no hay motivo para moverlo. **Los E2E recorren el
  sitio sin iniciar sesión** (`e2e/licitaciones.spec.ts`).
- **El lint es `eslint .`, no `next lint`** — desapareció en Next 16. La configuración es plana
  (`eslint.config.mjs`), porque ESLint 9 abandonó `.eslintrc`.

---

## Arquitectura

Next.js 16 App Router + TypeScript + Tailwind. Componentes propios, y los gráficos también (SVG y cajas de servidor; Recharts salió en octubre de 2026). El estado de
servidor va en TanStack Query (`lib/queries.ts`) y todo el tráfico pasa por `/api/proxy`,
sin sesión — ver las reglas de trabajo, más arriba. Pantallas: el catálogo de
licitaciones (`/licitaciones`, con su detalle; **los filtros viven en la URL**, `abiertas=1` incluido, así que
una búsqueda es una URL; **entrar sin nada en la URL abre en «Sólo abiertas»** (`filtrosIniciales`), y
una URL con filtros se lee tal cual, así que un enlace, una búsqueda guardada o un RSS no cambian de
sentido —sólo cuentan los parámetros del catálogo, `PARAMS_CATALOGO`: un `fbclid` no es un filtro—; lo
que la API rechazaría no sale de la URL ni del buscador (más de 8 palabras o 100 letras, términos
repetidos, un mecanismo desconocido, un `offset` sobre 100.000): un 422 se veía como «0 resultados»,
y un error de la API se pinta con `ErrorDeCarga`; cada licitación es una fila, `FilaLicitacion`, con el cierre en palabras de `cierreEnPalabras`), «Lo mejor de hoy en Compra Ágil» (`/compra-agil`), `/guardados`
y los mercados por rubro (`/mercado`, «Mercados» en la navegación); y lo abierto en `/abierto`,
enlazado como «API y MCP» desde la cabecera; la búsqueda en `/buscar?q=` (ver abajo); y las
notas de datos en `/notas` (ver «Notas de datos»). Las del panel viven en el grupo de rutas
`app/(panel)/`, que sólo les pone el contenedor (abajo) sin aparecer en la URL.

**Una sola cáscara** (`components/cascara/`, spec del rediseño §6.1–§6.2). `app/layout.tsx`
envuelve TODA página en `Cascara` —cabecera, el único `<main id="contenido">` y el pie—, así que
ninguna página ni layout de grupo pinta cabecera, pie, `PieAtribucion` ni `<main>` propios:
`__tests__/legal-enlazado.test.tsx` falla si lo hace. No hay barra lateral (R3).
- **Un contenedor y una escala** (spec `docs/PORTADA_V7_Y_NOTAS_2026-10.md` §4).
  `components/cascara/Contenedor.tsx` (`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8`) lo usan
  la cabecera, el pie, los layouts de `(panel)` y `(publico)`, la portada, los legales, el 404 y
  `error.tsx`: **un solo borde izquierdo**. Ninguna página fija su `max-w-*` ni su relleno lateral;
  las de lectura limitan el texto a `max-w-3xl` **dentro**, alineado a la izquierda, y con la
  clase `lectura` cada párrafo mide como mucho 58ch, ~77 caracteres (`__tests__/medida-lectura.test.ts`;
  eran ~120). `pagina` añade
  el tope: **48 px de la cabecera al `h1` desde `lg`, 24 en móvil**, así que **nada va antes del
  `h1`** (ni antetítulo ni «← volver»; en `/mercado` el selector de rubro va debajo del `h1`).
  `h1` de página: `.page-title` (28/36 px); `h2` de sección: `h2.section-title` (22 px).
  `components/cascara/Seccion.tsx` es LA sección (`mt-8 lg:mt-16`, h2 opcional; `Piezas` la
  re-exporta). Espacios en la escala 4/8/12/16/24/32/48/64. `e2e/escala.spec.ts` mide a 1440 y 390
  el borde izquierdo (marca, `h1`, pie) y la distancia cabecera→`h1` en `/licitaciones`,
  `/productos`, `/acerca`, `/guias` y una guía (la portada sólo el borde).
- **Sin señales de plantilla** (V10): ni antetítulos ni encabezados en mayúsculas (`uppercase`,
  `tracking-wide*`), ni metadatos con punto medio: «Confianza alta, 90 compras», no «· N=90».
  `__tests__/senales-plantilla.test.ts` los busca en todo `app/` y `components/`, comentarios
  incluidos. Se permite `first-letter:uppercase`. Tampoco bordes laterales gruesos de color
  (`border-l-4` en un aviso o una tarjeta, la señal que más marca el detector de `make diseno`),
  sin excepción: el filete de las cifras de la portada se fue con `TiraCifras`.
- **Un solo formato de montos: `monto()`** (`lib/formato.ts`; `formatCurrency` lo envuelve): «$825.000»,
  «$7,2 millones», «$1,5 mil millones», «$2,1 billones». Convivían «$825K», «$7,2M», «$1,5B» (en Chile un
  billón es 10¹²) y «$1.000K». `plata` (`lib/publico.ts`) redondea los millones a entero a propósito, para
  las bandas de precio. `/mercado` también pasa por `monto()`.
- **Las Compras Ágiles se pintan con UNA fila**, `FilaCompraAgil`, en la portada (compacta), `/compra-agil`,
  `/buscar` y la ficha del comprador (con `historia`: región, órdenes de la unidad y «Abrir en Mercado
  Público», porque su dato no trae URL).
  Con `historia`, bajo el monto va **un gráfico chico** (`RangoMonto`, regla y geometría en
  `lib/rangoMonto.ts`): la mitad de las órdenes de la unidad (P25–P75) en `dato-tenue`, la mediana como
  raya y el monto de esa Compra Ágil como un punto en `dato`, **lineal desde cero** (un monto diez veces
  lo usual tiene que verse lejos), y la frase «Más de / Dentro de / Menos de lo que suele gastar» (sobre
  P75, en la franja con sus bordes, bajo P25). Sale también en la fila repetida (su monto es otro), y no
  con el tope, sin monto, sin historia o con P25 = P75. La portada, compacta, no lo lleva.
- **El cierre se dice con UNA regla en todo el sitio** (`textoCierre`, `lib/horaChile.ts`): con la hora
  de quien mira (las listas del navegador) «Cierra hoy a las 18:00», «Cierra mañana a las 12:00», «Cierra
  el 28 oct a las 12:00» o «Cerró el 12 oct»; en lo que se sirve desde caché o del servidor (la portada,
  `/buscar`, la ficha del comprador; `cierreFijo`) siempre la fecha con su hora. Convivían «Cierra en 6
  días», «Cierra el 2 nov 2026» y «Cierra en 3 h» para lo mismo. La fila de licitación de `/buscar` tiene
  la forma de `FilaLicitacion` (nombre, comprador y región, cierre y código, monto a la derecha; **sin
  monto, nada**: un «Sin monto» gris en más de la mitad de las filas tapaba los montos), sin
  «guardar».
- **Un monto de Compra Ágil bajo `MONTO_SIMBOLICO` ($1.000) es «Sin monto»** (`montoDeclarado`): hay
  quien escribe $1 para no declarar nada. En `/compra-agil`, una fila de la misma unidad que la de arriba
  (`mismaUnidad`) dice «La misma unidad de compra que la anterior» en vez de repetir su historia.
- **Cifras y fechas en `es-CL`** (`__tests__/formatos-es-cl.test.ts`): ningún `toLocale*String` ni
  `new Intl.*` sin `'es-CL'`, ni un `format` de date-fns con nombres de mes sin `{ locale: es }`
  («29,586» y «16 Oct 26» salían en producción).
- **Campos a 16 px en móvil**: `.input-field` es `text-base sm:text-sm` (Safari amplía la página
  con menos), y un `text-sm` suelto en el campo lo deshace. `__tests__/campos-moviles.test.ts`.
- **La navegación es UNA lista**, `lib/navegacion.ts` (`SECCIONES`, `GUARDADOS`,
  `enlacesAbiertos`, `mapaDelSitio`, `enlacesDelPie`, `esSeccionActiva`): de ahí salen la fila de
  escritorio, el menú móvil y la fila de enlaces del pie. «Compra Ágil», no «Hoy» (V12). Una sección nueva se añade ahí y en ningún otro sitio;
  `__tests__/navegacion.test.ts` exige que cada ruta interna tenga su página. **El fichero no
  importa nada**: lo leen también los E2E, que no resuelven `@/`.
- **Cabecera y pie son componentes de servidor** con cuatro islas cliente: `EnlaceSeccion` (sección
  activa con `usePathname` y `aria-current`), `MarcoCabecera` (el `<header>`, con un solo
  `onClick` que cierra el menú móvil al pulsar cualquier enlace), `EnlaceGuardados` (contador con
  `useSyncExternalStore` sobre los almacenes de `/guardados`: licitaciones guardadas o postuladas,
  sin repetir, más búsquedas) y `SelectorTema`, en el pie. **El pie** (`PieSitio`): **una fila de enlaces**
  con lo que la cabecera no tiene (`enlacesDelPie`: acerca, costo, API y MCP, código, licencias,
  legales y contacto; ni las secciones, ni Guardados, ni «Apoyar», que ya están arriba) y el
  selector de tema compacto (tres íconos); debajo, la cita (`PieAtribucion`), «Un proyecto
  independiente, sin relación con el gobierno de Chile.», «Lo hace {nombre}.» (sólo con `AUTOR_NOMBRE`) y «Sitio en el commit
  `abc1234`» (sólo con `VERCEL_GIT_COMMIT_SHA`, enlazado si hay repositorio; `commitDelSitio` en
  `lib/repositorio.ts`). Eran cuatro columnas con 18 enlaces, la mitad repetidos: ~520 px en
  escritorio y ~900 en un teléfono; ahora, ~250 y ~370. `__tests__/cabecera.test.tsx` falla si
  otro fichero de `components/cascara/` se vuelve cliente o usa un color crudo.
  **La marca lleva el pájaro del logo** (`PajaroMarca`): SVG de servidor con los trazos de
  `lib/pajaroImagen.ts` (la misma copia que la tarjeta de vista previa) y los tokens invariantes
  `brand-blue` y `brand-teal`. Sustituye a `TordoLogo`, un componente cliente con siete hex que
  entraba en todas las páginas como una isla que el test no veía; por eso el test exige también
  que la cáscara no importe componentes cliente de fuera salvo `SelectorTema`.
  **Lo que importe una isla viaja en TODAS las páginas**: `EnlaceGuardados` arrastró `date-fns`
  (~6 KB gzip) por `useBusquedasGuardadas` → `filtrosCatalogo` → `licitacionEstado`, sólo para
  contar. `normalizeText` y `shortRegion` viven ahora en `lib/nombresChile.ts` (sin imports) y
  `__tests__/isla-guardados-ligera.test.ts` falla si la isla vuelve a alcanzar `date-fns`,
  `recharts`, `axios` o TanStack Query.
- **Los nombres de Mercado Público se escriben con `normalizeText`** (`lib/nombresChile.ts`): llegan
  en MAYÚSCULAS y salen con mayúscula inicial, pero «de», «del», «la», «las», «los», «y», «e», «o»,
  «en», «a», «al», «por», «para» y «con» en minúscula salvo al principio («Policia de Investigaciones de
  Chile»). **«El» va en minúscula sólo detrás de una de esas palabras** («para el Hospital», «en el
  CMT»): delante abre nombres propios que no son lugares («Hospital El Pino», «Jardín Infantil El
  Principito»). Un artículo que es parte de una comuna o región la conserva («Municipalidad de Las
  Condes», «de El Quisco», `LUGARES_CON_ARTICULO`): ante la duda, mayúscula. Las tildes que faltan no se inventan.
  Van enteros en mayúscula los romanos («II Región»), las abreviaturas de letra doble («OO PP»,
  «FF.AA.») y las palabras sin vocal («DCYF», «PVC»; no «Dr» ni «Sn»); tras un punto o un apóstrofo
  va mayúscula («S.A.», «I.Municipalidad», «O'Higgins»), y `PARTIDAS` une las palabras que el dato
  trae cortadas («DIREC CION»). Salía «Direc Cion Gral de Oo Pp Dcyf».
  La ficha del comprador y la tabla de compradores del rubro también lo pasan (analytics trae
  los nombres en mayúsculas). `__tests__/nombres-chile.test.ts`.
- **«Código» sólo con `REPOSITORIO_URL`** (`lib/repositorio.ts`), y por eso la cabecera tiene que
  ser de servidor: en un componente cliente la variable no existe y el enlace no saldría nunca.
- **La fila completa aparece desde `lg` (1024 px), no desde 640**: mide ~720 px y en una tableta
  se partía en dos líneas. Por debajo, marca, guardados, «Apoyar» y un `<details>` «Menú» cerrado:
  una línea, sin JavaScript. **Cualquier enlace de la cabecera —menú, marca, guardados, «Apoyar»— lo cierra al pulsarse** (`MarcoCabecera`): la cáscara no se
  desmonta al navegar y el menú quedaba abierto encima de la página nueva. `e2e/cascara.spec.ts`
  mide la cabecera a 320, 390, 768, 1024 y 1440 px (a 320, «Apoyar» queda sólo con el corazón y su nombre accesible) y saca capturas de `/mercado` y `/licitaciones` en
  claro y oscuro.
- **La cabecera no es fija**: así la barra de filtros de `/mercado` (`RubroFilter`, `sticky top-0`)
  se queda arriba al bajar sin quedar tapada.
- **`InfoTooltip` se alcanza con el teclado** (`tabIndex={0}`) y el globo es su descripción
  (`aria-describedby`). Sin texto es un `<button aria-label="Más información">` (un foco sin
  nombre no dice nada) y **Escape le quita el foco**, con lo que cierra el globo; cerrado es `display: none` y no ocupa sitio (con `opacity-0` ensanchaba
  `/mercado` a 390 px), y abierto se corre lo justo para caber en el viewport.
  `e2e/cascara.spec.ts` abre cada tooltip de `/mercado` a 390 px y mide la caja y el ancho del
  documento.

**Las URL del panel son permanentes desde el lanzamiento: no se renombran.** Hasta entonces
colgaban de `/dashboard/*` (`tenders`, `bi`…), y esas URL ya circulan en lectores de RSS,
marcadores y enlaces compartidos. `next.config.js` las redirige con **308** —el buscador
traspasa lo indexado; un 307 la dejaría indexada para siempre— conservando la query, porque
una búsqueda es su URL. `__tests__/redirecciones-panel.test.ts` fija la tabla y
`e2e/redirecciones.spec.ts` que el servidor la aplica. **No vuelvas a crear `app/dashboard/`**:
la redirección corre antes que las páginas y la dejaría muerta.

**`/buscar?q=` (rediseño 5)** — `app/(publico)/buscar/`: una búsqueda, tres respuestas —cuánto
ha pagado el Estado (`/publico/productos?q=` y la ficha del primero), qué está abierto ahora
(licitaciones con el filtro de `urlCatalogoAbiertas` y «Lo mejor de hoy» con `search`) y quién
lo compra (los compradores de esa ficha)—.
- **Componente de servidor y dinámico que pide como el visitante** (`lib/buscarServidor.ts`, sobre
  `pedirAlBackend` de `lib/rssServidor.ts`): hasta cinco llamadas por búsqueda **cuentan en el
  límite por IP de quien busca**. No va exenta como un renderizado del servidor: una página
  dinámica, generada por visitante y exenta, sería una forma gratis de saltarse el límite.
- **Pocas filas y tiempo máximo**: 3 productos, 5 licitaciones, 3 Compras Ágiles, 3 compradores
  por su nombre (`/publico/compradores?q=`, un atajo a su ficha que sólo se pinta si hay alguno)
  y una ficha —o, sin resultados, la sugerencia—;
  6 s por llamada (`TIEMPO_MAXIMO_BLOQUE_MS`). **Un bloque que falla se oculta con una línea**
  —un 429 dice «espera un momento»— y la página nunca lanza por la API. «No encontramos nada»
  sólo si los cuatro respondieron vacíos.
- **Con menos de 3 caracteres no llama al backend.** El término se recorta a 100 caracteres y 8
  palabras **antes** de llamar (`prepararBusqueda`, `lib/buscar.ts`): Compra Ágil responde 422
  con más, y el recorte vale para los tres bloques y sus enlaces, así que cada total es el de su
  enlace. `MAXIMO_TERMINOS_BUSCAR` y `MAXIMO_CARACTERES_BUSCAR` copian `limites.py`;
  `backend/tests/test_buscar_limites_del_frontend.py` falla si se separan.
- **Todo «ver todos» sale de un ayudante** (`rutaBusquedaProductos`, `urlCatalogoAbiertas`,
  `rutaCompraAgil`, `rutaProducto`), y los parámetros de `/tenders/` se derivan del propio enlace
  (`paramsLicitacionesAbiertas`): el filtro no puede separarse del total.
- **`noindex` por metadatos, fuera del sitemap y NO en `robots.txt`**: un buscador que no rastrea
  la página no ve su `noindex`. El término va en el `<title>` pero no en `og:title` ni en
  `twitter:title`: las tarjetas de vista previa ignoran `noindex`, y quien compartiera una URL
  fabricada controlaría el texto que se ve.
- **La cabecera no lleva buscador** (spec §6.1). Se llega por el formulario de la portada
  (`BuscadorPortada`, un `<form method="get" action="/buscar">`) y por sus ejemplos,
  `EJEMPLOS_BUSQUEDA` en `lib/buscar.ts` (verificados en producción por 0e), enlazados con
  `rutaBuscar`. **Sin `prefetch` en esos enlaces**: cada vista de la portada costaría hasta 24
  llamadas al backend.

**Explicativos (spec D18)** en `frontend/content/explicativos/*.mdx`: contenido estático, sin
JSX. **Toda cifra sale de un dato medido del repo y su fuente se nombra en el frontmatter**
(`fuentes`); no se inventan estadísticas, ni se publican umbrales legales (montos en UTM):
cambian y se remiten a ChileCompra. `__tests__/explicativos-frontmatter.test.ts` fija el
frontmatter, el largo de la `descripcion` (≤ 155), los enlaces internos permitidos y que no
haya `{`/`<` fuera de código (MDX los lee como JSX).

**Favoritos, búsquedas guardadas y RSS (sin cuentas).** Viven en `localStorage`
(`licit_dashboard_collections_v1`, `tordo_busquedas_v1`). Cada búsqueda guardada tiene su feed:
`/rss/licitaciones?<params del catálogo>` y `/rss/compra-agil` son route handlers de Next (la
API sigue siendo sólo JSON) con caché de CDN de 30 min, lista blanca de parámetros, XML
escapado y la cita de la fuente en cada ítem. Llaman al backend **como el visitante**
(`cabecerasHaciaElBackend(ipDelVisitante(...))`), no como renderizado exento.

**«Todas las licitaciones» se guarda como `abiertas=0`, nunca como la consulta vacía**
(`consultaCanonica`): vacía, el catálogo abre en «Sólo abiertas».

**Una URL que llega de fuera vuelve a montar la pantalla** (`lib/urlPropia.ts`,
`useClaveDeUrlExterna`): `/licitaciones`, `/compra-agil`, `/mercado` y `/productos` leen sus
filtros de la URL al montar, y Next 16 no desmonta la página cuando sólo cambia la consulta, así
que pulsar «Licitaciones» en la cabecera con un filtro puesto dejaba el filtro con la URL limpia.
Cada pantalla escribe su URL con `escribirUrlPropia`, que la anota; una consulta distinta de la
anotada cambia la clave del contenido.

**La pantalla de analítica (`app/(panel)/mercado/`, servida en `/mercado`) está ordenada por la decisión, no por lo
que el pipeline sabe calcular**: lo nacional (cuánto compra cada sector, `SectorOverview`, en
barras con el color de cada sector —el mismo de la portada, `lib/sectores.ts`—, con la línea de que los contratos de obra del MOP no están en las órdenes) → un rubro: cómo
está el mercado (resumen, panorama y crecimiento) → dónde mirar primero → un comprador en concreto →
herramientas. **Sin rubro en la URL abre en el de más mercados** (`/bi/rubros` viene por frecuencia;
el elegido por defecto no se escribe en la URL): antes abría con tres recuadros vacíos. La
cabecera del rubro la pinta `PanoramaRubro` desde `GET /bi/panorama`, que es una sola
llamada para las cuatro preguntas de mercado. **El resumen de arriba (`narrative/templates.ts`) dice
sólo lo que esas cifras no dicen**: cuánto crece el rubro y su comprador más activo, con periodo. Repetía
el monto, los proveedores y unos compradores del último año junto a «Compradores en 36 meses»
(`__tests__/resumen-rubro.test.ts`). **Ya no hay Recharts en `/mercado`**: sectores y
proveedores son `components/graficos/BarrasHorizontales.tsx` y los meses y años,
`components/graficos/Columnas.tsx`, que siguen la guía de gráficos (`PROPIOS`). Sin «¿Son
confiables?», sin la insignia «excelente», sin «Probabilidad de compra», sin semáforos: la nota
del comprador es «9,2 de 10» y sus tres números al lado.
**`PanoramaRubro` titula con la conclusión, no con el tema**: cada bloque lleva el tema como etiqueta
chica («Contra quién compites», con su ayuda) y la conclusión como título («Rubro fragmentado», «Se
compra parejo todo el año», «41 de los 890 compradores del rubro tienen alguna señal…»). `nivel`
elige su rango: `h3` en `/mercado` (dentro de «Cómo está el rubro») y `h2` en `/rubros/[slug]`, que
no tiene otra sección encima (saltaba de `h1` a `h3`). **«Parejo» no resalta ningún mes** (resaltaba
enero, desmintiendo el título); con temporada, el mes pico. Una cuota que se redondearía a cero dice
«menos de 0,1 %» (`porcentaje`, `lib/formato.ts`), y los compradores a mirar con cuidado enlazan a
su ficha como la tabla «Quién compra más».

**La URL de esa pantalla se lee, no sólo se escribe.** `rubro`, `focus` y `compare` se leen
con `useSearchParams` en un inicializador perezoso —dentro de una frontera de `Suspense`,
que `useSearchParams` exige— y se escriben con `replaceState`. Antes sólo se escribían:
compartir el enlace de un rubro abría el rubro por defecto del que lo recibía. «Copiar enlace»
lleva el rubro que se ve, también el de por defecto (`RubroMostrado`, `enlaceConRubro`).

**Sistema de diseño por tokens** en `app/globals.css`, mapeado a Tailwind en
`tailwind.config.js`. Paleta "Iridiscencia", sacada del propio logo — el tordo es un pájaro
negro con tornasol azul-verdoso:

- **navy = estructura**, **teal = acción**, **verde = liberado para significar "bueno"**.
  Antes `--color-accent` y `--color-success` valían el mismo hex, así que "esto es de TORDO"
  y "este número es bueno" eran indistinguibles.
- Ningún hex único sirve en ambos temas, así que cada color de acción tiene **dos paradas
  invertidas por tema** más un `--color-on-*` que dice qué etiqueta va encima.
- **Dos tokens de dato** (`--color-dato`, `--color-dato-tenue`, y `--color-on-dato` encima):
  cada gráfico pinta en `dato` sólo lo que nombra su conclusión y deja el resto en `dato-tenue`,
  que es decorativo (`SIN_PAR`): nunca lleva texto y el valor va escrito al lado. Claro: el azul
  del cuerpo del pájaro; oscuro: el turquesa del ala.
- Tipografía (`docs/IDENTIDAD_Y_PORTADA_2026-10.md` §4, revisada el 2026-10-21; `app/layout.tsx`,
  `next/font/google`, autoalojada): **Libre Franklin sólo en los titulares** (`h1`, `h2` y
  `font-display`: 800 y `letter-spacing: -0.015em`), **Public Sans en todo lo demás** —cuerpo,
  interfaz y **todas las cifras**—. Archivo semiexpandida se fue porque al dueño no le convencía:
  se compararon catorce familias con textos del sitio. Libre Franklin (la Franklin Gothic de los
  diarios) da el carácter pero **no trae `tnum`**; Public Sans salió de ella, sí lo trae (punto de
  miles a medio ancho) y comparte esqueleto. Las dos utilidades fijan peso y espaciado en
  `@layer utilities` de `globals.css`, que Tailwind emite después de las suyas: `font-display` le
  gana a un `font-bold`, y un titular **no lleva clase de peso** (salvo que declare que no es
  titular con `font-sans` o `font-mono`). **IBM Plex Mono** sólo para identificadores (códigos de
  licitación, de comprador, ONU; nunca un monto, y nunca en negrita: está cargada en 400 y 500)
  y **Varien** sólo para la marca, junto al pájaro. `.cifra` va sobre Public Sans con `tnum`.
  **Nunca `cifra` junto a `font-display`** (saldría en Libre Franklin, sin cifras tabulares), **ni
  un `style={{ fontFamily }}`**.
  `__tests__/tipografia.test.ts` y `e2e/tipografia.spec.ts`.
- Fondo de página en tema claro: **blanco** (`--color-background` = `--color-surface`); las
  tarjetas se separan por su borde. **`bg-background` sin borde no se distingue en claro**: para
  un relleno tenue (ítem activo, selector, código en línea, *hover*), `bg-surface-elevated`
  (`contraste-wcag.test.ts` lo exige).
- **Sin bandas de color en la portada** (sustituyen a las cuatro `band-1..4` de la landing
  vieja, ya fuera de CSS y de Tailwind): el color se reserva para el dato y la acción.
- Tema claro por defecto, con selector claro/oscuro/sistema en el pie del sitio
  (`components/SelectorTema.tsx`, dentro de `components/cascara/PieSitio.tsx`).

**La portada de gráficos: se busca a la izquierda, la red de compradores y proveedores a la derecha**
(octubre de 2026, sobre `docs/PORTADA_V7_Y_NOTAS_2026-10.md` §3; `app/page.tsx` + `components/portada/`):
server component con ISR de 30 min; las únicas islas cliente propias son los gráficos con globo
(`components/graficos/RedProveedores.tsx`, `GastoMensual.tsx`, `Concentracion.tsx` y
`components/precio/GraficoPrecio.tsx`, que se pintan igual en el servidor). **No le pongas `'use client'`
a la página**: Next ignora `metadata` en componentes cliente y la home perdería título y tarjeta de preview.
- **Dos columnas desde `lg`, `5fr / 7fr`** (48 px entre ellas), dentro de `Contenedor pagina`: a la
  izquierda el titular («Cuánto paga el Estado por lo que vendes», `TITULO_PORTADA`), el buscador y
  las abiertas de ahora; a la derecha **el gráfico grande**: la red (`RedPortada`), y sin ella —un
  backend sin el bloque `red`, o sin la tabla— el gasto mensual. Debajo, a lo ancho: «Para empezar»
  (tres lecturas en fila), **el gasto mensual** (si la red ocupó arriba), la franja de hoy, «Lo mejor
  de hoy», **la ficha** (el colofón: de qué base sale todo) y las notas de datos, cada una con la
  separación de `Seccion` (`CLASE_SECCION`). El orden es el de la historia (crítica del 22-10): la
  ficha justo bajo el gráfico grande era metadata en el mejor lugar de la página. Sin ningún gráfico grande, la parte de arriba es una
  columna `max-w-2xl`.
- **En móvil, una columna en ese orden**: buscador, abiertas, el gráfico grande, «Para empezar»… La
  conclusión del gráfico grande —o, sin él, la de la primera lectura— queda sobre el pliegue a
  390×844 (`e2e/portada.spec.ts`). **Un solo ejemplar de cada pieza**.
- **El buscador** (`BuscadorPortada`), un `<form method="get" action="/buscar">` que funciona sin
  JavaScript. El `<h1>` ya no es la etiqueta del campo: el campo se llama `ETIQUETA_BUSCADOR`
  («Producto o servicio que vendes», en `aria-label`). 36 px en móvil y 48 desde `lg`, con
  `text-balance`; el E2E exige que no pase de tres líneas a 1024 y 1440. Debajo,
  `SUBTITULO_PORTADA`; el campo dice `PLACEHOLDER_BUSCADOR` (no repite los ejemplos) y el botón es
  `bg-dato text-onDato`. Bajo el campo, **los primeros `EJEMPLOS_EN_PORTADA` (4) ejemplos, en una
  línea** (con los seis se partía en dos; `/buscar` los muestra todos). Los ejemplos (`EJEMPLOS_BUSQUEDA`,
  `rutaBuscar` y los límites del campo, todos de `lib/buscar.ts`) están **verificados contra
  producción**: `scripts/verificar-produccion.sh` pide cada uno, espaciados y sin bucle, con una copia
  literal que `__tests__/portada-ayudantes.test.ts` compara. Un ejemplo nuevo se verifica antes en
  producción y nunca es corto ni alfanumérico («pc», «A4»).
- **Las abiertas, en una frase** (`AbiertasAhora`, sobre `tiraDeLaPortada`): «Ahora puedes postular a
  4.409 licitaciones y 2.409 Compras Ágiles.», cada cifra con lo que cuenta enlazada al catálogo con
  el filtro que la cuenta (`urlCatalogoAbiertas`). Reemplaza a `TiraCifras`, dos bloques con número
  grande y filete lateral grueso: la plantilla de «métrica de héroe» que el dueño no quería.
- **La ficha** (`FichaPortada`, §3.5), **una franja de tres celdas a lo ancho**, el colofón antes de
  las notas (dos por fila por debajo de `lg`): como lista en la columna del buscador medía ~200 px de
  alto. **Base** —«5,48 millones de órdenes de compra, nov 2023 a oct 2026», `baseDeLaFicha` sobre
  `GET /bi/sector`: la suma de `n_oc` y la ventana mínima y máxima, **nunca escrita a mano**; sin
  analytics, sin `n_oc` en alguna fila o sin ventana, la celda no sale—, **Fuente**, **Se actualiza**
  (`SE_ACTUALIZA`: «Licitaciones y Compras Ágiles, hasta 4 veces al día. Precios y mercados, cada
  domingo.», que sale de `HORAS_HABILES` y `HORAS_FIN_DE_SEMANA`; el horario entero,
  `FRECUENCIA_CATALOGO`, está en `/acerca` y `/compra-agil`). **Quién lo hace no va en la ficha**: lo
  dice la ficha del autor, junto a las notas, y el pie (estaba tres veces en la portada).
- **La red** (`RedPortada` → `RedProveedores`; geometría, frase y pie en `lib/redPortada.ts`; datos del
  bloque `red` de `GET /publico/mercado`): **los 30 organismos que más compran, fijos en un anillo**
  agrupados por sector con su color (`lib/sectores.ts`, `relleno`), y **sus proveedores adentro**: los 4
  más grandes de cada uno, los 12 que le venden a más de ellos y todos los que le venden a la mitad o
  más (hasta 48), sin personas naturales. Las posiciones
  salen de una **simulación de fuerzas en el servidor** (resortes hacia sus compradores, repulsión,
  choque; determinista y sin dependencia): el que le vende a muchos queda al centro y el exclusivo,
  junto a su comprador. En tinta los que le venden a la mitad o más (lo que nombra la conclusión);
  **el resto, huecos** (un aro gris: relleno gris se confundía con el sector «Otros»); el tamaño es el
  monto; cada enlace, una curva hacia el centro. **Rótulos directos**: los 3 organismos de más monto por
  su nombre corto (`nombreCorto`: Cenabast, Junaeb…, sin «Ilustre», ≤ 30 caracteres) y «Le venden a 15 o
  más» bajo el grupo del centro; la leyenda en dos grupos, «Organismos:» y «Proveedores:». El `h2` es
  la conclusión en una frase (`fraseRed`): «40 proveedores le venden a la mitad o más de los 30
  organismos que más compran.» —**lo que cuenta es lo que se dibuja en tinta**; si el backend cortó la
  lista, añade «En tinta, los N que más venden.»; el total de proveedores va en el pie—. **Globo** al pasar o tocar un nodo, que lo aísla con sus vecinos.
  **Se mueve** (la única excepción a R3 de la guía de gráficos): deriva leve y partículas del comprador
  al proveedor, con `requestAnimationFrame`, **quieta con `prefers-reduced-motion`**, fuera de pantalla y
  con la pestaña oculta; las capturas del E2E emulan movimiento reducido. Con menos de
  `MINIMO_COMPRADORES` (8) o mal formada, no sale y el gráfico grande vuelve a ser el gasto.
  `__tests__/red-portada.test.ts`. **Dos disposiciones de la misma red** (`LIENZO_ANCHO` 640 × 420 desde
  `lg`, `LIENZO_MOVIL` 400 × 380 en el teléfono, una con `display: none` en cada ancho): la apaisada
  medía 358 × 235 px a 390 y los proveedores eran puntos de un píxel. «Cómo leer la red»
  (`ComoLeerLaRed`, tres frases y «Toca o pasa el mouse») va bajo las abiertas desde `lg` y bajo la
  leyenda en el teléfono.
- **El gasto mensual** (`GastoPortada` → `GastoMensual`, geometría en `lib/graficoGasto.ts`, frase
  en `lib/lecturasMercado.ts`; datos de `GET /publico/mercado`, `gasto_mensual`), **a lo ancho bajo la
  ficha** cuando la red está arriba (`ancho`: `h2` de sección y la leyenda en una fila): una columna por
  mes, **apilada por sector con el color fijo de cada uno** (`lib/sectores.ts`: Salud `serie-1`,
  Municipalidades `serie-2`, Gobierno y universidades `serie-3`, Obras públicas `serie-4`, Fuerzas
  Armadas `serie-5`, y el resto —«Otros», «Legislativo y judicial», sin sector— junto en
  `serie-otros`). El `h2` es la conclusión (`fraseGasto`): «El Estado compró $X en N meses.
  {Mes} fue el mes más alto: 1,7 veces un mes típico.» —el mes típico es la mediana; bajo
  `VECES_PICO` (1,25), «Compra parejo»—. **Globo** al pasar el mouse o tocar un mes (total y el %
  de cada sector; **sin contar órdenes**: `time_series` las cuenta únicas por rubro, y al sumar
  rubros una orden de dos rubros salía dos veces —7,1 millones contra los 5,5 de la ficha—); la leyenda es una lista de cifras (cada sector con su total y su
  %) y pasar por un sector lo resalta en todos los meses. Eje con la unidad dicha una vez («En
  billones de pesos») y marcas chicas («$0,5», «$1»). Un mes que falta entre el primero y el
  último se pinta como hueco. **Con menos de `MINIMO_MESES` (6) no sale.** **Sólo meses
  cerrados**: el mes en curso (en Chile, con la hora del render) no se dibuja ni se suma —octubre
  de 2026 salía a medias y se leía como un desplome—. Dibuja lo que dice su conclusión: una raya
  discontinua en el mes típico (con su llave arriba, «mes típico») y el nombre del mes más alto
  sobre su columna. «2,0 veces» se escribe «el doble de». El pie (a lo ancho del gráfico, `completo`)
  dice el periodo, «por mes» (sin decir de qué fecha: era el envío y desde #57 es la creación), qué es
  un mes típico y que las obras del MOP casi no pasan por órdenes.
- **«Para empezar»** (`LecturasPortada`, `TITULO_LECTURAS`): `h2` de sección y **tres lecturas en
  fila desde `lg`**, alineadas por subrejilla (la conclusión, el gráfico y el pie de cada una
  empiezan a la misma altura); en móvil, una tras otra. **Las tres primeras disponibles en el orden
  precio → concentración → cierres → nota** (`lecturasDeLaPortada`, `MAXIMO_LECTURAS_PORTADA` = 3):
  con todo, las tres de datos; si falta una, entra la nota; con el backend caído, sólo la nota; sin
  ninguna, la sección no sale. **Cada frase sale del dato con una regla** (`lib/lecturasPortada.ts`
  y `lib/lecturasMercado.ts`, fijadas en `__tests__/lecturas-portada.test.ts` y
  `__tests__/lecturas-mercado.test.ts`), y **cada lectura se oculta entera si le falta su dato**.
  - **Precio** (§3.2, `lecturaPrecio` → `precioDeBanda`): «{nombre}: la mitad de las compras se pagó
    entre p25 y p75» —o «…se pagó a $X» si P25 y P75 se escriben igual—, y la conclusión es el enlace
    al producto. **El gráfico** (`components/precio/GraficoPrecio.tsx`, geometría en
    `lib/graficoPrecio.ts`, `__tests__/grafico-precio.test.ts`): SVG `aria-hidden` con **globo** (cada
    punto dice la mediana del comprador y sus compras, con un área de toque de 20 px; la franja, entre
    qué precios se pagó la mitad y la mediana), escala logarítmica, la franja P25–P75 con su etiqueta
    directa «la mitad de las compras», la mediana como una
    raya, la línea fina de P10 a P90 («8 de cada 10»), **un punto por comprador en su mediana** (todos los
    de la banda, de `medianas_compradores`, hasta 200; si la API aún no lo trae —`null`, hasta que la
    semanal materialice su tabla— cae a los de `compradores` con la unidad de la banda, que son diez)
    **sólo con `MINIMO_PUNTOS` (5) o más**, y más chicos cuantos más son (`radioPara`: 8, 5 o 3,5 px) —con menos,
    ninguno, y la franja baja a 44 px: dos puntos de 63 compradores se leían como «los compradores» y el
    pie decía «uno de los 1»—, P25 y P75 en negrita y hasta dos valores redondos de contexto en `muted`. **El eje es del
    dato** (`dominioDelDato`): de lo más bajo a lo más alto que se dibuja —P10, P90, la franja y los
    puntos— con `AIRE_DOMINIO` (15 % de ese tramo) a cada lado, así que el dato llena ~77 % del ancho; un
    tramo de menos de `RAZON_MINIMA` (1,5×) se abre centrado. Las marcas de contexto (1; 1,5; 2; 2,5;
    3… 8 por una potencia de 10) caen **dentro** de ese eje, fuera de la franja, la más alejada cuyo
    rótulo no pise otro, y **nunca lo estiran**: si no cabe ninguna, ese lado va sin marca. Antes se
    buscaban al doble de P25 y P75 como mínimo y estiraban el eje: el cloro gel iba de $200 a $5 mil
    con 8 de cada 10 compras entre $725 y $1.437, en una cuarta parte del ancho. **Sin `viewBox`:
    lo horizontal va en % y lo vertical en px**, así que puntos y rótulos no se deforman; si dos
    puntos se tocan (se apilan) o dos rótulos se pisan (se apartan, o se juntan en uno) se decide al
    ancho más estrecho en que se pinta (`ANCHO_REFERENCIA`, 280 px): más ancho, nada empieza a
    pisarse. Con un solo comprador no hay franja (sólo en la ficha de producto: la portada no lo deja
    pasar). Los valores, como texto `sr-only`.
  - **La escalera de precios va en su lugar cuando está** (`lecturaEscalera`, `lib/escaleraPrecios.ts`;
    `components/graficos/EscaleraPrecios.tsx`): seis cosas que compra todo el Estado
    (`PRODUCTOS_ESCALERA`: lápiz pasta azul, agua mineral, cloro gel, resma carta, guantes de nitrilo
    por caja y la impresora), una por fila, con el rango en pesos escrito y la franja P25–P75
    **dibujada contra su propia mediana** (escala logarítmica de «la mitad» a «el doble»; si alguna se
    sale, el triple o el cuádruple): sobre los pesos, de $10 a $1 millón, cada franja medía un 4 % del
    ancho. La conclusión nombra la que más varía (mayor p75/p25), que va en `dato`. Cada fila pasa el
    filtro de la lectura de un producto **en la unidad escrita** (`bandaDeLaEscalera`); con menos de
    `MINIMO_FILAS` (4), vuelve la lectura de un producto. La impresora la pide `pedirProductoPortada`
    y las otras cinco `pedirProductosEscalera` (una semana, `analytics`). Elegidas en producción el
    2026-10-22, con copia literal (slug y unidad) en `scripts/verificar-produccion.sh`, que
    `__tests__/escalera-precios.test.ts` compara.
  - **`PRODUCTO_PORTADA` es `{ slug, nombre }`**, escrito a mano y genérico, sin marca: hoy
    «Impresora multifuncional», elegida el 2026-10-16 con el precio corregido y la regla de precio
    de mercado. **Tiene copia literal en `scripts/verificar-produccion.sh`**, que comprueba con una
    sola petición que sigue indexable y pasando el filtro; `portada-ayudantes.test.ts` compara las dos.
  - **El filtro de la banda** (`lecturaPrecio`): ficha indexable; banda de mercado (`de_mercado ===
    true`, que manda la API); unidad declarada; predictibilidad alta o media; `p25 ≥ 1`; `p75 ≥ p25`;
    y periodo legible. **P25 = P75 ya no la oculta** (antes sí): con varios compradores es un precio
    estable, y la frase lo dice. La copia en `verificar-produccion.sh` aplica el mismo filtro: si
    cambia uno, cambia el otro.
  - **Concentración** (`lecturaConcentracion` → `Concentracion`; `GET /publico/mercado`,
    `concentracion`): «5 de cada 10 pesos se gastan en mercados donde un solo proveedor se lleva la
    mitad o más» (los bordes del redondeo con palabras, como en los cierres). Un histograma de diez
    tramos de 10 puntos —cuánto se lleva el proveedor principal de cada mercado, un comprador en un
    rubro—, del alto del **monto** que se compra en ellos (contar mercados exageraba: los chicos salen
    más concentrados por tener pocas compras); en `dato` los tramos de la mitad o más. Globo por tramo
    (monto y mercados). El pie dice cuántos mercados, de qué periodo y cuántos tienen un solo proveedor.
  - **Cierres** (§3.3, `lecturaCierres`): «N de cada 10 Compras Ágiles abiertas cierran hoy o
    mañana» y **una barra de diez celdas con tantas en `dato` como esos décimos** (`decimosDe`, el
    mismo redondeo de la frase), y la tabla de los cuatro tramos con hoy y mañana en negrita. Sin
    hora legible del resumen, no sale (su pie dice de cuándo es: «Contadas el … a las …, hora de
    Chile.», sin el total de abiertas, que la frase de arriba ya dice). Los tramos
    tienen que sumar las abiertas.
  - **La nota** (§3.4, `lecturaNota`): **la más reciente que trae `antes_despues`**
    (`notaDeLaPortada`; si ninguna lo trae, la más reciente), para que tenga gráfico como las
    otras; la lista «Notas de datos» sigue con las cuatro últimas en su orden. Con su resumen y su
    `antes_despues` (`components/notas/AntesDespues.tsx`). Es contenido del repo y está siempre:
    entra cuando falta una de las de datos, y con el backend caído la sección sigue con ella.
- **El pie de método** (`components/metodo/PieDeMetodo.tsx`, V3) va bajo cada lectura —y bajo el
  gráfico de la ficha de producto—: base y periodo en una frase y los enlaces «Cómo se calcula»
  (guía y ancla), «Ver en la API» (`ORIGEN_API_PUBLICA`) y «Código» (`<REPOSITORIO_URL>/blob/main/<ruta>`,
  sólo con repositorio). **Cada método se declara una vez en `lib/metodo.ts` (`METODOS`)** y
  `__tests__/metodo.test.ts` falla si su fichero ya no existe o si la guía o el ancla cambiaron.
  Las anclas son los `id` que `lib/markdown.ts` (`idDeTitulo`) da a cada título de una guía.
- **Lo vivo dice de cuándo es** (`vigenciaDelResumen` en `lib/portada.ts`, con la hora del render
  que `app/page.tsx` lee con `horaDelRender`): si se saltó una corrida del cron frecuente
  (`seSaltoUnaCorrida`, la regla del aviso de `/compra-agil`), la frase de abiertas no dice «Ahora»
  sino «El martes 20 de octubre a las 19:13 se podía postular a…»; si el conteo no es de hoy en
  Chile, la franja dice «Publicadas el mar 20 oct» y «Más publicó ese día»; con cualquiera de las
  dos, la lectura de cierres («cierran hoy o mañana») no sale; y «Lo mejor de hoy» quita las que ya
  cerraron. El 21-10-2026 Railway estuvo caído el día entero y la portada daba el conteo de la tarde
  anterior como de ahora.
- **Cinco piezas vivas, pedidas en paralelo desde el servidor**, y **cada una se oculta sola si el
  backend falla o si un campo que se pinta viene mal formado**, y además, por principio 4 (una cifra
  viva sin hora no se publica): «Lo mejor de hoy» sin `actualizado_en` legible se oculta; el
  resumen sin hora legible oculta las abiertas, la franja **y la lectura de cierres**; el producto, sin
  periodo legible. `pedirParaLaPortada(ruta, validador, bloque, cache)` nunca lanza, y la caché la
  elige quien llama:
  - **lo vivo, media hora y etiqueta `compra-agil`** (la revalida el cron frecuente): el resumen
    (`GET /publico/portada`, `pedirResumenPortada`) —las abiertas, la lectura de cierres y la franja— y
    «Lo mejor de hoy» (`pedirDestacadas`);
  - **lo de analytics, una semana y etiqueta `analytics`** (la revalida el cron semanal): los
    sectores (`GET /bi/sector`, `pedirSectoresPortada`), que ya no son una lectura sino la fila
    «Base» de la ficha, el mercado (`GET /publico/mercado`, `pedirMercadoPortada`, validado por
    `esMercadoPortada`: el gráfico grande y la concentración) y la ficha del producto
    (`pedirProductoPortada`). Con `FEATURE_ANALYTICS` apagada responden 503: la fila «Base», el
    gráfico grande y las lecturas de precio y de concentración no salen.
- **La franja de hoy** (`FranjaPortada`, `franjaDeLaPortada`): publicadas hoy («612 licitaciones y
  Compras Ágiles»: cuenta las dos), el organismo que más publica (por nombre; truncado con `title`) y «Actualizado el» con el día —la portada se cachea—.
  Con 0 publicadas hoy (cada madrugada) las dos primeras celdas se ocultan y la que queda primera
  no lleva sangría. Sin enlace: el catálogo no filtra por fecha de publicación.
- **«Lo mejor de hoy», compacto** (`pedirDestacadas`, `BloqueHoy`): **cinco, con como mucho dos de un
  mismo comprador** (`variadas`, `POR_COMPRADOR_EN_PORTADA`; se piden `DESTACADAS_PEDIDAS` = 15 para poder
  elegir: el 21-10 las cuatro primeras eran de la misma unidad del MOP). Filas con nombre, comprador,
  cierre y monto; **el cierre es la hora en Santiago** («Cierra el 22 oct a las 18:00», `cierreFijo`),
  no «Cierra en 3 h», que envejece con la caché; sin puntaje, sin cocientes y sin la historia de la unidad, que vive en
  `/compra-agil`. `Portada` lee la hora una vez y se la pasa al bloque.
  **Su descripción depende de los datos que tiene al lado** (`descripcionDestacadas(historia_disponible
  === true)`, en la portada, en `/compra-agil` y en el RSS): sin historia por unidad el factor
  comprador vale lo mismo para todas y el orden es sólo tiempo y monto, así que dice «Ordenadas por dos cosas: el
  monto y el tiempo…» y no nombra al comprador. `DESCRIPCION_DESTACADAS` suelta describe el método
  (metadatos, `/acerca`) y no el estado.
- **Notas de datos** (`NotasPortada`): las cuatro últimas, con fecha y título y «Arreglo en curso»
  donde toque, y «Todas las notas». A la derecha (5/12) **la ficha del autor** (`FichaAutor`, §3.6,
  sólo con `AUTOR_NOMBRE`): quién lo hace, `hola@tordo.cl` y `AUTOR_URL` nombrado por su sitio
  (`nombreDelEnlace`). Sin autor, la lista ocupa el ancho. **La autoría no es el responsable legal**,
  y la portada nunca enseña el `[[hueco]]` de los documentos legales.
- **Ninguna lanza**, tampoco con un 200 mal formado: cada validador mira los campos que su bloque
  lee y su tipo. Con el backend caído la portada sale con el buscador, la ficha, la lectura de la
  nota y las notas (`__tests__/portada.test.tsx`).
- **Sin «Inteligencia»** en la portada, los metadatos (`openGraph` y `twitter` incluidos) ni la
  tarjeta de vista previa (R10): `__tests__/r10-sin-inteligencia.test.ts`.
- `e2e/portada.spec.ts` mide la portada a 320, 390, 1024 y 1440 px sin desborde y la captura en
  claro y oscuro; a 1024 y 1440, el `h1` en tres líneas como mucho, «Para empezar» en fila (misma
  altura, una al lado de otra) y, si está, el gráfico grande a la derecha del buscador y a su altura;
  a 1440×900, la primera conclusión de datos y su gráfico sobre el pliegue; a 390×844, la primera
  conclusión sobre el pliegue; y que el globo sale al pasar el mouse y se va al salir. El fixture
  del E2E trae tres meses de `time_series` (sin gráfico grande), la concentración, los cierres y la
  nota; el gráfico grande y la de precio se prueban en Vitest.

**La ficha de producto** (`/productos/[slug]`) abre con **«Cuánto se pagó»**: el mismo gráfico de
precio, con su pie de método (spec PORTADA_V7 §6), `precioDeBanda` sobre la unidad con más compras,
titulada con `tituloDeBanda`, sin el filtro de la portada —una banda de un solo comprador dice «todas
las compras son de {comprador}»—; debajo, sus cifras (`CifrasBanda`: mediana, la mitad de las compras,
8 de cada 10 compras y cuántas compras; bajo la mitad de las compras, cuánto se separan sus extremos
con la cifra, `textoDiferencia` —«De un extremo al otro, 1,9 veces», «Casi el mismo precio»—, sin
insignias de color; antes un adjetivo, «Precios algo distintos entre sí»). Con más de
una unidad, una tabla (`TablaUnidades`). Ya no hay tarjeta de P10…P90 encima del gráfico: la ficha
decía la mitad de las compras tres veces. Las tablas de las fichas (`TablaEnlaces`) van con filetes y sin caja.
**Un solo ancho, el de lectura** (`max-w-3xl` en el `<article>`): el gráfico medía ~680 px y las tablas
~1.090, y cada sección terminaba en otro sitio. `/buscar` hace lo mismo con la página entera.
**Las dos tablas se apilan bajo `sm`**, como `TablaCostos`: `TablaUnidades` pone la unidad y su mediana
en una línea y las demás cifras debajo, cada una con su nombre; `TablaEnlaces`, el nombre en su línea y
las celdas debajo con su encabezado delante (los de arriba quedan para el lector de pantalla, y los
roles de tabla van explícitos porque cambia el `display`). A 390 px la de unidades se desplazaba de lado
y escondía columnas, y la de compradores ocultaba la unidad y tocaba el borde. **«Quién lo compra» no
cuenta compradores** (`descripcionCompradores`): la tabla mezcla unidades y se corta en diez, y «Son 7 de
204: los demás lo compraron una o dos veces» la contradecía; con la lista de L0 dice sólo el corte (3
compras o más en una misma unidad).

**`/productos` sin búsqueda** enlaza, bajo los ejemplos, la búsqueda de las seis cosas de la
escalera (`PRODUCTOS_ESCALERA`, «Lo que compra todo el Estado»): **a su búsqueda, no a su ficha** —una
ficha escrita a mano puede dejar de ser indexable, y en el fixture del E2E no existe—, sin cifras ni
`prefetch`, que pinta la página de servidor y el buscador coloca (`inicio`): no piden nada al backend.

**La ficha de una licitación** (`/licitaciones/[codigo]`) **siempre sale a Mercado Público**, que es
donde se postula: «Abrir en Mercado Público» es su acción principal (`btn-primary`, primera). La URL
del dato (`url_licitacion`, filtrada por `urlDeMercadoPublico`) casi nunca viene, así que se arma del
código: la Compra Ágil, con el buscador (`urlMercadoPublico`); una licitación, con
`urlLicitacionMercadoPublico` (`…/RFB/DetailsAcquisition.aspx?idlicitacion=<código>`, que el portal
redirige a su ficha; comprobado el 2026-10-22). El comprador enlaza a su ficha (`rutaComprador`) sólo
si el panel de BI lo conoce (`comprador` o `competidores` disponibles): sin historia, la ficha sería un
404. La descripción va en tipo oración si llega toda en mayúsculas (`tipoOracion`). En el panel
(`BIPanelSection`): sin plazo no hay sección «El plazo»; los proveedores pasan por `normalizeText`; y
cada fila de precios dice qué es su código —el nombre que traen los ítems (`nombresDeCategorias`, el
panel sólo trae el código) y «Categoría ONU 53102706»—, con P25 = P75 en un solo precio (`rango`). El
título de la ficha lleva el sufijo del sitio porque `licitaciones/layout.tsx` declara `template`: Next
sólo pasa a los hijos la plantilla del segmento de arriba, y un título de texto plano la borraba.

**Cómo compra un comprador** (`BuyerProfilePanel`, en su ficha y en cada licitación; las reglas en
`lib/comprador.ts`): la nota enlaza a «Cómo se calcula» (`METODO_COMPRADOR`, la sección «La nota como
comprador» de la guía `como-leer-un-comprador`, con los siete pesos de `buyer_scoring.py`); «Calculado
con» sólo sale con base (el panel de licitación no la trae). **Un trato directo de 0 exacto no se
muestra** (`textoTratoDirecto`): hasta #61 (2026-10-21) era 0 para todo comprador, y lo materializado
antes de la semanal siguiente sigue diciéndolo; se puede volver a mostrar cuando no quede ninguna tabla
anterior. **Ojo**: ese 0 también inflaba la nota (el trato directo pesa 25 %) hasta esa semanal. Las
ofertas por licitación sobre `MAXIMO_OFERTAS_CREIBLE` (50) no salen («299,4» en producción: la media
de `NumeroOferentes`, arrastrada por pocas licitaciones). En la ficha, la cuota del proveedor
principal de Compra Ágil va en una frase (`fraseProveedorPrincipal`: «El proveedor principal se lleva
el 2% de sus órdenes por Compra Ágil.»), y el enlace final dice «de todos los compradores»:
`/compra-agil` no filtra por comprador, y las suyas ya están arriba.

**Acerca** (`/acerca`, `app/(publico)/acerca/`): lo que la portada dejó de explicar —qué es, de
dónde salen los datos, cómo se financia— y las preguntas frecuentes (`PREGUNTAS`, en
`lib/acerca.ts`). Indexable, en `PAGINAS_FIJAS`, enlazada desde el pie junto a las licencias y
el contacto (no es una sección de la navegación). Las preguntas son `<details>` sin caja, entre
filetes, con el `<summary>` de 44 px como mínimo; «Quién lo hace» es su propia sección y sólo sale
con `AUTOR_NOMBRE`: el nombre enlaza a `AUTOR_URL` si está, señala las notas de datos como su
trabajo y, con `REPOSITORIO_URL`, enlaza al código.

**El texto corrido de las páginas de lectura va a 16 px y en `text`** (`text-base leading-relaxed
text-text`): `/acerca`, `/apoyar`, `/abierto` y el cuerpo de guías y notas (`components/guias/Markdown.tsx`).
Era `text-sm text-muted`, que se leía como nota al pie. Lo secundario sigue chico: el subtítulo de
la cabecera, la letra chica, los pasos de instalación, las celdas de tabla y las fuentes.

**Guías** (`/guias`, `/guias/[slug]`): el contenido vive en `frontend/content/explicativos/*.mdx`
(Markdown plano; el test de frontmatter prohíbe `{` y `<`) y se publica en **`/guias/`** — los
enlaces internos ya apuntan ahí. Se renderiza con `lib/markdown.ts`, sin `@next/mdx`: el
contenido no usa JSX y cinco dependencias para eso no valen la pena. Si una guía necesita algo
que el parser no soporta, se amplía el parser con su test. **El índice va en orden de lectura**
(`ORDEN_GUIAS` en `lib/guias.ts`: los datos y las cuatro formas de comprar primero), no por título,
y una guía nueva hace fallar `guias.test.tsx` hasta tener su lugar; la fecha sale una vez, la de la
última revisada (`ultimaActualizacion`). `guias.test.tsx` comprueba que cada
enlace interno de cada guía resuelve. **Cada título lleva un `id`** (`idDeTitulo`: minúsculas, sin
tildes ni signos), que es el ancla de los «Cómo se calcula»: renombrar un título rompe su ancla, y
`metodo.test.ts` lo dice. El texto dice «TORDO» y se sustituye por `APP_NAME` al
pintar.

**Notas de datos** (`/notas`, `/notas/[slug]`, `/rss/notas`; spec `docs/PORTADA_V7_Y_NOTAS_2026-10.md`
§5): hallazgos medidos sobre los datos —qué vimos, cómo lo medimos, qué cambió y lo que todavía no
sabemos—, en `frontend/content/notas/*.mdx`, con el mismo parser que las guías (`lib/notas.ts`
sobre `lib/markdown.ts`). El slug es el nombre del archivo. Estáticas (`generateStaticParams`,
`dynamicParams = false`), indexables (`PAGINAS_FIJAS` y el sitemap, como las guías) y con su feed,
que lee del disco (`content/notas` va en la traza del sitemap y de `/rss/notas`, `next.config.js`).
«Notas» es la última sección de la navegación.
- **Cada cifra cita un fragmento literal del repo.** `fuentes` es una lista de `ruta: «fragmento»`
  y `__tests__/notas-frontmatter.test.ts` comprueba que el fragmento sigue en ese fichero (sin `**`,
  sin `>` de cita y con los espacios colapsados), y que **toda cifra de «En corto» está en algún
  fragmento**. Si corriges una cifra en `CLAUDE.md` o en un doc que una nota cita, corrige la nota
  en el mismo PR. Nada de rutas del scratchpad ni de informes fuera del repo.
- **`estado: arreglado` exige `cambio`**, y `cambio` sólo puede ser un PR de este repo público
  (`…/cris-middleton/tordo/pull/N`). Lo arreglado antes del 2026-10-15 vive en `saas#N`, que no se
  enlaza: esas notas van como `medido` y cuentan el arreglo en el texto, con la fecha del commit.
  `script`, si está, tiene que existir en el repo; se enlaza a `<REPOSITORIO_URL>/blob/main/<ruta>`
  sólo con `REPOSITORIO_URL`, y entonces el cuerpo lleva «Reprodúcelo».
- **Secciones fijas, en orden**: «En corto» (tres viñetas), «Qué vimos», «Cómo lo medimos», «Qué
  cambió», «Lo que todavía no sabemos» y, con `script`, «Reprodúcelo». `antes_despues` se pinta
  justo bajo «Qué cambió» (`components/notas/AntesDespues.tsx`).
- **Desde `lg`, la nota va en dos columnas**: la de lectura (el texto sigue a 58ch) y un costado
  (`<aside>` «Sobre esta nota», `sticky` a 32 px y alineado con el `h1`) con el antes y el después
  —se ve sin bajar—, «En esta nota» (un enlace por `##` más «Fuentes», con los `id` de
  `idDeTitulo` vía `indiceDeNota`) y los datos: estado, con qué datos, el PR (`numeroDeCambio`) y
  el script. Bajo `lg` el costado es `hidden` y esas piezas van donde siempre (los datos bajo el
  título, el gráfico bajo «Qué cambió», «El cambio» y «El script» al final), con `lg:hidden`: están
  dos veces en el HTML y se ve **una** en cada ancho; lo que está en `display: none` tampoco lo lee
  un lector de pantalla. `__tests__/notas.test.tsx` y `e2e/notas.spec.ts` lo fijan. `/notas` va en
  dos columnas desde `lg`, con las barras del antes y el después en la nota que las trae.
- **La firma** («La escribe {nombre}.») sale de `AUTOR_NOMBRE` (`lib/autor.ts`, servidor, en el
  build) y sin ella no hay línea; `AUTOR_URL` (sólo `https://`) enlaza el nombre.
- Ninguna nota nombra a un proveedor persona natural ni promete trabajo que no esté en un PR
  abierto. `voz-textos.test.ts` las revisa enteras.

**Apoyar** (`/apoyar`): tres enlaces, sin integración (spec §4.2), desde variables de
SERVIDOR — `DONAR_MERCADO_PAGO_URL`, `DONAR_GITHUB_SPONSORS_URL` (https) y `DONAR_TRANSFERENCIA`
(texto). **Los datos de transferencia no van en el HTML**: se piden con un clic a
`GET /api/apoyar/transferencia` (`no-store`, `noindex`), y `check:secreto` busca su centinela
en el bundle. Un medio sin variable no se muestra. **Vercel Web Analytics** es el script
oficial, sin dependencia, sólo cuando `VERCEL=1`.

**El costo, por concepto** (`/apoyar#costos`): la tabla sale de `lib/costos.ts`, y **cada cifra
cita un fragmento literal de un documento del repo** (este archivo, `docs/DESPLIEGUE.md`, la spec
del pivote). `__tests__/costos.test.ts` falla si el fragmento deja de estar o no contiene la
cifra: **si corriges un costo en docs/, corrige la tabla en el mismo PR**. Las filas de uso de
Railway son **medidas** (*Usage*, 2026-10-15, `docs/DESPLIEGUE.md` §13.2, con su método y sus
límites: 1,95 días, con los reinicios por OOM y la primera semanal dentro); lo que no tiene
medición se rotula «Estimado» (hoy, el dominio). El total es una **proyección, ~US$30–31**
(`COSTO_MENSUAL_APROXIMADO`), no una factura y no los US$5 de antes: el plan Hobby de Railway
cuesta US$5 e incluye US$5 de uso, así que se paga el mayor de los dos —el uso medido, ~US$9–10—
más Vercel Pro (US$20, desde el 2026-10-20) y el dominio (~US$1). Se repite al cerrar el primer periodo de facturación (2026-11-13). `/acerca`
y `/apoyar` lo leen de ahí (la prosa de `/apoyar` sale de las mismas constantes). «Cuánto cuesta» está en el pie. En `/apoyar` los medios de aporte van antes que el costo (con la tabla
delante, el botón quedaba a 3,5 pantallas en un teléfono), y el total sale dos veces: en la entrada
y en la fila «Total». La tabla es una sola en los dos anchos (`components/apoyar/TablaCostos.tsx`):
desde `sm`, tres columnas con filetes y sin caja; por debajo, cada fila pone concepto y monto en una
línea y «Cómo se sabe» debajo, con los roles de tabla explícitos porque cambia su `display`. **Ocupa la
columna entera** (`max-w-none` le gana al tope de 31 rem de `.lectura`) y «Cómo se sabe» se lleva el
60 %. Bajo los botones, una frase («Un aporte es una donación: quien aporta ve el mismo sitio que
cualquiera.») y el enlace a los términos, que dicen el resto: eran cuatro líneas de negaciones.

**Abierto** (`/abierto`): API, MCP con una fila de instalación por cliente (una lista con filetes;
en rejilla de dos, la quinta caja quedaba sola), CSV y RSS, código y
licencias (código AGPL-3.0 o posterior, `AGPL-3.0-or-later`; lo que el sitio calcula, CC BY 4.0; el catálogo, condiciones de
ChileCompra — los términos §4 y §7 lo dicen igual). **Cada fragmento (`Codigo`, `components/abierto/Bloques.tsx`) lleva un botón «Copiar»** (`BotonCopiar`,
la única isla de la página: `navigator.clipboard`, «Copiado» anunciado con `aria-live`, «Cópialo a
mano» sin permiso), parte las líneas largas en vez de desplazarse y ocupa el ancho de su columna. Las
descripciones de las herramientas empiezan en minúscula: van tras «nombre:». **La dirección pública de la API vive sólo en
`lib/abierto.ts`** (`ORIGEN_API_PUBLICA`, test que lo exige): no es `API_URL`, que es a dónde
habla el proxy. **La URL del MCP se publica siempre con barra final.** Las cuatro herramientas
están copiadas a mano y `backend/tests/test_mcp.py` las compara con el `tools/list` real.
«Código» sólo aparece con `REPOSITORIO_URL` (servidor, en el build, sólo `https://`;
`lib/repositorio.ts`). **Sin botones ni *badges* de terceros**: meterían peticiones que la
política de privacidad no declara; el E2E (`e2e/abierto.spec.ts`) falla si el navegador pide algo
fuera del sitio.
