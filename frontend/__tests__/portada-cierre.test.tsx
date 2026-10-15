/**
 * Lo libre, demostrado (spec del rediseño §6.3, principio 3): «Úsalo como
 * quieras» enlaza a /abierto, y el cierre dice el costo, quién lo hace —sólo si
 * hay nombre— y cómo apoyar.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CierrePortada } from '@/components/portada/CierrePortada';
import { UsosAbiertos } from '@/components/portada/UsosAbiertos';
import { COSTO_MENSUAL_APROXIMADO } from '@/lib/costos';
import { usosAbiertos } from '@/lib/portada';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';
const leer = (f: string) => readFileSync(join(__dirname, '..', 'components', 'portada', f), 'utf8');

describe('UsosAbiertos', () => {
  it('sin repositorio: API, MCP, CSV y RSS, a su sección de /abierto, y nada de «Código»', () => {
    render(<UsosAbiertos usos={usosAbiertos(null)} />);
    const seccion = screen.getByRole('region', { name: 'Úsalo como quieras' });
    const enlaces = within(seccion).getAllByRole('link');
    expect(enlaces.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['API', '/abierto#api'],
      ['MCP para Claude y ChatGPT', '/abierto#mcp'],
      ['CSV', '/abierto#datos'],
      ['RSS', '/abierto#datos'],
    ]);
    expect(within(seccion).queryByRole('link', { name: 'Código' })).toBeNull();
  });

  it('con repositorio, «Código» lleva fuera del sitio', () => {
    render(<UsosAbiertos usos={usosAbiertos('https://github.com/x/tordo')} />);
    const codigo = screen.getByRole('link', { name: 'Código' });
    expect(codigo).toHaveAttribute('href', 'https://github.com/x/tordo');
    expect(codigo).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('CierrePortada', () => {
  it('es gratis, el costo de lib/costos al desglose, y «Apoyar»', () => {
    render(<CierrePortada autor={null} />);
    expect(screen.getByText(`${APP_NAME} es gratis. Mantenerlo, casi.`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `~${COSTO_MENSUAL_APROXIMADO} al mes` })).toHaveAttribute(
      'href',
      '/apoyar#costos',
    );
    expect(screen.getByRole('link', { name: 'Apoyar' })).toHaveAttribute('href', '/apoyar');
  });

  it('sin nombre no firma: ni «hecho por» ni el hueco de los documentos legales', () => {
    const { container } = render(<CierrePortada autor={null} />);
    expect(container.textContent).not.toMatch(/hecho por|\[\[/i);
  });

  it('con nombre, «hecho por» y el nombre', () => {
    render(<CierrePortada autor="Nombre De Prueba" />);
    expect(screen.getByText(/hecho por Nombre De Prueba/)).toBeInTheDocument();
  });

  it.each(['UsosAbiertos.tsx', 'CierrePortada.tsx'])('%s no lleva JavaScript propio ni «TORDO» escrito', (f) => {
    expect(leer(f)).not.toMatch(/^\s*['"]use client['"]/m);
    expect(leer(f)).not.toMatch(/TORDO/);
  });
});
