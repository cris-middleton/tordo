'use client';

import { useRef } from 'react';
import { Loader2 } from 'lucide-react';
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

  if (!loading && !rubro) return <EligeRubro que="cómo está ese rubro" />;

  // Loading state
  if (loading) {
    return (
      <section className="flex items-center gap-3 py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted">Cargando el rubro…</p>
      </section>
    );
  }

  // Sin response (fetch falló o aún no se dispara porque no hay rubro)
  if (!resumen) return null;

  // Backend retornó disponible:false — mostrar el motivo como diagnóstico liviano
  if (!resumen.disponible) {
    return (
      <section className="py-2">
        <div className="flex items-start gap-3">
          <p className="text-sm text-muted">
            {motivoParaPersona(resumen.motivo, 'Todavía no podemos resumir este rubro.')}
          </p>
        </div>
      </section>
    );
  }

  // Hay data — construir frases
  const frases = buildFrases(resumen);

  // Sin crecimiento ni comprador no hay nada que decir que no digan las cifras
  // de debajo: decir «muy pocas compras para resumirlo» encima de un monto y
  // de cientos de órdenes se contradecía.
  if (frases.length === 0) return null;

  // Happy path: render la card narrativa
  const summaryText = frases
    .map((f) => f.replace(/<[^>]*>/g, ''))
    .join(' ');
  const filename = `resumen-${resumen.rubro?.replace(/\s+/g, '-').toLowerCase() || 'mercado'}`;

  return (
    // La conclusión del rubro en una o dos frases, como entrada de la sección.
    // Antes iba en una tarjeta con degradado y un icono de destellos: el disfraz
    // de «lo escribió una IA» sobre frases que salen de plantillas con el dato.
    <section ref={rootRef}>
      <div className="flex items-start gap-3">
        <div className="max-w-[65ch] flex-1 space-y-2">
          {frases.map((f, i) => (
            <p
              key={i}
              className="text-lg leading-relaxed text-text"
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
