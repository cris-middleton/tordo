'use client';

import { useRef } from 'react';
import { Loader2, Sparkles, Info } from 'lucide-react';
import { ResumenMercado } from '../types';
import { buildFrases } from '../narrative/templates';
import { ShareMenu } from './ShareMenu';

import { EligeRubro } from '@/components/bi/EligeRubro';
import { motivoParaPersona } from '@/lib/motivos';

interface MarketSummaryCardProps {
  resumen: ResumenMercado | null;
  loading: boolean;
  /** Vacío mientras el usuario no ha elegido rubro. Ver `EligeRubro`. */
  rubro?: string;
}

export function MarketSummaryCard({ resumen, loading, rubro }: MarketSummaryCardProps) {
  // Must be declared before any early returns (hooks rules)
  const rootRef = useRef<HTMLElement>(null);

  if (!loading && !rubro) return <EligeRubro que="el resumen de ese mercado" />;

  // Loading state
  if (loading) {
    return (
      <section className="card flex items-center gap-3 py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-sm text-muted">Analizando el mercado…</p>
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
            {motivoParaPersona(resumen.motivo, 'Resumen no disponible para este rubro.')}
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
  const summaryText = frases
    .map((f) => f.replace(/<[^>]*>/g, ''))
    .join(' ');
  const filename = `tordo-bi-resumen-${resumen.rubro?.replace(/\s+/g, '-').toLowerCase() || 'mercado'}`;

  return (
    <section ref={rootRef} className="card bg-gradient-to-br from-primary/5 via-background to-accent/5 border-primary/20">
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
        <ShareMenu
          targetRef={rootRef}
          summaryText={summaryText}
          filename={filename}
        />
      </div>
    </section>
  );
}
