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

export const getEstadoAccent = (estado?: string | null) => {
  if (!estado) return 'bg-primary/30';
  const e = estado.toLowerCase();
  if (e.includes('public')) return 'bg-accent';
  if (e.includes('adjudic')) return 'bg-info';
  if (e.includes('evaluac')) return 'bg-primary';
  if (e.includes('desierta') || e.includes('suspend')) return 'bg-subtle';
  if (e.includes('revocad') || e.includes('cancel')) return 'bg-danger';
  if (e.includes('cerrada')) return 'bg-gold';
  return 'bg-primary/30';
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
