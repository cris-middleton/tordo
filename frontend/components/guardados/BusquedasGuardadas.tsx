'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Rss, Search, Trash2 } from 'lucide-react';

import { useBusquedasGuardadas } from '@/hooks/useBusquedasGuardadas';
import { describirBusqueda } from '@/lib/filtrosCatalogo';
import { urlRssDeBusqueda } from '@/lib/rss';

/**
 * Las búsquedas del catálogo guardadas en este navegador: abrir, borrar y
 * copiar la URL de su RSS.
 */
export default function BusquedasGuardadas() {
  const { busquedas, borrar } = useBusquedasGuardadas();
  const [copiada, setCopiada] = useState<string | null>(null);

  const copiarRss = async (consulta: string) => {
    const url = urlRssDeBusqueda(window.location.origin, consulta);
    try {
      await navigator.clipboard.writeText(url);
      setCopiada(consulta);
    } catch {
      // Sin permiso de portapapeles (o en http): se ofrece para copiar a mano.
      window.prompt('Copia la URL del feed:', url);
    }
  };

  if (busquedas.length === 0) {
    return (
      <div className="card py-8 text-center">
        <p className="font-medium text-text">Todavía no guardas ninguna búsqueda</p>
        <p className="mt-1 text-sm text-muted">
          En{' '}
          <Link href="/licitaciones" className="font-medium text-primary hover:underline">
            Licitaciones
          </Link>
          , filtra como quieras y pulsa «Guardar esta búsqueda».
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {busquedas.map(({ consulta }) => (
        <li key={consulta} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <Link
            href={`/licitaciones${consulta ? `?${consulta}` : ''}`}
            className="min-w-0 flex-1 truncate text-sm font-medium text-text hover:text-primary"
          >
            {describirBusqueda(consulta)}
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => copiarRss(consulta)}
              className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-xs text-muted hover:border-primary/25 hover:text-primary"
            >
              {copiada === consulta ? (
                <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              ) : (
                <Rss className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copiada === consulta ? 'URL copiada' : 'Copiar URL de RSS'}
            </button>
            <button
              type="button"
              onClick={() => borrar(consulta)}
              aria-label={`Borrar la búsqueda ${describirBusqueda(consulta)}`}
              className="rounded-lg border border-border bg-background p-1.5 text-muted hover:border-danger/25 hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
