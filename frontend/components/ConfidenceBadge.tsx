'use client';

import { decimal } from '@/lib/formato';

interface ConfidenceBadgeProps {
  n: number;
  className?: string;
}

const getConfidence = (n: number) => {
  if (n >= 20) return { color: 'bg-accent/15 text-accent border-accent/25', label: `Confianza alta, ${decimal(n, 0)} compras` };
  if (n >= 5)  return { color: 'bg-gold/15 text-gold border-gold/25', label: `Confianza media, ${decimal(n, 0)} compras` };
  if (n >= 1)  return { color: 'bg-danger/15 text-danger border-danger/25', label: `Datos insuficientes, ${decimal(n, 0)} ${n === 1 ? 'compra' : 'compras'}` };
  return         { color: 'bg-border/60 text-muted border-border', label: 'Sin historial' };
};

export function ConfidenceBadge({ n, className = '' }: ConfidenceBadgeProps) {
  const { color, label } = getConfidence(n);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${color} ${className}`}
    >
      {label}
    </span>
  );
}
