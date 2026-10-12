/**
 * Los favoritos viven en `localStorage`, sobre `useSyncExternalStore`.
 *
 * Se fija:
 *   1. que lo guardado con la forma de siempre se sigue leyendo (cambiar la
 *      clave o la forma lo borraría en silencio) y que `orders` se descarta;
 *   2. que con el almacenamiento bloqueado la pantalla no revienta y guardar
 *      funciona en memoria durante la visita;
 *   3. que un cambio hecho en OTRA pestaña (evento `storage`) llega a esta.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AlmacenDePrueba, instalarAlmacenDePrueba } from './ayudas/almacenDePrueba';

const CLAVE = 'licit_dashboard_collections_v1';

const licitacion = { id: 7, codigo_externo: '1234-5-LE26', nombre: 'Válvulas' };

async function cargarHook() {
  // El almacén es de módulo: cada test parte de uno nuevo.
  vi.resetModules();
  return (await import('@/hooks/useDashboardCollections')).useDashboardCollections;
}

let almacen: AlmacenDePrueba;

beforeEach(() => {
  almacen = instalarAlmacenDePrueba();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('favoritos', () => {
  it('lee lo guardado con la clave y la forma de siempre, sin `orders`', async () => {
    window.localStorage.setItem(
      CLAVE,
      JSON.stringify({
        tenders: { saved: [{ ...licitacion, storedAt: '2026-01-01' }], applied: [] },
        orders: { saved: [{ id: 1, codigo_oc: 'X' }], applied: [] },
      }),
    );
    const useDashboardCollections = await cargarHook();
    const { result } = renderHook(() => useDashboardCollections());

    expect(result.current.isTenderStored('saved', 7)).toBe(true);
    expect(result.current.collections).not.toHaveProperty('orders');

    act(() => {
      result.current.toggleTender('applied', licitacion);
    });
    const guardado = JSON.parse(window.localStorage.getItem(CLAVE) ?? '{}');
    expect(guardado.tenders.applied).toHaveLength(1);
    expect(guardado.tenders.saved).toHaveLength(1);
    expect(guardado).not.toHaveProperty('orders');
  });

  it('un JSON corrupto no rompe la pantalla', async () => {
    window.localStorage.setItem(CLAVE, '{no es json');
    const useDashboardCollections = await cargarHook();
    const { result } = renderHook(() => useDashboardCollections());
    expect(result.current.counts.tenders.saved).toBe(0);
  });

  it('con el almacenamiento bloqueado, lee vacío y guarda en memoria', async () => {
    vi.spyOn(almacen, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    vi.spyOn(almacen, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    const useDashboardCollections = await cargarHook();
    const { result } = renderHook(() => useDashboardCollections());

    expect(result.current.counts.tenders.saved).toBe(0);
    act(() => {
      expect(result.current.toggleTender('saved', licitacion)).toBe(true);
    });
    expect(result.current.isTenderStored('saved', 7)).toBe(true);
  });

  it('un cambio en otra pestaña llega a esta', async () => {
    const useDashboardCollections = await cargarHook();
    const { result } = renderHook(() => useDashboardCollections());
    expect(result.current.isTenderStored('saved', 7)).toBe(false);

    act(() => {
      // Así lo ve esta pestaña: el valor ya está escrito y llega el evento.
      window.localStorage.setItem(
        CLAVE,
        JSON.stringify({ tenders: { saved: [{ ...licitacion, storedAt: 'x' }], applied: [] } }),
      );
      window.dispatchEvent(new StorageEvent('storage', { key: CLAVE }));
    });
    expect(result.current.isTenderStored('saved', 7)).toBe(true);
  });

  it('dos instancias del hook ven lo mismo', async () => {
    const useDashboardCollections = await cargarHook();
    const a = renderHook(() => useDashboardCollections());
    const b = renderHook(() => useDashboardCollections());
    act(() => {
      a.result.current.toggleTender('saved', licitacion);
    });
    expect(b.result.current.isTenderStored('saved', 7)).toBe(true);
  });
});
