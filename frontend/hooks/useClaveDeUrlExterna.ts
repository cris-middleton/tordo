'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { esUrlPropia, siguienteVista, type VistaDeUrl } from '@/lib/urlPropia';

/**
 * La clave con que una pantalla monta el contenido que lee filtros de la URL.
 * Cambia cuando la consulta llega de fuera —un enlace de la cabecera, una
 * búsqueda guardada— y no cuando la reescribe la propia pantalla
 * (`escribirUrlPropia`). Ver `lib/urlPropia.ts`.
 *
 * Se ajusta el estado durante el render, el patrón de React para «guardar
 * información de renders anteriores»: sin `useEffect`, así que no hay un render
 * intermedio con los filtros viejos y la URL nueva.
 */
export function useClaveDeUrlExterna(pagina: string): number {
  const consulta = useSearchParams().toString();
  const [vista, setVista] = useState<VistaDeUrl>({ consulta, clave: 0 });
  if (vista.consulta !== consulta) {
    setVista(siguienteVista(vista, consulta, esUrlPropia(pagina, consulta)));
  }
  return vista.clave;
}
