'use client';

import { useSyncExternalStore } from 'react';

const KEY = 'user_avatar';
const EVENTO = 'avatar_changed';

/**
 * El avatar del usuario, que vive en `localStorage`.
 *
 * Se leía con `useEffect` + `setState` y un oyente del evento `avatar_changed`.
 * `useSyncExternalStore` es la API que React tiene para esto, y evita el render
 * de más que hacía el efecto al corregir el valor tras montar.
 *
 * Mismo patrón que `useEmpresaActiva` en `lib/empresaActive.ts`.
 */

function suscribir(fn: () => void): () => void {
  window.addEventListener(EVENTO, fn);
  // `storage` mantiene en sincronía otras pestañas; `avatar_changed` es el aviso
  // dentro de la misma.
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(EVENTO, fn);
    window.removeEventListener('storage', fn);
  };
}

const leer = (): string | null => localStorage.getItem(KEY);
const leerEnServidor = (): string | null => null;

export function useAvatar(): string | null {
  return useSyncExternalStore(suscribir, leer, leerEnServidor);
}

export function setAvatar(dataUrl: string | null): void {
  if (typeof window === 'undefined') return;
  if (dataUrl === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, dataUrl);
  window.dispatchEvent(new Event(EVENTO));
}
