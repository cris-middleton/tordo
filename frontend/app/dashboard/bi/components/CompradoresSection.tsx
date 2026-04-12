// frontend/app/dashboard/bi/components/CompradoresSection.tsx
'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Loader2, Building2 } from 'lucide-react';
import { CompradorResult, DescuentoItem, scoreColor, scoreBg } from '../types';
import { apiClient } from '@/lib/api';

interface CompradorSectionProps {
  topOrganismos: string[];
  rubro: string;
}

function DescuentosInline({ rubro }: { rubro: string }) {
  const [data, setData] = useState<DescuentoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await apiClient.getBIDescuento({ rubro: rubro || undefined });
      if (res.disponible) setData(res.descuentos ?? []);
      setLoaded(true);
    } catch {
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => { if (!open) load(); setOpen((o) => !o); }}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Ver descuentos típicos
      </button>
      {open && (
        <div className="mt-3">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : data.length === 0 ? (
            <p className="text-xs text-muted">Sin datos de descuento para este rubro.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface/60 text-left">
                    <th className="px-3 py-2 text-muted">N° oferentes</th>
                    <th className="px-3 py-2 text-muted">P10</th>
                    <th className="px-3 py-2 text-muted">P50</th>
                    <th className="px-3 py-2 text-muted">P90</th>
                    <th className="px-3 py-2 text-muted">Señal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, 5).map((d, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{d.n_oferentes_rango ?? '—'}</td>
                      <td className="px-3 py-2">{d.p10 != null ? `${d.p10.toFixed(1)}%` : '—'}</td>
                      <td className="px-3 py-2 font-medium">{d.p50 != null ? `${d.p50.toFixed(1)}%` : '—'}</td>
                      <td className="px-3 py-2">{d.p90 != null ? `${d.p90.toFixed(1)}%` : '—'}</td>
                      <td className="px-3 py-2">{d.senial_competencia ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompradorCard({ organismoId, rubro }: { organismoId: string; rubro: string }) {
  const [data, setData] = useState<CompradorResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    apiClient.getBIComprador(organismoId)
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [organismoId]);

  if (loading) return (
    <div className="rounded-xl border border-border p-4 flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
    </div>
  );

  if (!data?.disponible) return (
    <div className="rounded-xl border border-border p-4 text-sm text-muted">
      Sin datos para organismo {organismoId}.
    </div>
  );

  const scoreColorClass = data.buyer_score != null ? scoreColor(data.buyer_score) : 'text-muted';
  const scoreClass = data.buyer_score != null ? scoreBg(data.buyer_score) : '';

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-surface/60 hover:bg-primary/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Building2 className="h-4 w-4 text-muted shrink-0" />
          <span className="font-medium text-text text-sm truncate">{data.nombre ?? organismoId}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data.buyer_score != null && (
            <span className={`text-sm font-bold ${scoreColorClass}`}>{data.buyer_score.toFixed(1)}</span>
          )}
          {data.clasificacion && (
            <span className={`text-xs rounded-full border px-2 py-0.5 ${scoreClass}`}>
              {data.clasificacion}
            </span>
          )}
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-muted" />}
        </div>
      </button>

      {open && (
        <div className="px-4 py-4 space-y-4 border-t border-border">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-surface border border-border p-3">
              <p className="text-xs text-muted">Pago promedio</p>
              <p className="text-base font-semibold text-text mt-0.5">
                {data.pago?.mediana_dias_pago ?? '—'} días
              </p>
            </div>
            <div className="rounded-lg bg-surface border border-border p-3">
              <p className="text-xs text-muted">Tasa adjudicación</p>
              <p className="text-base font-semibold text-text mt-0.5">
                {data.pago?.tasa_adjudicacion != null
                  ? `${(data.pago.tasa_adjudicacion * 100).toFixed(0)}%`
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-surface border border-border p-3">
              <p className="text-xs text-muted">Cancelaciones</p>
              <p className="text-base font-semibold text-text mt-0.5">
                {data.pago?.tasa_cancelacion != null
                  ? `${(data.pago.tasa_cancelacion * 100).toFixed(0)}%`
                  : '—'}
              </p>
            </div>
          </div>

          {data.risk_flags && data.risk_flags.n_flags > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.risk_flags.pago_lento && (
                <span title="Este organismo tarda más de 45 días en pagar en promedio" className="badge-error text-xs cursor-help">⚠ Pago lento</span>
              )}
              {data.risk_flags.cancelaciones && (
                <span title="Alta tasa de órdenes canceladas" className="badge-error text-xs cursor-help">⚠ Cancelaciones frecuentes</span>
              )}
              {data.risk_flags.baja_calificacion && (
                <span title="Calificación promedio de proveedores baja" className="badge-error text-xs cursor-help">⚠ Baja calificación</span>
              )}
            </div>
          )}

          <DescuentosInline rubro={rubro} />
        </div>
      )}
    </div>
  );
}

export function CompradoresSection({ topOrganismos, rubro }: CompradorSectionProps) {
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Perfil de compradores
        </h2>
        <p className="text-xs text-muted mt-0.5">¿Son confiables los organismos que más compran?</p>
      </div>

      <div className="space-y-3">
        {topOrganismos.slice(0, 3).map((org) => (
          <CompradorCard key={org} organismoId={org} rubro={rubro} />
        ))}
      </div>
    </section>
  );
}
