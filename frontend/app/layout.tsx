import React from 'react';
import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { AnaliticaWeb } from '@/components/AnaliticaWeb';
import { Cascara } from '@/components/cascara/Cascara';

// Dos familias, cada una con su trabajo, y Varien para la marca
// (docs/IDENTIDAD_Y_PORTADA_2026-10.md §4):
//
// - Archivo, TODO: titulares, cuerpo, interfaz y todas las cifras (trae `tnum`).
//   Variable con eje de ancho (`wdth` 62–125) y de peso: los titulares (`h1`, `h2`,
//   `font-display`) van semiexpandidos (112,5 %) y en 800; el resto, a ancho normal.
//   Es la de la tarjeta de vista previa. `next/font` carga el eje de peso entero
//   (100–900): no admite un rango parcial, y es el mismo archivo.
// - IBM Plex Mono, sólo identificadores: códigos de licitación y de Compra Ágil,
//   RUT, códigos ONU, `curl`. Nunca un monto: un precio en mono parece un log.
//
// `next/font` las sirve desde este dominio: ninguna petición nueva a un tercero.
const sans = Archivo({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  axes: ['wdth'],
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
  // Sin precarga: sólo se usa en identificadores, que en casi todas las rutas quedan bajo el
  // pliegue (en la ficha /licitaciones/[codigo] el código está arriba: ahí se ve un instante en
  // la fuente de respaldo, `display: swap`), y precargarla competía con las fuentes del texto
  // por el ancho de banda del LCP. Medido (5 cargas en
  // frío, 4G lenta, CPU ×4; mediana en /, /guias/…, /apoyar): antes del rediseño 720/720/712 ms,
  // con precarga 740/740/728 ms (+2,8 %), sin precarga 720/724/716 ms. Se pide al primer uso.
  preload: false,
});

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

export const metadata: Metadata = {
  // Sin metadataBase, Next no puede resolver las URLs relativas de openGraph.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://tordo.cl'),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  // Vocabulario llano (R10 del rediseño), y nada de lo que se fue con las cuentas.
  description: `${APP_NAME} — compras públicas de Chile para quien le vende al Estado: precios pagados, licitaciones abiertas y Compra Ágil. Gratis y sin cuenta`,
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-background font-sans text-text">
        <Providers>
          <Cascara>{children}</Cascara>
        </Providers>
        <AnaliticaWeb />
      </body>
    </html>
  );
}
