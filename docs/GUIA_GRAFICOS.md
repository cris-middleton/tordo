# Guía de gráficos

Léela antes de tocar un gráfico o de dibujar uno nuevo: `components/precio/GraficoPrecio.tsx` (con
su geometría en `lib/graficoPrecio.ts`), `components/notas/AntesDespues.tsx`,
`components/portada/BarraCierres.tsx` y `components/publico/BandaPrecio.tsx`.

Las reglas salen de cuatro guías públicas (al final, con su URL) y de lo que el sitio ya decidió en
la portada v7 (`PORTADA_V7_Y_NOTAS_2026-10.md` §3.2–§3.4). Hay dos clases:

- **Regla**: la fija un test, y un cambio que la rompe no pasa CI.
- **Criterio**: se revisa leyendo el gráfico, en claro y en oscuro, a 1440 y a 390 px.

## Cómo es un gráfico de este sitio

Un gráfico responde una pregunta y la respuesta va arriba, escrita. Debajo, el dibujo, sin leyenda:
cada cosa lleva su nombre al lado. Al pie, de dónde sale y cómo se calcula (`PieDeMetodo`). El
dibujo es un SVG o unas cajas de servidor, `aria-hidden`; los valores van en texto, para quien no ve
el dibujo y para el buscador. El color se gasta en una sola cosa: lo que nombra la conclusión va en
`dato` y el resto en `dato-tenue`.

## Reglas (las fija un test)

| # | regla | por qué | test |
|---|---|---|---|
| R1 | **Todo fichero que dibuja datos está declarado**: en `PROPIOS` (sigue esta guía), en `DEUDA` o en `NO_SON_GRAFICOS`, con su motivo. Se detecta por un `<svg>`, una marca en `dato-tenue`, Recharts o una geometría en línea (`width: \`${…}%\``). La deuda sólo encoge. | Un gráfico nuevo tiene que pasar por alguien que decida si cumple esto. | `guia-graficos.test.tsx` |
| R2 | **Un gráfico propio pinta con `dato`, `dato-tenue` y tintas neutras** (`text`, `muted`, `subtle`, `border`, `surface`). Ni un hex, ni `accent`, ni `primary`, ni un color por categoría. | Resaltar con un color y dejar el resto en gris (Datawrapper); usar el color para destacar algo y no para decorar (RSS). Teal es acción y verde es «bueno»: en un gráfico se leerían como tales. | `guia-graficos.test.tsx` |
| R3 | **Sin adornos**: ni degradados, ni sombras, ni filtros, ni animaciones. | Todo lo que no añade información sobra; el dato es el protagonista (RSS). | `guia-graficos.test.tsx` |
| R4 | **Sin leyenda**: la etiqueta va junto a lo que nombra («la mitad central», «hoy o mañana»). | Etiquetar directo y omitir la leyenda cuando se pueda (Urban, Datawrapper). | `guia-graficos.test.tsx` (prohíbe `Legend`) |
| R5 | **Ningún texto bajo 12 px**, dentro y fuera de los gráficos. | 12 como mínimo en la web (RSS); «más de 12 px» (Datawrapper). Urban deja la fuente y las notas en 11: aquí no, porque el pie de método es parte de la lectura. | `guia-graficos.test.tsx`, `texto-minimo.test.ts` |
| R6 | **El dibujo es `aria-hidden` y los valores van en texto**: cada marca en `dato` o `dato-tenue` cuelga de un `aria-hidden`; el gráfico que no escribe sus valores (`GraficoPrecio`, `BarraCierres`) los tiene al lado, en una lista `sr-only` o en una tabla. | El texto alternativo describe el contenido y la función (Urban, RSS). Una lista de cifras se lee mejor que un `aria-label` de 300 caracteres, y la indexa el buscador. | `guia-graficos.test.tsx` |
| R7 | **La escala logarítmica se declara en el propio gráfico** («escala logarítmica», bajo el eje). | Se usa para comparar razones (RSS), y quien no lo sabe lee mal las distancias. | `guia-graficos.test.tsx` |
| R8 | **Cifras y fechas en `es-CL`**. | «29,586» y «16 Oct 26» llegaron a producción. | `formatos-es-cl.test.ts` |
| R9 | **Contraste medido**: cada tinta sobre cada superficie, en los dos temas. `dato-tenue` es decorativo y nunca lleva texto encima: el valor va al lado. | 3:1 para elementos gráficos y 4,5:1 para texto (WCAG, citado por Datawrapper y Urban). | `contraste-wcag.test.ts` |
| R10 | **Un token en un estilo en línea va dentro de `rgb()`**: los tokens son tripletes («84 99 122») y `var(--color-x)` a secas no es un color. | El tooltip de `PriceBandChart` salía sin fondo por eso. | `guia-graficos.test.tsx` |
| R11 | **Recharts sólo vive en la deuda.** Un gráfico nuevo se dibuja en SVG o en cajas de servidor. | Dibuja en el cliente, trae sus propios colores y no llega en el HTML que lee el buscador. | `guia-graficos.test.tsx` |

