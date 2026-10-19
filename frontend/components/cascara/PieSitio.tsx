import Link from 'next/link';

import SelectorTema from '@/components/SelectorTema';
import { PieAtribucion } from '@/components/legal/PieAtribucion';
import { nombreAutor, urlAutor } from '@/lib/autor';
import { columnasDelPie, type EnlaceNavegacion } from '@/lib/navegacion';
import { commitDelSitio, urlRepositorio } from '@/lib/repositorio';
import { CORREO_CONTACTO } from '@/lib/responsable';

import { Contenedor } from './Contenedor';

const ENLACE = 'text-muted transition-colors hover:text-primary';
const TITULO_COLUMNA = 'font-sans text-sm font-semibold text-text';

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
 * El pie único del sitio (spec PORTADA_V7 §6), en todas las páginas.
 *
 * Cuatro columnas desde `lg` y dos por debajo: «Sitio», «Abierto», «Sobre el
 * sitio» (de `columnasDelPie`, en `lib/navegacion.ts`, la misma lista que la
 * cabecera) y, sólo con `AUTOR_NOMBRE`, «Lo hace» con el nombre enlazado a
 * `AUTOR_URL`. Debajo, la cita de ChileCompra, que no estamos afiliados al
 * gobierno, el commit del despliegue (sólo con `VERCEL_GIT_COMMIT_SHA`) y el
 * selector de tema.
 *
 * Componente de servidor —lee `REPOSITORIO_URL`, `AUTOR_*` y el commit— con una
 * sola isla cliente, `SelectorTema`. La cita la pone `PieAtribucion`, y **sólo
 * aquí**: `__tests__/legal-enlazado.test.tsx` falla si otro fichero la pinta.
 */
export function PieSitio() {
  const columnas = columnasDelPie(urlRepositorio(), CORREO_CONTACTO);
  const autor = nombreAutor();
  const enlaceAutor = urlAutor();
  const commit = commitDelSitio();

  return (
    <footer className="border-t border-border">
      <Contenedor className="py-12 lg:py-16">
        <nav aria-label="Mapa del sitio" className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {columnas.map((c) => (
            <div key={c.titulo}>
              <h2 className={TITULO_COLUMNA}>{c.titulo}</h2>
              <ul className="mt-3 space-y-3 text-sm">
                {c.enlaces.map((e) => (
                  <li key={e.href}>
                    <EnlacePie enlace={e} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {autor && (
            <div>
              <h2 className={TITULO_COLUMNA}>Lo hace</h2>
              <p className="mt-3 text-sm">
                {enlaceAutor ? (
                  <a href={enlaceAutor} rel="noopener noreferrer" className={ENLACE}>
                    {autor}
                  </a>
                ) : (
                  <span className="text-muted">{autor}</span>
                )}
              </p>
            </div>
          )}
        </nav>

        <div className="mt-12 flex flex-col gap-6 border-t border-border pt-8 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <div className="max-w-3xl space-y-2">
            <PieAtribucion />
            <p className="text-xs text-muted">No estamos afiliados al gobierno de Chile.</p>
            {commit && (
              <p className="text-xs text-muted">
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
          <div className="w-full max-w-xs shrink-0">
            <SelectorTema />
          </div>
        </div>
      </Contenedor>
    </footer>
  );
}
