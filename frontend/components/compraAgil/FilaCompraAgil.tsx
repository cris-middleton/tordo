import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import {
  esTopeCompraAgil,
  MOSTRAR_COTIZACIONES,
  NOTA_TOPE,
  textoComprador,
  textoCompetencia,
  textoMontoTipico,
  textoTiempo,
  urlMercadoPublico,
} from '@/lib/compraAgil';
import { formatCurrency, normalizeText, shortRegion } from '@/lib/licitacionEstado';
import type { CompraAgilDestacada } from '@/types/compraAgil';

/**
 * Una Compra Ágil en una fila: la misma en la portada, en `/compra-agil`, en
 * `/buscar` y en la ficha del comprador, como la fila del catálogo de
 * licitaciones. Nombre (al detalle), comprador, cierre y monto; **sin puntaje y
 * sin cocientes** (rediseño §6.7).
 *
 * Con `historia` añade la región y lo que se sabe de la unidad que compra —«Esta
 * unidad: 524 órdenes de Compra Ágil en 6 meses» y lo que suele gastar—; la
 * portada, compacta, no lo dice. Antes fuera de la portada era una tarjeta de
 * ~200 px con chips de icono: 20 medían 7.000 px en un teléfono.
 *
 * `min-w-0`, `line-clamp-*` y `break-words`: un nombre de 300 letras, o uno sin
 * espacios, no ensancha la página en un teléfono.
 */
export function FilaCompraAgil({
  item,
  posicion,
  actualizadoEn,
  historia,
}: {
  item: CompraAgilDestacada;
  posicion?: number;
  actualizadoEn: string | null;
  /** La historia de la unidad. `disponible` es `historia_disponible` de la respuesta: falso = no se dice nada del comprador. */
  historia?: { meses: number | null; disponible: boolean };
}) {
  const detalle = `/licitaciones/${encodeURIComponent(item.codigo_externo)}`;
  const deLaUnidad = historia ? textoComprador(item.comprador, historia.meses, historia.disponible) : null;
  const suele = historia?.disponible ? textoMontoTipico(item.comprador) : null;
  const lugar = [
    item.nombre_organismo && normalizeText(item.nombre_organismo),
    historia && item.region ? shortRegion(item.region) : null,
  ]
    .filter(Boolean)
    .join(', ');

  const montoPintado = esTopeCompraAgil(item) ? (
    <>
      <p className="cifra text-sm font-semibold text-text">Hasta {formatCurrency(item.monto_estimado)}</p>
      <p className="text-xs text-muted">{NOTA_TOPE}</p>
    </>
  ) : item.monto_estimado ? (
    <p className="cifra text-sm font-semibold text-text">{formatCurrency(item.monto_estimado)}</p>
  ) : (
    <p className="text-xs text-subtle">Sin monto</p>
  );

  // Compacta (portada): el monto a la derecha, en una línea. Con historia, una
  // rejilla: en un teléfono el monto baja bajo el nombre (a la derecha no cabe
  // «Hasta $7,2 millones» sin estrujar el título); desde `sm`, nombre y datos a
  // la izquierda y el monto a la derecha, ocupando las dos filas.
  return (
    <article aria-labelledby={`ca-${item.codigo_externo}`} className="flex items-start gap-3 py-3">
      {posicion !== undefined && (
        <span className="cifra w-6 shrink-0 text-right text-sm font-semibold text-subtle">
          <span className="sr-only">Puesto </span>
          {posicion}
        </span>
      )}
      <div
        className={
          historia
            ? 'grid min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto]'
            : 'flex min-w-0 flex-1 items-start gap-3'
        }
      >
        <div className="min-w-0 flex-1">
          <Link
            id={`ca-${item.codigo_externo}`}
            href={detalle}
            className={`${historia ? 'line-clamp-2' : 'line-clamp-1'} break-words text-sm font-semibold text-text hover:text-primary`}
          >
            {normalizeText(item.nombre)}
          </Link>
          {!historia && (
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              {lugar && <span className="min-w-0 break-words">{lugar}</span>}
              <span>{textoTiempo(item.horas_restantes)}</span>
              {MOSTRAR_COTIZACIONES && <span>{textoCompetencia(item.ofertas_recibidas, item.ofertas_al, actualizadoEn)}</span>}
            </p>
          )}
        </div>
        <div className={historia ? 'sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:text-right' : 'shrink-0 text-right'}>{montoPintado}</div>
        {historia && (
          <div className="min-w-0 text-xs text-muted">
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              {lugar && <span className="min-w-0 break-words">{lugar}</span>}
              <span>{textoTiempo(item.horas_restantes)}</span>
              {MOSTRAR_COTIZACIONES && (
                <span>{textoCompetencia(item.ofertas_recibidas, item.ofertas_al, actualizadoEn)}</span>
              )}
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {deLaUnidad && <span>{deLaUnidad}</span>}
              {suele && <span>{suele}</span>}
              {/* La Compra Ágil se cotiza en Mercado Público, y su dato no trae URL:
                  la ficha de aquí no siempre puede enlazarla, la fila sí. */}
              <a
                href={urlMercadoPublico(item.codigo_externo)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:text-accent"
              >
                Abrir en Mercado Público
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
