'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { Star } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

const ANALYTICS_ENABLED = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== 'false';

export default function AnalyticsPage() {
  const router = useRouter();

  const [stats, setStats] = useState<{
    active_tenders: number
    unread_alerts: number
    active_postulaciones: number
    expiring_docs: number
  } | null>(null);

  const [oportunidades, setOportunidades] = useState<Array<{
    organismo_id: string
    nombre_organismo: string
    score: number
    n_transacciones: number
    n_proveedores: number
    monto_promedio: number
    sector: string
  }>>([]);

  const [tendencias, setTendencias] = useState<Array<{
    rubro: string
    cagr: number
    n_transacciones: number
    tendencia: string
    es_emergente: boolean
  }>>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ANALYTICS_ENABLED) {
      router.replace('/dashboard/bi');
      return;
    }

    setLoading(true);
    Promise.allSettled([
      apiClient.getDashboardStats(),
      apiClient.getBIOportunidades({ limit: 10 }),
      apiClient.getBITendencia({ limit: 8 }),
    ])
      .then(([statsRes, opRes, tendRes]) => {
        if (statsRes.status === 'fulfilled') setStats(statsRes.value);
        if (opRes.status === 'fulfilled')
          setOportunidades((opRes.value as any)?.oportunidades ?? []);
        if (tendRes.status === 'fulfilled')
          setTendencias((tendRes.value as any)?.tendencias ?? []);
      })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-text sm:text-3xl">
            Analítica Avanzada
          </h1>
          <p className="text-sm text-muted">
            Visualizaciones y análisis de licitaciones y órdenes de compra
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2">
          <Star className="h-4 w-4 text-gold" />
          <span className="text-xs font-semibold text-gold">Funcionalidad Pro</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Licitaciones activas', value: stats?.active_tenders, color: 'text-info' },
          { label: 'Alertas sin leer',     value: stats?.unread_alerts,   color: 'text-gold' },
          { label: 'Postulaciones',        value: stats?.active_postulaciones, color: 'text-accent' },
          { label: 'Docs por vencer (30d)', value: stats?.expiring_docs,  color: 'text-danger' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface rounded-xl p-4 shadow-sm border border-border">
            <p className="text-xs text-muted mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>
              {loading ? '…' : value ?? '—'}
            </p>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Chart 1 — Oportunidades de mercado */}
        <div className="bg-surface rounded-xl p-5 shadow-sm border border-border">
          <h3 className="text-sm font-semibold text-text mb-4">
            Top Oportunidades de Mercado
          </h3>
          {loading && <div className="animate-pulse bg-background rounded-lg h-64" />}
          {!loading && oportunidades.length === 0 && (
            <p className="text-sm text-muted text-center py-10">
              Sin datos — activa <code className="text-xs bg-border px-1 rounded">FEATURE_ANALYTICS=true</code> para ver oportunidades reales.
            </p>
          )}
          {!loading && oportunidades.length > 0 && (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={oportunidades.slice(0, 8)}
                layout="vertical"
                margin={{ left: 120, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1A1F2C" />
                <XAxis
                  type="number"
                  domain={[0, 10]}
                  tickFormatter={(v: number) => `${v}/10`}
                  fontSize={11}
                  stroke="transparent"
                  tick={{ fill: '#94A3B8' }}
                />
                <YAxis
                  type="category"
                  dataKey="nombre_organismo"
                  width={115}
                  fontSize={10}
                  stroke="transparent"
                  tick={{ fill: '#94A3B8' }}
                  tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 18)}…` : v)}
                />
                <Tooltip
                  formatter={(v: number) => [`${v.toFixed(1)}/10`, 'Score']}
                  contentStyle={{ background: '#0F1117', border: '1px solid #1A1F2C', color: '#E2E8F0', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
                />
                <Bar dataKey="score" fill="#4A8FE7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 2 — Tendencias CAGR */}
        <div className="bg-surface rounded-xl p-5 shadow-sm border border-border">
          <h3 className="text-sm font-semibold text-text mb-4">
            Tendencias de Mercado (CAGR)
          </h3>
          {loading && <div className="animate-pulse bg-background rounded-lg h-64" />}
          {!loading && tendencias.length === 0 && (
            <p className="text-sm text-muted text-center py-10">
              Sin datos — activa <code className="text-xs bg-border px-1 rounded">FEATURE_ANALYTICS=true</code> para ver tendencias reales.
            </p>
          )}
          {!loading && tendencias.length > 0 && (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={tendencias} margin={{ bottom: 40, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1A1F2C" />
                <XAxis
                  dataKey="rubro"
                  angle={-35}
                  textAnchor="end"
                  fontSize={10}
                  stroke="transparent"
                  tick={{ fill: '#94A3B8' }}
                  tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 12)}…` : v)}
                />
                <YAxis
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  fontSize={11}
                  stroke="transparent"
                  tick={{ fill: '#94A3B8' }}
                />
                <Tooltip
                  formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'CAGR']}
                  contentStyle={{ background: '#0F1117', border: '1px solid #1A1F2C', color: '#E2E8F0', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
                />
                <Bar dataKey="cagr" radius={[4, 4, 0, 0]}>
                  {tendencias.map((entry, i) => (
                    <Cell key={i} fill={entry.es_emergente ? '#F59E0B' : '#00C896'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="flex gap-4 mt-3 text-xs text-muted">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded inline-block" style={{ background: '#00C896' }} /> Normal
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded inline-block" style={{ background: '#F59E0B' }} /> Emergente (&gt;20% CAGR)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
