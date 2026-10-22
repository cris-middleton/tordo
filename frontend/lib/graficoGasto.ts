/**
 * La geometría del gráfico de gasto mensual de la portada: una columna por mes,
 * apilada por sector, con el color fijo de cada sector (`lib/sectores.ts`).
 *
 * Puro y sin React: lo pinta `components/graficos/GastoMensual.tsx` y lo fija
 * `__tests__/grafico-gasto.test.ts`. Las alturas van en % del mes más alto, así
 * que el dibujo es de cajas y cabe en cualquier ancho.
 */

import type { GastoMensual } from '@/types/publico';

import { decimal, monto } from './formato';
import { SECTORES_CON_COLOR, sectorConColor, type SectorConColor } from './sectores';

export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Con menos meses no hay «mes típico» que comparar. */
export const MINIMO_MESES = 6;

export interface SerieGasto extends SectorConColor {
  /** Lo que compró el sector en todo el periodo. */
  total: number;
  /** «$3 billones». */
  texto: string;
  /** % del total del periodo, entero. */
  parte: number;
}

export interface MesGasto {
  clave: string;
  anio: number;
  mes: number;
  /** «dic 2025». */
  etiqueta: string;
  /** «diciembre de 2025». */
  largo: string;
  total: number;
  /** «$1,8 billones». */
  texto: string;
  /** Lo de cada serie, en el orden de `series`. */
  partes: number[];
  /** El alto de la columna, en % del mes más alto. */
  alto: number;
}

export interface MarcaGasto {
  valor: number;
  /** «$0,5»: la unidad va una vez, arriba del eje (`unidad`). */
  texto: string;
  /** Desde abajo, en % del alto del gráfico. */
  y: number;
}

export interface GraficoGasto {
  series: SerieGasto[];
  meses: MesGasto[];
  marcas: MarcaGasto[];
  /** «En billones de pesos»: la unidad de las marcas, dicha una vez. */
  unidad: string;
  total: number;
  pico: MesGasto;
  /** La mediana de los totales mensuales: un mes típico. */
  tipico: number;
  /** pico / típico. */
  veces: number;
  /** Dónde va la línea del mes típico: desde abajo, en % del alto del gráfico. */
  yTipico: number;
  /** El índice del mes más alto en `meses`: lleva su rótulo encima. */
  indicePico: number;
  /** Los años que empiezan dentro del gráfico: dónde va cada rótulo del eje. */
  anios: { anio: number; indice: number }[];
}

/** La unidad del eje: la del mes más alto, para que las marcas sean números chicos. */
function escalaDe(maximo: number): { divisor: number; nombre: string } {
  if (maximo >= 1e12) return { divisor: 1e12, nombre: 'billones' };
  if (maximo >= 1e9) return { divisor: 1e9, nombre: 'miles de millones' };
  return { divisor: 1e6, nombre: 'millones' };
}

const mediana = (v: number[]) => {
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/** El paso redondo (1, 2 o 5 × 10ⁿ) que deja dos o tres líneas bajo el máximo. */
export function pasoRedondo(maximo: number): number {
  const bruto = maximo / 3;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 5, 10].map((f) => f * potencia).find((p) => p >= bruto)!;
  return paso;
}

const esFila = (f: GastoMensual) =>
  Number.isInteger(f.anio) &&
  Number.isInteger(f.mes) &&
  f.mes >= 1 &&
  f.mes <= 12 &&
  Number.isFinite(f.monto) &&
  f.monto >= 0;

/** El mes de Chile en que cae un instante, como índice `año·12 + mes − 1`. */
export function mesDeChile(instante: number): number {
  const partes = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', year: 'numeric', month: 'numeric' }).formatToParts(
    instante,
  );
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  return valor('year') * 12 + valor('month') - 1;
}

/**
 * Las columnas, de la más vieja a la más nueva, con los meses que falten entre
 * la primera y la última rellenos en cero (un hueco en el tiempo se ve como
 * hueco, no como dos meses pegados). `null` si no hay con qué decir algo verdadero:
 * menos de `MINIMO_MESES`, una fila ilegible o un total en cero.
 */
