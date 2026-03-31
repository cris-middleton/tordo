'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, Users, ArrowRight } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { ConfidenceBadge } from './ConfidenceBadge';

interface Oportunidad {
  CodigoOrganismoPublico: string | null;
  RubroN2: string | null;
  opportunity_score: number | null;
  n_transacciones: number | null;
  n_proveedores: number | null;
  hhi: number | null;
  cagr: number | null;
}

function ScoreBadge({ score }: { score: number }) {
  if (score >= 7.5)
    return (
      <span className="inline-flex items-center rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-bold text-accent border border-accent/25">
        {score.toFixed(1)}
      </span>
    );
  if (score >= 5)
    return (
      <span className="inline-flex items-center rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-bold text-gold border border-gold/25">
        {score.toFixed(1)}
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-bold text-danger border border-danger/25">
      {score.toFixed(1)}
    </span>
  );
}

export function TopOpportunities() {
  const [items, setItems] = useState<Oportunidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  // TODO: migrar a React Query

  useEffect(() => {
    apiClient
      .getBIOportunidades({ min_score: 0, limit: 3 })
      .then((res: any) => {
        if (res.disponible === false) {
          setUnavailable(true);
          return;
        }
        setItems((res.oportunidades || []).slice(0, 3));
      })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card animate-pulse space-y-3">
        <div className="h-5 w-40 bg-border rounded" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-border rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="section-title">Top oportunidades</h2>
          <p className="text-xs text-muted mt-0.5">Mejor score de mercado activo</p>
        </div>
        <div className="rounded-lg bg-accent/10 p-2">
          <TrendingUp size={16} className="text-accent" />
        </div>
      </div>

      {unavailable ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-6 text-center">
          <p className="text-sm text-muted">
            Análisis BI no disponible. Asegúrate de que el pipeline de datos esté activo.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-6 text-center space-y-2">
          <p className="text-sm text-muted">
            No se encontraron oportunidades activas esta semana. Revisa tus alertas.
          </p>
          <Link href="/dashboard/alerts" className="text-xs text-primary hover:underline">
            Ver alertas →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-background p-3 transition-all hover:border-primary/25 hover:shadow-card-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text truncate">
                    {item.RubroN2 || 'Rubro no especificado'}
                  </p>
                  <p className="text-xs text-muted mt-0.5 truncate">
                    Organismo: {item.CodigoOrganismoPublico || 'N/A'}
                  </p>
                </div>
                {item.opportunity_score != null && (
                  <ScoreBadge score={item.opportunity_score} />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted">
                {item.n_proveedores != null && (
                  <span className="flex items-center gap-1">
                    <Users size={11} />
                    {item.n_proveedores} prov.
                  </span>
                )}
                {item.cagr != null && (
                  <span className={item.cagr >= 0 ? 'text-accent' : 'text-danger'}>
                    CAGR {item.cagr >= 0 ? '+' : ''}
                    {(item.cagr * 100).toFixed(1)}%
                  </span>
                )}
                {item.n_transacciones != null && (
                  <span className="text-subtle">{item.n_transacciones} txs históricas</span>
                )}
                <ConfidenceBadge n={item.n_transacciones ?? 0} />
              </div>
            </div>
          ))}
          <Link
            href="/dashboard/bi"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-xs font-medium text-muted transition-all hover:border-primary/30 hover:text-primary"
          >
            Ver análisis completo <ArrowRight size={12} />
          </Link>
        </div>
      )}
    </div>
  );
}