## Criterios (se revisan leyendo)

**El titular es la conclusión**: «Impresora multifuncional: la mitad se pagó entre $150.921 y
$240.000». Va primero lo que hay que llevarse y el método queda para el pie (Datawrapper). En el
titular, palabras de todos los días: «la mitad central» en vez de «P25–P75».

**La forma sale de la relación que muestra el dato** (FT, *Visual Vocabulary*):

| relación | forma aquí | dónde |
|---|---|---|
| distribución | una franja con un punto por comprador (*dot strip*) | `GraficoPrecio` |
| distribución, resumida | una barra P10–P90 con la mitad central y la mediana | `BandaPrecio` |
| magnitud | barras horizontales con el valor escrito al lado | `AntesDespues` |
| parte de un todo | diez celdas (*gridplot*), una por décimo | `BarraCierres` |

Si una pregunta nueva no cabe en la tabla, mira el *Visual Vocabulary* antes de inventar una forma.

**Las barras empiezan en cero.** Una barra se lee por su largo, y un eje cortado exagera
diferencias chicas (Urban, RSS). Los puntos y las franjas pueden no empezar en cero, y en escala
logarítmica no hay cero.

**Una línea de fuente y método en cada figura.** La base y el periodo en una frase («46 compras de 40
compradores, nov 2025 a oct 2026») y los enlaces a cómo se calcula, a la API y al código
(`PieDeMetodo`). Urban pide una línea de fuente en cada figura; aquí dice además cuántos datos hay
detrás, porque un precio de un solo comprador es el de su contrato.

**La unidad se dice una vez**, en el titular o en el eje, no en cada rótulo (Urban).

**Pocas cosas a la vez.** Menos de siete categorías (Urban) y tres o cuatro anotaciones como mucho
(RSS). Los rótulos no se pisan nunca (RSS): `lib/graficoPrecio.ts` lo decide al ancho más estrecho
en que se pinta (280 px).

**La precisión justa.** «$151 mil» en el eje y «$150.921» en el texto (Datawrapper, RSS). Nada de
decimales que nadie va a recordar.

**Una tabla cuando hay pocas cifras y la precisión importa** (RSS): los cuatro tramos de cierre van
en una tabla bajo las diez celdas, con hoy y mañana en negrita.

**Los rótulos no se giran.** Si no caben, se acortan o se cambia la forma (Datawrapper).

**El color nunca es la única señal** (RSS). La conclusión escribe el valor que el color destaca.

**Jerarquía del texto.** La conclusión en `text` y negrita; rótulos, ejes y pie en `muted`; dos
tamaños como mucho dentro del gráfico (Datawrapper). Alineado a la izquierda.

**En oscuro también.** Los tokens se invierten solos (`dato` pasa del azul del cuerpo del pájaro al
turquesa del ala). Mira la captura en los dos temas: un `dato-tenue` que se pierde en el fondo es un
dato que desaparece (Datawrapper).

## Deuda

Lo que dibuja datos y todavía no sigue esta guía. Está también en `DEUDA`, dentro de
`__tests__/guia-graficos.test.tsx`; quien arregle uno lo pasa a `PROPIOS` en el mismo PR.

