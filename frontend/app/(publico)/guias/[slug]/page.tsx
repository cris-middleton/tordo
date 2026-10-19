import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Markdown } from '@/components/guias/Markdown';
import { CabeceraFicha } from '@/components/publico/Piezas';
import { buscarGuia, leerGuias, rutaGuia } from '@/lib/guias';
import { fechaCorta } from '@/lib/publico';

type Props = { params: Promise<{ slug: string }> };

/**
 * `/guias/<slug>` — una guía. **Estáticas**: todas se generan en el build y un
 * slug que no está es un 404 (`dynamicParams = false`), sin pasar por el
 * servidor. El pie de atribución lo pone la cáscara única.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return leerGuias().map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guia = buscarGuia((await params).slug);
  if (!guia) notFound();
  const ruta = rutaGuia(guia.slug);
  return {
    title: guia.titulo,
    description: guia.descripcion,
    alternates: { canonical: ruta },
    openGraph: {
      title: guia.titulo,
      description: guia.descripcion,
      url: ruta,
      type: 'article',
      modifiedTime: guia.actualizado,
    },
  };
}

export default async function PaginaGuia({ params }: Props) {
  const guia = buscarGuia((await params).slug);
  if (!guia) notFound();

  return (
    <article className="lectura max-w-3xl">
      <CabeceraFicha
        titulo={guia.titulo}
        subtitulo={
          <>
            Actualizada el <time dateTime={guia.actualizado}>{fechaCorta(guia.actualizado)}</time>
          </>
        }
      />

      <Markdown arbol={guia.cuerpo} />

      <section aria-labelledby="fuentes" className="mt-12 border-t border-border pt-6">
        <h2 id="fuentes" className="font-sans text-base font-bold text-text">
          Fuentes
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          {guia.fuentes.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>

      {/* Al final y no arriba: nada va antes del `h1` (spec PORTADA_V7 §4). */}
      <Link href="/guias" className="enlace mt-12 inline-block text-sm">
        Todas las guías
      </Link>
    </article>
  );
}
