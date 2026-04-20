// frontend/app/dashboard/bi/components/CompetenciaSection.tsx
'use client';

import { useState, useEffect } from 'react';
import { Loader2, Users } from 'lucide-react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CompetidorItem, ConcentracionItem, OrganismoConNombre } from '../types';
import { apiClient } from '@/lib/api';
import { InfoTooltip } from './InfoTooltip';

interface CompetenciaSectionProps {
  topOrganismos: OrganismoConNombre[];
  selectedOrganismo: string;
  onOrganismoChange: (o: string) => void;
  rubro: string;
  disabled?: boolean;
  focused?: boolean; // when true, hide the organismo dropdown (filter is shown in filter bar chip)
}

// Hex values — CSS vars don't resolve inside Recharts SVG fill props
const COLORS = [
  '#3B5BDB', '#00A87A', '#F59E0B', '#EF4444', '#8b5cf6', '#06b6d4',
];

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as CompetidorItem;
  return (
    <div className="rounded-xl border border-border bg-surface shadow-lg px-4 py-3 text-sm max-w-xs">
      <p className="font-semibold text-text">{d.NombreProveedor}</p>
      <p className="text-muted mt-1">Participación: <span className="text-text font-medium">{d.market_share_pct.toFixed(1)}%</span></p>
      <p className="text-muted">Tasa adjudicación: <span className="text-text font-medium">{d.win_rate_pct.toFixed(1)}%</span></p>
      <p className="text-muted">{d.n_oc.toLocaleString('es-CL')} órdenes de compra</p>
    </div>
  );
};

export function CompetenciaSection({
  topOrganismos,
  selectedOrganismo,
  onOrganismoChange,
  rubro,
  disabled,
  focused,
}: CompetenciaSectionProps) {
  const [competidores, setCompetidores] = useState<CompetidorItem[]>([]);
  const [concentracion, setConcentracion] = useState<ConcentracionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!selectedOrganismo) return;
    setLoading(true);
    apiClient.getBICompetidores(selectedOrganismo, { rubro: rubro || undefined, top_n: 10 })
      .then((res) => {
        if (res.disponible) {
          setCompetidores(res.competidores ?? []);
          setConcentracion(res.concentracion ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedOrganismo, rubro]);

  const tipoMercado = concentracion[0]?.tipo_mercado;
  const nProveedores = concentracion[0]?.n_proveedores;

  // Normaliza tipo_mercado del backend a una sola palabra capitalizada
  function tipoLabelCorto(tipo: string | null | undefined): string {
    if (!tipo) return '';
    const lower = tipo.toLowerCase().trim();
    const known: Record<string, string> = {
      concentrado: 'Concentrado',
      moderado: 'Moderado',
      fragmentado: 'Fragmentado',
      competitivo: 'Competitivo',
    };
    if (known[lower]) return known[lower];
    // Fallback: capitaliza primera letra del string raw del backend
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Competencia
          </h2>
          <p className="text-xs text-muted mt-0.5">¿Contra quién compites en este mercado?</p>
        </div>

        {!focused && topOrganismos.length > 1 && (
          <select
            value={selectedOrganismo}
            onChange={(e) => onOrganismoChange(e.target.value)}
            disabled={disabled}
            className="text-sm rounded-lg border border-border bg-surface px-3 py-1.5 text-text disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {topOrganismos.map((o) => (
              <option key={o.codigo} value={o.codigo} title={o.nombre}>
                {o.nombre.length > 40 ? `${o.nombre.slice(0, 40)}…` : o.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {tipoMercado && (
        <div className="rounded-xl border border-border bg-surface/60 px-4 py-3 text-sm flex items-center gap-3 flex-wrap">
          <span className="font-medium text-text">
            {nProveedores != null ? `${nProveedores} proveedores activos.` : ''}
          </span>
          <span className="text-muted">
            Mercado{' '}
            <InfoTooltip
              content={
                <div className="space-y-1.5">
                  <p><b>Concentrado:</b> pocos proveedores dominan.</p>
                  <p><b>Moderado:</b> competencia equilibrada con varios actores.</p>
                  <p><b>Fragmentado:</b> muchos proveedores compiten.</p>
                  <p><b>Competitivo:</b> alta rotación entre proveedores.</p>
                </div>
              }
            >
              <span className="font-medium text-text">{tipoLabelCorto(tipoMercado)}</span>
            </InfoTooltip>
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : competidores.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Users className="h-7 w-7 text-muted" />
          <p className="text-sm text-muted">Sin datos de competencia para este organismo.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => setShowTable(false)}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${!showTable ? 'bg-primary text-white border-primary' : 'border-border text-muted hover:text-text'}`}
            >
              Gráfico
            </button>
            <button
              onClick={() => setShowTable(true)}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${showTable ? 'bg-primary text-white border-primary' : 'border-border text-muted hover:text-text'}`}
            >
              Tabla
            </button>
          </div>

          {!showTable ? (
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="win_rate_pct"
                  name="Tasa adjudicación"
                  type="number"
                  label={{ value: 'Tasa de adjudicación (%)', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#94a3b8' }}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                />
                <YAxis
                  dataKey="market_share_pct"
                  name="Participación"
                  type="number"
                  label={{ value: 'Participación de mercado (%)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                />
                <ZAxis dataKey="n_oc" range={[40, 400]} />
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={competidores} isAnimationActive={false}>
                  {competidores.map((_, i) => (
                    <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} fillOpacity={0.75} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface/60 text-left">
                    <th className="px-4 py-2.5 text-xs font-medium text-muted">#</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted">Proveedor</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted">Participación</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted">Tasa adjudicación</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted">OC</th>
                  </tr>
                </thead>
                <tbody>
                  {competidores.map((c, i) => (
                    <tr key={c.CodigoProveedor} className="border-b border-border last:border-0 hover:bg-primary/5">
                      <td className="px-4 py-2.5 text-muted text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-text">{c.NombreProveedor}</td>
                      <td className="px-4 py-2.5">{c.market_share_pct.toFixed(1)}%</td>
                      <td className="px-4 py-2.5">{c.win_rate_pct.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-muted">{c.n_oc.toLocaleString('es-CL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
