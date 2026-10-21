/**
 * El pie único: una fila de enlaces (lo que la cabecera no tiene), el selector de
 * tema compacto, la cita de ChileCompra una sola vez, quién lo hace y el commit
 * del despliegue. La fila sale de `enlacesDelPie`, en `lib/navegacion.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PieSitio } from '@/components/cascara/PieSitio';
import { SECCIONES } from '@/lib/navegacion';

const VARIABLES = ['REPOSITORIO_URL', 'AUTOR_NOMBRE', 'AUTOR_URL', 'VERCEL_GIT_COMMIT_SHA'];
const SHA = '0123456789abcdef0123456789abcdef01234567';

afterEach(() => {
  for (const v of VARIABLES) delete process.env[v];
});

const mapa = () => screen.getByRole('navigation', { name: 'Mapa del sitio' });
const enlacesDelMapa = () =>
  within(mapa())
    .getAllByRole('link')
    .map((a) => [a.textContent, a.getAttribute('href')]);

describe('el pie único', () => {
  it('es el contentinfo de la página', () => {
    render(<PieSitio />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('una fila: acerca, costo, lo abierto, licencias, legales y contacto, en su orden', () => {
    render(<PieSitio />);
    expect(enlacesDelMapa()).toEqual([
      ['Acerca', '/acerca'],
      ['Cuánto cuesta', '/apoyar#costos'],
      ['API y MCP', '/abierto'],
      ['Licencias', '/abierto#licencias'],
      ['Términos de uso', '/terminos'],
      ['Privacidad', '/privacidad'],
      ['Contacto', 'mailto:hola@tordo.cl'],
    ]);
  });

  it('no repite la cabecera: ni las secciones, ni Guardados, ni Apoyar', () => {
    render(<PieSitio />);
    const hrefs = enlacesDelMapa().map(([, href]) => href);
    for (const s of SECCIONES) expect(hrefs).not.toContain(s.href);
    expect(hrefs).not.toContain('/guardados');
    expect(hrefs).not.toContain('/apoyar');
  });

  it('con REPOSITORIO_URL, también «Código», fuera del sitio y junto a la API', () => {
    process.env.REPOSITORIO_URL = 'https://github.com/x/tordo';
    render(<PieSitio />);
    const codigo = within(mapa()).getByRole('link', { name: 'Código' });
    expect(codigo).toHaveAttribute('href', 'https://github.com/x/tordo');
    expect(codigo).toHaveAttribute('rel', 'noopener noreferrer');
    expect(enlacesDelMapa().map(([n]) => n).slice(2, 4)).toEqual(['API y MCP', 'Código']);
  });

  it('con AUTOR_NOMBRE, «Lo hace {nombre}.»; enlazado sólo con AUTOR_URL https', () => {
    process.env.AUTOR_NOMBRE = 'Nombre De Prueba';
    const { container, unmount } = render(<PieSitio />);
    expect(container.textContent).toMatch(/Lo hace Nombre De Prueba\./);
    expect(screen.queryByRole('link', { name: 'Nombre De Prueba' })).toBeNull();
    unmount();

    process.env.AUTOR_URL = 'https://github.com/alguien';
    render(<PieSitio />);
    const nombre = screen.getByRole('link', { name: 'Nombre De Prueba' });
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

  it('el selector de tema vive aquí, compacto: tres íconos con su nombre', () => {
    render(<PieSitio />);
    const selector = screen.getByRole('radiogroup', { name: 'Apariencia' });
    expect(within(selector).getAllByRole('radio').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Claro',
      'Oscuro',
      'Sistema',
    ]);
  });

  it('sin columnas: el pie es una fila, no un mapa en rejilla', () => {
    const fuente = readFileSync(join(__dirname, '..', 'components', 'cascara', 'PieSitio.tsx'), 'utf8');
    expect(fuente).not.toMatch(/grid-cols-[2-4]\b/);
    expect(fuente).not.toMatch(/<h2\b/);
  });
});
