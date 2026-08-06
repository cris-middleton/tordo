import type { Metadata } from 'next';
import LandingClient from '@/components/landing/LandingClient';

/**
 * La landing es un server component a propósito: toda la interactividad vive en
 * `LandingClient`. Next ignora `metadata` en componentes cliente, así que
 * mientras esta página llevó 'use client' la home no tuvo título propio ni
 * tarjeta de preview al compartirse — y SEO/contenido es el canal #1 de
 * adquisición del plan. No le devuelvas el 'use client' a este archivo.
 */

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tordo.cl';

const TITLE = `${APP_NAME} — Precios, competidores y plazos de Mercado Público`;
const DESCRIPTION =
  'Descubre a qué precio cotizar, en qué licitaciones vale la pena participar y ' +
  'cuáles se ajustan a lo que vendes. Sobre datos públicos de ChileCompra.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  keywords: [
    'licitaciones',
    'Mercado Público',
    'ChileCompra',
    'precios de adjudicación',
    'proveedores del Estado',
    'PYME',
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
        // Pendiente: una imagen 1200×630 propia. Esta es cuadrada, así que la
        // tarjeta se muestra en formato `summary`, no `summary_large_image`.
        url: '/web-app-manifest-512x512.png',
        width: 512,
        height: 512,
        alt: APP_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/web-app-manifest-512x512.png'],
  },
};

export default function Home() {
  return <LandingClient />;
}
