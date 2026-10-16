/**
 * El pie único (spec PORTADA_V7 §6): cuatro columnas —«Sitio», «Abierto»,
 * «Sobre el sitio» y, con `AUTOR_NOMBRE`, «Lo hace»—, la cita de ChileCompra una
 * sola vez, el selector de tema y el commit del despliegue. El mapa sale de la
 * misma lista que la cabecera.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PieSitio } from '@/components/cascara/PieSitio';

const VARIABLES = ['REPOSITORIO_URL', 'AUTOR_NOMBRE', 'AUTOR_URL', 'VERCEL_GIT_COMMIT_SHA'];
const SHA = '0123456789abcdef0123456789abcdef01234567';

afterEach(() => {
  for (const v of VARIABLES) delete process.env[v];
});

const mapa = () => screen.getByRole('navigation', { name: 'Mapa del sitio' });
const columna = (titulo: string) =>
  within(mapa())
    .getByRole('heading', { level: 2, name: titulo })
    .closest('div') as HTMLElement;
const enlacesDe = (titulo: string) =>
  within(columna(titulo))
    .getAllByRole('link')
    .map((a) => [a.textContent, a.getAttribute('href')]);

describe('el pie único', () => {
  it('es el contentinfo de la página', () => {
    render(<PieSitio />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('tres columnas sin AUTOR_NOMBRE, en su orden', () => {
    render(<PieSitio />);
    expect(
      within(mapa())
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(['Sitio', 'Abierto', 'Sobre el sitio']);
  });

  it('«Sitio»: las secciones de la cabecera y Guardados', () => {
    render(<PieSitio />);
    expect(enlacesDe('Sitio')).toEqual([
      ['Compra Ágil', '/compra-agil'],
      ['Licitaciones', '/licitaciones'],
      ['Precios', '/productos'],
      ['Mercados', '/mercado'],
      ['Guías', '/guias'],
      ['Notas', '/notas'],
      ['Guardados', '/guardados'],
    ]);
  });

  it('«Abierto»: API y MCP y Licencias; «Código» sólo con REPOSITORIO_URL', () => {
    render(<PieSitio />);
    expect(enlacesDe('Abierto')).toEqual([
      ['API y MCP', '/abierto'],
      ['Licencias', '/abierto#licencias'],
    ]);
  });

  it('con REPOSITORIO_URL, también «Código», fuera del sitio', () => {
    process.env.REPOSITORIO_URL = 'https://github.com/x/tordo';
    render(<PieSitio />);
    const codigo = within(columna('Abierto')).getByRole('link', { name: 'Código' });
    expect(codigo).toHaveAttribute('href', 'https://github.com/x/tordo');
    expect(codigo).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('«Sobre el sitio»: acerca, costo, apoyar, legales y contacto', () => {
    render(<PieSitio />);
    expect(enlacesDe('Sobre el sitio')).toEqual([
      ['Acerca', '/acerca'],
      ['Cuánto cuesta', '/apoyar#costos'],
      ['Apoyar', '/apoyar'],
      ['Términos de uso', '/terminos'],
      ['Privacidad', '/privacidad'],
      ['Contacto', 'mailto:hola@tordo.cl'],
    ]);
  });

  it('con AUTOR_NOMBRE, «Lo hace» con el nombre; enlazado sólo con AUTOR_URL https', () => {
    process.env.AUTOR_NOMBRE = 'Nombre De Prueba';
    const { unmount } = render(<PieSitio />);
    expect(within(columna('Lo hace')).getByText('Nombre De Prueba')).toBeInTheDocument();
    expect(within(columna('Lo hace')).queryByRole('link')).toBeNull();
    unmount();

    process.env.AUTOR_URL = 'https://github.com/alguien';
    render(<PieSitio />);
    const nombre = within(columna('Lo hace')).getByRole('link', { name: 'Nombre De Prueba' });
    expect(nombre).toHaveAttribute('href', 'https://github.com/alguien');
    expect(nombre).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('sin AUTOR_NOMBRE no hay «Lo hace», aunque haya AUTOR_URL', () => {
    process.env.AUTOR_URL = 'https://github.com/alguien';
    const { container } = render(<PieSitio />);
    expect(container.textContent).not.toMatch(/lo hace/i);
  });

  it('la cita de la fuente una sola vez, y que no es un sitio del gobierno, como frase', () => {
    render(<PieSitio />);
    expect(screen.getAllByText(/^Fuente: Dirección de Compras y Contratación Pública/)).toHaveLength(1);
    expect(screen.getByText('No estamos afiliados al gobierno de Chile.')).toBeInTheDocument();
  });

  it('sin puntos medios (spec PORTADA_V7 V10)', () => {
    process.env.AUTOR_NOMBRE = 'Nombre De Prueba';
    process.env.VERCEL_GIT_COMMIT_SHA = SHA;
    const { container } = render(<PieSitio />);
    expect(container.textContent).not.toMatch(/·/);
  });

  it('sin VERCEL_GIT_COMMIT_SHA no dice el commit', () => {
    const { container } = render(<PieSitio />);
    expect(container.textContent).not.toMatch(/commit/i);
  });

  it('con VERCEL_GIT_COMMIT_SHA, «Sitio en el commit abc1234»; enlazado si hay repositorio', () => {
    process.env.VERCEL_GIT_COMMIT_SHA = SHA;
    const { container, unmount } = render(<PieSitio />);
    expect(container.textContent).toMatch(/Sitio en el commit 0123456\./);
    expect(screen.queryByRole('link', { name: '0123456' })).toBeNull();
    unmount();

    process.env.REPOSITORIO_URL = 'https://github.com/x/tordo';
    render(<PieSitio />);
    expect(screen.getByRole('link', { name: '0123456' })).toHaveAttribute(
      'href',
      `https://github.com/x/tordo/commit/${SHA}`,
    );
  });

  it('el selector de tema vive aquí (§5.2: «el selector baja al pie»)', () => {
    render(<PieSitio />);
    expect(screen.getByRole('radiogroup', { name: 'Apariencia' })).toBeInTheDocument();
  });

  it('cuatro columnas desde lg y dos por debajo', () => {
    const fuente = readFileSync(join(__dirname, '..', 'components', 'cascara', 'PieSitio.tsx'), 'utf8');
    expect(fuente).toMatch(/grid-cols-2\b[^"]*\blg:grid-cols-4\b/);
  });
});
