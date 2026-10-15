/**
 * La barra lateral se fue entera (spec del rediseño R3 y §5.2): el componente,
 * sus tokens, sus utilidades de Tailwind y el hueco que dejaba en el contenido.
 * Un resto suelto es una invitación a volver a usarlo.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const r = join(dir, e);
    if (statSync(r).isDirectory()) return fuentes(r);
    return /\.(tsx?|css)$/.test(e) ? [relative(RAIZ, r)] : [];
  });
}

describe('sin barra lateral', () => {
  it('ni el componente ni la cabecera pública vieja', () => {
    expect(existsSync(join(RAIZ, 'components', 'Layout.tsx'))).toBe(false);
    expect(existsSync(join(RAIZ, 'components', 'publico', 'CabeceraPublica.tsx'))).toBe(false);
  });

  it('ni sus tokens en globals.css', () => {
    const css = leer('app/globals.css');
    for (const token of ['--color-sidebar-from', '--color-sidebar-to', '--color-header-bg', '--shadow-sidebar']) {
      expect(css, token).not.toContain(token);
    }
  });

  it('ni sus utilidades en Tailwind', () => {
    expect(leer('tailwind.config.js')).not.toMatch(/sidebar|nav-active|slide-in-left|slideInLeft/);
  });

  it('ningún fichero la nombra ni deja su hueco', () => {
    const codigo = ['app', 'components', 'lib', 'hooks'].flatMap((d) => fuentes(join(RAIZ, d)));
    expect(codigo.length).toBeGreaterThanOrEqual(80);
    const infractores = codigo.filter((r) =>
      /components\/Layout['"]|CabeceraPublica|lg:pl-64|shadow-sidebar|--color-sidebar|--color-header-bg|nav-lateral/.test(leer(r)),
    );
    expect(infractores).toEqual([]);
  });
});
