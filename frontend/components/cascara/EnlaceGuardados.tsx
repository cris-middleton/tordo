'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bookmark } from 'lucide-react';

import { useBusquedasGuardadas, type BusquedaGuardada } from '@/hooks/useBusquedasGuardadas';
import {
  useDashboardCollections,
  type DashboardCollectionsState,
} from '@/hooks/useDashboardCollections';
import { GUARDADOS, esSeccionActiva } from '@/lib/navegacion';

/**
 * Lo que lista `/guardados`: las licitaciones guardadas o marcadas como
 * postuladas —una que está en las dos cuenta una vez— y las búsquedas.
 */
export function contarGuardados(
  colecciones: DashboardCollectionsState,
  busquedas: readonly BusquedaGuardada[],
): number {
  const licitaciones = new Set(
    [...colecciones.tenders.saved, ...colecciones.tenders.applied].map((t) => t.id),
  );
  return licitaciones.size + busquedas.length;
}

/**
 * Guardados, con su contador (spec del rediseño §6.1). El nombre accesible dice
 * «en este navegador»: de paso, que no hay cuenta. El relleno (6 px por lado)
 * da un área de toque de 28 px (WCAG 2.5.8) sin cambiar la altura de la fila.
 *
 * Lee los mismos almacenes que `/guardados` con `useSyncExternalStore` (dentro
 * de los hooks): en el servidor y al hidratar el total es 0 y no se pinta
 * número, así que no hay desajuste de hidratación; un cambio en otra pestaña
 * llega solo.
 */
export function EnlaceGuardados() {
  const { collections } = useDashboardCollections();
  const { busquedas } = useBusquedasGuardadas();
  const ruta = usePathname() ?? '';
  const total = contarGuardados(collections, busquedas);
  const activa = esSeccionActiva(ruta, GUARDADOS.href);
  const nombre = total > 0 ? `Guardados en este navegador: ${total}` : 'Guardados en este navegador';

  return (
    <Link
      href={GUARDADOS.href}
      aria-label={nombre}
      aria-current={activa ? 'page' : undefined}
      className={`inline-flex items-center gap-1 rounded-lg p-2.5 text-sm transition-colors ${
        activa ? 'text-primary' : 'text-muted hover:text-primary'
      }`}
    >
      <Bookmark className="h-4 w-4" aria-hidden="true" />
      {total > 0 && <span className="cifra text-xs font-semibold">{total}</span>}
    </Link>
  );
}
