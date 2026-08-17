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

/* La descripción decía «Descubre a qué precio cotizar». Es justo lo que la FAQ
   de la propia página desmiente dos pantallas más abajo («¿Me van a decir
   exactamente cuánto cotizar?» → «No»), y una promesa que se rompe sola es peor
   que una promesa chica. Se queda con lo que sí entregamos: el histórico.
   Debajo de 160 caracteres para que Google no la corte. */
const TITLE = `${APP_NAME} — Precios de adjudicación y alertas de Mercado Público`;
const DESCRIPTION =
  'Cuánto ha pagado cada comprador por lo que vendes y contra quién compites. ' +
  'Sobre las órdenes de compra públicas de ChileCompra, desde 2010.';

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
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: `${APP_NAME} — inteligencia de precios y plazos para Mercado Público`,
      },
    ],
  },
  twitter: {
    // `summary_large_image` necesita una imagen 1200×630; con el ícono
    // cuadrado que había antes, la tarjeta caía al formato chico.
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og.png'],
  },
};

export default function Home() {
  return <LandingClient />;
}
