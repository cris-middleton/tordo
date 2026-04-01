'use client';

import { AlertTriangle } from 'lucide-react';
import { ConfidenceBadge } from './ConfidenceBadge';

// ── Types ──────────────────────────────────────────────────────────────────

interface TransparenciaComprador {
  clasificacion?: string | null;
  pct_trato_directo?: number | null;
}

interface CompradorPanel {
  disponible: boolean;
  nombre?: string | null;
  buyer_score?: number | null;
  clasificacion?: string | null;
  mediana_dias_pago?: number | null;
  tasa_adjudicacion?: number | null;
  n_flags?: number;
  n_base?: number | null;
  transparencia?: TransparenciaComprador | null;
  motivo?: string | null;
}

interface BuyerProfilePanelProps {
  comprador: CompradorPanel;
}

// ── Label / color maps ─────────────────────────────────────────────────────

const transpLabel: Record<string, string> = {
  muy_transparente: 'Muy transp.',
  transparente: 'Transparente',
  moderado: 'Moderado',
  poco_transparente: 'Poco transp.',
  opaco: 'Opaco',
};

const transpColor: Record<string, string> = {
  muy_transparente: 'text-accent',
  transparente: 'text-accent',
  moderado: 'text-gold',
  poco_transparente: 'text-gold',
  opaco: 'text-danger',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 7) return 'text-accent';
  if (score >= 4) return 'text-gold';
  return 'text-danger';
}

function diasColor(dias: number): string {
  if (dias <= 30) return 'text-accent';
  if (dias <= 60) return 'text-gold';
  return 'text-danger';
}

function adjColor(tasa: number): string {
  if (tasa >= 0.6) return 'text-accent';
  if (tasa >= 0.3) return 'text-gold';
  return 'text-danger';
}

// ── Sub-components ─────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function BuyerProfilePanel({ comprador }: BuyerProfilePanelProps) {
  return (
    <div className="card flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="section-title">Perfil del comprador</h3>
          {comprador.nombre && (
            <p className="text-xs text-muted mt-0.5 truncate max-w-[220px]" title={comprador.nombre}>
              {comprador.nombre}
            </p>
          )}
        </div>
        {comprador.n_base != null && <ConfidenceBadge n={comprador.n_base} />}
      </div>

      {/* Body */}
      {!comprador.disponible ? (
        <p className="text-sm text-muted">
          {comprador.motivo ?? 'Sin datos del comprador.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* KPI tiles row */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* Score */}
            <KpiTile
              label="Score comprador"
              value={
                comprador.buyer_score != null
                  ? `${comprador.buyer_score.toFixed(1)}/10`
                  : '—'
              }
              valueColor={
                comprador.buyer_score != null
                  ? scoreColor(comprador.buyer_score)
                  : 'text-muted'
              }
            />

            {/* Días de pago */}
            <KpiTile
              label="Pago med."
              value={
                comprador.mediana_dias_pago != null
                  ? `${comprador.mediana_dias_pago} días`
                  : '—'
              }
              valueColor={
                comprador.mediana_dias_pago != null
                  ? diasColor(comprador.mediana_dias_pago)
                  : 'text-muted'
              }
            />

            {/* Tasa adjudicación */}
            <KpiTile
              label="Adj. rate"
              value={
                comprador.tasa_adjudicacion != null
                  ? `${Math.round(comprador.tasa_adjudicacion * 100)}%`
                  : '—'
              }
              valueColor={
                comprador.tasa_adjudicacion != null
                  ? adjColor(comprador.tasa_adjudicacion)
                  : 'text-muted'
              }
            />

            {/* Transparencia */}
            <KpiTile
              label="Transp."
              value={
                comprador.transparencia?.clasificacion
                  ? (transpLabel[comprador.transparencia.clasificacion] ??
                    comprador.transparencia.clasificacion)
                  : '—'
              }
              valueColor={
                comprador.transparencia?.clasificacion
                  ? (transpColor[comprador.transparencia.clasificacion] ?? 'text-muted')
                  : 'text-muted'
              }
            />
          </div>

          {/* Risk flags */}
          {comprador.n_flags != null && comprador.n_flags > 0 && (
            <div className="flex items-center gap-1.5 rounded border border-gold/20 bg-gold/10 px-2 py-1 text-xs text-gold">
              <AlertTriangle size={12} />
              {comprador.n_flags} señal
              {comprador.n_flags > 1 ? 'es' : ''} de riesgo detectada
              {comprador.n_flags > 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
