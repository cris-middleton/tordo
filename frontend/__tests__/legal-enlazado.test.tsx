/**
 * Cada página del sitio cita la fuente de los datos y enlaza términos y
 * privacidad.
 *
 * La cita no es un adorno: es una CONDICIÓN de uso de los datos de ChileCompra
 * (`docs/DECLARACION_USO_DATOS.md`). Y un documento legal al que no se llega no
 * cumple nada. Las dos cosas son de las que se pierden en un rediseño sin que
 * falle nada más, así que se fijan aquí: renderizando los tres marcos que
 * existen (landing, panel, documentos legales, páginas públicas) y, para que una página nueva no
 * nazca sin ninguno, recorriendo `app/**\/page.tsx`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LayoutPublico from '@/app/(publico)/layout';
import Layout from '@/components/Layout';
import LandingClient from '@/components/landing/LandingClient';
import { DocumentoLegal } from '@/components/legal/DocumentoLegal';
import { DESCARGO_CHILECOMPRA, FUENTE_DATOS } from '@/lib/atribucion';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard/tenders',
}));

/** La frase exacta de la Declaración. Escrita aquí y no importada: si alguien
 *  la «mejora» en `lib/atribucion.ts`, este test tiene que enterarse. */
const CITA_LITERAL =
  'Fuente: Dirección de Compras y Contratación Pública (ChileCompra / Mercado Público)';

function comprobarPie() {
  expect(screen.getByText(new RegExp(`^${escapar(CITA_LITERAL)}`))).toBeInTheDocument();
  expect(screen.getByText(/ChileCompra no participa ni respalda/)).toBeInTheDocument();
  const legales = screen.getByRole('navigation', { name: /documentos legales/i });
  expect(within(legales).getByRole('link', { name: /términos/i })).toHaveAttribute(
    'href',
    '/terminos',
  );
  expect(within(legales).getByRole('link', { name: /privacidad/i })).toHaveAttribute(
    'href',
    '/privacidad',
  );
}

function escapar(texto: string) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('atribución y enlaces legales', () => {
  it('la cita es la literal de la Declaración', () => {
    expect(FUENTE_DATOS).toBe(CITA_LITERAL);
    expect(DESCARGO_CHILECOMPRA).toMatch(/^ChileCompra no participa ni respalda/);
  });

  it('en la landing', () => {
    render(<LandingClient />);
    comprobarPie();
  });

  it('en el panel (catálogo y analítica)', () => {
    render(
      <Layout>
        <p>contenido</p>
      </Layout>,
    );
    comprobarPie();
  });

  it('en las páginas públicas (comprador, rubro, producto)', () => {
    render(
      <LayoutPublico>
        <p>contenido</p>
      </LayoutPublico>,
    );
    comprobarPie();
  });

  it('en los propios documentos legales', () => {
    render(
      <DocumentoLegal titulo="Prueba" vigenteDesde="hoy">
        <p>texto</p>
      </DocumentoLegal>,
    );
    comprobarPie();
  });
});

/**
 * Qué marco pone el pie a cada página. Una página nueva que no caiga en ninguno
 * hace fallar el test hasta que alguien le ponga `PieAtribucion` — el mismo
 * trinquete que el de tenancy en el backend.
 */
const APP = join(__dirname, '..', 'app');

function paginas(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...paginas(ruta));
    else if (entrada === 'page.tsx') salida.push(ruta);
  }
  return salida;
}

function tienePie(ruta: string): boolean {
  const rel = relative(APP, ruta).split('\\').join('/');
  // `app/dashboard/layout.tsx` envuelve todo en `Layout`, que lleva el pie.
  if (rel.startsWith('dashboard/')) return true;
  // `app/(publico)/layout.tsx` pone el pie a las fichas públicas.
  if (rel.startsWith('(publico)/')) return true;
  const fuente = readFileSync(ruta, 'utf-8');
  return /\b(PieAtribucion|DocumentoLegal|LandingClient)\b/.test(fuente);
}

describe('ninguna página sin atribución', () => {
  const todas = paginas(APP);

  it('hay páginas que revisar', () => {
    // La guarda de siempre: sin ella, mover `app/` dejaría el test en verde
    // comprobando el vacío.
    expect(todas.length).toBeGreaterThanOrEqual(5);
  });

  it('el panel envuelve sus páginas en el Layout con pie', () => {
    const layout = readFileSync(join(APP, 'dashboard', 'layout.tsx'), 'utf-8');
    expect(layout).toMatch(/<Layout>/);
  });

  it('las páginas públicas llevan el pie en su layout', () => {
    const layout = readFileSync(join(APP, '(publico)', 'layout.tsx'), 'utf-8');
    expect(layout).toMatch(/<PieAtribucion\b/);
  });

  it.each(paginas(APP).map((r) => [relative(APP, r)]))('%s lleva el pie', (rel) => {
    expect(tienePie(join(APP, rel))).toBe(true);
  });
});
