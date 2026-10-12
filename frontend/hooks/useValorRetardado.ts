'use client';

import { useEffect, useState } from 'react';

/**
 * El valor, pero sólo cuando lleva `ms` sin cambiar. Para no pedir al backend
 * una búsqueda por cada tecla.
 *
 * Un temporizador SÍ es un efecto; lo que no hace este efecto es pedir datos:
 * publica el valor retardado y la consulta (TanStack Query) reacciona a él. El
 * `setState` va dentro del temporizador, no en el cuerpo del efecto.
 */
export function useValorRetardado<T>(valor: T, ms = 250): T {
  const [retardado, setRetardado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetardado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retardado;
}
