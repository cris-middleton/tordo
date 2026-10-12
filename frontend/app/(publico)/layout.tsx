import Link from 'next/link';

import TordoLogo from '@/components/TordoLogo';
import { PieAtribucion } from '@/components/legal/PieAtribucion';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

/**
 * El marco de las páginas públicas indexables: un comprador, un rubro, un
 * producto (paso 10 del pivote).
 *
 * Fuera de `/dashboard` a propósito: son las páginas a las que llega alguien
 * desde Google, y la barra lateral del panel es para quien ya está usando la
 * herramienta. Arriba, la marca y la salida al resto del sitio; abajo, la
 * cita de la fuente y los enlaces legales — `__tests__/legal-enlazado.test.tsx`
 * da por cubiertas las páginas de `(publico)/` sólo porque este layout lleva
 * `PieAtribucion`.
 */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label={`${APP_NAME}, inicio`}>
            <TordoLogo size={28} />
            <span className="font-brand text-lg text-text">{APP_NAME}</span>
          </Link>
          <nav aria-label="Secciones" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <Link href="/dashboard/compra-agil" className="text-muted hover:text-primary">
              Lo mejor de hoy
            </Link>
            <Link href="/dashboard/tenders" className="text-muted hover:text-primary">
              Licitaciones
            </Link>
            <Link href="/productos" className="text-muted hover:text-primary">
              Precios
            </Link>
            <Link href="/dashboard/bi" className="text-muted hover:text-primary">
              Inteligencia de mercado
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <PieAtribucion />
      </footer>
    </div>
  );
}
