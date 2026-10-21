import Link from 'next/link';

import SelectorTema from '@/components/SelectorTema';
import { PieAtribucion } from '@/components/legal/PieAtribucion';
import { nombreAutor, urlAutor } from '@/lib/autor';
import { enlacesDelPie, type EnlaceNavegacion } from '@/lib/navegacion';
import { commitDelSitio, urlRepositorio } from '@/lib/repositorio';
import { CORREO_CONTACTO } from '@/lib/responsable';

import { Contenedor } from './Contenedor';

const ENLACE = 'text-muted transition-colors hover:text-primary';

function EnlacePie({ enlace }: { enlace: EnlaceNavegacion }) {
  if (enlace.href.startsWith('mailto:')) {
    return (
      <a href={enlace.href} className={ENLACE}>
        {enlace.nombre}
      </a>
    );
  }
  if (enlace.externo) {
    return (
      <a href={enlace.href} rel="noopener noreferrer" className={ENLACE}>
        {enlace.nombre}
      </a>
    );
  }
  return (
    <Link href={enlace.href} className={ENLACE}>
      {enlace.nombre}
    </Link>
  );
}

/**
 * El pie único del sitio, en todas las páginas.
 *
 * **Una fila de enlaces y dos líneas de letra chica.** Antes eran cuatro columnas
 * con 18 enlaces —«Sitio» repetía la cabecera entera— que medían ~430 px en
 * escritorio y ~900 en un teléfono: el pie era más alto que muchas páginas. La
 * navegación vive en la cabecera; aquí queda lo que la cabecera no tiene
 * (`enlacesDelPie`), el selector de tema, la cita de ChileCompra, que no estamos
 * afiliados al gobierno, quién lo hace (sólo con `AUTOR_NOMBRE`) y el commit del
 * despliegue (sólo con `VERCEL_GIT_COMMIT_SHA`).
 *
 * Componente de servidor —lee `REPOSITORIO_URL`, `AUTOR_*` y el commit— con una
 * sola isla cliente, `SelectorTema`. La cita la pone `PieAtribucion`, y **sólo
 * aquí**: `__tests__/legal-enlazado.test.tsx` falla si otro fichero la pinta.
 */
export function PieSitio() {
  const enlaces = enlacesDelPie(urlRepositorio(), CORREO_CONTACTO);
  const autor = nombreAutor();
  const enlaceAutor = urlAutor();
  const commit = commitDelSitio();

  return (
    <footer className="border-t border-border">
      <Contenedor className="py-8 lg:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Mapa del sitio">
            <ul className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
              {enlaces.map((e) => (
                <li key={e.href}>
                  <EnlacePie enlace={e} />
                </li>
              ))}
            </ul>
          </nav>
          <SelectorTema compacto />
        </div>

        <div className="mt-6 grid gap-4 border-t border-border pt-6 text-xs text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12">
          <div className="max-w-3xl space-y-1">
            <PieAtribucion />
            <p>Un proyecto independiente, sin relación con el gobierno de Chile.</p>
          </div>
          <div className="space-y-1 lg:text-right">
            {autor && (
              <p>
                Lo hace{' '}
                {enlaceAutor ? (
                  <a href={enlaceAutor} rel="noopener noreferrer" className={`${ENLACE} text-text`}>
                    {autor}
                  </a>
                ) : (
                  <span className="text-text">{autor}</span>
                )}
                .
              </p>
            )}
            {commit && (
              <p>
                Sitio en el commit{' '}
                {commit.url ? (
                  <a href={commit.url} rel="noopener noreferrer" className={`${ENLACE} font-mono`}>
                    {commit.corto}
                  </a>
                ) : (
                  <span className="font-mono">{commit.corto}</span>
                )}
                .
              </p>
            )}
          </div>
        </div>
      </Contenedor>
    </footer>
  );
}
