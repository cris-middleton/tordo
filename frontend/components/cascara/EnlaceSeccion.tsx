'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { esSeccionActiva, type EnlaceNavegacion } from '@/lib/navegacion';

const CLASES = {
  barra: {
    base: 'transition-colors',
    activa: 'font-semibold text-primary',
    inactiva: 'text-muted hover:text-primary',
  },
  menu: {
    base: 'block rounded-lg px-3 py-2 text-sm transition-colors',
    activa: 'bg-background font-semibold text-primary',
    inactiva: 'text-text hover:bg-background hover:text-primary',
  },
} as const;

/**
 * Un enlace de la navegación (spec del rediseño §6.1). Es una isla cliente sólo
 * para saber la ruta actual (`usePathname`) y marcar la sección con
 * `aria-current`. Cerrar el menú móvil al pulsarlo lo hace `MarcoCabecera`, para
 * todos los enlaces de la cabecera a la vez.
 */
export function EnlaceSeccion({
  enlace,
  variante,
}: {
  enlace: EnlaceNavegacion;
  variante: 'barra' | 'menu';
}) {
  const ruta = usePathname() ?? '';
  const activa = !enlace.externo && esSeccionActiva(ruta, enlace.href);
  const c = CLASES[variante];
  const clase = `${c.base} ${activa ? c.activa : c.inactiva}`;

  if (enlace.externo) {
    return (
      <a href={enlace.href} rel="noopener noreferrer" className={clase}>
        {enlace.nombre}
      </a>
    );
  }
  return (
    <Link
      href={enlace.href}
      className={clase}
      aria-current={activa ? 'page' : undefined}
    >
      {enlace.nombre}
    </Link>
  );
}
