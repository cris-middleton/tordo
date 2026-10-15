import type { Metadata } from 'next';

import { Portada } from '@/components/portada/Portada';
import { DESTACADAS_EN_PORTADA } from '@/lib/portada';
import { pedirDestacadas, pedirResumenPortada } from '@/lib/publicoServidor';
import { urlRepositorio } from '@/lib/repositorio';
import { nombreResponsable } from '@/lib/responsable';

/**
 * La portada. **Componente de servidor, y tiene que seguir siéndolo**: Next
 * ignora `metadata` en componentes cliente, y la home se quedaría sin título
 * ni tarjeta de preview. Y el buscador es un `<form>` que funciona sin JS. No
 * le pongas 'use client'.
 *
 * **ISR cada media hora** (`revalidate`), la misma ventana que la caché de lo
 * vivo, que además vacía el cron frecuente con la etiqueta `compra-agil`. Así la
 * portada sale del CDN y no del servidor en cada visita.
 *
 * Las dos piezas vivas se piden en paralelo y **ninguna lanza**: si el backend
 * falla al regenerar, `pedirDestacadas` y `pedirResumenPortada` devuelven `null`,
 * su bloque se oculta y la portada se publica igual, con el buscador; a la media
 * hora se reintenta. (En un build sin backend —CI— nace sin ellas por lo mismo.)
 */
export const revalidate = 1800;

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tordo.cl';

// Vocabulario llano (R10 del rediseño): sin jerga de producto ni promesas de lo que
// se fue con las cuentas. La descripción, bajo 155 caracteres.
const TITLE = `${APP_NAME} — Compras públicas de Chile, gratis y sin cuenta`;
const DESCRIPTION =
  'Busca lo que le vendes al Estado: cuánto ha pagado, qué está abierto hoy y quién lo compra. ' +
  'Con datos de ChileCompra, gratis y sin registrarte.';

export const metadata: Metadata = {
  // Absoluto: el `template` del layout raíz le añadiría el nombre otra vez.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  keywords: [
    'Compra Ágil',
    'licitaciones',
    'Mercado Público',
    'ChileCompra',
    'precios de adjudicación',
    'proveedores del Estado',
    'Chile',
  ],
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    url: SITE_URL,
    siteName: APP_NAME,
    title: TITLE,
    description: DESCRIPTION,
    // La imagen la pone `app/opengraph-image.tsx` (archivo de metadatos).
  },
  twitter: {
    // `summary_large_image` necesita una imagen 1200×630.
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function Home() {
  const [destacadas, resumen] = await Promise.all([
    pedirDestacadas(DESTACADAS_EN_PORTADA),
    pedirResumenPortada(),
  ]);
  return (
    <Portada
      destacadas={destacadas}
      resumen={resumen}
      repositorio={urlRepositorio()}
      autor={nombreResponsable()}
    />
  );
}
