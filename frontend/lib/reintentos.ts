/**
 * Cuánto se espera a la API y cuándo se vuelve a intentar.
 *
 * `/mercado` se quedó más de 30 s con el spinner (spec del rediseño §8.2): sin
 * timeout, cada intento duraba lo que tardara el backend en morir, y se
 * reintentaba dos veces cada 502. Peor: la API moría por memoria con esas
 * consultas, y reintentarlas la volvía a matar mientras reiniciaba.
 *
 * - **Timeout de 15 s.** Una consulta de BI sana tarda ~1,5 s (medido en
 *   producción el 14-10); quince es margen, no espera.
 * - **Un solo reintento**, y sólo para lo que puede ser pasajero (5xx o error de
 *   red). Un 4xx no se arregla reintentando, y un timeout tampoco: duraría otro
 *   tanto.
 */

export const TIEMPO_MAXIMO_MS = 15_000;

type ErrorDeAxios = { code?: string; response?: { status?: number } };

export function esTiempoAgotado(error: unknown): boolean {
  const code = (error as ErrorDeAxios | null)?.code;
  return code === 'ECONNABORTED' || code === 'ETIMEDOUT';
}

export function debeReintentar(fallos: number, error: unknown): boolean {
  if (esTiempoAgotado(error)) return false;
  const status = (error as ErrorDeAxios | null)?.response?.status;
  if (status && status >= 400 && status < 500) return false;
  return fallos < 1;
}
