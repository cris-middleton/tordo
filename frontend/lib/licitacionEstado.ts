/**
 * Formato y colores del estado de una licitación.
 *
 * Vivían dentro del componente, así que se reconstruían en cada render y no se
 * podían reutilizar desde la tarjeta. Son funciones puras: aquí abajo no hay
 * nada que dependa de React.
 */

import { format } from 'date-fns';
import es from 'date-fns/locale/es';
import { decimal } from '@/lib/formato';

// Viven aparte, sin `date-fns`: ver `nombresChile.ts`.
export { normalizeText, shortRegion } from '@/lib/nombresChile';

export const formatCurrency = (amount?: number) => {
  if (amount == null) return null;
  if (amount >= 1_000_000_000) return `$${decimal(amount / 1_000_000_000, 1)}B`;
  if (amount >= 1_000_000) return `$${decimal(amount / 1_000_000, 1)}M`;
  if (amount >= 1_000) return `$${decimal(amount / 1_000, 0)}K`;
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(amount);
};

export const getEstadoCls = (estado?: string | null) => {
  if (!estado) return 'bg-border/50 text-subtle border-border';
  const e = estado.toLowerCase();
  if (e.includes('public')) return 'bg-accent/10 text-accent border-accent/20';
  if (e.includes('adjudic')) return 'bg-info/10 text-info border-info/20';
  if (e.includes('evaluac')) return 'bg-primary/10 text-primary border-primary/20';
  if (e.includes('desierta') || e.includes('suspend')) return 'bg-border/50 text-subtle border-border';
  if (e.includes('revocad') || e.includes('cancel')) return 'bg-danger/10 text-danger border-danger/20';
  if (e.includes('cerrada')) return 'bg-gold/10 text-gold border-gold/20';
  return 'bg-border/50 text-muted border-border';
};

export const getClosingUrgency = (fechaCierre?: string | null) => {
  if (!fechaCierre) return null;
  const closing = new Date(fechaCierre);
  const now = new Date();
  const daysLeft = Math.ceil((closing.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return null;
  if (daysLeft === 0) return { label: 'Cierra hoy', cls: 'text-danger font-bold' };
  if (daysLeft <= 2) return { label: `${daysLeft}d`, cls: 'text-danger font-semibold' };
  if (daysLeft <= 7) return { label: `${daysLeft}d`, cls: 'text-gold font-medium' };
  return { label: format(closing, 'd MMM', { locale: es }), cls: 'text-muted' };
};

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** El día de calendario en Santiago de un instante, como número comparable (días desde 1970). */
function diaDeChile(instante: Date): { dia: number; mes: number; ordinal: number } {
  const partes = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  const [anio, mes, dia] = [valor('year'), valor('month'), valor('day')];
  return { dia, mes, ordinal: Math.round(Date.UTC(anio, mes - 1, dia) / 86_400_000) };
}

/**
 * El cierre de una licitación en palabras, contado en días de calendario de
 * Chile: «Cierra hoy», «Cierra mañana», «Cierra en 4 días», «Cierra el 30 oct»
 * o «Cerró el 12 oct». Antes la tarjeta decía «1d», que no decía si era plazo o
 * antigüedad. `urgente` (hoy o mañana) es lo que se pinta en rojo.
 */
export function cierreEnPalabras(
  fechaCierre: string | null | undefined,
  ahora: Date = new Date(),
): { texto: string; urgente: boolean } | null {
  if (!fechaCierre) return null;
  const cierre = new Date(fechaCierre);
  if (Number.isNaN(cierre.getTime())) return null;
  const c = diaDeChile(cierre);
  const fecha = `${c.dia} ${MESES_CORTOS[c.mes - 1]}`;
  if (cierre.getTime() <= ahora.getTime()) return { texto: `Cerró el ${fecha}`, urgente: false };
  const dias = c.ordinal - diaDeChile(ahora).ordinal;
  if (dias <= 0) return { texto: 'Cierra hoy', urgente: true };
  if (dias === 1) return { texto: 'Cierra mañana', urgente: true };
  if (dias <= 7) return { texto: `Cierra en ${dias} días`, urgente: false };
  return { texto: `Cierra el ${fecha}`, urgente: false };
}
