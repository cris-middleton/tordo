import Link from 'next/link';

import type { TiraPortada } from '@/lib/portada';

/**
 * La tira de cifras vivas (spec del rediseño §6.3 y §6.6): cuántas licitaciones
 * y Compras Ágiles se pueden postular ahora, con la hora de la última ingesta.
 *
 * Si no hay tira no se llega aquí: `tiraDeLaPortada` devuelve `null` sin resumen
 * o sin una hora legible, y la portada no la pinta. Cada cifra lleva al catálogo
 * con el mismo filtro que la cuenta: el número que se lee es el total que se encuentra.
 */
export function TiraCifras({ tira }: { tira: TiraPortada }) {
  return (
    <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted">
      <ul aria-label="Abiertas ahora" className="flex flex-wrap gap-x-4 gap-y-1">
        {tira.cifras.map((c) => (
          <li key={c.href}>
            <Link href={c.href} className="cifra font-semibold text-text transition-colors hover:text-primary">
              {c.texto}
            </Link>
          </li>
        ))}
      </ul>
      <span>
        actualizado el <span className="cifra">{tira.actualizado}</span>
      </span>
    </div>
  );
}
