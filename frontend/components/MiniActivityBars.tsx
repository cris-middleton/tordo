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
import { Calendar } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { ConfidenceBadge } from './ConfidenceBadge';

const MONTH_ABBR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

interface ChartEntry {
  mes: string;
  prob: number;
  peak: boolean;
}

interface MiniActivityBarsProps {
  organismoId?: string | null;
}

export function MiniActivityBars({ organismoId }: MiniActivityBarsProps) {
  const [data, setData] = useState<ChartEntry[]>([]);
  const [nBase, setNBase] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  // TODO: migrar a React Query

  useEffect(() => {
    if (!organismoId) {
      setUnavailable(true);
      setLoading(false);
      return;
    }

    apiClient
      .getBIEstacionalidad(organismoId)
      .then((res: any) => {
        if (res.disponible === false) {
          setUnavailable(true);
          return;
        }
        const patrones: any[] = res.patrones || [];
        const totalCompras = patrones.reduce((sum, p) => sum + ((p.compras_mes as number) ?? 0), 0);
        setNBase(Math.round(totalCompras));
        setData(
          patrones.map((p) => ({
            mes: MONTH_ABBR[((p.mes as number) ?? 1) - 1] ?? '?',
            prob: Math.round(((p.prob_mes as number) ?? 0) * 100),
            peak: (p.es_pico_estacional as boolean) ?? false,
          })),
        );
      })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, [organismoId]);

  if (loading) return <div className="card animate-pulse h-36" />;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="section-title">Actividad mensual</h2>
          <p className="text-xs text-muted mt-0.5">Probabilidad de compra por mes</p>
        </div>
        <div className="flex items-center gap-2">
          {!unavailable && nBase > 0 && <ConfidenceBadge n={nBase} />}
          <div className="rounded-lg bg-primary/10 p-2">
            <Calendar size={16} className="text-primary" />
          </div>
        </div>
      </div>

      {unavailable || data.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 h-16 text-center">
          <p className="text-sm text-muted">
            {!organismoId
              ? 'Selecciona un organismo en el módulo BI para ver su estacionalidad.'
              : 'Sin datos de estacionalidad para este organismo.'}
          </p>
        </div>
      ) : (
        <div className="h-16">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barSize={14} margin={{ top: 2, right: 4, bottom: 2, left: 4 }}>
              <XAxis
                dataKey="mes"
                stroke="transparent"
                tick={{ fill: 'var(--color-text-hex)', fontSize: 9, fontFamily: 'var(--font-dm-sans)', opacity: 0.5 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value: number) => [`${value}%`, 'Prob. compra']}
                cursor={{ fill: 'rgba(0,200,150,0.05)', radius: 4 }}
                contentStyle={{
                  borderRadius: '8px',
                  border: `1px solid var(--color-border-hex)`,
                  background: 'var(--color-surface-elevated-hex)',
                  fontSize: '11px',
                  color: 'var(--color-text-hex)',
                  fontFamily: 'var(--font-dm-sans)',
                }}
              />
              <Bar dataKey="prob" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.peak ? '#F59E0B' : '#00C896'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
