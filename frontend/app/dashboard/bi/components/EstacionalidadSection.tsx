// frontend/app/dashboard/bi/components/EstacionalidadSection.tsx
'use client';

import { useState } from 'react';
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
import { useEstacionalidad } from '@/lib/queries';
import { InfoTooltip } from './InfoTooltip';

interface EstacionalidadSectionProps {
  topOrganismos: OrganismoConNombre[];
  rubro: string;
  focusedOrganismo?: OrganismoConNombre | null;
  focused?: boolean; // when true, hide the organismo dropdown (filter is shown in filter bar chip)
  focusedNombre?: string; // NEW: display name of the focused organismo
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

export function EstacionalidadSection({ topOrganismos, rubro, focusedOrganismo, focused, focusedNombre }: EstacionalidadSectionProps) {
  // El organismo mostrado se DERIVA, no se sincroniza con dos efectos: manda el
  // enfocado si lo hay, si no el que el usuario haya elegido, y si no el primero
  // de la lista. Los efectos que hacían eso competían entre sí — uno reponía el
  // primero justo después de que el otro pusiera el enfocado.
  const [orgElegido, setSelectedOrg] = useState('');
  const selectedOrg = focusedOrganismo?.codigo || orgElegido || topOrganismos[0]?.codigo || '';

  // Combine topOrganismos with focusedOrganismo if it's not already in the list
  const optionsOrganismos = focusedOrganismo && !topOrganismos.find((o) => o.codigo === focusedOrganismo.codigo)
    ? [focusedOrganismo, ...topOrganismos]
    : topOrganismos;

  const selectedOrgNombre = optionsOrganismos.find((o) => o.codigo === selectedOrg)?.nombre
    || selectedOrg;

  const { data: res, isFetching } = useEstacionalidad(selectedOrg || undefined, rubro);
  const patrones = ((res?.disponible ? res.patrones : []) ?? []) as EstacionalidadMes[];
  const loading = Boolean(selectedOrg) && isFetching;

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
            <InfoTooltip
              content={
                <div className="space-y-1.5">
                  <p><b>Probabilidad de compra:</b> % de los años en que este comprador compra en ese mes.</p>
                  <p><b>Consistencia:</b> qué tan repetible es el patrón. 100% = siempre los mismos meses; 0% = errático.</p>
                  <p><b>Picos</b> (dot grande): meses consistentemente activos.</p>
                </div>
              }
              side="bottom"
            />
          </h2>
          <p className="text-xs text-muted mt-0.5">
            {focused && focusedNombre
              ? <>¿En qué meses compra <span className="font-medium text-text">{focusedNombre.length > 45 ? `${focusedNombre.slice(0, 45)}…` : focusedNombre}</span>?</>
              : '¿En qué meses compran más?'}
          </p>
        </div>

        {!focused && optionsOrganismos.length > 1 && (
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            disabled={!!focusedOrganismo}
            className="text-sm rounded-lg border border-border bg-surface px-3 py-1.5 text-text disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {optionsOrganismos.map((o) => (
              <option key={o.codigo} value={o.codigo} title={o.nombre}>
                {o.nombre.length > 40 ? `${o.nombre.slice(0, 40)}…` : o.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {picoMeses.length > 0 && (
        <div className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-2.5 text-sm text-accent flex flex-wrap items-center gap-1">
          <span>Suele comprar más en</span>
          <span className="font-semibold">{picoMeses.join(', ')}.</span>
          {avgConsist && (
            <span className="flex items-center gap-1">
              <span>Consistencia promedio:</span>
              <InfoTooltip
                content={
                  <div>
                    Qué tan repetible es el patrón año a año.
                    <br />
                    <b>100%</b> = compran siempre en los mismos meses.
                    <br />
                    <b>0%</b> = patrón errático.
                  </div>
                }
              >
                <span className="font-semibold">{avgConsist}%</span>
              </InfoTooltip>
            </span>
          )}
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
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="bandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#102858" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#102858" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#DCE3ED" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5F7089' }} />
            <YAxis
              tickFormatter={(v) => `${(v).toFixed(0)}%`}
              tick={{ fontSize: 11, fill: '#5F7089' }}
              domain={[0, 'auto']}
              width={70}
              label={{
                value: 'Probabilidad de compra (%)',
                angle: -90,
                position: 'insideLeft',
                offset: 0,
                style: { fontSize: 11, fill: '#54637A', textAnchor: 'middle' },
              }}
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
              stroke="#102858"
              strokeWidth={2}
              fill="none"
              dot={(props: any) => {
                const d = props.payload;
                if (!d.es_pico_estacional) {
                  return <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="#102858" opacity={0.5} />;
                }
                return (
                  <circle
                    key={props.key}
                    cx={props.cx}
                    cy={props.cy}
                    r={6}
                    fill="#0E7C7F"
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
