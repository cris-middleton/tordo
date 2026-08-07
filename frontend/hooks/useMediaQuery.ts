'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Una media query, como valor reactivo.
 *
 * `useSyncExternalStore` en vez de `useEffect` + `setState`: es la API que React
 * tiene para suscribirse a algo que vive fuera de React, y evita el render de
 * más que hacía el efecto al corregir el valor tras montar.
 *
 * En el servidor devuelve `false` — el mismo valor que da el cliente antes de
 * hidratar, así que no hay desajuste. Eso significa que **el valor "positivo"
 * debe ser el que no cambie la disposición**: si asumieras `true` para
 * `prefers-reduced-motion`, el contenido parpadearía al hidratar.
 */
export function useMediaQuery(query: string): boolean {
  const suscribir = useCallback(
    (fn: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    [query],
  );
  const leer = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(suscribir, leer, () => false);
}