| fichero | qué falla |
|---|---|
| `app/(panel)/mercado/components/CompetenciaSection.tsx` | Recharts, hex fijos, una paleta categórica de seis colores |
| `app/(panel)/mercado/components/EstacionalidadSection.tsx` | Recharts, hex fijos y un degradado bajo la curva |
| `app/(panel)/mercado/components/TendenciasSection.tsx` | Recharts, hex fijos; verde y rojo por signo |
| `app/(panel)/mercado/components/TrendChart.tsx` | Recharts, hex fijos |
| `app/(panel)/mercado/components/OportunidadesSection.tsx` | barra de puntaje en semáforo (`accent`, `gold`, `danger`) |
| `components/bi/PanoramaRubro.tsx` | barras de estacionalidad en `accent` y `primary` |
| `components/PriceBandChart.tsx` | Recharts: cinco barras P10–P90 desde cero, que comparan alturas cuando lo que importa es dónde cae cada precio. Ya pinta con tokens. |
| `components/CompetitorsList.tsx` | barra de cuota en `primary` |
| `components/OpportunityScoreCard.tsx` | barras de componentes en `primary` |

Los de `/mercado` usan además `fontSize` de 10 y 11 en los ejes y no se ven bien en tema oscuro
(los hex no se invierten). Se reescriben en SVG de servidor cuando se rehaga esa pantalla, no antes.

## Un gráfico nuevo, paso a paso

1. Escribe la conclusión primero. Si no sale en una frase, el gráfico todavía no tiene pregunta.
2. Elige la forma por la relación (tabla de arriba).
3. Dibújalo en un componente propio: SVG o cajas, `aria-hidden`, sin `viewBox` si los puntos tienen
   que seguir redondos a cualquier ancho (como `GraficoPrecio`). La geometría va en `lib/`, con su
   test.
4. `dato` para lo que nombra la conclusión, `dato-tenue` para el resto, tintas neutras para ejes y
   rótulos.
5. Los valores en texto al lado, y el pie de método debajo (declara el método en `lib/metodo.ts`).
6. Decláralo en `PROPIOS` con un ejemplo, y corre `npx vitest run __tests__/guia-graficos.test.tsx`.
7. Mira las capturas en claro y oscuro, a 1440 y 390, y corre `make diseno URL="http://localhost:3000/…"`
   sobre la página.

## Fuentes

- Lisa Charlotte Muth, «A detailed guide to colors in data vis style guides», Datawrapper, 2022-03-30:
  <https://www.datawrapper.de/blog/colors-for-data-vis-style-guides>. Resaltar con un color y atenuar el
  resto; grises para el contexto, para la grilla y para el texto secundario; 3:1 para los elementos
  gráficos.
- Lisa Charlotte Muth, «What to consider when using text in data visualizations», Datawrapper,
  2022-09-28: <https://www.datawrapper.de/blog/text-in-data-visualizations>. El titular es la
  conclusión; etiquetas directas; texto de más de 12 px; sin rotar rótulos; precisión justa.
- Urban Institute, *Data Visualization Style Guide*, actualizada el 2025-08-27:
  <https://urbaninstitute.github.io/graphics-styleguide/>. Etiquetar directo y omitir la leyenda;
  barras desde cero; la unidad una vez; una línea de fuente en cada figura; menos de siete categorías;
  texto alternativo de menos de 160 caracteres.
- Andreas Krause y Nicola Rennie, *Best Practices for Data Visualisation*, Royal Statistical Society,
  2024: <https://royal-statistical-society.github.io/datavisguide/> (en especial
  [principios](https://royal-statistical-society.github.io/datavisguide/docs/principles.html) y
  [estilo y accesibilidad](https://royal-statistical-society.github.io/datavisguide/docs/styling.html)).
  Sin adornos; ejes desde cero salvo motivo; escala logarítmica para razones; rótulos que no se pisan;
  12 pt como mínimo; el color para destacar.
- Financial Times Visual Journalism Team, *Visual Vocabulary*:
  <https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary>. La forma según la
  relación que muestra el dato.

El detector de señales de plantilla (`make diseno`, Impeccable) complementa esta guía en lo que no es
gráfico: bordes laterales gruesos, texto chico, líneas demasiado largas.
