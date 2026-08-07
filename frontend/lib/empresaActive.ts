'use client';

import { useSyncExternalStore } from 'react';

const KEY = 'tordo_empresa_activa_id';

export function getEmpresaActiva(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY);
}

export function setEmpresaActiva(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, id);
  avisar();
}

export function clearEmpresaActiva(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
  avisar();
}

// ── Suscripción ──────────────────────────────────────────────────────────────
//
// Las pantallas leían esto con `useEffect` + `setState`, que es lo que marca
// `set-state-in-effect`. `useSyncExternalStore` es la API que React tiene
// justamente para esto: suscribirse a algo que vive fuera de React.
//
// Y arregla un fallo que el efecto tenía: **el efecto sólo corría al montar**,
// así que cambiar de empresa en el selector no actualizaba las pantallas ya
// montadas hasta recargar.

const oyentes = new Set<() => void>();

function avisar(): void {
  oyentes.forEach((fn) => fn());
}

function suscribir(fn: () => void): () => void {
  oyentes.add(fn);
  // `storage` sólo dispara en OTRAS pestañas, que es exactamente lo que hace
  // falta para mantenerlas en sincronía; los cambios propios los cubre `avisar`.
  window.addEventListener('storage', fn);
  return () => {
    oyentes.delete(fn);
    window.removeEventListener('storage', fn);
  };
}

/**
 * La empresa activa, reactiva.
 *
 * En el servidor devuelve `null` — el mismo valor que da el cliente antes de
 * hidratar, así que no hay desajuste de hidratación.
 */
export function useEmpresaActiva(): string | null {
  return useSyncExternalStore(suscribir, getEmpresaActiva, () => null);
}
