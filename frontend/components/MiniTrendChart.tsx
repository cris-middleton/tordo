'use client';

import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { ConfidenceBadge } from './ConfidenceBadge';

interface ChartEntry {
  name: string;
  cagr: number;
  positive: boolean;
}

export function MiniTrendChart() {
  const [data, setData] = useState<ChartEntry[]>([]);
  const [nBase, setNBase] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  // TODO: migrar a React Query

  useEffect(() => {
    apiClient
      .getBITendencia({ limit: 6 })
      .then((res: any) => {
        if (res.disponible === false) {
          setUnavailable(true);
          return;
        }
        const items: any[] = res.tendencias || [];
        setNBase(res.total ?? items.length);
        setData(
          items
            .filter((t) => t.cagr != null)
            .slice(0, 6)
            .map((t) => ({
              name: ((t.RubroN2 as string) || 'N/A').substring(0, 12),
              cagr: Math.round((t.cagr as number) * 100),
              positive: (t.cagr as number) >= 0,
            })),
        );
      })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card animate-pulse h-36" />;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="section-title">Tendencias de mercado</h2>
          <p className="text-xs text-muted mt-0.5">Crecimiento anual por rubro (CAGR) — top 6</p>
        </div>
        <div className="flex items-center gap-2">
          {!unavailable && nBase > 0 && <ConfidenceBadge n={nBase} />}
          <div className="rounded-lg bg-info/10 p-2">
            <TrendingUp size={16} className="text-info" />
          </div>
        </div>
      </div>

      {unavailable || data.length === 0 ? (
        <div className="flex items-center justify-center h-16 text-sm text-muted">
          Sin datos de tendencias disponibles
        </div>
      ) : (
        <div className="h-16">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barSize={20} margin={{ top: 2, right: 4, bottom: 2, left: 4 }}>
              <XAxis
                dataKey="name"
                stroke="transparent"
                tick={{ fill: '#94A3B8', fontSize: 9, fontFamily: 'var(--font-dm-sans)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value: number) => [`${value}%`, 'CAGR']}
                cursor={{ fill: 'rgba(0,200,150,0.05)', radius: 4 }}
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #1A1F2C',
                  background: '#0F1117',
                  fontSize: '11px',
                  color: '#E2E8F0',
                  fontFamily: 'var(--font-dm-sans)',
                }}
              />
              <Bar dataKey="cagr" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.positive ? '#00C896' : '#F87171'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
