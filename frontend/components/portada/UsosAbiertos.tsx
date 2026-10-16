import Link from 'next/link';

import type { EnlaceNavegacion } from '@/lib/navegacion';

/**
 * «Úsalo como quieras» (spec del rediseño §6.3): lo abierto, en una línea. Cada
 * uso lleva a su sección de `/abierto`; «Código», si está, al repositorio, fuera
 * del sitio. La lista la arma `usosAbiertos()` (`lib/portada.ts`), que decide si
 * hay repositorio que enlazar.
 */
export function UsosAbiertos({ usos }: { usos: EnlaceNavegacion[] }) {
  return (
    <section aria-labelledby="usos-titulo" className="mt-12 border-t border-border pt-6">
      <h2 id="usos-titulo" className="text-xl text-text">
        Úsalo como quieras
      </h2>
      <p className="mt-1 text-sm text-muted">
        Desde otro programa, desde un asistente de IA o en una planilla.
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {usos.map((u) => (
          <li key={u.nombre}>
            {u.externo ? (
              <a href={u.href} rel="noopener noreferrer" className="enlace">
                {u.nombre}
              </a>
            ) : (
              <Link href={u.href} className="enlace">
                {u.nombre}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
