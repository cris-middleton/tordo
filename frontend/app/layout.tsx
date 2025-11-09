import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'LicitUp',
  description: 'Plataforma LicitUp para la gestión integral de licitaciones públicas y órdenes de compra',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-background text-text`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

