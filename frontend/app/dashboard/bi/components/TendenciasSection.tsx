// frontend/app/dashboard/bi/components/TendenciasSection.tsx
'use client';

import { Loader2, TrendingUp } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { TendenciaItem, SerieAnualPunto } from '../types';
import { TrendChart } from './TrendChart';
import { InfoTooltip } from './InfoTooltip';

interface TendenciasSectionProps {
  tendencias: TendenciaItem[];
  emergentes: TendenciaItem[];
  loading: boolean;
  selectedRubro: string;
  serieAnual?: SerieAnualPunto[] | null;
  cagrRubro?: number | null;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as TendenciaItem;
  return (
    <div className="rounded-xl border border-border bg-surface shadow-lg px-4 py-3 text-sm max-w-xs">
      <p className="font-semibold text-text mb-1">{d.RubroN2}</p>
      <p className="text-muted">
        Crecimiento anual: <span className={`font-bold ${d.cagr >= 0 ? 'text-accent' : 'text-danger'}`}>
          {d.cagr > 0 ? '+' : ''}{d.cagr.toFixed(1)}%
        </span>
      </p>
      {d.n_anios && (
        <p className="text-xs text-subtle mt-1">
          Basado en {d.total_oc?.toLocaleString('es-CL') ?? '?'} órdenes de compra en {d.n_anios} año{d.n_anios !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};

export function TendenciasSection({ tendencias, emergentes, loading, selectedRubro, serieAnual, cagrRubro }: TendenciasSectionProps) {
  if (loading) return (
    <div className="card flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  // Vista comprimida cuando hay rubro filtrado
  if (selectedRubro && !loading) {
    const found = tendencias.find((t) => t.RubroN2 === selectedRubro);

    // CAGR a mostrar: prefiere cagr_rubro (computed from serie_anual, complete years only),
    // fallback a found.cagr si cagr_rubro no está disponible
    const cagrToShow = cagrRubro !== null && cagrRubro !== undefined
      ? cagrRubro
      : found?.cagr;

    return (
      <section className="card space-y-4">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Tendencias del mercado
            <InfoTooltip
              content={
                <div className="space-y-1.5">
                  <p className="font-semibold">¿Qué estoy viendo?</p>
                  <p>
                    El <b>monto total anual</b> adjudicado en Órdenes de Compra
                    tramitadas vía Mercado Público para este rubro.
                  </p>
                  <p>
                    Suma de todas las transacciones del año (todos los organismos compradores).
                    No incluye licitaciones no adjudicadas.
                  </p>
                  <p className="text-subtle">Fuente: datos abiertos de ChileCompra.</p>
                </div>
              }
              side="bottom"
            />
          </h2>
          <p className="text-xs text-muted mt-0.5">¿Este mercado está creciendo o contrayéndose?</p>
        </div>

        {cagrToShow !== undefined && cagrToShow !== null ? (
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,1fr)_2fr] gap-5 items-center">
              {/* Columna izquierda: métricas */}
              {(() => {
                // Computar YoY del último año desde serieAnual
                let yoyPct: number | null = null;
                let yoyFromYear: number | null = null;
                let yoyToYear: number | null = null;
                if (serieAnual && serieAnual.length >= 2) {
                  const last = serieAnual[serieAnual.length - 1];
                  const prev = serieAnual[serieAnual.length - 2];
                  if (prev.monto_total > 0) {
                    yoyPct = ((last.monto_total / prev.monto_total) - 1) * 100;
                    yoyFromYear = prev.anio;
                    yoyToYear = last.anio;
                  }
                }

                const firstYear = serieAnual?.[0]?.anio;
                const lastYear = serieAnual?.[serieAnual.length - 1]?.anio;
                const cagrLabel = firstYear && lastYear ? `promedio anual ${firstYear}–${lastYear}` : 'promedio anual';

                return (
                  <div>
                    <p className="text-sm text-muted">{selectedRubro}</p>

                    {/* CAGR grande */}
                    <p className={`text-3xl font-bold mt-1 ${(cagrToShow ?? 0) >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {(cagrToShow ?? 0) > 0 ? '+' : ''}{(cagrToShow ?? 0).toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted mt-0.5">{cagrLabel}</p>

                    {/* YoY */}
                    {yoyPct !== null && (
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className={`text-sm font-semibold ${yoyPct >= 0 ? 'text-accent' : 'text-danger'}`}>
                          {yoyPct > 0 ? '+' : ''}{yoyPct.toFixed(1)}%
                        </span>
                        <span className="text-xs text-muted">
                          en {yoyToYear} vs. {yoyFromYear}
                        </span>
                      </div>
                    )}

                    {/* Stats pequeños */}
                    <div className="mt-3 text-xs text-muted space-y-0.5">
                      {found?.total_oc && <p>{found.total_oc.toLocaleString('es-CL')} OC totales</p>}
                      {serieAnual && <p>{serieAnual.length} años completos</p>}
                    </div>
                  </div>
                );
              })()}

              {/* Columna derecha: chart que expande */}
              {serieAnual && serieAnual.length >= 2 ? (
                <div className="w-full h-[140px]">
                  <TrendChart
                    data={serieAnual}
                    color={cagrToShow >= 0 ? '#00A87A' : '#EF4444'}
                  />
                </div>
              ) : (
                <div className="w-full h-[140px] flex items-center justify-center text-xs text-muted">
                  Sin serie anual disponible
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Sin datos de tendencia para este rubro.</p>
        )}

      </section>
    );
  }
  // Vista completa (sin rubro) — render original continúa abajo

  const chartData = [...tendencias]
    .sort((a, b) => b.cagr - a.cagr)
    .slice(0, 12)
    .map((t) => ({
      ...t,
      label: t.RubroN2.length > 35 ? t.RubroN2.slice(0, 35) + '…' : t.RubroN2,
    }));

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Tendencias del mercado
          <InfoTooltip
            content={
              <div className="space-y-1.5">
                <p className="font-semibold">¿Qué estoy viendo?</p>
                <p>
                  El <b>monto total anual</b> adjudicado en Órdenes de Compra
                  tramitadas vía Mercado Público para este rubro.
                </p>
                <p>
                  Suma de todas las transacciones del año (todos los organismos compradores).
                  No incluye licitaciones no adjudicadas.
                </p>
                <p className="text-subtle">Fuente: datos abiertos de ChileCompra.</p>
              </div>
            }
            side="bottom"
          />
        </h2>
        <p className="text-xs text-muted mt-0.5">¿Este mercado está creciendo o contrayéndose?</p>
      </div>

      {/* Emergentes badges */}
      {emergentes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-muted self-center">En alza:</span>
          {emergentes.slice(0, 3).map((e) => (
            <span
              key={e.RubroN2}
              className="flex items-center gap-1.5 rounded-full bg-accent/15 border border-accent/25 px-3 py-1 text-xs font-semibold text-accent"
            >
              ↗ {e.RubroN2} {e.cagr > 0 ? '+' : ''}{e.cagr.toFixed(0)}% anual
            </span>
          ))}
        </div>
      )}

      {/* Horizontal bar chart */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 36)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 40, left: 8, bottom: 24 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis
              type="number"
              tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              label={{ value: 'Crecimiento anual (%)', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#94a3b8' }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={200}
              tick={{ fontSize: 11, fill: '#64748b' }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
            <ReferenceLine x={0} stroke="#cbd5e1" strokeWidth={1.5} />
            <Bar dataKey="cagr" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {chartData.map((entry, i) => (
                <Cell
                  key={`cell-${i}`}
                  fill={entry.cagr >= 0 ? '#00A87A' : '#EF4444'}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <TrendingUp className="h-7 w-7 text-muted" />
          <p className="text-sm text-muted">No hay datos de tendencias para este rubro.</p>
        </div>
      )}
    </section>
  );
}
