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
  { href: '/compra-agil', texto: 'Ver lo mejor de hoy en Compra Ágil' },
  { href: '/productos', texto: 'Buscar el precio de un producto' },
  { href: '/licitaciones', texto: 'Ver las licitaciones abiertas' },
  { href: '/guias', texto: 'Leer las guías' },
];

export default function NoEncontrada() {
  return (
    <Contenedor pagina>
      <h1 className="page-title">Esta página no está</h1>
      <p className="mt-4 max-w-[60ch] text-muted">
        O el enlace venía mal escrito, o la página se quedó sin datos: las fichas de compradores y
        productos se recalculan cada domingo, y alguna puede salir.
      </p>
      <p className="mt-8 text-sm font-semibold text-text">Lo que sí está:</p>
      <ul className="mt-3 space-y-3">
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
