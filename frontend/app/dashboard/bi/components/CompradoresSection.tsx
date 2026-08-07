// frontend/app/dashboard/bi/components/CompradoresSection.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Building2 } from 'lucide-react';
import { CompradorResult, OrganismoConNombre, scoreColor, scoreBg } from '../types';
import { useComprador } from '@/lib/queries';

interface CompradorSectionProps {
  topOrganismos: OrganismoConNombre[];
  rubro: string;
  focusedOrganismo?: OrganismoConNombre | null;
  focusedNombre?: string; // NEW: display name of the focused organismo
}

function CompradorCard({ organismoId }: { organismoId: string }) {
  // La deduplicación entre tarjetas la hace TanStack Query por clave: dos
  // tarjetas del mismo organismo comparten una sola petición, que es lo que
  // hacía a mano el `useCompradorCache` que se eliminó.
  const { data: respuesta, isPending: loading } = useComprador(organismoId);
  const data = (respuesta ?? null) as CompradorResult | null;
  const [open, setOpen] = useState(false);

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

  // buyer_score is 0-1 scale; scoreColor/scoreBg use 0-10 thresholds
  const scoreDisplay = data.buyer_score != null ? data.buyer_score * 10 : null;
  const scoreColorClass = scoreDisplay != null ? scoreColor(scoreDisplay) : 'text-muted';
  const scoreClass = scoreDisplay != null ? scoreBg(scoreDisplay) : '';

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
          {scoreDisplay != null && (
            <span className={`text-sm font-bold ${scoreColorClass}`}>{scoreDisplay.toFixed(1)}</span>
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
                {data.pago?.mediana_dias_pago != null
                  ? `${Math.round(data.pago.mediana_dias_pago)} días`
                  : '—'}
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
                <span title="Este organismo tarda más de 45 días en pagar en promedio" className="badge-danger text-xs cursor-help">⚠ Pago lento</span>
              )}
              {data.risk_flags.cancelaciones && (
                <span title="Alta tasa de órdenes canceladas" className="badge-danger text-xs cursor-help">⚠ Cancelaciones frecuentes</span>
              )}
              {data.risk_flags.baja_calificacion && (
                <span title="Calificación promedio de proveedores baja" className="badge-danger text-xs cursor-help">⚠ Baja calificación</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CompradoresSection({ topOrganismos, rubro, focusedOrganismo, focusedNombre }: CompradorSectionProps) {
  const orgsAMostrar = focusedOrganismo ? [focusedOrganismo] : topOrganismos.slice(0, 3);

  // Dynamic title and subtitle based on focus state and count
  const tituloDinamico = focusedOrganismo || orgsAMostrar.length === 1
    ? 'Perfil del comprador'
    : 'Perfil de compradores';
  const subtituloDinamico = focusedOrganismo
    ? '¿Es confiable este comprador?'
    : '¿Son confiables los organismos que más compran?';

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          {tituloDinamico}
        </h2>
        <p className="text-xs text-muted mt-0.5">{subtituloDinamico}</p>
      </div>

      <div className="space-y-3">
        {orgsAMostrar.map((org) => (
          <CompradorCard key={org.codigo} organismoId={org.codigo} />
        ))}
      </div>
    </section>
  );
}
