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
  indiceDeNota,
  leerNotas,
  numeroDeCambio,
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
  const indice = indiceDeNota(nota.cuerpo);

  return (
    // Desde `lg`, dos columnas: la de lectura (el texto sigue a 58ch) y el costado,
    // fijo al bajar, con el antes y el después, el índice y los datos de la nota.
    // Bajo `lg` el costado no existe (`hidden`) y sus piezas van donde siempre: los
    // datos bajo el título, el gráfico bajo «Qué cambió» y los enlaces al final
    // (`lg:hidden`). Cada pieza se ve una sola vez en cada ancho, y lo que está en
    // `display: none` tampoco lo lee un lector de pantalla.
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-x-16 xl:grid-cols-[minmax(0,1fr)_20rem]">
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
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm lg:hidden">
            <dt className="text-muted">Estado</dt>
            <dd className="font-semibold text-text">{ETIQUETA_ESTADO[nota.estado]}</dd>
            <dt className="text-muted">Con qué datos</dt>
            <dd className="text-text">{nota.medido_sobre}</dd>
          </dl>
        </CabeceraFicha>

        <Markdown arbol={antes} />
        {despues && (
          <>
            {nota.antes_despues && <AntesDespues datos={nota.antes_despues} className="mt-6 lg:hidden" rotulo="arriba" />}
            <Markdown arbol={despues} />
          </>
        )}

        {(nota.cambio || urlScript) && (
          <nav aria-label="El código de esta nota" className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm lg:hidden">
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

        <section aria-labelledby="fuentes" className="mt-10 scroll-mt-6 border-t border-border pt-6">
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
        <Link href="/notas" className="enlace mt-12 inline-block text-sm">
          Todas las notas
        </Link>
      </article>

      {/* El costado: arriba a la altura del `h1`, y fijo a 32 px del borde al bajar.
          Si no cabe en la ventana (una pantalla baja), se desplaza por dentro. */}
      <aside
        aria-label="Sobre esta nota"
        className="hidden text-sm lg:sticky lg:top-8 lg:block lg:max-h-[calc(100vh-4rem)] lg:self-start lg:overflow-y-auto">
        {nota.antes_despues && (
          <AntesDespues datos={nota.antes_despues} className="border-b border-border pb-6" rotulo="arriba" />
        )}

        <nav aria-labelledby="en-esta-nota" className={nota.antes_despues ? 'pt-6' : ''}>
          <h2 id="en-esta-nota" className="font-sans text-sm font-semibold text-text">
            En esta nota
          </h2>
          <ol className="mt-2">
            {[...indice, { id: 'fuentes', titulo: 'Fuentes' }].map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block py-1 text-muted hover:text-text">
                  {s.titulo}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <dl className="mt-6 space-y-3 border-t border-border pt-6">
          <div>
            <dt className="text-muted">Estado</dt>
            <dd className="font-semibold text-text">{ETIQUETA_ESTADO[nota.estado]}</dd>
          </div>
          <div>
            <dt className="text-muted">Con qué datos</dt>
            <dd className="text-text">{nota.medido_sobre}</dd>
          </div>
          {nota.cambio && (
            <div>
              <dt className="text-muted">El cambio</dt>
              <dd>
                <a href={nota.cambio} className="enlace text-text" target="_blank" rel="noopener noreferrer">
                  Pull request {numeroDeCambio(nota.cambio)}
                </a>
              </dd>
            </div>
          )}
          {urlScript && nota.script && (
            <div>
              <dt className="text-muted">El script</dt>
              <dd>
                <a
                  href={urlScript}
                  className="enlace break-all font-mono text-xs text-text"
                  target="_blank"
                  rel="noopener noreferrer">
                  {nota.script}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </aside>
    </div>
  );
}
