'use client';

import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { SerieAnualPunto } from '../types';

interface SparklineProps {
  data: SerieAnualPunto[];
  width?: number;
  height?: number;
  color?: string;
}

function formatCLPShort(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}B`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}MM`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toString();
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as SerieAnualPunto;
  return (
    <div className="rounded-lg border border-border bg-surface shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-text">{d.anio}</p>
      <p className="text-muted">CLP {formatCLPShort(d.monto_total)}</p>
      {d.n_oc != null && (
        <p className="text-subtle">{d.n_oc.toLocaleString('es-CL')} OC</p>
      )}
    </div>
  );
};

export function Sparkline({ data, width = 180, height = 60, color = '#00A87A' }: SparklineProps) {
  if (!data || data.length < 2) return null;

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <XAxis dataKey="anio" hide />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip content={<CustomTooltip />} cursor={false} />
          <Line
            type="monotone"
            dataKey="monto_total"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 2.5, fill: color }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
