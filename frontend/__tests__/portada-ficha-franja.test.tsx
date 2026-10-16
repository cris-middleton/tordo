/**
 * La ficha (D14: tres datos concretos en vez de una lista de ✓) y la franja de
 * hoy (spec IDENTIDAD_Y_PORTADA §3.1 y §3.6).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FichaPortada } from '@/components/portada/FichaPortada';
import { FranjaPortada } from '@/components/portada/FranjaPortada';
import { SE_ACTUALIZA, type DatosFranja } from '@/lib/portada';

const leer = (f: string) => readFileSync(join(__dirname, '..', 'components', 'portada', f), 'utf8');

describe('FichaPortada', () => {
  it('un <dl> de tres filas: Fuente, Se actualiza, Se usa', () => {
    const { container } = render(<FichaPortada />);
    const dl = container.querySelector('dl') as HTMLElement;
    expect([...dl.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Fuente', 'Se actualiza', 'Se usa']);
    expect([...dl.querySelectorAll('dd')].map((d) => d.textContent)).toEqual([
      'ChileCompra',
      SE_ACTUALIZA,
      'Aquí, por API, por MCP o en CSV. Sin registro',
    ]);
  });

  it('API, MCP y CSV llevan a su sitio de /abierto, subrayados (texto corrido)', () => {
    render(<FichaPortada />);
    for (const [nombre, href] of [
      ['API', '/abierto#api'],
      ['MCP', '/abierto#mcp'],
      ['CSV', '/abierto#datos'],
    ]) {
      const enlace = screen.getByRole('link', { name: nombre });
      expect(enlace).toHaveAttribute('href', href);
      expect(enlace).toHaveClass('enlace');
    }
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

  it.each(['FichaPortada.tsx', 'FranjaPortada.tsx'])('%s no lleva JavaScript propio ni colores crudos', (f) => {
    expect(leer(f)).not.toMatch(/^\s*['"]use client['"]/m);
    expect(leer(f)).not.toMatch(/#[0-9a-fA-F]{6}\b|text-white|bg-white/);
  });
});
