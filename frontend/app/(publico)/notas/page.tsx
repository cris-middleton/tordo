import type { Metadata } from 'next';
import Link from 'next/link';

import { AntesDespues } from '@/components/notas/AntesDespues';
import { CabeceraFicha } from '@/components/publico/Piezas';
import { DESCRIPCION_NOTAS, ETIQUETA_ESTADO, leerNotas, rutaNota } from '@/lib/notas';
import { fechaCorta } from '@/lib/publico';

export const metadata: Metadata = {
  title: 'Notas de datos',
  description: DESCRIPCION_NOTAS,
  alternates: {
    canonical: '/notas',
    types: { 'application/rss+xml': '/rss/notas' },
  },
};

/**
 * `/notas` — las notas de datos, de la más nueva a la más vieja (spec
 * docs/PORTADA_V7_Y_NOTAS_2026-10.md §5). Cada una con su fecha, su estado
 * (arreglado, medido o en curso), su resumen y, si lo tiene, el antes y el
 * después en sus dos barras: es lo que dice qué se encontró sin abrirla. Sin
 * tarjetas; desde `lg`, dos por fila. Estática: se genera en el build.
 */
export default function PaginaNotas() {
  const notas = leerNotas();
  return (
    // `lg:max-w-none`: desde `lg` la lista va en dos columnas y usa el ancho entero.
    <article className="lectura max-w-3xl lg:max-w-none">
      <CabeceraFicha titulo="Notas de datos" subtitulo={DESCRIPCION_NOTAS}>
        <p className="mt-2 text-sm text-muted">
          Para leerlas apenas salen, agrega el{' '}
          <a href="/rss/notas" className="enlace">
            feed RSS
          </a>{' '}
          a tu lector de noticias.
        </p>
      </CabeceraFicha>
      {/* Bajo `lg`, una nota por fila, con la fecha a la izquierda desde `sm`; la
          fila mide lo que el texto (58ch) más la columna de la fecha, así que los
          filetes no sobresalen del párrafo. Desde `lg`, dos notas por fila, con la
          fecha y el estado sobre el título: cada columna ya mide lo que un párrafo. */}
      <ol className="grid max-w-[calc(58ch+8.5rem)] border-b border-border lg:max-w-none lg:grid-cols-2 lg:gap-x-16">
        {notas.map((n) => (
          <li
            key={n.slug}
            className="grid max-w-none gap-x-6 gap-y-2 border-t border-border py-6 sm:grid-cols-[7rem_minmax(0,1fr)] lg:grid-cols-1 lg:content-start">
            <div className="flex gap-3 text-sm text-muted sm:flex-col sm:gap-1 lg:flex-row lg:gap-3">
              <time dateTime={n.fecha} className="cifra">
                {fechaCorta(n.fecha)}
              </time>
              <span>{ETIQUETA_ESTADO[n.estado]}</span>
            </div>
            <div>
              <h2 className="font-sans text-lg font-semibold leading-snug">
                <Link href={rutaNota(n.slug)} className="text-text hover:text-primary">
                  {n.titulo}
                </Link>
              </h2>
              <p className="mt-2 text-muted">{n.resumen}</p>
              {n.antes_despues && <AntesDespues datos={n.antes_despues} className="mt-4" rotulo="arriba" />}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
