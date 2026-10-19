/**
 * La geometría del gráfico de precio (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3.2,
 * V7): un punto por comprador en su mediana, sobre la franja P25–P75, en escala
 * logarítmica. Lo pinta `components/precio/GraficoPrecio.tsx` en la portada y en
 * la ficha de producto; aquí sólo se calcula, con funciones puras que fija
 * `__tests__/grafico-precio.test.ts`.
 *
 * **Las posiciones horizontales van en % y las verticales en px.** El SVG mide el
 * ancho de su columna y no lleva `viewBox`: así un punto es redondo y un rótulo
 * mide 12 px a cualquier ancho. Lo que no se puede saber en el servidor es ese
 * ancho, así que todo lo que depende de él —si dos puntos coinciden, si dos
 * rótulos se pisan, si un rótulo se sale— se decide al ancho más estrecho en que
 * se pinta (`ANCHO_REFERENCIA`). Más ancho, las distancias crecen y los rótulos
 * no: nada que no se pisara empieza a pisarse.
 *
 * **Escala logarítmica**: los precios del Estado tienen cola larga, y en escala
 * lineal la mitad central de los productos baratos se aplastaba contra el borde.
 * Dos marcas de contexto en valores redondos (1, 2 o 5 por una potencia de 10)
 * dicen dónde está el resto.
 */

import type { BandaUnidad, CompradorDeProducto } from '@/types/publico';

import { decimal } from './formato';
import { unidadDeclarada } from './publico';

/**
 * El ancho más estrecho del gráfico, en px. Va en la primera columna de la banda:
 * a 1024 px mide ~296, y a 320 px de pantalla, 288. En la ficha de producto, más.
 */
export const ANCHO_REFERENCIA = 280;

/** Radio de un punto, en px. */
export const RADIO_PUNTO = 8;

/** Distancia entre centros de dos puntos que no se tocan, en px. */
export const PASO_PUNTOS = 2 * RADIO_PUNTO + 1;

/**
 * Ancho de un carácter de rótulo a 12 px, en px. Medido con Archivo en negrita,
 * «$151 mil» ocupa ~6,3 px por carácter (los espacios y la «i» compensan las
 * cifras): sobra un poco y nunca falta.
 */
export const ANCHO_CARACTER = 6.6;

/**
 * Con menos compradores dibujables que esto, no se dibuja ninguno: dos o tres
 * puntos sobre una franja hecha con 60 compradores se leen como «estos son los
 * compradores», y son sólo los que la API alcanzó a traer. La franja y la línea
 * fina dicen lo mismo sin mentir por omisión. (Con un solo comprador sí: el punto
 * ES todas las compras.)
 */
export const MINIMO_PUNTOS = 5;

/** Aire mínimo entre dos rótulos, en px. */
const AIRE_ROTULOS = 6;

/**
 * Una marca de contexto queda, como mínimo, a este factor de P25 o de P75: más
 * cerca no se distingue de la franja ni deja sitio a su rótulo. El dominio se
 * estira hasta incluirla.
 */
const FACTOR_CONTEXTO = 2;

export type Ancla = 'start' | 'middle' | 'end';

export interface PuntoPrecio {
  /** Posición horizontal, en % con un decimal. */
  x: number;
  /**
   * Fila del punto: 0 en el eje, y si coincide con otro se apila alternando
   * arriba (negativa) y abajo (positiva): 0, -1, 1, -2, 2…
   */
  fila: number;
}

export interface MarcaEje {
  /** Dónde va la marca del eje, en %. */
  x: number;
  texto: string;
  /** P25 y P75 en negrita; las de contexto, en `muted`. */
  fuerte: boolean;
  /** Dónde va el rótulo (en %) y de qué lado se ancla: puede no estar sobre su marca si no cabía. */
  xTexto: number;
  ancla: Ancla;
}

export interface GraficoPrecio {
  /** La mitad central. `null` con un solo comprador: no hay franja que comparar. Si desde = hasta, es una línea. */
  franja: { desde: number; hasta: number } | null;
  /** De P10 a P90, la línea fina: 8 de cada 10 compras. `null` sin P10 o P90, o con un solo comprador. */
  bigotes: { desde: number; hasta: number } | null;
  /** La mediana (P50), una marca sobre la franja. `null` sin P50 o con un solo comprador (el punto ya lo es). */
  mediana: number | null;
  puntos: PuntoPrecio[];
  /** La fila más alejada del eje (0 si ningún punto se apila): da el alto del gráfico. */
  filas: number;
  marcas: MarcaEje[];
  /** «la mitad central», encima de la franja: dónde y de qué lado se ancla. `null` sin franja. */
  rotuloFranja: { xTexto: number; ancla: Ancla } | null;
}

/** La etiqueta directa de la franja (sin leyenda: spec §3.2). */
export const ROTULO_FRANJA = 'la mitad central';

const unDecimal = (x: number) => Math.round(x * 10) / 10;

