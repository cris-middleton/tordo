import Link from 'next/link';
import { Heart, Menu } from 'lucide-react';

import { SECCIONES, enlacesAbiertos } from '@/lib/navegacion';
import { urlRepositorio } from '@/lib/repositorio';

import { Contenedor } from './Contenedor';
import { EnlaceGuardados } from './EnlaceGuardados';
import { EnlaceSeccion } from './EnlaceSeccion';
import { MarcoCabecera } from './MarcoCabecera';
import { PajaroMarca } from './PajaroMarca';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

/**
 * La cabecera única del sitio (spec del rediseño §6.1), en todas las páginas.
 *
 * **Componente de servidor**: así puede leer `REPOSITORIO_URL` («Código» sólo
 * aparece con el repositorio publicado) y no manda JavaScript propio. Las islas
 * cliente son pequeñas: la sección activa, el contador de guardados y el marco
 * que cierra el menú móvil al pulsar cualquier enlace (`MarcoCabecera`).
 *
 * - **Desde `lg` (1024 px)**, la fila entera. Mide ~720 px: con el corte en
 *   640 que proponía la spec, en una tableta se partía en dos líneas.
 * - **Por debajo**, una sola línea —marca, guardados, «Apoyar», «Menú»— y las
 *   secciones en un `<details>` cerrado: la búsqueda de cada página queda en la
 *   primera pantalla, sin JavaScript (principio 1 del rediseño).
 * - **No es fija**: la barra de filtros de `/mercado` (`sticky top-0`) se queda
 *   arriba al bajar sin quedar debajo de nada.
 * - Sin `<h1>`: el de cada página es el único.
 * - Dentro del contenedor único (`Contenedor`): la marca y el `h1` de cada página
 *   arrancan en el mismo borde izquierdo (spec PORTADA_V7 §4).
 */
export function Cabecera() {
  const abiertos = enlacesAbiertos(urlRepositorio());

  return (
    <MarcoCabecera className="relative z-30 border-b border-border bg-surface">
      <Contenedor className="flex h-14 items-center gap-2 sm:gap-3 lg:gap-8">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={`${APP_NAME}, inicio`}>
          <PajaroMarca />
          <span className="font-brand text-lg leading-none text-text">{APP_NAME}</span>
        </Link>

        <nav
          aria-label="Secciones"
          className="hidden min-w-0 flex-1 items-center justify-between gap-6 text-sm lg:flex"
        >
          <ul className="flex items-center gap-5">
            {SECCIONES.map((s) => (
              <li key={s.href}>
                <EnlaceSeccion enlace={s} variante="barra" />
              </li>
            ))}
          </ul>
          <ul className="flex items-center gap-5">
            {abiertos.map((s) => (
              <li key={s.href}>
                <EnlaceSeccion enlace={s} variante="barra" />
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3 lg:ml-0">
          <EnlaceGuardados />
          <Link
            href="/apoyar"
            className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1.5 text-sm font-semibold text-accent transition-colors hover:text-primary"
          >
            <Heart className="h-4 w-4" aria-hidden="true" />
            {/* Por debajo de 360 px sólo el corazón: a 320 la fila se pasaba del ancho (WCAG 1.4.10). */}
            <span className="max-[359px]:sr-only">Apoyar</span>
          </Link>
          <details className="relative lg:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated [&::-webkit-details-marker]:hidden">
              <Menu className="h-4 w-4" aria-hidden="true" />
              Menú
            </summary>
            <nav
              aria-label="Menú de secciones"
              className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-card-lg"
            >
              <ul className="space-y-0.5">
                {[...SECCIONES, ...abiertos].map((s) => (
                  <li key={s.href}>
                    <EnlaceSeccion enlace={s} variante="menu" />
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </Contenedor>
    </MarcoCabecera>
  );
}
