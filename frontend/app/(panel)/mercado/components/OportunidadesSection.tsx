// frontend/app/(panel)/mercado/components/OportunidadesSection.tsx
'use client';

import React, { useState, useRef } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { OportunidadItem, CompradorResult } from '../types';
import { useComprador } from '@/lib/queries';
import { ShareMenu } from './ShareMenu';

import { EligeRubro } from '@/components/bi/EligeRubro';
import { decimal } from '@/lib/formato';
import { normalizeText } from '@/lib/nombresChile';

interface OportunidadesSectionProps {
  oportunidades: OportunidadItem[];
  loading: boolean;
  onFocusOrganismo?: (o: { codigo: string; nombre: string }) => void;
  /** Vacío mientras el usuario no ha elegido rubro. Ver `EligeRubro`. */
  rubro?: string;
}

function pctOpc(v?: number | null): string {
  return v == null ? '—' : `${decimal(v * 100, 0)}\u00a0%`;
}

function ExpandedRow({
  organismo,
  nombre,
  onFocus,
}: {
  organismo: string;
  nombre: string;
  onFocus?: (o: { codigo: string; nombre: string }) => void;
}) {
  // El `loaded` que había existía para no volver a pedir lo mismo. Sobra: la
  // caché de TanStack Query lo cubre por clave, y además comparte la respuesta
  // con las tarjetas de CompradoresSection en vez de duplicarla.
  const { data: respuesta, isPending: loading } = useComprador(organismo);
  const data = (respuesta ?? null) as CompradorResult | null;

  if (loading) return (
    <div className="p-4 flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando el comprador…
    </div>
  );

  if (!data?.disponible) return (
    <div className="p-4 text-sm text-muted">Todavía no tenemos la historia de este comprador.</div>
  );

  // buyer_score is 0-1; multiply ×10 for display and color thresholds
  const scoreDisplay = data.buyer_score != null ? data.buyer_score * 10 : null;

  return (
    <div className="grid grid-cols-2 gap-4 border-t border-border bg-surface-elevated p-4 text-sm sm:grid-cols-4">
      <div>
        <p className="mb-1 text-muted">Nota como comprador</p>
        {scoreDisplay != null ? (
          <span className="cifra font-semibold text-text">{decimal(scoreDisplay, 1)} de 10</span>
        ) : <span className="text-muted">—</span>}
      </div>
      <div>
        <p className="mb-1 text-muted">Adjudica de lo que licita</p>
        <p className="font-medium text-text">
          {pctOpc(data.tramitacion?.tasa_adjudicacion)}
        </p>
      </div>
      <div>
        <p className="mb-1 text-muted">Cancela de sus órdenes</p>
        <p className="font-medium text-text">
          {pctOpc(data.tramitacion?.tasa_cancelacion)}
        </p>
      </div>
      <div>
        <p className="mb-1 text-muted">Órdenes que el proveedor acepta</p>
        <p className="font-medium text-text">
          {pctOpc(data.tramitacion?.tasa_aceptacion)}
        </p>
      </div>
      {data.risk_flags && data.risk_flags.n_flags > 0 && (
        <div className="col-span-full flex flex-wrap gap-1.5">
          {data.risk_flags.aceptacion_lenta && (
            <span
              title="Sus órdenes tardan en aceptarse mucho más que las de un comprador típico."
              className="rounded-full border border-border px-2 py-0.5 text-sm text-text"
            >
              Trámite lento
            </span>
          )}
          {data.risk_flags.cancelaciones && (
            <span title="Cancela una parte alta de sus órdenes" className="rounded-full border border-border px-2 py-0.5 text-sm text-text">Cancela seguido</span>
          )}
          {data.risk_flags.licitaciones_fallidas && (
            <span title="Declara desierta una parte alta de lo que licita" className="rounded-full border border-border px-2 py-0.5 text-sm text-text">Declara desierto seguido</span>
          )}
          {data.risk_flags.baja_calificacion && (
            <span title="Los proveedores que le vendieron le ponen nota baja" className="rounded-full border border-border px-2 py-0.5 text-sm text-text">Mal calificado por proveedores</span>
          )}
        </div>
      )}
      {onFocus && (
        <div className="col-span-full mt-4 pt-3 border-t border-border flex">
          <button
            onClick={() => onFocus({ codigo: organismo, nombre })}
            className="btn-secondary h-11 text-sm"
          >
            Ver este comprador de cerca
          </button>
        </div>
      )}
    </div>
  );
}