/**
 * Un precio corto para el eje: «$850», «$4,2 mil», «$151 mil», «$1,2 millones».
 * La cifra exacta va en la conclusión; el eje sólo tiene que ubicar.
 */
export function plataCorta(clp: number): string {
  // Bajo 10, un decimal (sin «,0»); desde 10, entero.
  const corta = (v: number) => (v < 9.95 ? decimal(Math.round(v * 10) / 10, 1).replace(/,0$/, '') : decimal(Math.round(v), 0));
  if (clp < 999.5) return `$${decimal(Math.round(clp), 0)}`;
  if (clp < 999_500) return `$${corta(clp / 1000)} mil`;
  const millones = corta(clp / 1e6);
  return `$${millones} ${millones === '1' ? 'millón' : 'millones'}`;
}

/** Valores redondos (1, 2 y 5 por una potencia de 10) entre `desde` y `hasta`. */
export function valoresRedondos(desde: number, hasta: number): number[] {
  const salida: number[] = [];
  for (let e = Math.floor(Math.log10(desde)) - 1; e <= Math.ceil(Math.log10(hasta)) + 1; e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= desde && v <= hasta) salida.push(v);
    }
  }
  return salida;
}

/**
 * La fila de cada punto, en el orden en que llegan: el primero que cabe en la
 * secuencia 0, -1, 1, -2, 2… sin tocar a otro de su fila (al ancho de referencia).
 */
export function filasDePuntos(xs: number[], ancho = ANCHO_REFERENCIA): number[] {
  const ocupadas = new Map<number, number[]>();
  return xs.map((x) => {
    const px = (x / 100) * ancho;
    for (let i = 0; ; i++) {
      const fila = i === 0 ? 0 : i % 2 ? -Math.ceil(i / 2) : Math.ceil(i / 2);
      const enFila = ocupadas.get(fila) ?? [];
      if (enFila.every((otro) => Math.abs(otro - px) >= PASO_PUNTOS)) {
        ocupadas.set(fila, [...enFila, px]);
        return fila;
      }
    }
  });
}

interface Caja {
  izquierda: number;
  derecha: number;
}

const anchoDeRotulo = (texto: string) => [...texto].length * ANCHO_CARACTER;

/** La caja de un rótulo en px y su ancla, sin salirse del gráfico. */
function rotulo(x: number, texto: string, ancho: number, ancla: Ancla = 'middle'): { caja: Caja; xTexto: number; ancla: Ancla } {
  const px = (x / 100) * ancho;
  const w = anchoDeRotulo(texto);
  const caja =
    ancla === 'start' ? { izquierda: px, derecha: px + w } : ancla === 'end' ? { izquierda: px - w, derecha: px } : { izquierda: px - w / 2, derecha: px + w / 2 };
  if (caja.izquierda < 0) return { caja: { izquierda: 0, derecha: w }, xTexto: 0, ancla: 'start' };
  if (caja.derecha > ancho) return { caja: { izquierda: ancho - w, derecha: ancho }, xTexto: 100, ancla: 'end' };
  return { caja, xTexto: x, ancla };
}

const sePisan = (a: Caja, b: Caja) => a.izquierda < b.derecha + AIRE_ROTULOS && b.izquierda < a.derecha + AIRE_ROTULOS;

/**
 * Los rótulos fuertes (P25 y P75, o el único valor): centrados en su marca; si
 * se pisan, hacia fuera de la franja el que haga falta; y si aun así, uno solo con los dos.
 */
function marcasFuertes(x25: number, x75: number, t25: string, t75: string, ancho: number): MarcaEje[] {
  if (t25 === t75) {
    const r = rotulo(x25, t25, ancho);
    return [{ x: x25, texto: t25, fuerte: true, xTexto: r.xTexto, ancla: r.ancla }];
  }
  // Centrados si caben; si no, el que estorba se aparta hacia fuera de la franja.
  for (const [a25, a75] of [
    ['middle', 'middle'],
    ['end', 'middle'],
    ['middle', 'start'],
    ['end', 'start'],
  ] as const) {
    const r25 = rotulo(x25, t25, ancho, a25);
    const r75 = rotulo(x75, t75, ancho, a75);
    if (!sePisan(r25.caja, r75.caja)) {
      return [
        { x: x25, texto: t25, fuerte: true, xTexto: r25.xTexto, ancla: r25.ancla },
        { x: x75, texto: t75, fuerte: true, xTexto: r75.xTexto, ancla: r75.ancla },
      ];
    }
  }
  const juntos = `${t25} – ${t75}`;
  const centro = unDecimal((x25 + x75) / 2);
  const r = rotulo(centro, juntos, ancho);
  // Las dos marcas del eje siguen en su sitio; el rótulo, uno solo. El segundo va sin texto.
  return [
    { x: x25, texto: juntos, fuerte: true, xTexto: r.xTexto, ancla: r.ancla },
    { x: x75, texto: '', fuerte: true, xTexto: x75, ancla: 'middle' },
  ];
}

