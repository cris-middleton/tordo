import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BandaPrecio } from '@/components/publico/BandaPrecio';
import { CabeceraFicha, EnlacePanel, Seccion, TablaEnlaces } from '@/components/publico/Piezas';
import {
  categoriaProducto,
  entero,
  metadataProducto,
  nombreProducto,
  plata,
  rutaComprador,
  unidadDeclarada,
} from '@/lib/publico';
import { textoPeriodo } from '@/lib/periodo';
import { pedirPublico, segmento } from '@/lib/publicoServidor';
import type { ProductoPublico } from '@/types/publico';

/**
 * `/productos/{slug}` — cuánto paga el Estado por un producto.
 *
 * El producto es una FIRMA de la especificación del comprador (palabras
 * ordenadas, sin códigos), no una categoría del catálogo: dentro de una sola
 * categoría UNSPSC conviven artículos que difieren en cinco órdenes de magnitud.
 * El título es cómo lo escribe quien lo compra (`nombreProducto`), la firma va
 * al pie y la categoría debajo como contexto: si el título fuera la categoría,
 * miles de páginas se llamarían igual.
 *
 * El periodo va en la cabecera, una vez para todas las bandas; cada banda dice
 * de cuántas compras y de cuántos organismos sale.
 *
 * Un producto con pocas compras, de pocos compradores o con precio muy disperso
 * responde igual (`indexable: false`): la página existe, con `noindex`, y se
 * llega por búsqueda o por enlace.
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
  const categoria = categoriaProducto(p);
  const periodo = textoPeriodo({ desde: p.periodo?.ventana_desde, hasta: p.periodo?.ventana_hasta });

  return (
    <article>
      <CabeceraFicha
        titulo={nombre}
        subtitulo={
          periodo
            ? `Lo que pagaron los compradores públicos en Chile, ${periodo}.`
            : 'Lo que pagan los compradores públicos en Chile.'
        }
      >
        {(categoria || p.codigo_onu) && (
          <p className="mt-1 text-sm text-subtle">
            Categoría del catálogo: {categoria ?? 'sin nombre'}
            {p.codigo_onu && (
              <>
                {' '}
                (código ONU <span className="font-mono">{p.codigo_onu}</span>)
              </>
            )}
          </p>
        )}
        {/* El título ya es la descripción; entera, sólo si hubo que cortarla. */}
        {p.descripcion && nombre.endsWith('…') && (
          <p className="mt-3 max-w-3xl text-sm text-muted">{p.descripcion}</p>
        )}
        {!p.indexable && (
          <p className="mt-3 max-w-3xl rounded-lg border border-gold/25 bg-gold/10 px-3 py-2 text-xs text-gold">
            Hay pocas compras, pocos compradores o precios muy distintos: úsalo sólo para orientarte.
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
            {p.unidades.map((u, i) => (
              <BandaPrecio key={unidadDeclarada(u.unidad) ?? `sin-unidad-${i}`} banda={u} />
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

      <EnlacePanel href="/mercado">Más precios en el panel</EnlacePanel>
    </article>
  );
}
