// frontend/app/(panel)/mercado/components/CompetenciaSection.tsx
'use client';

import { useState } from 'react';
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
import { textoPeriodo } from '@/lib/periodo';
import { ErrorDeCarga } from '@/components/ErrorDeCarga';
import { useCompetidores } from '@/lib/queries';
import { InfoTooltip } from '@/components/bi/InfoTooltip';
import { decimal } from '@/lib/formato';

interface CompetenciaSectionProps {
  topOrganismos: OrganismoConNombre[];
  selectedOrganismo: string;
  onOrganismoChange: (o: string) => void;
  rubro: string;
  disabled?: boolean;
  focused?: boolean; // when true, hide the organismo dropdown (filter is shown in filter bar chip)
  focusedNombre?: string; // NEW: display name of the focused organismo
}

// Hex values — CSS vars don't resolve inside Recharts SVG fill props
const COLORS = [
  '#102858', '#0E7C7F', '#96590A', '#B91C1C', '#8b5cf6', '#06b6d4',
];

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as CompetidorItem;
  return (
    <div className="rounded-xl border border-border bg-surface shadow-lg px-4 py-3 text-sm max-w-xs">
      <p className="font-semibold text-text">{d.NombreProveedor}</p>
      <p className="text-muted mt-1">Participación: <span className="text-text font-medium">{decimal(d.market_share_pct, 1)}%</span></p>
      <p className="text-muted">Tasa adjudicación: <span className="text-text font-medium">{decimal(d.win_rate_pct, 1)}%</span></p>
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
  focusedNombre,
}: CompetenciaSectionProps) {
  const consulta = useCompetidores(selectedOrganismo || undefined, rubro);
  const { data: res, isPending } = consulta;
  // Se conserva la regla anterior: si el backend dice `disponible: false`, se
  // trata como si no hubiera datos, no como un error.
  const competidores = ((res?.disponible ? res.competidores : []) ?? []) as CompetidorItem[];
  const concentracion = ((res?.disponible ? res.concentracion : []) ?? []) as ConcentracionItem[];
  const loading = Boolean(selectedOrganismo) && isPending;
  // Una cuota sin periodo se lee como «de siempre»: son los últimos 36 meses.
  const periodo = res?.disponible ? textoPeriodo(res.periodo) : null;
  const [showTable, setShowTable] = useState(false);

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
      // Nombre anterior del mismo tramo; sigue llegando hasta la próxima
      // materialización semanal de analytics.
      competitivo: 'Fragmentado',
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
          <p className="text-xs text-muted mt-0.5">
            {focused && focusedNombre
              ? <>¿Contra quién compites para vender a <span className="font-medium text-text">{focusedNombre.length > 45 ? `${focusedNombre.slice(0, 45)}…` : focusedNombre}</span>?</>
              : '¿Contra quién compites en este mercado?'}
          </p>
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
                /* Había una cuarta entrada, «Competitivo: alta rotación entre
                   proveedores», y sobraba por dos motivos.

                   Uno: `tipoLabelCorto` mapea `competitivo` a «Fragmentado»
                   —es el nombre viejo del mismo tramo—, así que esa etiqueta no
                   se puede pintar nunca. El usuario abría la ayuda para
                   entender qué significa lo que está leyendo y se encontraba
                   una categoría fantasma.

                   Dos: la definición era falsa. Lo que mide este índice es
                   CONCENTRACIÓN, no rotación; «competitivo» además se lee al
                   revés de lo que significa, que es justo por lo que se
                   renombró el tramo.

                   Los textos se alinean con los de `PanoramaRubro`, que ya
                   decían qué implica cada tramo para quien va a postular en vez
                   de describir el índice. */
                <div className="space-y-1.5">
                  <p><b>Concentrado:</b> pocos proveedores se llevan casi todo. Entrar cuesta más.</p>
                  <p><b>Moderado:</b> hay competidores fuertes, pero el mercado no está cerrado.</p>
                  <p><b>Fragmentado:</b> muchos proveedores se reparten el mercado. Hay espacio.</p>
                </div>
              }
            >
              <span className="font-medium text-text">{tipoLabelCorto(tipoMercado)}</span>
            </InfoTooltip>
          </span>
        </div>
      )}

      {periodo && <p className="text-xs text-muted">Cuotas de {periodo}</p>}

      {consulta.isError ? (
        <ErrorDeCarga
          titulo="No pudimos cargar la competencia"
          error={consulta.error}
          onReintentar={() => void consulta.refetch()}
          reintentando={consulta.isFetching}
        />
      ) : loading ? (
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
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${!showTable ? 'bg-primary text-onPrimary border-primary' : 'border-border text-muted hover:text-text'}`}
            >
              Gráfico
            </button>
            <button
              onClick={() => setShowTable(true)}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${showTable ? 'bg-primary text-onPrimary border-primary' : 'border-border text-muted hover:text-text'}`}
            >
              Tabla
            </button>
          </div>

          {!showTable ? (
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#DCE3ED" />
                <XAxis
                  dataKey="win_rate_pct"
                  name="Tasa adjudicación"
                  type="number"
                  label={{ value: 'Tasa de adjudicación (%)', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#5F7089' }}
                  tick={{ fontSize: 11, fill: '#5F7089' }}
                />
                <YAxis
                  dataKey="market_share_pct"
                  name="Participación"
                  type="number"
                  width={70}
                  tick={{ fontSize: 11, fill: '#5F7089' }}
                  label={{
                    value: 'Participación de mercado (%)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 0,
                    style: { fontSize: 11, fill: '#54637A', textAnchor: 'middle' },
                  }}
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
                      <td className="cifra px-4 py-2.5 text-muted text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-text">{c.NombreProveedor}</td>
                      <td className="cifra px-4 py-2.5">{decimal(c.market_share_pct, 1)}%</td>
                      <td className="cifra px-4 py-2.5">{decimal(c.win_rate_pct, 1)}%</td>
                      <td className="cifra px-4 py-2.5 text-muted">{c.n_oc.toLocaleString('es-CL')}</td>
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
