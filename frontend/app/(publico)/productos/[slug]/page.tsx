import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PieDeMetodo } from '@/components/metodo/PieDeMetodo';
import { GraficoPrecio } from '@/components/precio/GraficoPrecio';
import { CifrasBanda, TablaUnidades } from '@/components/publico/CifrasBanda';
import { CabeceraFicha, Seccion, TablaEnlaces } from '@/components/publico/Piezas';
import { precioDeBanda } from '@/lib/lecturasPortada';
import {
  categoriaProducto,
  entero,
  frasePrecio,
  metadataProducto,
  nombreProducto,
  plata,
  rutaComprador,
  tituloDeBanda,
} from '@/lib/publico';
import { normalizeText } from '@/lib/nombresChile';
import { textoPeriodo } from '@/lib/periodo';
import { pedirPublico, segmento } from '@/lib/publicoServidor';
import { urlRepositorio } from '@/lib/repositorio';
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
 *
 * Primero «Cuánto se pagó»: el gráfico de precio de la portada (spec PORTADA_V7
 * §6) para la unidad con más compras, sus cifras (`CifrasBanda`) y su pie de
 * método; las demás unidades, en una tabla. Mismos componentes y mismas reglas
 * que la portada (`precioDeBanda`), sin su filtro: aquí se ve también la banda
 * de un solo comprador, y la frase lo dice. Antes una tarjeta de P10…P90 iba
 * encima del gráfico y la ficha repetía la mitad central tres veces.
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
  const principal = p.unidades[0];
  const precio = principal
    ? precioDeBanda({ producto: p, banda: principal, nombre: tituloDeBanda(principal.unidad), repositorio: urlRepositorio() })
    : null;

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

      <Seccion titulo="Cuánto se pagó">
        {!principal ? (
          <p className="text-sm text-subtle">Todavía no hay compras suficientes para una banda.</p>
        ) : (
          <div className="max-w-3xl">
            {precio ? (
              <>
                <h3 className="font-sans text-[17px] font-bold leading-snug text-text">{precio.conclusion}</h3>
                <div className="mt-4">
                  <GraficoPrecio datos={precio.grafico} />
                  <ul className="sr-only">
                    {precio.accesible.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <h3 className="font-sans text-[17px] font-bold leading-snug text-text">{frasePrecio(principal)}</h3>
            )}
            <CifrasBanda banda={principal} />
            {precio && <PieDeMetodo texto={precio.pie} enlaces={precio.enlaces} />}
          </div>
        )}
      </Seccion>

      {p.unidades.length > 1 && (
        <Seccion
          titulo="Por unidad de medida"
          descripcion="El mismo producto se compra por caja, por unidad o por paquete: cada unidad tiene su precio."
        >
          <div className="max-w-3xl">
            <TablaUnidades unidades={p.unidades} titulo={(u) => tituloDeBanda(u.unidad)} />
          </div>
        </Seccion>
      )}

      <Seccion titulo="Quién lo compra" descripcion="Los compradores con más compras de este producto, y lo que pagó cada uno.">
        <TablaEnlaces
          encabezados={['Comprador', 'Unidad', 'Compras', 'Precio mediano']}
          vacio="Todavía no hay compradores con datos de este producto."
          ocultarEnMovil={[0]}
          filas={p.compradores.map((c) => ({
            clave: `${c.codigo}-${c.unidad}`,
            href: rutaComprador(c.codigo),
            nombre: normalizeText(c.nombre),
            celdas: [c.unidad, entero(c.n), plata(c.p50)],
          }))}
        />
      </Seccion>

      <p className="mt-6 text-xs text-subtle">
        Agrupado por la descripción que escribe el comprador (sin códigos ni cifras): «{p.firma}».
      </p>

      <p className="mt-4 text-sm">
        <Link href="/productos" className="enlace">
          Buscar otro producto
        </Link>
      </p>
    </article>
  );
}
