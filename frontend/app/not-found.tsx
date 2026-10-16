import type { Metadata } from 'next';
import Link from 'next/link';

import { Contenedor } from '@/components/cascara/Contenedor';

/*
 * El 404 del sitio. Sin él, Next servía su página genérica: sin marca, sin
 * salida y sin la cita de la fuente (hoy las pone la cáscara única, como en
 * toda página). A un 404 se llega sobre todo desde un buscador (un comprador o
 * un producto que dejó de tener datos), así que lo útil es ofrecer por dónde
 * seguir.
 */
export const metadata: Metadata = {
  title: 'Página no encontrada',
  robots: { index: false, follow: true },
};

const SALIDAS = [
  { href: '/compra-agil', texto: 'Lo mejor de hoy en Compra Ágil' },
  { href: '/productos', texto: 'Buscar precios por producto' },
  { href: '/licitaciones', texto: 'Catálogo de licitaciones' },
  { href: '/guias', texto: 'Guías' },
];

export default function NoEncontrada() {
  return (
    <Contenedor pagina>
      <h1 className="page-title">No encontramos esta página</h1>
      <p className="mt-4 max-w-3xl text-muted">
        Puede que el enlace esté mal escrito o que esta página ya no tenga datos: los compradores
        y productos se recalculan cada semana con lo que publica ChileCompra.
      </p>
      <ul className="mt-8 space-y-3">
        {SALIDAS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="font-medium text-primary hover:underline">
              {s.texto}
            </Link>
          </li>
        ))}
      </ul>
    </Contenedor>
  );
}
