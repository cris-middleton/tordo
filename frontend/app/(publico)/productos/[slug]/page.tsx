import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BandaPrecio } from '@/components/publico/BandaPrecio';
import { CabeceraFicha, EnlacePanel, Seccion, TablaEnlaces } from '@/components/publico/Piezas';
import { entero, metadataProducto, nombreProducto, plata, rutaComprador } from '@/lib/publico';
import { pedirPublico, segmento } from '@/lib/publicoServidor';
import type { ProductoPublico } from '@/types/publico';

/**
 * `/productos/{slug}` — cuánto paga el Estado por un producto.
 *
 * El producto es una FIRMA de la especificación del comprador (palabras
 * ordenadas, sin códigos), no una categoría del catálogo: dentro de una sola
 * categoría UNSPSC conviven artículos que difieren en cinco órdenes de magnitud.
 *
 * Un producto con pocas compras o precio muy disperso responde igual
 * (`indexable: false`): la página existe, con `noindex`, y se llega por
 * búsqueda o por enlace.
 */

export const dynamicParams = true;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

async function obtener(slug: string): Promise<ProductoPublico> {
  const producto = await pedirPublico<ProductoPublico>(`/productos/${segmento(slug)}`);
  if (!producto) notFound();
  return producto;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return metadataProducto(await obtener(slug));
}

export default async function PaginaProducto({ params }: Props) {
  const { slug } = await params;
  const p = await obtener(slug);
  const nombre = nombreProducto(p);

  return (
    <article>
      <CabeceraFicha
        tipo="Precio de referencia"
        titulo={nombre}
        subtitulo={
          <>
            Lo que pagan los compradores públicos en Chile
            {p.codigo_onu ? ` · categoría ONU ${p.codigo_onu}` : ''}
          </>
        }
      >
        {p.descripcion && <p className="mt-3 max-w-3xl text-sm text-muted">{p.descripcion}</p>}
        {!p.indexable && (
          <p className="mt-3 max-w-3xl rounded-lg border border-gold/25 bg-gold/10 px-3 py-2 text-xs text-gold">
            Hay pocas compras de este producto o su precio varía demasiado: tómalo como una
            orientación, no como una referencia.
          </p>
        )}
      </CabeceraFicha>

      <Seccion
        titulo="Bandas de precio"
        descripcion="Precio unitario pagado en órdenes de compra, una banda por unidad de medida."
      >
        {p.unidades.length === 0 ? (
          <p className="text-sm text-subtle">Todavía no hay compras suficientes para una banda.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {p.unidades.map((u) => (
              <BandaPrecio key={u.unidad} banda={u} />
            ))}
          </div>
        )}
      </Seccion>

      <Seccion titulo="Quién lo compra" descripcion="Los diez compradores con más compras de este producto.">
        <TablaEnlaces
          encabezados={['Comprador', 'Unidad', 'Compras', 'Precio mediano']}
          vacio="Todavía no hay compradores con datos de este producto."
          filas={p.compradores.map((c) => ({
            clave: `${c.codigo}-${c.unidad}`,
            href: rutaComprador(c.codigo),
            nombre: c.nombre,
            celdas: [c.unidad, entero(c.n), plata(c.p50)],
          }))}
        />
      </Seccion>

      <p className="mt-6 text-xs text-subtle">
        Agrupado por la descripción que escribe el comprador (sin códigos ni cifras): «{p.firma}».
      </p>

      <EnlacePanel href="/dashboard/bi">Más precios en el panel</EnlacePanel>
    </article>
  );
}
