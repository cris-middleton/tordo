/**
 * La ficha (spec PORTADA_V7 §3.5: datos concretos en vez de una lista de ✓), la
 * ficha del autor (§3.6) y la franja de hoy (IDENTIDAD_Y_PORTADA §3.6).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FichaAutor } from '@/components/portada/FichaAutor';
import { FichaPortada } from '@/components/portada/FichaPortada';
import { FranjaPortada } from '@/components/portada/FranjaPortada';
import { SE_ACTUALIZA, type DatosFranja } from '@/lib/portada';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';
const leer = (f: string) => readFileSync(join(__dirname, '..', 'components', 'portada', f), 'utf8');

const BASE = '5,48 millones de órdenes de compra, nov 2023 a oct 2026';
const filas = (dl: HTMLElement) =>
  [...dl.querySelectorAll('dt')].map((d) => [d.textContent, d.nextElementSibling?.textContent]);

describe('FichaPortada (spec PORTADA_V7 §3.5)', () => {
  it('con todo: Base, Fuente, Se actualiza y Lo hace, en ese orden', () => {
    const { container } = render(<FichaPortada base={BASE} autor="Nombre De Prueba" urlAutor="https://github.com/prueba" />);
    expect(filas(container.querySelector('dl') as HTMLElement)).toEqual([
      ['Base', BASE],
      ['Fuente', 'Datos abiertos de ChileCompra'],
      ['Se actualiza', SE_ACTUALIZA],
      ['Lo hace', 'Nombre De Prueba, data scientist'],
    ]);
    expect(screen.getByRole('link', { name: 'Nombre De Prueba' })).toHaveAttribute('href', 'https://github.com/prueba');
  });

  it('sin base ni autor, esas filas no salen (ni un hueco)', () => {
    const { container } = render(<FichaPortada base={null} autor={null} urlAutor={null} />);
    expect(filas(container.querySelector('dl') as HTMLElement).map(([dt]) => dt)).toEqual(['Fuente', 'Se actualiza']);
    expect(container.textContent).not.toMatch(/Lo hace|\[\[|null/);
  });

  it('con autor y sin URL, el nombre sin enlace', () => {
    render(<FichaPortada base={BASE} autor="Nombre De Prueba" urlAutor={null} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/Nombre De Prueba/)).toBeInTheDocument();
  });

  it('«Se usa» se fue (V11): la salida a API, MCP y CSV es la de la cabecera y el pie', () => {
    const { container } = render(<FichaPortada base={BASE} autor={null} urlAutor={null} />);
    expect(container.textContent).not.toMatch(/Se usa|MCP|CSV/);
  });
});

describe('FichaAutor (spec PORTADA_V7 §3.6)', () => {
  it('quién lo hace, a quién escribir y su enlace con el nombre del sitio', () => {
    render(<FichaAutor nombre="Nombre De Prueba" url="https://www.linkedin.com/in/prueba" />);
    const ficha = screen.getByRole('complementary', { name: 'Quién lo hace' });
    expect(ficha).toHaveTextContent(`Nombre De Prueba hace ${APP_NAME}. Es data scientist y escribe las notas de datos.`);
    expect(ficha).toHaveTextContent('Si un número no cuadra con Mercado Público, escríbele: cada corrección sale como nota.');
    expect(screen.getByRole('link', { name: 'hola@tordo.cl' })).toHaveAttribute('href', 'mailto:hola@tordo.cl');
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', 'https://www.linkedin.com/in/prueba');
  });

  it('sin URL, sólo el correo', () => {
    render(<FichaAutor nombre="Nombre De Prueba" url={null} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});

const FRANJA: DatosFranja = {
  publicadasHoy: '612',
  masPublicaHoy: 'Servicio De Salud Metropolitano Sur',
  actualizado: 'mié, 14 oct, 13:17',
};

describe('FranjaPortada', () => {
  it('tres celdas: publicadas hoy, quién más publica y la hora', () => {
    const { container } = render(<FranjaPortada franja={FRANJA} />);
    expect([...container.querySelectorAll('dt')].map((d) => d.textContent)).toEqual([
      'Publicadas hoy:',
      'Más publica hoy:',
      'Actualizado el',
    ]);
    expect([...container.querySelectorAll('dd')].map((d) => d.textContent)).toEqual([
      '612',
      'Servicio De Salud Metropolitano Sur',
      'mié, 14 oct, 13:17',
    ]);
  });

  it('un nombre larguísimo se corta con elipsis y el title lleva el entero', () => {
    const largo = `Ilustre Municipalidad de ${'Santa María de los Ángeles '.repeat(8)}`.trim();
    render(<FranjaPortada franja={{ ...FRANJA, masPublicaHoy: largo }} />);
    const celda = screen.getByTitle(largo);
    expect(celda).toHaveClass('truncate', 'min-w-0');
    expect(celda.parentElement).toHaveClass('min-w-0');
  });

  it('sin publicadas hoy, sólo la hora', () => {
    render(<FranjaPortada franja={{ publicadasHoy: null, masPublicaHoy: null, actualizado: FRANJA.actualizado }} />);
    expect(screen.queryByText('Publicadas hoy:')).toBeNull();
    expect(screen.queryByText('Más publica hoy:')).toBeNull();
    expect(screen.getByText('Actualizado el')).toBeInTheDocument();
  });

  it('con sólo la hora, su celda no queda sangrada desde lg', () => {
    const { container } = render(
      <FranjaPortada franja={{ publicadasHoy: null, masPublicaHoy: null, actualizado: FRANJA.actualizado }} />,
    );
    const dl = container.querySelector('dl') as HTMLElement;
    expect(dl.children).toHaveLength(1);
    expect(dl.firstElementChild).toHaveClass('lg:first:pl-0');
  });

  it('con publicadas y sin nombre que poner primero: el conteo y la hora, sin «Más publica hoy»', () => {
    const { container } = render(<FranjaPortada franja={{ ...FRANJA, masPublicaHoy: null }} />);
    expect([...container.querySelectorAll('dt')].map((d) => d.textContent)).toEqual([
      'Publicadas hoy:',
      'Actualizado el',
    ]);
    expect([...container.querySelectorAll('dd')].map((d) => d.textContent)).toEqual(['612', 'mié, 14 oct, 13:17']);
  });

  it('cualquier celda que quede primera pierde la sangría izquierda desde lg', () => {
    const { container } = render(<FranjaPortada franja={FRANJA} />);
    for (const celda of (container.querySelector('dl') as HTMLElement).children) {
      expect(celda).toHaveClass('lg:first:pl-0');
    }
  });

  it.each(['FichaPortada.tsx', 'FichaAutor.tsx', 'FranjaPortada.tsx', 'LecturasPortada.tsx', 'NotasPortada.tsx'])('%s no lleva JavaScript propio ni colores crudos', (f) => {
    expect(leer(f)).not.toMatch(/^\s*['"]use client['"]/m);
    expect(leer(f)).not.toMatch(/#[0-9a-fA-F]{6}\b|text-white|bg-white/);
  });
});
