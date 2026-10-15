import Link from 'next/link';

import SelectorTema from '@/components/SelectorTema';
import { PieAtribucion } from '@/components/legal/PieAtribucion';
import { mapaDelSitio } from '@/lib/navegacion';
import { urlRepositorio } from '@/lib/repositorio';
import { CORREO_CONTACTO } from '@/lib/responsable';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

const ENLACE = 'text-muted transition-colors hover:text-primary';

/**
 * El pie único del sitio (spec del rediseño §6.2), en todas las páginas.
 *
 * Componente de servidor —lee `REPOSITORIO_URL` para «Código»— con una sola isla
 * cliente, `SelectorTema`. El mapa del sitio sale de `lib/navegacion.ts`, la
 * misma lista que la cabecera. La cita de ChileCompra y los enlaces legales los
 * pone `PieAtribucion`, y **sólo aquí**: `__tests__/legal-enlazado.test.tsx`
 * falla si otro fichero la pinta.
 *
 * «Acerca» va aquí, con las licencias y el contacto, y no en el mapa: no es una
 * sección (spec §6.2). Entró con su página, en el PR 6 del rediseño.
 */
export function PieSitio() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <nav aria-label="Mapa del sitio">
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
            {mapaDelSitio(urlRepositorio()).map((e) => (
              <li key={e.href}>
                {e.externo ? (
                  <a href={e.href} rel="noopener noreferrer" className={ENLACE}>
                    {e.nombre}
                  </a>
                ) : (
                  <Link href={e.href} className={ENLACE}>
                    {e.nombre}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <PieAtribucion />

        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-subtle">
          <li>
            <Link href="/abierto#licencias" className="transition-colors hover:text-primary">
              Licencias
            </Link>
          </li>
          <li>
            <Link href="/acerca" className="transition-colors hover:text-primary">
              Acerca
            </Link>
          </li>
          <li>
            <a href={`mailto:${CORREO_CONTACTO}`} className="transition-colors hover:text-primary">
              Contacto
            </a>
          </li>
        </ul>

        <div className="w-full max-w-xs">
          <SelectorTema />
        </div>

        <p className="text-center text-[11px] text-subtle">
          {APP_NAME} · Chile · No estamos afiliados al gobierno de Chile
        </p>
      </div>
    </footer>
  );
}
