import Link from 'next/link';

import TordoLogo from '@/components/TordoLogo';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

/** Las secciones del sitio. «Apoyar» va al final y más tenue: es discreto a propósito. */
export const SECCIONES_PUBLICAS = [
  { nombre: 'Lo mejor de hoy', href: '/compra-agil' },
  { nombre: 'Licitaciones', href: '/licitaciones' },
  { nombre: 'Precios', href: '/productos' },
  { nombre: 'Inteligencia de mercado', href: '/mercado' },
  { nombre: 'Guías', href: '/guias' },
] as const;

/**
 * La cabecera de lo público: la portada y las páginas de `app/(publico)/`.
 * Componente de servidor, sin menú desplegable: los enlaces se envuelven en
 * pantallas chicas, y así la cabecera no necesita JavaScript.
 */
export function CabeceraPublica({ ancho = 'max-w-5xl' }: { ancho?: string }) {
  return (
    <header className="border-b border-border bg-surface">
      <div
        className={`mx-auto flex ${ancho} flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6`}
      >
        <Link href="/" className="flex items-center gap-2" aria-label={`${APP_NAME}, inicio`}>
          <TordoLogo size={28} />
          <span className="font-brand text-lg text-text">{APP_NAME}</span>
        </Link>
        <nav aria-label="Secciones" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {SECCIONES_PUBLICAS.map((s) => (
            <Link key={s.href} href={s.href} className="text-muted hover:text-primary">
              {s.nombre}
            </Link>
          ))}
          <Link href="/apoyar" className="text-subtle hover:text-primary">
            Apoyar
          </Link>
        </nav>
      </div>
    </header>
  );
}
