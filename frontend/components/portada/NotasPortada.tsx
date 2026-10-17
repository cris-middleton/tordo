import Link from 'next/link';

import { CLASE_SECCION } from '@/components/cascara/Seccion';
import { DESCRIPCION_NOTAS, ETIQUETA_ESTADO, rutaNota, type Nota } from '@/lib/notas';
import { fechaCorta } from '@/lib/publico';

import { FichaAutor } from './FichaAutor';

/** Cuántas notas lista la portada; el resto, en `/notas`. */
export const NOTAS_EN_PORTADA = 4;

/**
 * «Notas de datos» en la portada (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3.1,
 * punto 5): las cuatro últimas, con fecha y título y «Arreglo en curso» donde
 * toque, y «Todas las notas». A la derecha, la ficha del autor; sin
 * `AUTOR_NOMBRE`, la lista ocupa el ancho. Sin notas, la sección no sale.
 */
export function NotasPortada({
  notas,
  autor,
  rol,
  urlAutor,
}: {
  notas: Nota[];
  autor: string | null;
  rol: string | null;
  urlAutor: string | null;
}) {
  if (notas.length === 0) return null;
  return (
    <section aria-labelledby="notas-titulo" className={CLASE_SECCION}>
      <div className={autor ? 'grid gap-8 lg:grid-cols-12 lg:gap-12' : ''}>
        <div className="min-w-0 lg:col-span-7">
          <h2 id="notas-titulo" className="section-title">
            Notas de datos
          </h2>
          <p className="mt-2 text-sm text-muted">{DESCRIPCION_NOTAS}</p>
          <ol className="mt-4 divide-y divide-border border-y border-border">
            {notas.slice(0, NOTAS_EN_PORTADA).map((n) => (
              <li key={n.slug} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-6">
                <time dateTime={n.fecha} className="cifra flex-none text-sm text-muted sm:w-28">
                  {fechaCorta(n.fecha)}
                </time>
                <p className="min-w-0">
                  <Link href={rutaNota(n.slug)} className="enlace">
                    {n.titulo}
                  </Link>
                  {n.estado === 'en-curso' && (
                    <span className="ml-2 whitespace-nowrap text-xs font-semibold text-accent">
                      {ETIQUETA_ESTADO[n.estado]}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm">
            <Link href="/notas" className="enlace">
              Todas las notas
            </Link>
          </p>
        </div>
        {autor && (
          <div className="lg:col-span-5">
            <FichaAutor nombre={autor} rol={rol} url={urlAutor} />
          </div>
        )}
      </div>
    </section>
  );
}
