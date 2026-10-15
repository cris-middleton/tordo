/**
 * Cada página del sitio cita la fuente de los datos y enlaza términos y
 * privacidad.
 *
 * La cita no es un adorno: es una CONDICIÓN de uso de los datos de ChileCompra
 * (`docs/DECLARACION_USO_DATOS.md`). Y un documento legal al que no se llega no
 * cumple nada. Las dos cosas se pierden en un rediseño sin que falle nada más.
 *
 * Desde la cáscara única (spec del rediseño §6.1–§6.2) hay UN solo sitio que
 * pone el pie: `components/cascara/Cascara.tsx`, que `app/layout.tsx` monta
 * alrededor de toda página. Se fija por las dos puntas: la cáscara renderizada
 * lleva el pie, y ningún otro fichero pinta pie, cabecera ni `<main>` propios —
 * un segundo pie duplicaría la cita, y un `<main>` anidado rompe la navegación
 * por regiones de un lector de pantalla—.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Cascara } from '@/components/cascara/Cascara';
import { DESCARGO_CHILECOMPRA, FUENTE_DATOS } from '@/lib/atribucion';

vi.mock('next/navigation', () => ({
  usePathname: () => '/licitaciones',
}));

/** La frase exacta de la Declaración. Escrita aquí y no importada: si alguien
 *  la «mejora» en `lib/atribucion.ts`, este test tiene que enterarse. */
const CITA_LITERAL =
  'Fuente: Dirección de Compras y Contratación Pública (ChileCompra / Mercado Público)';

function escapar(texto: string) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('atribución y enlaces legales', () => {
  it('la cita es la literal de la Declaración', () => {
    expect(FUENTE_DATOS).toBe(CITA_LITERAL);
    expect(DESCARGO_CHILECOMPRA).toMatch(/^ChileCompra no participa ni respalda/);
  });

  it('la cáscara pone el pie, una sola vez, alrededor del contenido', () => {
    render(
      <Cascara>
        <p>contenido</p>
      </Cascara>,
    );
    expect(screen.getAllByText(new RegExp(`^${escapar(CITA_LITERAL)}`))).toHaveLength(1);
    expect(screen.getByText(/ChileCompra no participa ni respalda/)).toBeInTheDocument();
    const legales = screen.getByRole('navigation', { name: /documentos legales/i });
    expect(within(legales).getByRole('link', { name: /términos/i })).toHaveAttribute('href', '/terminos');
    expect(within(legales).getByRole('link', { name: /privacidad/i })).toHaveAttribute('href', '/privacidad');
    expect(within(screen.getByRole('main')).getByText('contenido')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenido');
  });
});

const RAIZ = join(__dirname, '..');
const APP = join(RAIZ, 'app');

function ficheros(dir: string, patron: RegExp): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return ficheros(ruta, patron);
    return patron.test(entrada) ? [ruta] : [];
  });
}

const rel = (ruta: string) => relative(RAIZ, ruta).split('\\').join('/');

describe('una sola cáscara para todas las páginas', () => {
  const paginas = ficheros(APP, /^page\.tsx$/);
  const tsx = ['app', 'components'].flatMap((d) => ficheros(join(RAIZ, d), /\.tsx$/)).map(rel);

  it('hay páginas y componentes que revisar', () => {
    // La guarda de siempre: sin ella, mover `app/` dejaría el test en verde
    // comprobando el vacío. 15 páginas y 78 .tsx el 2026-10-14.
    expect(paginas.length).toBeGreaterThanOrEqual(12);
    expect(tsx.length).toBeGreaterThanOrEqual(60);
  });

  it('el layout raíz envuelve toda página en la cáscara', () => {
    const layout = readFileSync(join(APP, 'layout.tsx'), 'utf-8');
    expect(layout).toMatch(/<Cascara>\s*\{children\}\s*<\/Cascara>/);
  });

  it.each([
    ['la cita de la fuente', /<PieAtribucion\b/, ['components/cascara/PieSitio.tsx']],
    ['la cabecera', /<Cabecera\b/, ['components/cascara/Cascara.tsx']],
    ['el pie', /<PieSitio\b/, ['components/cascara/Cascara.tsx']],
    ['<main>', /<main\b/, ['components/cascara/Cascara.tsx']],
    // `global-error` reemplaza el documento entero cuando falla el layout raíz.
    ['<html>', /<html\b/, ['app/global-error.tsx', 'app/layout.tsx']],
  ])('sólo pinta %s quien debe', (_, patron, esperados) => {
    const quienes = tsx.filter((r) => patron.test(readFileSync(join(RAIZ, r), 'utf-8'))).sort();
    expect(quienes).toEqual(esperados);
  });
});
