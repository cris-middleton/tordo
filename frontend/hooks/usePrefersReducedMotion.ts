'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * `true` cuando el sistema pide menos movimiento.
 *
 * El bloque `@media (prefers-reduced-motion)` de globals.css apaga las
 * animaciones CSS, pero no puede tocar el movimiento que maneja JavaScript:
 * el rubro que rota en el hero, el auto-avance de los tabs de producto y el
 * aleteo del logo son `setInterval`, y seguirían corriendo. Este hook existe
 * para eso — úsalo para no arrancar el intervalo, no sólo para ocultarlo.
 *
 * Arranca en `false`: en el servidor no hay `matchMedia`, y asumir `true` haría
 * parpadear el contenido en la hidratación.
 */
const suscribir = (fn: () => void): (() => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
};

const leer = (): boolean => window.matchMedia(QUERY).matches;

// En el servidor no hay `matchMedia`. `false` es el mismo valor que da el cliente
// antes de hidratar, así que no hay desajuste.
const leerEnServidor = (): boolean => false;

export function usePrefersReducedMotion(): boolean {
  // `useSyncExternalStore` en vez de `useEffect` + `setState`: es la API que
  // React tiene para suscribirse a algo que vive fuera de React, y evita el
  // render de más que hacía el efecto al corregir el valor tras montar.
  return useSyncExternalStore(suscribir, leer, leerEnServidor);
}
