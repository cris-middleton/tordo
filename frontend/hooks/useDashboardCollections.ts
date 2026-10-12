'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { crearAlmacenLocal } from '@/lib/almacenLocal';

/**
 * Licitaciones guardadas («favoritos») y marcadas como postuladas, en el
 * navegador del visitante. Sin cuentas no hay otro sitio donde guardarlas.
 *
 * **La clave y la forma son las de siempre** (`licit_dashboard_collections_v1`,
 * `{tenders: {saved, applied}}`): cambiarlas borraría en silencio lo que cada
 * visitante tenía guardado. Lo que se fue es `orders` —no queda pantalla de
 * órdenes—, y se descarta al leer: la próxima escritura ya no lo lleva.
 *
 * Vive en `useSyncExternalStore` sobre `lib/almacenLocal.ts`, no en `useState` +
 * `useEffect`: así todas las instancias del hook ven lo mismo y un cambio en
 * otra pestaña llega a esta.
 */

export type CollectionType = 'saved' | 'applied';

export interface StoredTender {
  id: number;
  codigo_externo: string;
  nombre: string;
  fecha_publicacion?: string;
  monto_estimado?: number;
  estado?: string;
  region?: string;
  nombre_organismo?: string;
  storedAt: string;
}

export interface DashboardCollectionsState {
  tenders: {
    saved: StoredTender[];
    applied: StoredTender[];
  };
}

export const STORAGE_KEY = 'licit_dashboard_collections_v1';

const defaultState: DashboardCollectionsState = { tenders: { saved: [], applied: [] } };

function esTender(x: unknown): x is StoredTender {
  const t = x as StoredTender | null;
  return typeof t === 'object' && t !== null && typeof t.id === 'number' && typeof t.codigo_externo === 'string';
}

export function parseState(crudo: unknown): DashboardCollectionsState {
  const c = crudo as { tenders?: { saved?: unknown; applied?: unknown } } | null;
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter(esTender) : []);
  return {
    tenders: { saved: lista(c?.tenders?.saved), applied: lista(c?.tenders?.applied) },
  };
}

type TenderInput = {
  id: number;
  codigo_externo: string;
  nombre: string;
  fecha_publicacion?: string;
  monto_estimado?: number;
  estado?: string;
  region?: string;
  nombre_organismo?: string;
};

export const toStoredTender = (tender: TenderInput): StoredTender => ({
  id: tender.id,
  codigo_externo: tender.codigo_externo,
  nombre: tender.nombre,
  fecha_publicacion: tender.fecha_publicacion,
  monto_estimado: tender.monto_estimado,
  estado: tender.estado,
  region: tender.region,
  nombre_organismo: tender.nombre_organismo,
  storedAt: new Date().toISOString(),
});

const almacen = crearAlmacenLocal(STORAGE_KEY, defaultState, parseState);

const suscribirNada = () => () => {};

export function useDashboardCollections() {
  const collections = useSyncExternalStore(almacen.suscribir, almacen.leer, almacen.leerEnServidor);
  // En el servidor y durante la hidratación se pinta el estado vacío; los
  // botones de guardar esperan a saber lo que hay de verdad.
  const hydrated = useSyncExternalStore(suscribirNada, () => true, () => false);

  const isTenderStored = useCallback(
    (collection: CollectionType, id: number) =>
      collections.tenders[collection].some((item) => item.id === id),
    [collections],
  );

  const toggleTender = useCallback((collection: CollectionType, tender: TenderInput) => {
    let agregada = false;
    almacen.escribir((prev) => {
      const lista = prev.tenders[collection];
      const existe = lista.some((item) => item.id === tender.id);
      agregada = !existe;
      return {
        tenders: {
          ...prev.tenders,
          [collection]: existe
            ? lista.filter((item) => item.id !== tender.id)
            : [...lista, toStoredTender(tender)],
        },
      };
    });
    return agregada;
  }, []);

  const counts = useMemo(
    () => ({
      tenders: {
        saved: collections.tenders.saved.length,
        applied: collections.tenders.applied.length,
      },
    }),
    [collections],
  );

  return { collections, counts, hydrated, isTenderStored, toggleTender };
}
