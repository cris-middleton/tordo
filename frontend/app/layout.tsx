import React from 'react';
import type { Metadata } from 'next';
import { Archivo, DM_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { AnaliticaWeb } from '@/components/AnaliticaWeb';

// Archivo en vez de Outfit: es una grotesca institucional, estructuralmente
// distinta de DM Sans (geométrica-humanista), así que por primera vez hay
// contraste real entre display y cuerpo. Y —lo que decidió la elección—
// trae cifras tabulares, que DM Sans no tiene. Ver `.cifra` en globals.css.
const display = Archivo({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
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
    <html lang="es" className={`${display.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <body className="font-sans bg-background text-text">
        <Providers>{children}</Providers>
        <AnaliticaWeb />
      </body>
    </html>
  );
}
