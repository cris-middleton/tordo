import { PieAtribucion } from '@/components/legal/PieAtribucion';
import { CabeceraPublica } from '@/components/publico/CabeceraPublica';

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
      <CabeceraPublica />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <PieAtribucion />
      </footer>
    </div>
  );
}
