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
 * docs/PORTADA_V7_Y_NOTAS_2026-10.md §5). Cada una con su fecha, su estado
 * (arreglado, medido o en curso), su resumen y, si lo tiene, el antes y el
 * después en una línea: es lo que dice qué se encontró sin abrirla. Sin
 * tarjetas. Estática: se genera en el build.
 */
export default function PaginaNotas() {
  const notas = leerNotas();
  return (
    <article className="lectura max-w-3xl">
      <CabeceraFicha titulo="Notas de datos" subtitulo={DESCRIPCION_NOTAS}>
        <p className="mt-2 text-sm text-muted">
          Para leerlas apenas salen, agrega el{' '}
          <a href="/rss/notas" className="enlace">
            feed RSS
          </a>{' '}
          a tu lector de noticias.
        </p>
      </CabeceraFicha>
      {/* La fila mide lo que el texto (58ch) más la columna de la fecha: los
          filetes no sobresalen del párrafo. */}
      <ol className="max-w-[calc(58ch+8.5rem)] divide-y divide-border border-y border-border">
        {notas.map((n) => (
          <li key={n.slug} className="grid max-w-none gap-x-6 gap-y-2 py-6 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <div className="flex gap-3 text-sm text-muted sm:flex-col sm:gap-1">
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
              {n.antes_despues && (
                <p className="mt-2 text-sm text-muted">
                  {n.antes_despues.rotulo}:{' '}
                  <span className="cifra font-semibold text-text">{n.antes_despues.antes.valor.toLocaleString('es-CL')} %</span>{' '}
                  {n.antes_despues.antes.etiqueta.toLowerCase()},{' '}
                  <span className="cifra font-semibold text-text">{n.antes_despues.despues.valor.toLocaleString('es-CL')} %</span>{' '}
                  {n.antes_despues.despues.etiqueta.toLowerCase()}.
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
