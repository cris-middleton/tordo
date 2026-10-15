import React from 'react';
import type { Metadata } from 'next';
import { IBM_Plex_Mono, Newsreader, Public_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { AnaliticaWeb } from '@/components/AnaliticaWeb';
import { Cascara } from '@/components/cascara/Cascara';

// Tres familias, cada una con un solo trabajo (docs/REDISENO_PUBLICO_2026-10.md §5.1):
//
// - Newsreader, sólo `h1` y `h2`: serif editorial, se lee como periodismo de
//   datos y no como producto. Variable con `wght` y `opsz` enteros: el eje
//   óptico ajusta el dibujo al tamaño del titular.
// - Public Sans, todo lo demás —cuerpo, interfaz, `h3`–`h6` y TODAS las cifras—.
//   Trae `tnum`, así que `.cifra` ya no necesita otra familia (DM Sans no lo traía).
// - IBM Plex Mono, sólo identificadores: códigos de licitación y de Compra Ágil,
//   RUT, códigos ONU, `curl`. Nunca un monto: un precio en mono parece un log.
//
// `next/font` las sirve desde este dominio: ninguna petición nueva a un tercero.
const display = Newsreader({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['opsz'],
});

const sans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
  // Sin precarga: sólo se usa en identificadores, que en casi todas las rutas quedan bajo el
  // pliegue (en la ficha /licitaciones/[codigo] el código está arriba: ahí se ve un instante en
  // la fuente de respaldo, `display: swap`), y precargarla competía con Newsreader y Public Sans
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
  // «y cumplimiento» se fue con las cuentas: sin empresa no hay estado hábil ni documentos.
  description: `${APP_NAME} — Inteligencia de compras públicas para proveedores del Estado en Chile, gratis y sin cuenta`,
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
    <html lang="es" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-background font-sans text-text">
        <Providers>
          <Cascara>{children}</Cascara>
        </Providers>
        <AnaliticaWeb />
      </body>
    </html>
  );
}
