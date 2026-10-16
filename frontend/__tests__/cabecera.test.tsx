/**
 * La cabecera única (spec del rediseño §6.1): un componente de servidor con
 * islas cliente pequeñas, la misma lista en escritorio y en el menú móvil, y
 * «Código» sólo con `REPOSITORIO_URL`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Cabecera } from '@/components/cascara/Cabecera';
import { PieSitio } from '@/components/cascara/PieSitio';
import { TRAZOS_PAJARO, VIEWBOX_PAJARO } from '@/lib/pajaroImagen';

const navegacion = vi.hoisted(() => ({ ruta: '/licitaciones' }));
vi.mock('next/navigation', () => ({ usePathname: () => navegacion.ruta }));

const ESPERADOS = ['Compra Ágil', 'Licitaciones', 'Precios', 'Mercados', 'Guías', 'API y MCP'];

/** `hidden: true`: en jsdom el contenido de un <details> cerrado puede contar como oculto. */
function enlacesDe(nombreNav: string): HTMLElement[] {
  const nav = screen.getByRole('navigation', { name: nombreNav, hidden: true });
  return within(nav).getAllByRole('link', { hidden: true });
}
const nombres = (enlaces: HTMLElement[]) => enlaces.map((a) => a.textContent?.trim());

afterEach(() => {
  delete process.env.REPOSITORIO_URL;
  navegacion.ruta = '/licitaciones';
});

