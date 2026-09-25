'use client';

import { Lock } from 'lucide-react';
import { usePlanActual } from '@/lib/queries';
import { incluyePro } from '@/lib/plan';
import { ConfidenceBadge } from './ConfidenceBadge';
import { motivoParaPersona } from '@/lib/motivos';

// ── Types ──────────────────────────────────────────────────────────────────

interface Competidor {
  CodigoOrganismoPublico?: string | null;
  NombreProveedor?: string | null;
  market_share_pct?: number | null;
  win_rate_pct?: number | null;
  n_oc?: number | null;
  rank_monto?: number | null;
  n_proveedores?: number | null;
  es_incumbente?: boolean | null;
}

interface CompetidoresPanel {
  disponible: boolean;
  top5?: Competidor[] | null;
  hhi?: number | null;
  tipo_mercado?: string | null;
  motivo?: string | null;
}

interface CompetidoresPanelProps {
  competidores: CompetidoresPanel;
}

// ── Label / color maps ─────────────────────────────────────────────────────

// `competitivo` es el nombre viejo del tramo bajo del HHI. Se mantiene mapeado
// —no en la lista de valores nuevos— porque `analytics.market_concentration` se
// re-materializa una vez por semana: entre el despliegue y esa corrida las filas
// siguen diciendo la palabra anterior, y sin esto saldrían con la insignia gris
// de «tipo desconocido».
const tipoLabel: Record<string, string> = {
  concentrado: 'Concentrado',
  moderado: 'Moderado',
  fragmentado: 'Fragmentado',
  competitivo: 'Fragmentado',
};

const tipoColor: Record<string, string> = {
  concentrado: 'bg-danger/10 text-danger border-danger/20',
  moderado: 'bg-gold/10 text-gold border-gold/20',
  fragmentado: 'bg-accent/10 text-accent border-accent/20',
  competitivo: 'bg-accent/10 text-accent border-accent/20',
};

// ── Sub-components ─────────────────────────────────────────────────────────

function TipoMercadoBadge({ tipo }: { tipo: string }) {
  const label = tipoLabel[tipo] ?? tipo;
  const color = tipoColor[tipo] ?? 'bg-border/60 text-muted border-border';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${color}`}
    >
      {label}
    </span>
  );
}

function ShareBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function CompetitorRow({
  competidor,
  rank,
  isIncumbente,
}: {
  competidor: Competidor;
  rank: number;
  isIncumbente: boolean;
}) {
  const name = competidor.NombreProveedor ?? competidor.CodigoOrganismoPublico ?? '—';
  const share = competidor.market_share_pct ?? 0;
  const nOc = competidor.n_oc ?? 0;

  return (
    <div className="flex items-center gap-3 py-1.5">
      {/* Rank */}
      <span className="w-4 shrink-0 text-xs font-semibold text-muted">{rank}.</span>

      {/* Name */}
      <span
        className="flex-1 truncate text-sm text-text"
        title={name}
      >
        {name}
      </span>

      {/* Share bar */}
      <ShareBar pct={share} />

      {/* Share % */}
      <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-text">
        {share.toFixed(0)}%
      </span>

      {/* OC count */}
      <span className="w-12 shrink-0 text-right text-xs text-muted">
        {nOc} OC
      </span>

      {/* Incumbente badge */}
      {isIncumbente ? (
        <span className="inline-flex items-center rounded-full border border-danger/20 bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">
          Incumbente frecuente
        </span>
      ) : (
        /* Reserve space so rows stay aligned */
        <span className="w-[110px] shrink-0" />
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function CompetitorsList({ competidores }: CompetidoresPanelProps) {
  const isPro = incluyePro(usePlanActual().data?.tier);
  const nBase = competidores.top5?.[0]?.n_proveedores ?? 0;

  return (
    <div className="card flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="section-title">Top competidores</h3>
        {competidores.tipo_mercado && (
          <TipoMercadoBadge tipo={competidores.tipo_mercado} />
        )}
      </div>

      {/* Body */}
      {!isPro ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="rounded-full bg-border/60 p-3">
            <Lock size={18} className="text-muted" />
          </div>
          <div>
            <p className="text-sm font-medium text-text">Análisis de competidores</p>
            <p className="text-xs text-muted mt-0.5">Ve quién compite en este segmento</p>
          </div>
          <a href="/dashboard/billing" className="btn-primary inline-flex items-center gap-1.5 text-sm">
            Disponible en plan Pro
          </a>
        </div>
      ) : !competidores.disponible ? (
        <p className="text-sm text-muted">
          {motivoParaPersona(competidores.motivo, 'Todavía no tenemos competidores registrados para este comprador.')}
        </p>
      ) : !competidores.top5 || competidores.top5.length === 0 ? (
        <p className="text-sm text-muted">
          No se encontraron competidores históricos.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {competidores.top5.map((c, i) => (
            <CompetitorRow
              key={c.CodigoOrganismoPublico ?? c.NombreProveedor ?? i}
              competidor={c}
              rank={i + 1}
              isIncumbente={c.es_incumbente ?? (c.rank_monto === 0 || i === 0)}
            />
          ))}
        </div>
      )}

      {/* Footer — only shown when Pro and data available */}
      {isPro && (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <ConfidenceBadge n={nBase} />
          {competidores.hhi != null && (
            <span className="text-xs text-muted">
              HHI:{' '}
              <span className="font-semibold tabular-nums text-text">
                {competidores.hhi.toFixed(3)}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
