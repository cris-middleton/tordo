/**
 * En qué meses compra un comprador: la frase que resume doce columnas. La usan
 * `/mercado` (un comprador en un rubro, `EstacionalidadSection`) y la ficha
 * pública del comprador (todos sus rubros). Vive aquí y no en el componente de
 * `/mercado`, que es cliente: una página de servidor no puede llamar una función
 * exportada desde un módulo `'use client'`.
 */

export const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «enero, febrero y octubre». */
const enLista = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);

/**
 * La frase sobre los meses. Con picos marcados por el ETL, los nombra. Sin ellos, lo
 * decide la forma: «Compra parejo todo el año.» salía sobre un gráfico con 38 % en
 * febrero y seis meses en 0 % (el ETL no marca pico con pocas compras). Si los tres
 * meses de más compras suman la mitad o más, se nombran; si ningún mes pasa del 15 %,
 * es parejo; si no, se nombra el mayor.
 */
/** Qué dice la frase y qué meses nombra. */
export type FormaDeLosMeses =
  | { tipo: 'sin-compras' }
  | { tipo: 'concentrado'; meses: number[] }
  | { tipo: 'parejo' }
  | { tipo: 'con-un-mayor'; meses: [number] };

/**
 * La forma de las doce columnas cuando el ETL no marcó picos: si los (hasta) tres
 * meses de más compras suman la mitad o más, se nombran; si ningún mes pasa del
 * 15 %, es parejo; si no, el mayor. Los meses nombrados son los que un gráfico
 * pinta en `dato` (docs/GUIA_GRAFICOS.md: sólo lo que nombra la conclusión).
 */
export function formaDeLosMeses(meses: { mes: number; prob: number }[]): FormaDeLosMeses {
  const total = meses.reduce((a, m) => a + m.prob, 0);
  if (!(total > 0)) return { tipo: 'sin-compras' };
  // Sólo meses con compras: con dos meses comprados, los «tres de más compras» se
  // completaban con uno en cero y la frase decía «enero, marzo y noviembre» con
  // enero en 0 %.
  const orden = meses.filter((m) => m.prob > 0).sort((a, b) => b.prob - a.prob || a.mes - b.mes);
  const tres = orden.slice(0, 3);
  if (tres.reduce((a, m) => a + m.prob, 0) / total >= 0.5) {
    return { tipo: 'concentrado', meses: tres.map((m) => m.mes).sort((a, b) => a - b) };
  }
  if (orden[0].prob / total <= 0.15) return { tipo: 'parejo' };
  return { tipo: 'con-un-mayor', meses: [orden[0].mes] };
}

/** Los meses que nombra la frase (vacío si no nombra ninguno). */
export const mesesNombrados = (meses: { mes: number; prob: number }[]): number[] => {
  const forma = formaDeLosMeses(meses);
  return 'meses' in forma ? forma.meses : [];
};

/**
 * La frase sobre los meses. Con picos marcados por el ETL, los nombra. Sin ellos, lo
 * decide la forma (`formaDeLosMeses`): «Compra parejo todo el año.» salía sobre un
 * gráfico con 38 % en febrero y seis meses en 0 % (el ETL no marca pico con pocas
 * compras).
 */
export function conclusionDeMeses(meses: { mes: number; prob: number }[], picoMeses: string[]): string {
  if (picoMeses.length > 0) return `Compra sobre todo en ${enLista(picoMeses)}.`;
  const forma = formaDeLosMeses(meses);
  switch (forma.tipo) {
    case 'sin-compras':
      return 'No hay compras en el rubro para ver en qué meses.';
    case 'parejo':
      return 'Compra parejo todo el año.';
    case 'con-un-mayor':
      return `Compra todo el año, con más en ${MESES_LARGOS[forma.meses[0] - 1]}.`;
    case 'concentrado':
      return `Compra sobre todo en ${enLista(forma.meses.map((m) => MESES_LARGOS[m - 1]))}.`;
  }
}