describe('la cabecera única', () => {
  it('escritorio: las cinco secciones y, aparte, «API y MCP»', () => {
    render(<Cabecera />);
    expect(nombres(enlacesDe('Secciones'))).toEqual(ESPERADOS);
  });

  it('móvil: las mismas, dentro de un <details> «Menú» cerrado por defecto', () => {
    const { container } = render(<Cabecera />);
    const menu = container.querySelector('details');
    expect(menu).not.toBeNull();
    expect(menu!.open).toBe(false);
    expect(menu!.querySelector('summary')?.textContent?.trim()).toBe('Menú');
    expect(nombres(enlacesDe('Menú de secciones'))).toEqual(ESPERADOS);
  });

  it('«Código» con REPOSITORIO_URL https: en las dos navegaciones, fuera del sitio', () => {
    process.env.REPOSITORIO_URL = 'https://github.com/x/tordo';
    render(<Cabecera />);
    for (const nav of ['Secciones', 'Menú de secciones']) {
      const codigo = enlacesDe(nav).find((a) => a.textContent === 'Código');
      expect(codigo, nav).toBeDefined();
      expect(codigo).toHaveAttribute('href', 'https://github.com/x/tordo');
      expect(codigo).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it.each([
    ['sin variable', undefined],
    ['http', 'http://github.com/x/tordo'],
    ['texto', 'pronto'],
  ])('sin «Código» %s', (_, valor) => {
    if (valor !== undefined) process.env.REPOSITORIO_URL = valor;
    render(<Cabecera />);
    expect(screen.queryAllByRole('link', { name: 'Código', hidden: true })).toHaveLength(0);
  });

  it.each([
    ['/licitaciones/E2E-1001-LR24', ['Licitaciones']],
    ['/productos/guantes-nitrilo', ['Precios']],
    ['/compra-agil', ['Compra Ágil']],
    ['/', []],
    ['/compradores/7248', []],
  ])('en %s se marca %j y nada más', (ruta, marcadas) => {
    navegacion.ruta = ruta;
    render(<Cabecera />);
    const actuales = enlacesDe('Secciones').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(nombres(actuales)).toEqual(marcadas);
  });

  it('«Apoyar» en color de acento con su corazón, y Guardados con su texto accesible', () => {
    render(<Cabecera />);
    const apoyar = screen.getByRole('link', { name: 'Apoyar' });
    expect(apoyar).toHaveAttribute('href', '/apoyar');
    expect(apoyar.className).toMatch(/\btext-accent\b/);
    expect(apoyar.querySelector('svg')).not.toBeNull();
    // Por debajo de 360 px el texto pasa a `sr-only` (la fila no cabía a 320): el nombre accesible queda.
    expect(apoyar.querySelector('span')?.className).toMatch(/max-\[359px\]:sr-only/);
    expect(screen.getByRole('link', { name: /^guardados en este navegador/i })).toHaveAttribute(
      'href',
      '/guardados',
    );
  });

  it('los enlaces de acción tienen área de toque de 24×24 px o más (WCAG 2.5.8)', () => {
    render(<Cabecera />);
    // Icono o texto de 16–20 px + relleno de 6 px por lado = 28 px. El relleno es
    // del enlace, no de la fila: la altura de la cabecera no cambia.
    for (const nombre of [/^apoyar$/i, /^guardados en este navegador/i]) {
      const clases = screen.getByRole('link', { name: nombre }).className;
      expect(clases).toMatch(/\bpx-1\.5\b/);
      expect(clases).toMatch(/\bpy-1\.5\b/);
    }
  });

  it('la marca lleva el pájaro del logo: decorativo, con sus trazos y pintado con tokens', () => {
    render(<Cabecera />);
    const marca = screen.getByRole('link', { name: /, inicio$/ });
    const pajaro = marca.querySelector('svg');
    expect(pajaro).not.toBeNull();
    // Decorativo: el nombre lo da el enlace. Sin `aria-hidden`, un lector leería «imagen».
    expect(pajaro).toHaveAttribute('aria-hidden', 'true');
    expect(pajaro).toHaveAttribute('viewBox', VIEWBOX_PAJARO);
    const trazos = [...pajaro!.querySelectorAll('path')];
    expect(trazos.map((p) => p.getAttribute('d'))).toEqual(TRAZOS_PAJARO.map((t) => t.d));
    expect(trazos.map((p) => p.getAttribute('class'))).toEqual(
      TRAZOS_PAJARO.map((t) => (t.parte === 'ala' ? 'fill-brand-teal' : 'fill-brand-blue')),
    );
    expect(pajaro!.querySelector('ellipse')).toHaveAttribute('class', 'fill-surface');
    // El nombre, en Varien, sigue al lado del pájaro.
    expect(marca.querySelector('.font-brand')).not.toBeNull();
  });

  it('la marca lleva a la portada y la cabecera no trae <h1> (el de cada página es el único)', () => {
    const { container } = render(<Cabecera />);
    expect(screen.getByRole('link', { name: /, inicio$/ })).toHaveAttribute('href', '/');
    expect(container.querySelector('h1')).toBeNull();
  });
});

describe('components/cascara: servidor con islas pequeñas, sólo tokens', () => {
  const DIR = join(__dirname, '..', 'components', 'cascara');
  const ISLAS = ['EnlaceGuardados.tsx', 'EnlaceSeccion.tsx', 'MarcoCabecera.tsx'];
  const ficheros = readdirSync(DIR).filter((f) => f.endsWith('.tsx'));
  const leer = (f: string) => readFileSync(join(DIR, f), 'utf8');

  it('guarda: hay ficheros que revisar', () => {
    expect(ficheros.length).toBeGreaterThanOrEqual(3);
  });

  it.each(ficheros)('%s es cliente sólo si es una isla', (f) => {
    expect(/^\s*['"]use client['"]/.test(leer(f))).toBe(ISLAS.includes(f));
  });

  // La navegación nunca va subrayada (spec §5.2): la sección activa se marca con
  // color y `aria-current`, no con una línea que se confunde con un texto enlazado.
  it.each(ficheros)('%s no subraya ningún enlace', (f) => {
    expect(leer(f)).not.toMatch(/(^|[\s"'`:])underline\b/);
  });

  it('ningún enlace renderizado de la cabecera ni del pie lleva `underline`', () => {
    const { container } = render(
      <>
        <Cabecera />
        <PieSitio />
      </>,
    );
    const enlaces = [...container.querySelectorAll('a')];
    expect(enlaces.length).toBeGreaterThan(10);
    for (const a of enlaces) {
      const clases = a.getAttribute('class')?.split(/\s+/) ?? [];
      expect(
        clases.filter((c) => c.split(':').pop() === 'underline'),
        a.textContent ?? '',
      ).toEqual([]);
    }
  });

  // `TordoLogo` (cliente, con un `setInterval` y siete hex) entraba en todas las páginas
  // desde `Cabecera.tsx` sin contar como isla: el test de arriba sólo mira esta carpeta.
  it.each(ficheros)('%s no importa componentes cliente de fuera, salvo SelectorTema', (f) => {
    const PERMITIDOS = ['SelectorTema'];
    const importados = [...leer(f).matchAll(/from\s+'@\/components\/([^']+)'/g)].map((m) => m[1]);
    const clientes = importados.filter((ruta) => {
      const fuente = readFileSync(join(__dirname, '..', 'components', `${ruta}.tsx`), 'utf8');
      return /^\s*['"]use client['"]/.test(fuente) && !PERMITIDOS.includes(ruta);
    });
    expect(clientes).toEqual([]);
  });

  it.each(ficheros)('%s no usa colores crudos (el tema oscuro los delata tarde)', (f) => {
    expect(leer(f)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(text|bg|border)-(white|black)\b|rgba?\(/);
  });
});
