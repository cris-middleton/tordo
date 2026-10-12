'use client';

import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { SerieAnualPunto } from '../types';
import { decimal } from '@/lib/formato';

interface TrendChartProps {
  data: SerieAnualPunto[];
  color?: string;
}

function formatCLPShort(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${decimal(abs / 1e12, 1)}B`;
  if (abs >= 1e9) return `${sign}${decimal(abs / 1e9, 1)} MM`;
  if (abs >= 1e6) return `${sign}${decimal(abs / 1e6, 0)} M`;
  if (abs >= 1e3) return `${sign}${decimal(abs / 1e3, 0)} K`;
  return `${sign}${decimal(abs, 0)}`;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as SerieAnualPunto;
  return (
    <div className="rounded-lg border border-border bg-surface shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-text">{d.anio}</p>
      <p className="text-muted">CLP {formatCLPShort(d.monto_total)}</p>
      {d.n_oc != null && <p className="text-subtle">{d.n_oc.toLocaleString('es-CL')} OC</p>}
    </div>
  );
};

export function TrendChart({ data, color = '#0E7C7F' }: TrendChartProps) {
  if (!data || data.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#DCE3ED" vertical={false} />
        <XAxis
          dataKey="anio"
          type="category"
          tick={{ fontSize: 11, fill: '#5F7089' }}
          tickLine={false}
          axisLine={{ stroke: '#DCE3ED' }}
          interval={0}
          padding={{ left: 8, right: 8 }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#5F7089' }}
          tickFormatter={(v) => formatCLPShort(v)}
          tickLine={false}
          axisLine={false}
          width={60}
          tickCount={3}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#C4D0E0' }} />
        <Line
          type="monotone"
          dataKey="monto_total"
          stroke={color}
          strokeWidth={2.5}
          dot={{ r: 3, fill: color }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
