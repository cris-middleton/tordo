// frontend/app/(panel)/mercado/components/CompradoresSection.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Building2 } from 'lucide-react';
import { CompradorResult, OrganismoConNombre, scoreColor, scoreBg } from '../types';
import { ErrorDeCarga } from '@/components/ErrorDeCarga';
import { useComprador } from '@/lib/queries';
import { decimal } from '@/lib/formato';

interface CompradorSectionProps {
  topOrganismos: OrganismoConNombre[];
  rubro: string;
  focusedOrganismo?: OrganismoConNombre | null;
  focusedNombre?: string; // NEW: display name of the focused organismo
}

function pctOpc(v?: number | null): string {
  return v == null ? '—' : `${decimal(v * 100, 0)}%`;
}

function CompradorCard({ organismoId }: { organismoId: string }) {
  // La deduplicación entre tarjetas la hace TanStack Query por clave: dos
  // tarjetas del mismo organismo comparten una sola petición, que es lo que
  // hacía a mano el `useCompradorCache` que se eliminó.
  const consulta = useComprador(organismoId);
  const { data: respuesta, isPending: loading } = consulta;
  const data = (respuesta ?? null) as CompradorResult | null;
  const [open, setOpen] = useState(false);

  if (loading) return (
    <div className="rounded-xl border border-border p-4 flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
    </div>
  );

  // Un error NO es «sin datos»: decir que el organismo no tiene datos cuando la
  // API no respondió es una conclusión de negocio falsa.
  if (consulta.isError) return (
    <ErrorDeCarga
      titulo="No pudimos cargar el perfil del comprador"
      error={consulta.error}
      onReintentar={() => void consulta.refetch()}
      reintentando={consulta.isFetching}
    />
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
            <span className={`text-sm font-bold ${scoreColorClass}`}>{decimal(scoreDisplay, 1)}</span>
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
          {/* Los tres números son comportamiento del COMPRADOR, que es lo que
              se puede usar para decidir. El que estaba en el primer hueco
              —«Pago promedio: N días»— era comportamiento del proveedor
              aceptando la orden, y encima anunciado como plazo de pago. */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-surface border border-border p-3">
              <p className="text-xs text-muted">Adjudica</p>
              <p className="text-base font-semibold text-text mt-0.5">
                {pctOpc(data.tramitacion?.tasa_adjudicacion)}
              </p>
              <p className="text-[11px] text-subtle mt-0.5">de lo que llama</p>
            </div>
            <div className="rounded-lg bg-surface border border-border p-3">
              <p className="text-xs text-muted">Cancela</p>
              <p className="text-base font-semibold text-text mt-0.5">
                {pctOpc(data.tramitacion?.tasa_cancelacion)}
              </p>
              <p className="text-[11px] text-subtle mt-0.5">de sus órdenes</p>
            </div>
            <div className="rounded-lg bg-surface border border-border p-3">
              <p className="text-xs text-muted">Órdenes aceptadas</p>
              <p className="text-base font-semibold text-text mt-0.5">
                {pctOpc(data.tramitacion?.tasa_aceptacion)}
              </p>
              <p className="text-[11px] text-subtle mt-0.5">por el proveedor</p>
            </div>
          </div>

          {data.risk_flags && data.risk_flags.n_flags > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.risk_flags.aceptacion_lenta && (
                <span
                  title="Sus órdenes tardan en aceptarse mucho más que la mediana del sistema, que es de menos de dos días. Suele indicar fricción en el trámite."
                  className="badge-danger text-xs cursor-help"
                >
                  ⚠ Trámite lento
                </span>
              )}
              {data.risk_flags.aceptacion_impredecible && (
                <span
                  title="El tiempo hasta la aceptación varía mucho de una orden a otra."
                  className="badge-danger text-xs cursor-help"
                >
                  ⚠ Trámite impredecible
                </span>
              )}
              {data.risk_flags.cancelaciones && (
                <span title="Alta tasa de órdenes canceladas" className="badge-danger text-xs cursor-help">⚠ Cancelaciones frecuentes</span>
              )}
              {data.risk_flags.licitaciones_fallidas && (
                <span title="Declara desierta una parte alta de lo que llama a licitación" className="badge-danger text-xs cursor-help">⚠ Declara desierto seguido</span>
              )}
              {data.risk_flags.baja_calificacion && (
                <span title="Calificación promedio de proveedores baja" className="badge-danger text-xs cursor-help">⚠ Baja calificación</span>
              )}
              {data.risk_flags.compras_irregulares && (
                <span title="Compra de forma muy irregular a lo largo del año" className="badge-danger text-xs cursor-help">⚠ Compra irregular</span>
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
