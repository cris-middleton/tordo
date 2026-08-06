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
