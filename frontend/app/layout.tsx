import React from 'react';
import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Libre_Franklin, Public_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { AnaliticaWeb } from '@/components/AnaliticaWeb';
import { Cascara } from '@/components/cascara/Cascara';

// Tres familias, cada una con su trabajo, y Varien para la marca
// (docs/IDENTIDAD_Y_PORTADA_2026-10.md §4, con la comparación que las eligió):
//
// - Libre Franklin, sólo titulares (`h1`, `h2`, `font-display`), en 800 y un poco
//   apretada. Es la versión libre de Franklin Gothic, la gótica de los diarios y de sus
//   gráficos de datos: es la que le da carácter al sitio. No trae cifras tabulares, y por
//   eso no hace nada más.
// - Public Sans, todo lo demás: cuerpo, interfaz y todas las cifras (trae `tnum`, con un
//   punto de miles de medio ancho). Salió de Libre Franklin para el sistema de diseño del
//   gobierno de Estados Unidos, así que las dos comparten esqueleto: el titular y el texto
//   se notan distintos sin pelearse. Con cursiva propia (las notas y las guías la usan).
// - IBM Plex Mono, sólo identificadores: códigos de licitación y de Compra Ágil,
//   RUT, códigos ONU, `curl`. Nunca un monto: un precio en mono parece un log.
//
// `next/font` las sirve desde este dominio: ninguna petición nueva a un tercero.
const titular = Libre_Franklin({
  subsets: ['latin'],
  variable: '--font-titular',
  display: 'swap',
});

const sans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  style: ['normal', 'italic'],
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
    template: `%s | ${APP_NAME}`,
  },
  // Vocabulario llano (R10 del rediseño), y nada de lo que se fue con las cuentas.
  description: `${APP_NAME} — compras públicas de Chile para quien le vende al Estado: precios pagados, licitaciones abiertas y Compra Ágil. Datos públicos de ChileCompra.`,
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

// `only light` en la etiqueta, además de en `app/globals.css`: Chrome la lee antes que la
// hoja de estilos, y así no oscurece ni el primer pintado. Con el tema oscuro manda la hoja
// (`:root.dark { color-scheme: dark }`).
export const viewport: Viewport = {
  colorScheme: 'only light',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${titular.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-background font-sans text-text">
        <Providers>
          <Cascara>{children}</Cascara>
        </Providers>
        <AnaliticaWeb />
      </body>
    </html>
  );
}
