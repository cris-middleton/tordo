'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { ResumenMercado } from '../types';
import { buildFrases } from '../narrative/templates';

interface MarketSummaryCardProps {
  resumen: ResumenMercado | null;
  loading: boolean;
}

export function MarketSummaryCard({ resumen, loading }: MarketSummaryCardProps) {
  if (loading) {
    return (
      <section className="card flex items-center gap-3 py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-sm text-muted">Analizando el mercado...</p>
      </section>
    );
  }

  if (!resumen?.disponible) return null;

  const frases = buildFrases(resumen);
  if (frases.length === 0) return null;

  return (
    <section className="card bg-gradient-to-br from-primary/5 via-background to-accent/5 border-primary/20">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/15 p-2 shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 space-y-2">
          {frases.map((f, i) => (
            <p
              key={i}
              className="text-sm leading-relaxed text-text"
              dangerouslySetInnerHTML={{ __html: f }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
