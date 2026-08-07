'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type CollectionType = 'saved' | 'applied';
export type ItemCategory = 'tenders' | 'orders';

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

export interface StoredOrder {
  id: number;
  codigo_oc: string;
  nombre: string;
  fecha_publicacion?: string;
  monto_total: number;
  moneda?: string;
  estado?: string;
  region?: string;
  nombre_organismo?: string;
  nombre_proveedor?: string;
  storedAt: string;
}

export interface DashboardCollectionsState {
  tenders: {
    saved: StoredTender[];
    applied: StoredTender[];
  };
  orders: {
    saved: StoredOrder[];
    applied: StoredOrder[];
  };
}

const STORAGE_KEY = 'licit_dashboard_collections_v1';

const defaultState: DashboardCollectionsState = {
  tenders: {
    saved: [],
    applied: [],
  },
  orders: {
    saved: [],
    applied: [],
  },
};

const parseState = (raw: string | null): DashboardCollectionsState => {
  if (!raw) return defaultState;
  try {
    const parsed = JSON.parse(raw);
    return {
      tenders: {
        saved: Array.isArray(parsed?.tenders?.saved) ? parsed.tenders.saved : [],
        applied: Array.isArray(parsed?.tenders?.applied) ? parsed.tenders.applied : [],
      },
      orders: {
        saved: Array.isArray(parsed?.orders?.saved) ? parsed.orders.saved : [],
        applied: Array.isArray(parsed?.orders?.applied) ? parsed.orders.applied : [],
      },
    };
  } catch (error) {
    console.warn('Error parsing dashboard collections from storage', error);
    return defaultState;
  }
};

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

type OrderInput = {
  id: number;
  codigo_oc: string;
  nombre: string;
  fecha_publicacion?: string;
  monto_total: number;
  moneda?: string;
  estado?: string;
  region?: string;
  nombre_organismo?: string;
  nombre_proveedor?: string;
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

export const toStoredOrder = (order: OrderInput): StoredOrder => ({
  id: order.id,
  codigo_oc: order.codigo_oc,
  nombre: order.nombre,
  fecha_publicacion: order.fecha_publicacion,
  monto_total: order.monto_total,
  moneda: order.moneda,
  estado: order.estado,
  region: order.region,
  nombre_organismo: order.nombre_organismo,
  nombre_proveedor: order.nombre_proveedor,
  storedAt: new Date().toISOString(),
});

export function useDashboardCollections() {
  // El estado arranca directamente de localStorage con un inicializador
  // perezoso, en vez de un efecto que lo corregía tras montar. Ese efecto
  // provocaba un render con el estado vacío y otro con el real — visible como
  // un parpadeo en las listas guardadas.
  //
  // `typeof window` dentro del inicializador cubre el servidor, donde devuelve
  // el estado por defecto: es el mismo valor que el cliente pinta en la
  // hidratación, así que no hay desajuste.
  const [collections, setCollections] = useState<DashboardCollectionsState>(() =>
    typeof window === 'undefined'
      ? defaultState
      : parseState(window.localStorage.getItem(STORAGE_KEY)),
  );

  // Escribir SÍ es un efecto: es una sincronización con algo externo, no un
  // cálculo de estado. `hydrated` desaparece porque ya no hay dos fases.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
  }, [collections]);

  const isTenderStored = useCallback(
    (collection: CollectionType, id: number) =>
      collections.tenders[collection].some((item) => item.id === id),
    [collections.tenders],
  );

  const isOrderStored = useCallback(
    (collection: CollectionType, id: number) =>
      collections.orders[collection].some((item) => item.id === id),
    [collections.orders],
  );

  const toggleTender = useCallback(
    (collection: CollectionType, tender: TenderInput) => {
      const exists = collections.tenders[collection].some((item) => item.id === tender.id);
      setCollections((prev) => {
        const nextCollection = exists
          ? prev.tenders[collection].filter((item) => item.id !== tender.id)
          : [...prev.tenders[collection], toStoredTender(tender)];
        return {
          ...prev,
          tenders: {
            ...prev.tenders,
            [collection]: nextCollection,
          },
        };
      });
      return !exists;
    },
    [collections.tenders],
  );

  const toggleOrder = useCallback(
    (collection: CollectionType, order: OrderInput) => {
      const exists = collections.orders[collection].some((item) => item.id === order.id);
      setCollections((prev) => {
        const nextCollection = exists
          ? prev.orders[collection].filter((item) => item.id !== order.id)
          : [...prev.orders[collection], toStoredOrder(order)];
        return {
          ...prev,
          orders: {
            ...prev.orders,
            [collection]: nextCollection,
          },
        };
      });
      return !exists;
    },
    [collections.orders],
  );

  const counts = useMemo(
    () => ({
      tenders: {
        saved: collections.tenders.saved.length,
        applied: collections.tenders.applied.length,
      },
      orders: {
        saved: collections.orders.saved.length,
        applied: collections.orders.applied.length,
      },
    }),
    [collections],
  );

  return {
    collections,
    counts,
    //  siempre fue true tras el primer render; ahora lo es desde el
    // primero, así que se conserva como constante para no romper a quien lo lea.
    hydrated: true,
    isTenderStored,
    isOrderStored,
    toggleTender,
    toggleOrder,
  };
}
