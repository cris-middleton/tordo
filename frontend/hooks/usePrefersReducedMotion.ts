'use client';

import { useEffect, useState } from 'react';

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
 * Arranca en `false` y se corrige tras montar: en el servidor no hay
 * `matchMedia`, y asumir `true` haría parpadear el contenido en la hidratación.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    setReduced(mq.matches);

    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

export default usePrefersReducedMotion;
