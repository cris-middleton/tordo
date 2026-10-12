/**
 * De qué meses sale una banda de precio o una cuota de mercado.
 *
 * El backend lo devuelve como `periodo` (`ventana_desde`/`ventana_hasta` del
 * pipeline): 12 meses las bandas por producto, 36 las cuotas y la concentración.
 * Una cifra sin periodo se lee como «de siempre», y no lo es.
 */

export interface Periodo {
  desde?: string | null;
  hasta?: string | null;
}

const MES = new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function mesCorto(iso: string): string {
  // «abr 2025», sin el punto que Intl le pone a la abreviatura.
  return MES.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)).replace('.', '');
}

/** «abr 2025 – mar 2026 (12 meses)», o null si no hay periodo. */
export function textoPeriodo(periodo?: Periodo | null): string | null {
  if (!periodo?.desde || !periodo?.hasta) return null;
  const [a1, m1] = periodo.desde.split('-').map(Number);
  const [a2, m2] = periodo.hasta.split('-').map(Number);
  const meses = (a2 - a1) * 12 + (m2 - m1) + 1;
  return `${mesCorto(periodo.desde)} – ${mesCorto(periodo.hasta)} (${meses} meses)`;
}
