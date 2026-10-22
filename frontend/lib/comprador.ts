/**
 * Cifras del perfil de un comprador que no se publican tal cual llegan: la
 * ficha pública (`/compradores/[codigo]`) y el panel de cada licitación las
 * pasan por aquí antes de pintarlas.
 */

/**
 * El trato directo en una cifra, o null si no hay que mostrarlo.
 *
 * **Un 0 exacto no se muestra.** Hasta el 2026-10-21 (#61) se contaba en la
 * descarga de licitaciones, que no trae ningún trato directo, y salía 0 % para
 * TODO comprador; desde entonces sale de las órdenes, pero lo materializado
 * antes de la semanal siguiente sigue diciendo 0, y en el dato no se distingue
 * del 0 nuevo. Ocultar un 0 verdadero (ninguna orden por trato directo en 36
 * meses; la mediana es 3,7 %) cuesta poco; publicar el viejo como hecho, más.
 * Se puede volver a mostrar cuando ninguna tabla anterior a #61 siga en
 * producción. Sobre cero pero bajo el 1 %, «menos de 1%», no «0%».
 */
export function textoTratoDirecto(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  if (v < 0.005) return 'menos de 1%';
  return `${Math.round(v * 100)}%`;
}

/**
 * Sobre esto, un promedio de ofertas por licitación no se publica.
 *
 * Producción mostró «299,4» para una municipalidad: es la media de
 * `NumeroOferentes` de la primera fila de cada licitación
 * (`etl/analytics/buyer_scoring.py`), y basta un puñado de licitaciones con
 * cientos de oferentes —o un campo mal cargado— para arrastrarla. Una
 * licitación común recibe un puñado de ofertas; 50 deja pasar a los compradores
 * muy disputados y corta lo que nadie creería. Hasta tener la mediana, mejor
 * nada que una cifra que hace dudar de las de al lado.
 */
export const MAXIMO_OFERTAS_CREIBLE = 50;

/** El promedio de ofertas por licitación, o null si falta o no es creíble. */
export function ofertasPorLicitacion(promedio: number | null | undefined): number | null {
  if (promedio == null || !Number.isFinite(promedio) || promedio < 0) return null;
  return promedio > MAXIMO_OFERTAS_CREIBLE ? null : promedio;
}

/**
 * «El proveedor principal se lleva el 2% de sus órdenes por Compra Ágil.» Como
 * celda, «Su proveedor principal → 2% de las órdenes», se leía como si el 2% fuera
 * el proveedor. Bajo el 1%, «menos del 1%».
 */
export function fraseProveedorPrincipal(cuotaPct: number): string {
  const cifra = cuotaPct > 0 && cuotaPct < 0.5 ? 'menos del 1%' : `el ${Math.round(cuotaPct)}%`;
  return `El proveedor principal se lleva ${cifra} de sus órdenes por Compra Ágil.`;
}
