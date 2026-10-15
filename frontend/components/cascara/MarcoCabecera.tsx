'use client';

import type { MouseEvent, ReactNode } from 'react';

/**
 * El `<header>` de la cabecera, con un solo manejador: pulsar CUALQUIER enlace
 * suyo cierra el menú móvil.
 *
 * Hace falta porque la cáscara vive en el layout raíz y **no se desmonta al
 * navegar**: el `<details>` abierto seguiría abierto encima de la página nueva.
 * Los enlaces que lo cierran no son sólo los del menú —también la marca, el
 * marcador de guardados y «Apoyar», que están en la misma fila—, y un
 * `onClick` por enlace obligaba a volver cliente cada uno. Sin estado ni
 * efecto: quita el atributo `open`, que es todo el estado de un `<details>`.
 * Sin JavaScript no pasa nada: cada navegación recarga la página.
 *
 * El contenido llega como `children` desde la cabecera, que sigue siendo de
 * servidor (necesita `REPOSITORIO_URL`).
 */
export function MarcoCabecera({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <header className={className} onClick={cerrarMenuAlNavegar}>
      {children}
    </header>
  );
}

function cerrarMenuAlNavegar(evento: MouseEvent<HTMLElement>) {
  if (!(evento.target instanceof Element) || !evento.target.closest('a')) return;
  evento.currentTarget.querySelector('details')?.removeAttribute('open');
}
