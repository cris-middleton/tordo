'use client';

import { ConfidenceBadge } from './ConfidenceBadge';
import { decimal } from '@/lib/formato';

// ── BIPanel type definitions ───────────────────────────────────────────────

interface PrecioFallback {
  disponible: boolean;
  codigo_producto?: string | null;
  nivel_usado?: string | null;
  fallback?: boolean;
  p10?: number | null;
  p25?: number | null;
  p50?: number | null;
  p75?: number | null;
  p90?: number | null;
  confianza?: string | null;
  n?: number | null;
}

interface CompradorPanel {
  disponible: boolean;
  nombre?: string | null;
  buyer_score?: number | null;
  tasa_adjudicacion?: number | null;
  n_flags?: number;
  motivo?: string | null;
}

interface VentanaPanel {
  disponible: boolean;
  presion_score?: number | null;
  window_days?: number | null;
  alerta_ventana_corta?: boolean | null;
  motivo?: string | null;
}

interface CompetidoresPanel {
  disponible: boolean;
  hhi?: number | null;
  tipo_mercado?: string | null;
  motivo?: string | null;
}

interface BIPanel {
  comprador: CompradorPanel;
  ventana: VentanaPanel;
  competidores: CompetidoresPanel;
  precios: PrecioFallback[];
}

// ── Props ──────────────────────────────────────────────────────────────────

interface OpportunityScoreCardProps {
  panel: BIPanel;
}

// ── Driver derivation ──────────────────────────────────────────────────────

interface Drivers {
  fit: number | null;
  competencia: number | null;
  timing: number | null;
  precio: number | null;
}

function deriveDrivers(panel: BIPanel): Drivers {
  const fit =
    panel.comprador.buyer_score != null
      ? panel.comprador.buyer_score / 10
      : null;

  const competencia =
    panel.competidores.hhi != null
      ? Math.max(0, Math.min(1, 1 - panel.competidores.hhi * 2))
      : null;

  const timing =
    panel.ventana.presion_score != null
      ? Math.max(0, Math.min(1, 1 - panel.ventana.presion_score))
      : null;

  const firstPrecio = panel.precios[0];
  let precio: number | null = null;
  if (firstPrecio?.confianza === 'alta') {
    precio = 0.85;
  } else if (firstPrecio?.confianza === 'media') {
    precio = 0.6;
  } else if (firstPrecio?.n != null && firstPrecio.n >= 1) {
    precio = 0.35;
  }

  return { fit, competencia, timing, precio };
}

function computeScore(drivers: Drivers): number | null {
  const values = [
    drivers.fit,
    drivers.competencia,
    drivers.timing,
    drivers.precio,
  ].filter((v): v is number => v !== null);

  if (values.length === 0) return null;
  return (values.reduce((a, b) => a + b, 0) / values.length) * 10;
}

// ── Explanation builder ────────────────────────────────────────────────────

function buildExplanation(drivers: Drivers, score: number | null): string {
  if (score === null) return 'Datos insuficientes para calcular el score.';

  const parts: string[] = [];

  if (drivers.fit != null && drivers.fit >= 0.7) {
    parts.push('el comprador tiene buenas métricas de pago');
  } else if (drivers.fit != null && drivers.fit < 0.4) {
    parts.push('el comprador presenta señales de riesgo');
  }

  if (drivers.precio != null && drivers.precio >= 0.7) {
    parts.push('hay referencias de precio disponibles');
  }

  if (drivers.competencia != null && drivers.competencia >= 0.6) {
    parts.push('el mercado es competitivo');
  } else if (drivers.competencia != null && drivers.competencia < 0.35) {
    parts.push('alta concentración de mercado');
  }

  if (drivers.timing != null && drivers.timing >= 0.6) {
    parts.push('hay tiempo suficiente para prepararse');
  } else if (drivers.timing != null && drivers.timing < 0.3) {
    parts.push('ventana de preparación corta');
  }

  if (parts.length === 0) return 'Score calculado con datos parciales.';

  const scoreLabel = score >= 7 ? 'alto' : score >= 4.5 ? 'medio' : 'bajo';
  return `Rankea ${scoreLabel} porque ${parts.join(' y ')}.`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DriverBar({
  label,
  value,
  note,
}: {
  label: string;
  value: number | null;
  note?: string;
}) {
  if (value === null) {
    return (
      <div className="flex items-center gap-3">
        <span className="w-28 shrink-0 text-xs text-muted">{label}</span>
        <div className="h-1.5 flex-1 rounded-full bg-border" />
        <span className="w-10 text-right text-xs text-muted">—</span>
      </div>
    );
  }

  const pct = Math.round(value * 100);

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-muted">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex w-16 items-center justify-end gap-1">
        <span className="text-xs font-medium text-text">{pct}%</span>
        {note && (
          <span className="rounded bg-accent/15 px-1 py-0.5 text-[9px] font-semibold text-accent">
            {note}
          </span>
        )}
      </div>
    </div>
  );
}

function ScoreDial({ score }: { score: number | null }) {
  const display = score !== null ? decimal(score, 1) : '—';
  const color =
    score === null
      ? 'text-muted'
      : score >= 7
        ? 'text-accent'
        : score >= 4.5
          ? 'text-gold'
          : 'text-danger';

  return (
    <div className="flex flex-col items-center gap-0.5 py-2">
      <span className={`cifra text-5xl font-bold ${color}`}>
        {display}
      </span>
      <span className="text-xs text-muted">/ 10</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function OpportunityScoreCard({ panel }: OpportunityScoreCardProps) {
  const drivers = deriveDrivers(panel);
  const score = computeScore(drivers);
  const explanation = buildExplanation(drivers, score);

  const n = panel.precios[0]?.n ?? 0;

  // Determine if precio driver is in "zona ganadora"
  const precioNote =
    drivers.precio != null && drivers.precio >= 0.7 ? 'zona ganadora' : undefined;

  return (
    <div className="card flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="section-title">Score de oportunidad</h3>
        <ConfidenceBadge n={n} />
      </div>

      {/* Score dial */}
      <ScoreDial score={score} />

      {/* Driver bars */}
      <div className="flex flex-col gap-2.5">
        <DriverBar
          label="Confiabilidad"
          value={drivers.fit}
        />
        <DriverBar
          label="Precio ref."
          value={drivers.precio}
          note={precioNote}
        />
        <DriverBar
          label="Competencia"
          value={drivers.competencia}
        />
        <DriverBar
          label="Timing"
          value={drivers.timing}
        />
      </div>

      {/* Explanatory text */}
      <p className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm italic text-muted">
        &ldquo;{explanation}&rdquo;
      </p>
    </div>
  );
}
