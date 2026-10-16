import Link from 'next/link';

import type { TiraPortada } from '@/lib/portada';

/**
 * Las cifras vivas (spec del rediseño §6.6 e IDENTIDAD_Y_PORTADA §3.1): cuántas
 * licitaciones y Compras Ágiles se pueden postular ahora, cada una un bloque con
 * su etiqueta arriba, el número grande y el borde en `dato`. **El enlace es el
 * bloque entero** y su nombre es «4.232 licitaciones abiertas»: el DOM lleva el
 * número primero y `flex-col-reverse` pone la etiqueta encima.
 *
 * Si no hay tira no se llega aquí (`tiraDeLaPortada` → null). La hora ya no va
 * aquí: la dice la franja de abajo. Cada cifra lleva al catálogo con el mismo
 * filtro que la cuenta.
 */
export function TiraCifras({ tira }: { tira: TiraPortada }) {
  return (
    <ul aria-label="Abiertas ahora" className="mt-9 grid grid-cols-2 gap-4">
      {tira.cifras.map((c) => (
        <li key={c.href} className="min-w-0 border-l-4 border-dato pl-3">
          <Link href={c.href} className="group flex flex-col-reverse">
            <span className="cifra text-3xl font-extrabold leading-tight text-text transition-colors group-hover:text-primary sm:text-4xl">
              {c.numero}
            </span>{' '}
            <span className="block text-sm text-muted first-letter:uppercase">{c.etiqueta}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
