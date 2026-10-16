import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import {
  CON_PUESTO,
  descripcionDestacadas,
  MOSTRAR_COTIZACIONES,
  TITULO_DESTACADAS,
  textoCompetencia,
  textoTiempo,
} from '@/lib/compraAgil';
import { formatCurrency, normalizeText } from '@/lib/licitacionEstado';
import type { CompraAgilDestacada, CompraAgilDestacadasResponse } from '@/types/compraAgil';

/**
 * Una Compra Ágil en una fila: nombre (al detalle), comprador, cierre y monto.
 * **Sin puntaje y sin cocientes** (spec §6.7), y sin la historia de la unidad:
 * eso lo cuenta la tarjeta entera de `/compra-agil` (`TarjetaDestacada`). Las
 * cotizaciones, sólo si `MOSTRAR_COTIZACIONES`, como allí.
 *
 * `min-w-0`, `line-clamp-1` y `break-words`: un nombre de 300 letras, o uno sin
 * espacios, no ensancha la página en un teléfono.
 */
function FilaDestacada({
  item,
  posicion,
  actualizadoEn,
}: {
  item: CompraAgilDestacada;
  posicion?: number;
  actualizadoEn: string | null;
}) {
  const detalle = `/licitaciones/${encodeURIComponent(item.codigo_externo)}`;
  return (
    <article aria-labelledby={`hoy-${item.codigo_externo}`} className="flex items-start gap-3 py-3">
      {posicion !== undefined && (
        <span className="cifra w-5 shrink-0 pt-0.5 text-right text-sm font-semibold text-subtle">
          <span className="sr-only">Puesto </span>
          {posicion}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Link
          id={`hoy-${item.codigo_externo}`}
          href={detalle}
          className="line-clamp-1 break-words text-sm font-semibold text-text hover:text-primary"
        >
          {normalizeText(item.nombre)}
        </Link>
        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
          {item.nombre_organismo && (
            <span className="min-w-0 break-words">{normalizeText(item.nombre_organismo)}</span>
          )}
          <span>{textoTiempo(item.horas_restantes)}</span>
          {MOSTRAR_COTIZACIONES && (
            <span>{textoCompetencia(item.ofertas_recibidas, item.ofertas_al, actualizadoEn)}</span>
          )}
        </p>
      </div>
      {item.monto_estimado ? (
        <p className="cifra shrink-0 text-sm font-semibold text-text">{formatCurrency(item.monto_estimado)}</p>
      ) : (
        <p className="shrink-0 text-xs text-subtle">Sin monto</p>
      )}
    </article>
  );
}

/**
 * «Lo mejor de hoy» en la portada —o «Cierran pronto», según
 * `TITULO_DESTACADAS`—, compacto (spec del rediseño §6.3): las primeras de la
 * lista en filas, pedidas desde el servidor con media hora de caché
 * (`pedirDestacadas`). La lista entera, con filtros y RSS, es `/compra-agil`.
 *
 * Si el backend falló, o su hora no se puede leer, no se llega aquí: la portada
 * oculta el bloque (principio 4). `actualizado` es esa hora ya leída
 * (`actualizadoEnPalabras`); la lee la portada, que es quien decide si pintar, y
 * aquí no se vuelve a leer. Lleva su propia hora porque la franja de la portada
 * puede faltar sin él; **cuando la franja está, no la repite**
 * (`horaEnLaFranja`): «Actualizado el …» dos veces a pocos centímetros es ruido.
 * La hora se sigue exigiendo para pintar el bloque.
 */
export function BloqueHoy({
  datos,
  actualizado,
  horaEnLaFranja = false,
}: {
  datos: CompraAgilDestacadasResponse;
  /** «mar, 13 oct, 09:30»: la hora de `datos.actualizado_en`, en palabras y en hora de Chile. */
  actualizado: string;
  /** La portada ya dice la hora en su franja: aquí no se repite. Por defecto, sí se dice. */
  horaEnLaFranja?: boolean;
}) {
  const Lista = CON_PUESTO ? 'ol' : 'ul';

  return (
    <section id="hoy" aria-labelledby="hoy-titulo" className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="hoy-titulo" className="text-xl text-text">
          {TITULO_DESTACADAS}
        </h2>
        <Link
          href="/compra-agil"
          aria-label={`Ver todas: ${TITULO_DESTACADAS}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-accent"
        >
          Ver todas
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-1 text-xs text-muted">
        {descripcionDestacadas(datos.historia_disponible === true)}
        {!horaEnLaFranja && (
          <>
            {' '}
            Actualizado el <span className="cifra">{actualizado}</span>.
          </>
        )}
      </p>

      {datos.items.length > 0 ? (
        <Lista
          aria-label="Compras Ágiles destacadas de hoy"
          className="mt-3 divide-y divide-border border-y border-border"
        >
          {datos.items.map((item, i) => (
            <li key={item.codigo_externo}>
              <FilaDestacada
                item={item}
                posicion={CON_PUESTO ? i + 1 : undefined}
                actualizadoEn={datos.actualizado_en}
              />
            </li>
          ))}
        </Lista>
      ) : (
        <p className="mt-3 rounded-xl border border-border bg-surface px-5 py-6 text-sm text-muted">
          Ahora mismo no hay Compras Ágiles abiertas que cierren en más de dos horas. La lista se renueva
          varias veces al día.
        </p>
      )}
    </section>
  );
}