export function OportunidadesSection({ oportunidades, loading, onFocusOrganismo, rubro }: OportunidadesSectionProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);

  const maxScore = oportunidades.length > 0
    ? Math.max(...oportunidades.map((o) => o.opportunity_score))
    : 0;
  const avgCompetidores = oportunidades.length > 0
    ? oportunidades.reduce((s, o) => s + o.n_proveedores, 0) / oportunidades.length
    : 0;

  const summaryText = (() => {
    const parts: string[] = [];
    parts.push(`Compradores para mirar primero: ${oportunidades.length}`);
    if (oportunidades.length > 0) {
      parts.push(`el primero con ${decimal(maxScore, 1)} de 10`);
      parts.push(`${Math.round(avgCompetidores)} proveedores por comprador, en promedio`);
    }
    return parts.join(', ') + '.';
  })();

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  // Sin rubro elegido no hay nada que buscar todavía, y decir «no se
  // encontraron oportunidades» sugiere que se miró y no había.
  if (!loading && !rubro) return <EligeRubro que="qué compradores mirar primero" />;

  if (!loading && oportunidades.length === 0) return (
    <p className="py-6 text-sm text-muted">Este rubro no tiene compradores con historia suficiente para ordenarlos.</p>
  );

  return (
    <section ref={rootRef} aria-label="Compradores del rubro, ordenados" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Los {Math.min(10, oportunidades.length)} con mejor puntaje. Toca un nombre para ver cómo compra.
        </p>
        <ShareMenu targetRef={rootRef} summaryText={summaryText} filename="donde-mirar" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th scope="col" className="py-2 pr-3 text-right font-normal">#</th>
              <th scope="col" className="py-2 pr-3 font-normal">Comprador</th>
              <th scope="col" className="py-2 pr-3 text-right font-normal">Puntaje</th>
              <th scope="col" className="hidden py-2 pr-3 text-right font-normal sm:table-cell">Compras</th>
              <th scope="col" className="py-2 pr-3 text-right font-normal">Proveedores</th>
              <th scope="col" className="w-8"><span className="sr-only">Abrir</span></th>
            </tr>
          </thead>
          <tbody>
            {oportunidades.slice(0, 10).map((op, i) => {
              const rowKey = `${op.CodigoOrganismoPublico}-${op.RubroN2}-${i}`;
              const isExpanded = expandedRow === rowKey;
              const nombre = op.NombreOrganismo ? normalizeText(op.NombreOrganismo) : op.CodigoOrganismoPublico;
              return (
                <React.Fragment key={rowKey}>
                  <tr className="border-b border-border">
                    <td className="cifra py-3 pr-3 text-right text-subtle">{i + 1}</td>
                    <td className="py-3 pr-3">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                        className="text-left font-medium text-text hover:text-primary"
                      >
                        {nombre}
                      </button>
                    </td>
                    <td className="cifra py-3 pr-3 text-right font-semibold text-text">{decimal(op.opportunity_score, 1)}</td>
                    <td className="cifra hidden py-3 pr-3 text-right text-muted sm:table-cell">
                      {op.n_transacciones.toLocaleString('es-CL')}
                    </td>
                    <td className="cifra py-3 pr-3 text-right text-muted">{op.n_proveedores.toLocaleString('es-CL')}</td>
                    <td className="py-3">
                      <button
                        type="button"
                        aria-label={isExpanded ? `Cerrar ${nombre}` : `Abrir ${nombre}`}
                        onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                        className="flex h-8 w-8 items-center justify-center text-muted hover:text-primary"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <ExpandedRow
                          organismo={op.CodigoOrganismoPublico}
                          nombre={nombre}
                          onFocus={onFocusOrganismo}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
