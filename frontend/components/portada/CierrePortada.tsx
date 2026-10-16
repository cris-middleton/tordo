import Link from 'next/link';
import { Heart } from 'lucide-react';

import { COSTO_MENSUAL_APROXIMADO } from '@/lib/costos';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

/**
 * El cierre de la portada (spec del rediseño §6.3): gratis se prueba con el
 * costo (principio 3), con la voz de `/apoyar`. **«Lo hace» sólo con nombre**
 * (`nombreAutor()` en `app/page.tsx`, spec PORTADA_V7 V5): sin `AUTOR_NOMBRE` la
 * línea dice lo demás y calla el nombre. Firma la autoría, no el responsable legal.
 */
export function CierrePortada({ autor }: { autor: string | null }) {
  return (
    <section aria-label="Cómo se sostiene" className="mt-12 border-t border-border pt-6">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted">
        <span className="font-semibold text-text">{`${APP_NAME} es gratis. Mantenerlo, casi.`}</span>
        <Link href="/apoyar#costos" className="enlace cifra">
          ~{COSTO_MENSUAL_APROXIMADO} al mes
        </Link>
        {autor && <span>Lo hace {autor}.</span>}
        <Link
          href="/apoyar"
          className="inline-flex items-center gap-1 font-semibold text-accent transition-colors hover:text-primary"
        >
          <Heart className="h-4 w-4" aria-hidden="true" />
          Apoyar
        </Link>
      </p>
    </section>
  );
}
