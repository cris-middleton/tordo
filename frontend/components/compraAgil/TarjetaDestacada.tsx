import Link from 'next/link';
import { Building2, Clock, ExternalLink, MapPin, Users } from 'lucide-react';

import {
  textoComprador,
  textoCompetencia,
  textoMontoTipico,
  textoTiempo,
  urlMercadoPublico,
} from '@/lib/compraAgil';
import { formatCurrency, normalizeText, shortRegion } from '@/lib/licitacionEstado';
import type { CompraAgilDestacada } from '@/types/compraAgil';

/**
 * Una Compra Ágil destacada.
 *
 * Los tres factores del puntaje se cuentan con el dato del que salen, no con
 * su valor en [0, 1]: «1 cotización hasta ahora» decide algo, «competencia
 * 0,5» no.
 */
export default function TarjetaDestacada({
  item,
  posicion,
  mesesVentana,
}: {
  item: CompraAgilDestacada;
  posicion: number;
  mesesVentana: number | null;
}) {
  const montoTipico = textoMontoTipico(item.comprador);
  const detalle = `/licitaciones/${encodeURIComponent(item.codigo_externo)}`;

  return (
    <article className="card flex flex-col gap-3" aria-labelledby={`ca-${item.codigo_externo}`}>
      <div className="flex items-start gap-3">
        <span
          className="cifra flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-onAccent"
          aria-label={`Puesto ${posicion}`}
        >
          {posicion}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            id={`ca-${item.codigo_externo}`}
            href={detalle}
            className="line-clamp-2 text-sm font-semibold leading-snug text-text hover:text-primary"
          >
            {normalizeText(item.nombre)}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            {item.nombre_organismo && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" aria-hidden="true" />
                {normalizeText(item.nombre_organismo)}
              </span>
            )}
            {item.region && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {shortRegion(item.region)}
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {item.monto_estimado ? (
            <p className="cifra text-sm font-bold text-primary">{formatCurrency(item.monto_estimado)}</p>
          ) : (
            <p className="text-xs text-subtle">Sin monto</p>
          )}
          <p className="text-[11px] text-subtle" title="Heurística: no es una probabilidad">
            puntaje <span className="cifra">{Math.round(item.puntaje * 100)}</span>/100
          </p>
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <li className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-text">
          <Users className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
          {textoCompetencia(item.ofertas_recibidas)}
        </li>
        <li className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-text">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
          {textoComprador(item.comprador, mesesVentana)}
        </li>
        <li className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-text">
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
          {textoTiempo(item.horas_restantes)}
        </li>
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
        <p className="text-xs text-muted">{montoTipico ?? 'Sin historial de montos del comprador'}</p>
        <div className="flex items-center gap-3 text-xs font-medium">
          <Link href={detalle} className="text-primary hover:underline">
            Ver detalle
          </Link>
          <a
            href={urlMercadoPublico(item.codigo_externo)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            Mercado Público <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
}
