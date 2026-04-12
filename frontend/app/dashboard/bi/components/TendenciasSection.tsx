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
import { TendenciaItem } from '../types';

interface TendenciasSectionProps {
  tendencias: TendenciaItem[];
  emergentes: TendenciaItem[];
  loading: boolean;
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

export function TendenciasSection({ tendencias, emergentes, loading }: TendenciasSectionProps) {
  if (loading) return (
    <div className="card flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

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
            margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis
              type="number"
              tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
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
