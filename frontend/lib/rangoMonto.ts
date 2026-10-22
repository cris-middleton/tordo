/**
 * Dónde cae el monto de una Compra Ágil frente a lo que suele pedir su unidad de
 * compra: la regla de la frase y la geometría del gráfico chico de la fila
 * (`components/compraAgil/RangoMonto.tsx`).
 *
 * Lo usual es la mitad de las órdenes de la unidad, de P25 a P75: la misma franja
 * que dice la fila en texto («La mitad de sus órdenes va de $243.956 a $1,6
 * millones», `textoMontoTipico`). Sobre P75 es más que lo usual, bajo P25 es
 * menos, y lo demás (los bordes incluidos), dentro.
 *
 * **Escala lineal desde cero**, a propósito: el gráfico mide cuánto más o cuánto
 * menos, y un monto diez veces lo usual tiene que verse lejos. La franja se
 * achica entonces a unos píxeles, que es lo que pasa con el dato. Lineal no hay
 * que declararla (docs/GUIA_GRAFICOS.md, R7).
 */
import { esTopeCompraAgil, montoDeclarado } from '@/lib/compraAgil';
import type { CompraAgilDestacada } from '@/types/compraAgil';

export type LecturaRango = 'sobre' | 'dentro' | 'bajo';

export interface RangoMonto {
  lectura: LecturaRango;
  /** La frase que acompaña al dibujo, que es `aria-hidden`. */
  texto: string;
  /** Posiciones en % del ancho, de 0 a 100. */
  desde: number;
  hasta: number;
  mediana: number;
  monto: number;
}

export const TEXTO_RANGO: Record<LecturaRango, string> = {
  sobre: 'Más de lo que suele gastar',
  dentro: 'Dentro de lo que suele gastar',
  bajo: 'Menos de lo que suele gastar',
};

/** Aire a la derecha de lo más grande: ni el punto ni la franja tocan el borde. */
export const AIRE_DERECHA = 1.15;

/** La regla: sobre P75, más; bajo P25, menos; en la franja (con sus bordes), dentro. */
export function lecturaRango(monto: number, p25: number, p75: number): LecturaRango {
  if (monto > p75) return 'sobre';
  if (monto < p25) return 'bajo';
  return 'dentro';
}

/**
 * El rango de la fila, o null si no hay qué comparar: sin monto (o simbólico),
 * con el tope de Compra Ágil (no dice cuánto se va a gastar), sin historia de la
 * unidad, o sin una franja de verdad (P25 y P75 iguales, o alguno que falta: la
 * fila dice entonces sólo la mediana).
 */
export function rangoMonto(item: Pick<CompraAgilDestacada, 'monto_estimado' | 'monto_es_tope' | 'comprador'>): RangoMonto | null {
  const monto = montoDeclarado(item);
  if (monto == null || esTopeCompraAgil(item)) return null;
  const c = item.comprador;
  if (!c || c.monto_p25 == null || c.monto_p75 == null || c.monto_mediana == null) return null;
  const { monto_p25: p25, monto_p75: p75 } = c;
  if (!(p25 > 0) || !(p25 < p75)) return null;
  const mediana = Math.min(Math.max(c.monto_mediana, p25), p75);

  const tope = Math.max(p75, monto) * AIRE_DERECHA;
  const x = (v: number) => Math.round((v / tope) * 1000) / 10;
  const lectura = lecturaRango(monto, p25, p75);
  return { lectura, texto: TEXTO_RANGO[lectura], desde: x(p25), hasta: x(p75), mediana: x(mediana), monto: x(monto) };
}
