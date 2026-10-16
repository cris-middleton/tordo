'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import es from 'date-fns/locale/es';
import {
  BookmarkCheck,
  BookmarkPlus,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Send,
} from 'lucide-react';

import {
  formatCurrency,
  getClosingUrgency,
  getEstadoAccent,
  getEstadoCls,
  normalizeText,
  shortRegion,
} from '@/lib/licitacionEstado';
import type { Tender } from '@/types/licitacion';
import type { StoredTender } from '@/hooks/useDashboardCollections';

/**
 * Una licitación en el listado.
 *
 * `hydrated`, `estaGuardada` y `alternar` llegan por props y no de
 * `useDashboardCollections()` directamente: la tarjeta se queda sin saber
 * dónde se guarda lo guardado. (Hoy el hook vive en `useSyncExternalStore` y
 * N instancias verían lo mismo; no es ése el motivo.)
 */
export default function TarjetaLicitacion({
  tender,
  seleccionada,
  onSeleccionar,
  hydrated,
  estaGuardada,
  alternar,
}: {
  tender: Tender;
  seleccionada: boolean;
  onSeleccionar: () => void;
  hydrated: boolean;
  estaGuardada: (tipo: 'saved' | 'applied', id: number) => boolean;
  alternar: (tipo: 'saved' | 'applied', tender: StoredTender | Tender) => void;
}) {
  const isSaved = hydrated && estaGuardada('saved', tender.id);
  const isApplied = hydrated && estaGuardada('applied', tender.id);
  const urgency = getClosingUrgency(tender.fecha_cierre);
  const estadoDisplay = tender.estado ?? tender.detalle?.estado_actual;
  const estadoCls = getEstadoCls(estadoDisplay);
  const accentCls = getEstadoAccent(estadoDisplay);

  return (

    <div
      key={tender.id}
      onClick={onSeleccionar}
      className={`relative flex overflow-hidden rounded-xl border transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-md cursor-pointer ${
        seleccionada
          ? 'border-primary/40 bg-primary/3 shadow-card-md'
          : 'border-border bg-surface hover:border-primary/20'
      }`}
    >
      {/* Left accent bar */}
      <div className={`w-1 shrink-0 ${accentCls}`} />

      <div className="flex flex-col flex-1 min-w-0 px-4 pt-3.5 pb-3">
        {/* Row 1: badge(s) + region */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {estadoDisplay && (
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none ${estadoCls}`}>
                {normalizeText(estadoDisplay)}
              </span>
            )}
          </div>
          {tender.region && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted shrink-0">
              <MapPin className="h-2.5 w-2.5" />
              {shortRegion(tender.region)}
            </span>
          )}
        </div>

        {/* Title */}
        <Link
          href={`/licitaciones/${encodeURIComponent(tender.codigo_externo)}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-semibold text-text leading-snug line-clamp-2 hover:text-primary transition-colors mb-0.5"
        >
          {normalizeText(tender.nombre)}
        </Link>

        {/* Organismo */}
        <p className="text-[11px] text-muted truncate mb-3">
          {tender.nombre_organismo ? (
            normalizeText(tender.nombre_organismo)
          ) : (
            <span className="font-mono">{tender.codigo_externo}</span>
          )}
        </p>

        {/* Footer: monto + urgency + actions */}
        <div className="flex items-center gap-2 pt-2.5 border-t border-border mt-auto">
          <div className="flex-1 min-w-0">
            {tender.monto_estimado ? (
              <p className="text-sm font-bold text-primary tabular-nums leading-none">
                {formatCurrency(tender.monto_estimado)}
              </p>
            ) : (
              <p className="text-[11px] text-subtle leading-none">Sin monto</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {tender.fecha_publicacion && (
                <p className="text-[11px] text-subtle">
                  {format(new Date(tender.fecha_publicacion), 'd MMM yyyy', { locale: es })}
                </p>
              )}
              {urgency && (
                <p className={`text-[11px] ${urgency.cls}`}>{urgency.label}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={!hydrated}
              onClick={(e) => { e.stopPropagation(); alternar('saved', tender); }}
              title={isSaved ? 'Quitar guardada' : 'Guardar'}
              className={`flex items-center justify-center rounded-lg border p-1.5 transition-all ${
                isSaved ? 'border-primary/30 bg-primary/8 text-primary' : 'border-border bg-background text-muted hover:border-primary/25 hover:text-primary'
              } ${!hydrated ? 'opacity-50' : ''}`}
            >
              {isSaved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              disabled={!hydrated}
              onClick={(e) => { e.stopPropagation(); alternar('applied', tender); }}
              title={isApplied ? 'Quitar postulación' : 'Postular'}
              className={`flex items-center justify-center rounded-lg border p-1.5 transition-all ${
                isApplied ? 'border-accent/30 bg-accent/8 text-accent' : 'border-border bg-background text-muted hover:border-accent/25 hover:text-accent'
              } ${!hydrated ? 'opacity-50' : ''}`}
            >
              {isApplied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            </button>
            {tender.url_licitacion ? (
              <a
                href={tender.url_licitacion}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Ver en Mercado Público"
                className="flex items-center justify-center rounded-lg border border-border bg-background p-1.5 text-muted hover:border-primary/25 hover:text-primary transition-all"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <Link
                href={`/licitaciones/${encodeURIComponent(tender.codigo_externo)}`}
                onClick={(e) => e.stopPropagation()}
                title="Ver detalle"
                className="flex items-center justify-center rounded-lg border border-border bg-background p-1.5 text-muted hover:border-primary/25 hover:text-primary transition-all"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