export function graficoGasto(filas: GastoMensual[] | null | undefined, ahora?: number): GraficoGasto | null {
  if (!filas?.length || !filas.every(esFila)) return null;

  const indice = (anio: number, mes: number) => anio * 12 + mes - 1;
  // **Sólo meses cerrados.** El mes en curso va a medias y se leía como un desplome
  // (octubre de 2026: $0,7 billones contra $1,3 de un mes típico, el 21-10). El ETL
  // ya deja fuera el mes en curso de sus datos (#57), pero la tabla se materializa
  // el domingo y el mes cambia entremedio: se corta aquí también, con la hora del render.
  if (ahora !== undefined) {
    const enCurso = mesDeChile(ahora);
    filas = filas.filter((f) => indice(f.anio, f.mes) < enCurso);
    if (!filas.length) return null;
  }
  const primero = Math.min(...filas.map((f) => indice(f.anio, f.mes)));
  const ultimo = Math.max(...filas.map((f) => indice(f.anio, f.mes)));
  const cuantos = ultimo - primero + 1;
  if (cuantos < MINIMO_MESES) return null;

  const claves = SECTORES_CON_COLOR.map((s) => s.clave);
  const montos = Array.from({ length: cuantos }, () => claves.map(() => 0));
  for (const f of filas) {
    const i = indice(f.anio, f.mes) - primero;
    montos[i][claves.indexOf(sectorConColor(f.sector).clave)] += f.monto;
  }

  const totales = montos.map((m) => m.reduce((a, b) => a + b, 0));
  const total = totales.reduce((a, b) => a + b, 0);
  const maximo = Math.max(...totales);
  if (!(total > 0)) return null;

  const porSerie = claves.map((_, s) => montos.reduce((a, m) => a + m[s], 0));
  const series: SerieGasto[] = SECTORES_CON_COLOR.map((s, i) => ({
    ...s,
    total: porSerie[i],
    texto: monto(porSerie[i]),
    parte: Math.round((porSerie[i] / total) * 100),
  }));

  const meses: MesGasto[] = totales.map((t, i) => {
    const anio = Math.floor((primero + i) / 12);
    const mes = ((primero + i) % 12) + 1;
    return {
      clave: `${anio}-${mes}`,
      anio,
      mes,
      etiqueta: `${MESES_CORTOS[mes - 1]} ${anio}`,
      largo: `${MESES_LARGOS[mes - 1]} de ${anio}`,
      total: t,
      texto: monto(t),
      partes: montos[i],
      alto: (t / maximo) * 100,
    };
  });

  const paso = pasoRedondo(maximo);
  const escala = escalaDe(maximo);
  // Con un paso bajo la unidad (0,5 billones) las marcas llevan un decimal; si no, ninguno.
  const digitos = paso / escala.divisor < 1 ? 1 : 0;
  const marcas: MarcaGasto[] = [];
  for (let v = paso; v <= maximo; v += paso) {
    marcas.push({ valor: v, texto: `$${decimal(v / escala.divisor, digitos).replace(/,0$/, '')}`, y: (v / maximo) * 100 });
  }

  const indicePico = meses.reduce((a, m, i) => (m.total > meses[a].total ? i : a), 0);
  const pico = meses[indicePico];
  const tipico = mediana(totales);
  // Un rótulo por año, en su enero. El año del primer mes sólo si le quedan al
  // menos cuatro meses antes del enero siguiente: si no, los dos rótulos se pisan.
  const anios = meses.flatMap((m, i) => (m.mes === 1 || (i === 0 && m.mes <= 9) ? [{ anio: m.anio, indice: i }] : []));

  return {
    series,
    meses,
    marcas,
    unidad: `En ${escala.nombre} de pesos`,
    total,
    pico,
    tipico,
    veces: tipico > 0 ? pico.total / tipico : 0,
    yTipico: (tipico / maximo) * 100,
    indicePico,
    anios,
  };
}

/**
 * «1,6 veces». Dos y tres, en palabras: «2,0 veces un mes típico» se lee peor que
 * «el doble de un mes típico».
 */
export const veces = (v: number) => {
  const redondo = decimal(v, 1);
  if (redondo === '2,0') return 'el doble de';
  if (redondo === '3,0') return 'el triple de';
  return `${redondo} veces`;
};
