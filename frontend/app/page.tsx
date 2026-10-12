import type { Metadata } from 'next';

import { Portada } from '@/components/portada/Portada';
import { DESTACADAS_EN_PORTADA } from '@/lib/portada';
import { pedirDestacadas } from '@/lib/publicoServidor';

/**
 * La portada. **Componente de servidor, y tiene que seguir siéndolo**: Next
 * ignora `metadata` en componentes cliente, y la home se quedaría sin título
 * ni tarjeta de preview. No le pongas 'use client'.
 *
 * **ISR cada media hora** (`revalidate`), la misma ventana que la caché del
 * bloque vivo, que además vacía el cron frecuente con la etiqueta
 * `compra-agil`. Así la portada sale del CDN y no del servidor en cada visita.
 * Si el backend falla al regenerar, `pedirDestacadas` devuelve `null`, el
 * bloque se oculta y la portada se publica igual; a la media hora se reintenta.
 * (En un build sin backend —CI— nace sin el bloque por lo mismo.)
 */
export const revalidate = 1800;

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tordo.cl';

// Bajo 160 caracteres, para que el buscador no la corte. Sólo promete lo que el
// sitio público entrega hoy: nada de avisos, informes ni cuentas.
const TITLE = `${APP_NAME} — Inteligencia de compras públicas, gratis y sin cuenta`;
const DESCRIPTION =
  'Lo mejor de hoy en Compra Ágil, precios pagados por el Estado y contra quién compites en ' +
  'Mercado Público. Con datos de ChileCompra, sin registrarte.';

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
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: `${APP_NAME} — inteligencia de compras públicas en Chile`,
      },
    ],
  },
  twitter: {
    // `summary_large_image` necesita una imagen 1200×630.
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og.png'],
  },
};

export default async function Home() {
  const destacadas = await pedirDestacadas(DESTACADAS_EN_PORTADA);
  return <Portada destacadas={destacadas} />;
}