/** Las cajas que ya ocupan los rótulos, para no pisarlas. */
function cajasDe(marcas: MarcaEje[], ancho: number): Caja[] {
  return marcas
    .filter((m) => m.texto)
    .map((m) => {
      const px = (m.xTexto / 100) * ancho;
      const w = anchoDeRotulo(m.texto);
      return m.ancla === 'start' ? { izquierda: px, derecha: px + w } : m.ancla === 'end' ? { izquierda: px - w, derecha: px } : { izquierda: px - w / 2, derecha: px + w / 2 };
    });
}

/**
 * El gráfico de una banda, o `null` si no hay franja que dibujar (sin P25 o P75,
 * o con P75 bajo P25). Los puntos son los compradores **de la misma unidad** que
 * la banda (los de otra unidad no se comparan: es otro envase) con mediana.
 *
 * - Con un solo comprador (`banda.compradores === 1`) no hay franja: un punto y
 *   su valor en negrita.
 * - Con P25 = P75 (escritos igual en el eje), la franja es una línea y lleva un
 *   solo rótulo.
 */
export function graficoPrecio(
  banda: BandaUnidad,
  compradores: CompradorDeProducto[],
  ancho = ANCHO_REFERENCIA,
): GraficoPrecio | null {
  const { p25, p75 } = banda;
  if (p25 == null || p75 == null || !(p25 > 0) || p75 < p25) return null;
  const unidad = unidadDeclarada(banda.unidad);
  const medianas = compradores
    .filter((c) => unidadDeclarada(c.unidad) === unidad && typeof c.p50 === 'number' && c.p50 > 0)
    .map((c) => c.p50 as number)
    .sort((a, b) => a - b);
  const unSolo = banda.compradores === 1;
  const valores = unSolo && medianas.length === 0 ? [banda.p50 ?? p25] : unSolo ? medianas.slice(0, 1) : medianas;
  const dibujados = unSolo || valores.length >= MINIMO_PUNTOS ? valores : [];
  const { p10, p50, p90 } = banda;
  const conBigotes = !unSolo && p10 != null && p90 != null && p10 > 0 && p10 <= p25 && p90 >= p75;

  // Las dos marcas de contexto: el valor redondo más cercano a cada lado, a un
  // factor de la franja (o del único punto). El dominio llega hasta ellas.
  const izquierda = unSolo ? valores[0] : p25;
  const derecha = unSolo ? valores[0] : p75;
  const contexto = [
    valoresRedondos(izquierda / 1000, izquierda / FACTOR_CONTEXTO).at(-1),
    valoresRedondos(derecha * FACTOR_CONTEXTO, derecha * 1000)[0],
  ].filter((v): v is number => v !== undefined);

  const extremos = conBigotes ? [p10 as number, p90 as number] : [];
  let a = Math.log(Math.min(p25, ...dibujados, ...extremos, ...contexto));
  let b = Math.log(Math.max(p75, ...dibujados, ...extremos, ...contexto));
  const margen = (b - a) * 0.05;
  a -= margen;
  b += margen;
  const x = (v: number) => unDecimal(((Math.log(v) - a) / (b - a)) * 100);

  const xs = dibujados.map(x);
  const filas = filasDePuntos(xs, ancho);
  const puntos = xs.map((px, i) => ({ x: px, fila: filas[i] }));

  const marcas = unSolo
    ? marcasFuertes(xs[0], xs[0], plataCorta(valores[0]), plataCorta(valores[0]), ancho)
    : marcasFuertes(x(p25), x(p75), plataCorta(p25), plataCorta(p75), ancho);

  // Las de contexto, sólo si su rótulo no pisa otro.
  for (const v of contexto) {
    const texto = plataCorta(v);
    const r = rotulo(x(v), texto, ancho);
    // Pegada a un borde, el rótulo se apoya en él y sigue cubriendo su marca.
    if (cajasDe(marcas, ancho).some((c) => sePisan(c, r.caja))) continue;
    marcas.push({ x: x(v), texto, fuerte: false, xTexto: r.xTexto, ancla: r.ancla });
  }
  marcas.sort((m, n) => m.x - n.x);

  const franja = unSolo ? null : { desde: x(p25), hasta: x(p75) };
  const encima = franja ? rotulo(unDecimal((franja.desde + franja.hasta) / 2), ROTULO_FRANJA, ancho) : null;

  return {
    franja,
    bigotes: conBigotes ? { desde: x(p10 as number), hasta: x(p90 as number) } : null,
    mediana: !unSolo && p50 != null && p50 >= p25 && p50 <= p75 ? x(p50) : null,
    rotuloFranja: encima ? { xTexto: encima.xTexto, ancla: encima.ancla } : null,
    puntos,
    filas: Math.max(0, ...filas.map(Math.abs)),
    marcas,
  };
}
