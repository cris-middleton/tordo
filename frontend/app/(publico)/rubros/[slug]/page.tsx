import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PanoramaRubro } from '@/components/bi/PanoramaRubro';
import { CabeceraFicha, EnlacePanel, Seccion, TablaEnlaces } from '@/components/publico/Piezas';
import { entero, metadataRubro, plata, rutaComprador, rutaPanelRubro } from '@/lib/publico';
import { pedirPublico, segmento } from '@/lib/publicoServidor';
import type { RubroPublico } from '@/types/publico';

/**
 * `/rubros/{slug}` — el mercado de un rubro: cuánto se mueve, contra quién se
 * compite, cuándo se compra y quién compra más.
 *
 * El slug lo resuelve el backend; aquí no se des-slugifica nada. El panorama es
 * el mismo componente que encabeza el panel (`PanoramaRubro`), con los datos
 * ya traídos en el servidor.
 */

export const dynamicParams = true;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

async function obtener(slug: string): Promise<RubroPublico> {
  const rubro = await pedirPublico<RubroPublico>(`/rubros/${segmento(slug)}`);
  if (!rubro) notFound();
  return rubro;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return metadataRubro(await obtener(slug));
}

export default async function PaginaRubro({ params }: Props) {
  const { slug } = await params;
  const r = await obtener(slug);

  return (
    <article>
      <CabeceraFicha
        titulo={r.nombre}
        subtitulo="Cómo está este mercado de compras públicas en Chile."
      />

      <PanoramaRubro panorama={r.panorama} cargando={false} rubro={r.nombre} />

      <Seccion
        titulo="Quién compra más"
        descripcion="Los diez compradores con más monto en este rubro."
      >
        <TablaEnlaces
          encabezados={['Comprador', 'Monto', 'Órdenes']}
          vacio="Todavía no hay compradores con datos en este rubro."
          filas={r.compradores.map((c) => ({
            clave: c.codigo,
            href: rutaComprador(c.codigo),
            nombre: c.nombre,
            celdas: [plata(c.monto), entero(c.ordenes)],
          }))}
        />
      </Seccion>

      <EnlacePanel href={rutaPanelRubro(r.nombre)}>Analizar este rubro en el panel</EnlacePanel>
    </article>
  );
}
