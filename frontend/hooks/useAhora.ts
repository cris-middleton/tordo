'use client';

import { useSyncExternalStore } from 'react';

const MINUTO = 60_000;

function suscribir(avisar: () => void) {
  const id = window.setInterval(avisar, MINUTO);
  return () => window.clearInterval(id);
}

// Redondeado al minuto: `getSnapshot` tiene que devolver lo mismo entre dos
// llamadas seguidas, o React entra en bucle.
const leer = () => Math.floor(Date.now() / MINUTO) * MINUTO;

/**
 * La hora actual, al minuto, como valor reactivo. `null` en el servidor y
 * durante la hidratación: ahí no se sabe la hora del visitante.
 *
 * Existe para que «actualizado hace más de 8 h» se recalcule solo con la
 * pestaña abierta, sin un `Date.now()` impuro dentro del render.
 */
export function useAhora(): number | null {
  return useSyncExternalStore(suscribir, leer, () => null);
}
