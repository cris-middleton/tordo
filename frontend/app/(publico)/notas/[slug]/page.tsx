import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Markdown } from '@/components/guias/Markdown';
import { AntesDespues } from '@/components/notas/AntesDespues';
import { CabeceraFicha } from '@/components/publico/Piezas';
import { nombreAutor, urlAutor } from '@/lib/autor';
import {
  ETIQUETA_ESTADO,
  buscarNota,
  citaDeFuente,
  fechaLarga,
  fragmentoLegible,
  leerNotas,
  partirEnQueCambio,
  rutaNota,
  urlEnRepositorio,
} from '@/lib/notas';
import { urlRepositorio } from '@/lib/repositorio';

type Props = { params: Promise<{ slug: string }> };

/**
 * `/notas/<slug>` — una nota de datos (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §5).
 * **Estáticas**: todas se generan en el build y un slug que no está es un 404
 * (`dynamicParams = false`). La firma (`AUTOR_NOMBRE`) y el repositorio
 * (`REPOSITORIO_URL`) se leen en el build: sin ellos, ni línea de autor ni
 * enlace al script.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return leerNotas().map((n) => ({ slug: n.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const nota = buscarNota((await params).slug);
  if (!nota) notFound();
  const ruta = rutaNota(nota.slug);
  return {
    title: nota.titulo,
    description: nota.resumen,
    alternates: { canonical: ruta, types: { 'application/rss+xml': '/rss/notas' } },
    openGraph: {
      title: nota.titulo,
      description: nota.resumen,
      url: ruta,
      type: 'article',
      publishedTime: nota.fecha,
    },
  };
}

export default async function PaginaNota({ params }: Props) {
  const nota = buscarNota((await params).slug);
  if (!nota) notFound();

  const autor = nombreAutor();
  const enlaceAutor = urlAutor();
  const repositorio = urlRepositorio();
  const urlScript = nota.script ? urlEnRepositorio(repositorio, nota.script) : null;
  const [antes, despues] = partirEnQueCambio(nota.cuerpo);

  return (
    <article className="lectura max-w-3xl">
      <CabeceraFicha titulo={nota.titulo}>
        <p className="mt-3 text-sm text-muted">
          Nota de datos del <time dateTime={nota.fecha}>{fechaLarga(nota.fecha)}</time>.
          {autor && (
            <>
              {' '}
              La escribe{' '}
              {enlaceAutor ? (
                <a href={enlaceAutor} className="enlace" rel="author noopener noreferrer" target="_blank">
                  {autor}
                </a>
              ) : (
                autor
              )}
              .
            </>
          )}
        </p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Estado</dt>
          <dd className="font-semibold text-text">{ETIQUETA_ESTADO[nota.estado]}</dd>
          <dt className="text-muted">Datos</dt>
          <dd className="text-text">{nota.medido_sobre}</dd>
        </dl>
      </CabeceraFicha>

      <Markdown arbol={antes} />
      {despues && (
        <>
          {nota.antes_despues && <AntesDespues datos={nota.antes_despues} />}
          <Markdown arbol={despues} />
        </>
      )}

      {(nota.cambio || urlScript) && (
        <nav aria-label="El código de esta nota" className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {nota.cambio && (
            <a href={nota.cambio} className="enlace" target="_blank" rel="noopener noreferrer">
              El cambio
            </a>
          )}
          {urlScript && (
            <a href={urlScript} className="enlace" target="_blank" rel="noopener noreferrer">
              El script
            </a>
          )}
        </nav>
      )}

      <section aria-labelledby="fuentes" className="mt-10 border-t border-border pt-6">
        <h2 id="fuentes" className="font-sans text-base font-bold text-text">
          Fuentes
        </h2>
        <p className="mt-1 text-sm text-muted">Cada cifra de la nota sale de uno de estos fragmentos del repositorio.</p>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          {nota.fuentes.map((f) => {
            const cita = citaDeFuente(f);
            if (!cita) return <li key={f}>{f}</li>;
            const url = urlEnRepositorio(repositorio, cita.ruta);
            return (
              <li key={f}>
                {url ? (
                  <a href={url} className="enlace font-mono text-xs" target="_blank" rel="noopener noreferrer">
                    {cita.ruta}
                  </a>
                ) : (
                  <code className="font-mono text-xs">{cita.ruta}</code>
                )}
                : «{fragmentoLegible(cita.fragmento)}»
              </li>
            );
          })}
        </ul>
      </section>

      {/* Al final y no arriba: nada va antes del `h1` (spec PORTADA_V7 §4). */}
      <Link href="/notas" className="mt-12 inline-block text-sm font-semibold text-primary hover:underline">
        ← Todas las notas
      </Link>
    </article>
  );
}
