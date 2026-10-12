'use client';

import Link from 'next/link';
import { X } from 'lucide-react';

import { type CollectionType, useDashboardCollections } from '@/hooks/useDashboardCollections';
import { formatCurrency, normalizeText } from '@/lib/licitacionEstado';

/**
 * Las licitaciones guardadas o marcadas como postuladas en este navegador.
 * Hasta ahora se guardaban desde el catálogo y no se veían en ninguna parte.
 */
export default function LicitacionesGuardadas({
  coleccion,
  vacio,
}: {
  coleccion: CollectionType;
  vacio: string;
}) {
  const { collections, hydrated, toggleTender } = useDashboardCollections();
  const lista = collections.tenders[coleccion];

  if (!hydrated) return null;
  if (lista.length === 0) return <p className="text-sm text-muted">{vacio}</p>;

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {lista.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <Link
              href={`/dashboard/tenders/${encodeURIComponent(t.codigo_externo)}`}
              className="line-clamp-1 text-sm font-medium text-text hover:text-primary"
            >
              {normalizeText(t.nombre)}
            </Link>
            <p className="truncate text-xs text-muted">
              {[t.nombre_organismo && normalizeText(t.nombre_organismo), formatCurrency(t.monto_estimado)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleTender(coleccion, t)}
            aria-label={`Quitar ${normalizeText(t.nombre)}`}
            className="rounded-lg p-1.5 text-muted hover:text-danger"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
