'use client';

import Link from 'next/link';
import { Bookmark, BookmarkCheck } from 'lucide-react';

import { cierreEnPalabras, formatCurrency, normalizeText, shortRegion } from '@/lib/licitacionEstado';
import type { Tender } from '@/types/licitacion';
import type { StoredTender } from '@/hooks/useDashboardCollections';

/**
 * Una licitación del catálogo, en una fila con divisor (como «Lo mejor de hoy»
 * en la portada): nombre en dos líneas, monto a la derecha, comprador y región,
 * y el cierre en palabras con el código.
 *
 * Antes era una tarjeta de 148–168 px con tres botones de 28 px y un salto al
 * pasar el mouse; en un teléfono no cabía ninguna en la primera pantalla. Aquí
 * queda una sola acción, guardar, de 44 × 44: «Postulé» y el enlace a Mercado
 * Público viven en la ficha.
 *
 * `hydrated`, `estaGuardada` y `alternar` llegan por props: la fila no sabe
 * dónde se guarda lo guardado.
 */
export default function FilaLicitacion({
  tender,
  ahora,
  hydrated,
  estaGuardada,
  alternar,
}: {
  tender: Tender;
  ahora: Date;
  hydrated: boolean;
  estaGuardada: (tipo: 'saved' | 'applied', id: number) => boolean;
  alternar: (tipo: 'saved' | 'applied', tender: StoredTender | Tender) => void;
}) {
  const guardada = hydrated && estaGuardada('saved', tender.id);
  const cierre = cierreEnPalabras(tender.fecha_cierre, ahora);
  const estado = tender.estado ?? tender.detalle?.estado_actual;
  // «Publicada» es lo normal y el cierre ya lo dice; los demás estados sí informan.
  const estadoVisible = estado && !/^publicada$/i.test(estado) ? normalizeText(estado) : null;
  const nombre = normalizeText(tender.nombre);
  const lugar = [tender.nombre_organismo && normalizeText(tender.nombre_organismo), shortRegion(tender.region)]
    .filter(Boolean)
    .join(', ');
  const idTitulo = `licitacion-${tender.id}`;

  return (
    <article aria-labelledby={idTitulo} className="flex gap-3 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="font-sans text-base font-semibold leading-snug text-text">
          <Link
            id={idTitulo}
            href={`/licitaciones/${encodeURIComponent(tender.codigo_externo)}`}
            className="line-clamp-2 break-words hover:text-primary"
          >
            {nombre}
          </Link>
        </h2>
        {lugar && <p className="mt-1 break-words text-sm text-muted">{lugar}</p>}
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          {cierre && (
            <span className={cierre.urgente ? 'font-semibold text-danger' : 'text-muted'}>{cierre.texto}</span>
          )}
          {estadoVisible && <span className="text-muted">{estadoVisible}</span>}
          {tender.tipo_convocatoria === 'compra_agil' && <span className="text-muted">Compra Ágil</span>}
          <span className="font-mono text-xs text-subtle">{tender.codigo_externo}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2 sm:flex-row sm:items-start sm:justify-end sm:gap-2">
        {tender.monto_estimado ? (
          <p className="cifra text-base font-semibold text-text">{formatCurrency(tender.monto_estimado)}</p>
        ) : (
          // Sin monto, nada: un «Sin monto» gris en más de la mitad de las filas tapaba los montos
          // que el ojo busca. El hueco sostiene la columna (en móvil, el botón abajo).
          <span aria-hidden="true" />
        )}
        <button
          type="button"
          disabled={!hydrated}
          aria-pressed={guardada}
          aria-label={guardada ? `Quitar de guardadas: ${nombre}` : `Guardar: ${nombre}`}
          title={guardada ? 'Quitar de guardadas' : 'Guardar'}
          onClick={() => alternar('saved', tender)}
          className={`-mr-2.5 flex h-11 w-11 sm:-mt-2.5 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
            guardada ? 'text-primary' : 'text-muted hover:text-primary'
          }`}
        >
          {guardada ? <BookmarkCheck className="h-5 w-5" aria-hidden="true" /> : <Bookmark className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    </article>
  );
}
