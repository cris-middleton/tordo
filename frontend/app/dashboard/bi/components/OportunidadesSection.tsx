// frontend/app/dashboard/bi/components/OportunidadesSection.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Loader2, Target } from 'lucide-react';
import { OportunidadItem, CompradorResult, scoreColor, scoreBg } from '../types';
import { apiClient } from '@/lib/api';

interface OportunidadesSectionProps {
  oportunidades: OportunidadItem[];
  loading: boolean;
}

function ScoreBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? 'bg-accent' : pct >= 40 ? 'bg-gold' : 'bg-danger';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-muted w-6 text-right">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function CompetitionBadge({ n }: { n: number }) {
  if (n < 5) return <span className="badge-accent text-xs">Baja ({n})</span>;
  if (n <= 15) return <span className="badge-warning text-xs">Media ({n})</span>;
  return <span className="badge-error text-xs">Alta ({n})</span>;
}

function ExpandedRow({ organismo }: { organismo: string }) {
  const [data, setData] = useState<CompradorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await apiClient.getBIComprador(organismo);
      setData(res);
      setLoaded(true);
    } catch {
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load on mount
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="p-4 flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando perfil del comprador...
    </div>
  );

  if (!data?.disponible) return (
    <div className="p-4 text-sm text-muted">Sin datos de este comprador.</div>
  );

  // buyer_score is 0-1; multiply ×10 for display and color thresholds
  const scoreDisplay = data.buyer_score != null ? data.buyer_score * 10 : null;
  const scoreClass = scoreDisplay != null ? scoreBg(scoreDisplay) : '';

  return (
    <div className="p-4 bg-surface/60 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
      <div>
        <p className="text-xs text-muted mb-1">Score comprador</p>
        {scoreDisplay != null ? (
          <span className={`font-bold text-base ${scoreColor(scoreDisplay)}`}>
            {scoreDisplay.toFixed(1)}/10
          </span>
        ) : <span className="text-muted">—</span>}
        {data.clasificacion && (
          <span className={`ml-2 text-xs rounded-full border px-2 py-0.5 ${scoreClass}`}>
            {data.clasificacion}
          </span>
        )}
      </div>
      <div>
        <p className="text-xs text-muted mb-1">Pago promedio</p>
        <p className="font-medium text-text">
          {data.pago?.mediana_dias_pago != null
            ? `${Math.round(data.pago.mediana_dias_pago)} días`
            : '—'}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted mb-1">Tasa adjudicación</p>
        <p className="font-medium text-text">
          {data.pago?.tasa_adjudicacion != null
            ? `${(data.pago.tasa_adjudicacion * 100).toFixed(0)}%`
            : '—'}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted mb-1">Cancelaciones</p>
        <p className="font-medium text-text">
          {data.pago?.tasa_cancelacion != null
            ? `${(data.pago.tasa_cancelacion * 100).toFixed(0)}%`
            : '—'}
        </p>
      </div>
      {data.risk_flags && data.risk_flags.n_flags > 0 && (
        <div className="col-span-full flex flex-wrap gap-1.5">
          {data.risk_flags.pago_lento && (
            <span title="Este organismo tarda más de 45 días en pagar en promedio" className="badge-error text-xs cursor-help">⚠ Pago lento</span>
          )}
          {data.risk_flags.cancelaciones && (
            <span title="Alta tasa de órdenes canceladas" className="badge-error text-xs cursor-help">⚠ Cancelaciones frecuentes</span>
          )}
          {data.risk_flags.baja_calificacion && (
            <span title="Calificación promedio de proveedores baja" className="badge-error text-xs cursor-help">⚠ Baja calificación</span>
          )}
        </div>
      )}
    </div>
  );
}

export function OportunidadesSection({ oportunidades, loading }: OportunidadesSectionProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const maxScore = oportunidades.length > 0
    ? Math.max(...oportunidades.map((o) => o.opportunity_score))
    : 0;
  const avgCompetidores = oportunidades.length > 0
    ? oportunidades.reduce((s, o) => s + o.n_proveedores, 0) / oportunidades.length
    : 0;

  if (loading) return (
    <div className="card flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  if (!loading && oportunidades.length === 0) return (
    <div className="card flex flex-col items-center gap-3 py-12 text-center">
      <Target className="h-8 w-8 text-muted" />
      <p className="text-sm text-muted">No se encontraron oportunidades para este rubro.</p>
      <p className="text-xs text-subtle">Prueba bajando el filtro mínimo de score o cambiando el rubro.</p>
    </div>
  );

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Oportunidades destacadas
        </h2>
        <p className="text-xs text-muted mt-0.5">¿Dónde hay oportunidad de negocio en este mercado?</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs text-muted">Oportunidades encontradas</p>
          <p className="text-2xl font-bold text-text mt-1">{oportunidades.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs text-muted mb-1">Mejor score</p>
          <p className={`text-2xl font-bold ${maxScore > 0 ? scoreColor(maxScore) : 'text-muted'}`}>
            {maxScore > 0 ? maxScore.toFixed(1) : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs text-muted mb-1.5">Competencia promedio</p>
          {avgCompetidores > 0 ? (
            <CompetitionBadge n={Math.round(avgCompetidores)} />
          ) : (
            <span className="text-muted text-sm">—</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/60 text-left">
              <th className="px-4 py-2.5 text-xs font-medium text-muted">Organismo</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted">Rubro</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted w-40 whitespace-nowrap overflow-visible">
                <div className="group relative inline-flex items-center gap-1 cursor-help">
                  Score de oportunidad
                  <span className="text-muted/60 font-normal">ℹ</span>
                  <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-0 w-64 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-[100] font-normal leading-relaxed whitespace-normal">
                    Score 0–10 que combina volumen de compras, nivel de competencia, estacionalidad y tendencia de crecimiento. Mayor score = mejor oportunidad.
                  </div>
                </div>
              </th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted">Transacciones históricas</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted">Proveedores activos</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {oportunidades.slice(0, 10).map((op, i) => {
              const rowKey = `${op.CodigoOrganismoPublico}-${op.RubroN2}-${i}`;
              const isExpanded = expandedRow === rowKey;
              return (
                <React.Fragment key={rowKey}>
                  <tr
                    className="border-b border-border last:border-0 hover:bg-primary/5 cursor-pointer"
                    onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                  >
                    <td className="px-4 py-3 max-w-[160px]">
                      {op.NombreOrganismo ? (
                        <span
                          title={op.NombreOrganismo}
                          className="block truncate text-xs text-text capitalize-words"
                          style={{ textTransform: 'capitalize' }}
                        >
                          {op.NombreOrganismo.toLowerCase()}
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-muted">{op.CodigoOrganismoPublico}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text max-w-[180px] truncate">{op.RubroN2}</td>
                    <td className="px-4 py-3 w-40">
                      <ScoreBar value={op.opportunity_score} />
                    </td>
                    <td className="px-4 py-3 text-text text-right">{op.n_transacciones.toLocaleString('es-CL')}</td>
                    <td className="px-4 py-3">
                      <CompetitionBadge n={op.n_proveedores} />
                    </td>
                    <td className="px-4 py-3">
                      {isExpanded
                        ? <ChevronUp className="h-3.5 w-3.5 text-muted" />
                        : <ChevronDown className="h-3.5 w-3.5 text-muted" />}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${rowKey}-expanded`}>
                      <td colSpan={6} className="p-0">
                        <ExpandedRow organismo={op.CodigoOrganismoPublico} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
