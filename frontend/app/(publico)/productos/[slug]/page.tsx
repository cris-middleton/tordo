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
  descripcionCompradores,
  entero,
  frasePrecio,
  metadataProducto,
  nombreProducto,
  plata,
  precioDeLaBanda,
  rutaComprador,
  tituloDeBanda,
} from '@/lib/publico';
import { normalizeText } from '@/lib/nombresChile';
import { rangoDeMeses } from '@/lib/periodo';
import { esSlugPublico } from '@/lib/parametrosPublicos';
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
  // Un slug con otra forma no existe: 404 sin llamar al backend (`lib/parametrosPublicos.ts`).
  if (!esSlugPublico(slug)) notFound();
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
  const periodo = rangoDeMeses(p.periodo?.ventana_desde, p.periodo?.ventana_hasta);
  const principal = p.unidades[0];
  const precio = principal
    ? precioDeBanda({ producto: p, banda: principal, nombre: precioDeLaBanda(principal.unidad), repositorio: urlRepositorio() })
    : null;

  // Un solo ancho para toda la ficha: el de lectura. El gráfico medía ~680 px y
  // las tablas ~1.090, y cada sección empezaba y terminaba en otro sitio.
  return (
    <article className="max-w-3xl">
      <CabeceraFicha
        titulo={nombre}
        subtitulo={
          periodo ? `Lo que pagó el Estado de ${periodo}, y quién lo compró.` : 'Lo que pagó el Estado, y quién lo compró.'
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
          <p className="mt-3 text-sm text-muted">{p.descripcion}</p>
        )}
        {!p.indexable && (
          <p className="mt-3 rounded-lg border border-gold/25 bg-gold/10 px-3 py-2 text-xs text-gold">
            Hay pocas compras, pocos compradores o precios muy distintos. Úsalo sólo para orientarte.
          </p>
        )}
      </CabeceraFicha>

      <Seccion titulo="Cuánto se pagó">
        {!principal ? (
          <p className="text-sm text-subtle">Todavía hay muy pocas compras para darte un precio.</p>
        ) : (
          <div>
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
          titulo="Otras formas de comprarlo"
          descripcion="Lo mismo se compra por caja, por unidad o por paquete. Cada forma tiene su precio."
        >
          {/* Sin la de arriba: sus cifras ya están en el gráfico y bajo él (crítica del 22-10:
              la ficha decía $956 tres veces). */}
          <TablaUnidades unidades={p.unidades.slice(1)} titulo={(u) => tituloDeBanda(u.unidad)} />
        </Seccion>
      )}

      <Seccion titulo="Quién lo compra" descripcion={descripcionCompradores(p)}>
        <TablaEnlaces
          encabezados={['Comprador', 'Unidad', 'Compras', 'Mediana']}
          vacio="Todavía no hay compradores con datos de este producto."
          filas={p.compradores.map((c) => ({
            clave: `${c.codigo}-${c.unidad}`,
            href: rutaComprador(c.codigo),
            nombre: normalizeText(c.nombre),
            celdas: [c.unidad, entero(c.n), plata(c.p50)],
          }))}
        />
      </Seccion>

      <p className="mt-6 text-xs text-subtle">
        Junta las compras descritas con estas palabras, en cualquier orden: «{p.firma}».
      </p>

      <p className="mt-4 text-sm">
        <Link href="/productos" className="enlace">
          Buscar otro producto
        </Link>
      </p>
    </article>
  );
}
