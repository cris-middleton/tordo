'use client';

import { Loader2, Sparkles, Info } from 'lucide-react';
import { ResumenMercado } from '../types';
import { buildFrases } from '../narrative/templates';

interface MarketSummaryCardProps {
  resumen: ResumenMercado | null;
  loading: boolean;
}

export function MarketSummaryCard({ resumen, loading }: MarketSummaryCardProps) {
  // Loading state
  if (loading) {
    return (
      <section className="card flex items-center gap-3 py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-sm text-muted">Analizando el mercado...</p>
      </section>
    );
  }

  // Sin response (fetch falló o aún no se dispara porque no hay rubro)
  if (!resumen) return null;

  // Backend retornó disponible:false — mostrar el motivo como diagnóstico liviano
  if (!resumen.disponible) {
    return (
      <section className="card py-4">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-muted shrink-0 mt-0.5" />
          <p className="text-sm text-muted">
            Resumen no disponible
            {resumen.motivo ? <> — {resumen.motivo}</> : null}.
          </p>
        </div>
      </section>
    );
  }

  // Hay data — construir frases
  const frases = buildFrases(resumen);

  // No se pudo construir ninguna frase (todos los campos del backend vinieron null/insuficientes)
  if (frases.length === 0) {
    return (
      <section className="card py-4">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-muted shrink-0 mt-0.5" />
          <p className="text-sm text-muted">
            Datos de resumen insuficientes para este rubro.
          </p>
        </div>
      </section>
    );
  }

  // Happy path: render la card narrativa
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
