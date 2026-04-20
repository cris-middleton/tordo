// frontend/app/dashboard/bi/components/EstacionalidadSection.tsx
'use client';

import { useState, useEffect } from 'react';
import { Loader2, Calendar } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { EstacionalidadMes, MESES, OrganismoConNombre } from '../types';
import { apiClient } from '@/lib/api';

interface EstacionalidadSectionProps {
  topOrganismos: OrganismoConNombre[];
  rubro: string;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as any;
  if (!d) return null;
  const prob = d.prob_mes != null ? (d.prob_mes * 100).toFixed(0) : '?';
  const consist = d.consistencia != null ? (d.consistencia * 100).toFixed(0) : '?';
  return (
    <div className="rounded-xl border border-border bg-surface shadow-lg px-4 py-3 text-sm max-w-xs">
      <p className="font-semibold text-text mb-1">{d.label}</p>
      <p className="text-muted">
        Probabilidad de compra: <span className="text-text font-medium">{prob}%</span>
      </p>
      <p className="text-muted">
        Consistencia: <span className="text-text font-medium">{consist}%</span>
      </p>
      {d.es_pico_estacional && (
        <p className="text-accent font-medium mt-1">📈 Mes pico</p>
      )}
    </div>
  );
};

export function EstacionalidadSection({ topOrganismos, rubro }: EstacionalidadSectionProps) {
  const [selectedOrg, setSelectedOrg] = useState(topOrganismos[0]?.codigo ?? '');
  const [patrones, setPatrones] = useState<EstacionalidadMes[]>([]);
  const [loading, setLoading] = useState(false);

  const selectedOrgNombre = topOrganismos.find((o) => o.codigo === selectedOrg)?.nombre
    || selectedOrg;

  // Reset selectedOrg whenever the organismo list is replaced (e.g. after a rubro change)
  useEffect(() => {
    if (topOrganismos.length > 0) {
      setSelectedOrg(topOrganismos[0].codigo);
    } else {
      setSelectedOrg('');
    }
  }, [topOrganismos]);

  useEffect(() => {
    if (!selectedOrg) return;
    setLoading(true);
    apiClient.getBIEstacionalidad(selectedOrg, { rubro: rubro || undefined })
      .then((res) => {
        if (res.disponible) setPatrones(res.patrones ?? []);
        else setPatrones([]);
      })
      .catch(() => setPatrones([]))
      .finally(() => setLoading(false));
  }, [selectedOrg, rubro]);

  const chartData = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const found = patrones.find((p) => p.mes === mes);
    const prob = found?.prob_mes ?? 0;
    const consist = found?.consistencia ?? 0;
    const spread = (1 - consist) * prob * 0.5;
    return {
      label: MESES[i],
      mes,
      prob_mes: found?.prob_mes,
      consistencia: found?.consistencia,
      es_pico_estacional: found?.es_pico_estacional ?? false,
      bandLow: Math.max(0, prob - spread),
      bandHigh: Math.min(1, prob + spread),
      probPct: prob * 100,
    };
  });

  const picoMeses = chartData.filter((d) => d.es_pico_estacional).map((d) => d.label);
  const avgConsist = patrones.length > 0
    ? (patrones.reduce((s, p) => s + (p.consistencia ?? 0), 0) / patrones.length * 100).toFixed(0)
    : null;

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Estacionalidad de compras
          </h2>
          <p className="text-xs text-muted mt-0.5">¿En qué meses compran más?</p>
        </div>

        {topOrganismos.length > 1 && (
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="text-sm rounded-lg border border-border bg-surface px-3 py-1.5 text-text"
          >
            {topOrganismos.map((o) => (
              <option key={o.codigo} value={o.codigo} title={o.nombre}>
                {o.nombre.length > 40 ? `${o.nombre.slice(0, 40)}…` : o.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {picoMeses.length > 0 && (
        <div className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          <span className="font-semibold">{selectedOrgNombre.length > 50 ? selectedOrgNombre.slice(0, 50) + '…' : selectedOrgNombre}</span>
          {' '}suele comprar más en <span className="font-semibold">{picoMeses.join(', ')}</span>.
          {avgConsist && ` Consistencia promedio: ${avgConsist}%.`}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : patrones.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Calendar className="h-7 w-7 text-muted" />
          <p className="text-sm text-muted">Sin datos de estacionalidad para este organismo y rubro.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="bandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B5BDB" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3B5BDB" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis
              tickFormatter={(v) => `${(v).toFixed(0)}%`}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              domain={[0, 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Confidence band upper */}
            <Area
              type="monotone"
              dataKey="bandHigh"
              stroke="none"
              fill="url(#bandGradient)"
              isAnimationActive={false}
            />
            {/* Confidence band lower — masks to create band effect */}
            <Area
              type="monotone"
              dataKey="bandLow"
              stroke="none"
              fill="#ffffff"
              isAnimationActive={false}
            />
            {/* Main line */}
            <Area
              type="monotone"
              dataKey="probPct"
              stroke="#3B5BDB"
              strokeWidth={2}
              fill="none"
              dot={(props: any) => {
                const d = props.payload;
                if (!d.es_pico_estacional) {
                  return <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="#3B5BDB" opacity={0.5} />;
                }
                return (
                  <circle
                    key={props.key}
                    cx={props.cx}
                    cy={props.cy}
                    r={6}
                    fill="#00A87A"
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                );
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
