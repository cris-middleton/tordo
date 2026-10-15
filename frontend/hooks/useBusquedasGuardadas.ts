'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { crearAlmacenLocal } from '@/lib/almacenLocal';
import { escribirFiltros, leerFiltros, soloFiltros } from '@/lib/filtrosCatalogo';

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

/**
 * La forma canónica de una consulta, también la de una guardada hace tiempo:
 * lo guardado antes de normalizar `tipo_convocatoria` (u `abiertas=true`) tiene
 * otro texto que la página, que siempre compara contra `leer → escribir`. Sin
 * esto, esa búsqueda dejaba de reconocerse como guardada y guardarla otra vez
 * añadía una gemela.
 */
export function consultaCanonica(consulta: string): string {
  return consultaDe(escribirFiltros(leerFiltros(new URLSearchParams(consulta))));
}

function interpretar(crudo: unknown): BusquedaGuardada[] {
  if (!Array.isArray(crudo)) return VACIA;
  const vistas = new Set<string>();
  const salida: BusquedaGuardada[] = [];
  for (const b of crudo) {
    if (typeof b !== 'object' || b === null || typeof b.consulta !== 'string') continue;
    const consulta = consultaCanonica(b.consulta);
    // Dos guardadas que normalizan igual son la misma búsqueda: queda la más reciente (va primero).
    if (vistas.has(consulta)) continue;
    vistas.add(consulta);
    salida.push({ ...b, consulta });
  }
  return salida;
}

const almacen = crearAlmacenLocal(CLAVE_BUSQUEDAS, VACIA, interpretar);

/** La consulta canónica de una URL del catálogo. */
export function consultaDe(params: URLSearchParams): string {
  return soloFiltros(params).toString();
}

export function useBusquedasGuardadas() {
  const busquedas = useSyncExternalStore(almacen.suscribir, almacen.leer, almacen.leerEnServidor);

  const estaGuardada = useCallback(
    (consulta: string) => {
      const canonica = consultaCanonica(consulta);
      return busquedas.some((b) => b.consulta === canonica);
    },
    [busquedas],
  );

  const guardar = useCallback((consulta: string) => {
    const canonica = consultaCanonica(consulta);
    almacen.escribir((prev) =>
      prev.some((b) => b.consulta === canonica)
        ? prev
        : [{ consulta: canonica, guardadaEn: new Date().toISOString() }, ...prev],
    );
  }, []);

  const borrar = useCallback((consulta: string) => {
    const canonica = consultaCanonica(consulta);
    almacen.escribir((prev) => prev.filter((b) => b.consulta !== canonica));
  }, []);

  return { busquedas, estaGuardada, guardar, borrar };
}
