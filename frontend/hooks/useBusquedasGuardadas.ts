'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { crearAlmacenLocal } from '@/lib/almacenLocal';
import { soloFiltros } from '@/lib/filtrosCatalogo';

/**
 * Búsquedas del catálogo guardadas en el navegador (`tordo_busquedas_v1`).
 *
 * Una búsqueda es su **consulta**: sólo los parámetros que filtran, en orden
 * fijo (`soloFiltros`). Es a la vez su identidad —guardar dos veces la misma
 * no la duplica— y lo que va en la URL del catálogo y en la del RSS.
 */

export interface BusquedaGuardada {
  /** `search=…&region=…`, sin `?`. */
  consulta: string;
  guardadaEn: string;
}

export const CLAVE_BUSQUEDAS = 'tordo_busquedas_v1';

const VACIA: BusquedaGuardada[] = [];

function interpretar(crudo: unknown): BusquedaGuardada[] {
  if (!Array.isArray(crudo)) return VACIA;
  return crudo.filter(
    (b): b is BusquedaGuardada =>
      typeof b === 'object' && b !== null && typeof b.consulta === 'string',
  );
}

const almacen = crearAlmacenLocal(CLAVE_BUSQUEDAS, VACIA, interpretar);

/** La consulta canónica de una URL del catálogo. */
export function consultaDe(params: URLSearchParams): string {
  return soloFiltros(params).toString();
}

export function useBusquedasGuardadas() {
  const busquedas = useSyncExternalStore(almacen.suscribir, almacen.leer, almacen.leerEnServidor);

  const estaGuardada = useCallback(
    (consulta: string) => busquedas.some((b) => b.consulta === consulta),
    [busquedas],
  );

  const guardar = useCallback((consulta: string) => {
    almacen.escribir((prev) =>
      prev.some((b) => b.consulta === consulta)
        ? prev
        : [{ consulta, guardadaEn: new Date().toISOString() }, ...prev],
    );
  }, []);

  const borrar = useCallback((consulta: string) => {
    almacen.escribir((prev) => prev.filter((b) => b.consulta !== consulta));
  }, []);

  return { busquedas, estaGuardada, guardar, borrar };
}
