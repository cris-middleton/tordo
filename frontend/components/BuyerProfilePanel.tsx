'use client';

import { AlertTriangle } from 'lucide-react';
import { ConfidenceBadge } from './ConfidenceBadge';
import { motivoParaPersona } from '@/lib/motivos';
import { decimal } from '@/lib/formato';

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

// «Muy transp.» y «Poco transp.» no son palabras: son abreviaturas que sólo
// se entienden si ya sabes qué dicen. En una ficha que se lee de un vistazo
// para decidir si postular, obligar a descifrar la etiqueta cuesta más de lo
// que ahorra en ancho.
const transpLabel: Record<string, string> = {
  muy_transparente: 'Muy abierto',
  transparente: 'Abierto',
  moderado: 'Normal',
  poco_transparente: 'Poco abierto',
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

/** Cuanto más compra por trato directo, menos queda a competir de verdad. */
function tratoDirectoColor(pct: number): string {
  if (pct <= 0.15) return 'text-accent';
  if (pct <= 0.35) return 'text-gold';
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
      <p className="text-xs text-muted">{label}</p>
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
          {motivoParaPersona(comprador.motivo, 'Todavía no tenemos historial de este comprador.')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* KPI tiles row */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* Score */}
            <KpiTile
              label="Nota del comprador"
              value={
                comprador.buyer_score != null
                  ? `${decimal(comprador.buyer_score, 1)}/10`
                  : '—'
              }
              valueColor={
                comprador.buyer_score != null
                  ? scoreColor(comprador.buyer_score)
                  : 'text-muted'
              }
            />

            {/* Trato directo.
                Este hueco lo ocupaba «Pago med.», que mostraba los días hasta
                que el PROVEEDOR acepta la orden bajo una etiqueta de plazo de
                pago —y con una escala de color de 30/60 días para un dato cuya
                mediana real es de 1,6—. El porcentaje de trato directo sí
                cambia una decisión: es la parte del gasto que no llega a
                competencia abierta. */}
            <KpiTile
              label="Trato directo"
              value={
                comprador.transparencia?.pct_trato_directo != null
                  ? `${Math.round(comprador.transparencia.pct_trato_directo * 100)}%`
                  : '—'
              }
              valueColor={
                comprador.transparencia?.pct_trato_directo != null
                  ? tratoDirectoColor(comprador.transparencia.pct_trato_directo)
                  : 'text-muted'
              }
            />

            {/* Tasa adjudicación */}
            <KpiTile
              label="Adjudica"
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
              label="Transparencia"
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
