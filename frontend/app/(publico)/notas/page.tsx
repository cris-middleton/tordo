import type { Metadata } from 'next';
import Link from 'next/link';

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
 * docs/PORTADA_V7_Y_NOTAS_2026-10.md §5). Fecha y título, sin tarjetas. Estática:
 * se genera en el build.
 */
export default function PaginaNotas() {
  const notas = leerNotas();
  return (
    <article className="lectura max-w-3xl">
      <CabeceraFicha titulo="Notas de datos" subtitulo={DESCRIPCION_NOTAS}>
        <p className="mt-2 text-sm text-muted">
          Síguelas en tu lector de noticias con el{' '}
          <a href="/rss/notas" className="enlace">
            feed RSS
          </a>
          .
        </p>
      </CabeceraFicha>
      <ol className="divide-y divide-border border-y border-border">
        {notas.map((n) => (
          <li key={n.slug} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-6">
            <time dateTime={n.fecha} className="cifra flex-none text-sm text-muted sm:w-28">
              {fechaCorta(n.fecha)}
            </time>
            <div>
              <Link href={rutaNota(n.slug)} className="font-semibold text-text hover:text-primary hover:underline">
                {n.titulo}
              </Link>
              {n.estado === 'en-curso' && (
                <span className="ml-2 text-sm text-muted">{ETIQUETA_ESTADO[n.estado]}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
