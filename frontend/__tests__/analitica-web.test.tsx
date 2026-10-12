/**
 * Vercel Web Analytics: el script oficial sólo en Vercel (`VERCEL=1`). Fuera de
 * Vercel la ruta `/_vercel/insights/*` no existe y la etiqueta sería un 404 en
 * cada página.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AnaliticaWeb, SCRIPT_ANALITICA_WEB, enVercel } from '@/components/AnaliticaWeb';

afterEach(() => {
  delete process.env.VERCEL;
});

describe('Vercel Web Analytics', () => {
  it('fuera de Vercel no se incluye', () => {
    delete process.env.VERCEL;
    const { container } = render(<AnaliticaWeb />);
    expect(container.querySelector('script')).toBeNull();
    expect(enVercel({ VERCEL: '0' })).toBe(false);
    expect(enVercel({})).toBe(false);
  });

  it('en Vercel, el script oficial con defer y sin nada más', () => {
    process.env.VERCEL = '1';
    const { container } = render(<AnaliticaWeb />);
    const script = container.querySelector('script');
    expect(script?.getAttribute('src')).toBe(SCRIPT_ANALITICA_WEB);
    expect(SCRIPT_ANALITICA_WEB).toBe('/_vercel/insights/script.js');
    expect(script?.hasAttribute('defer')).toBe(true);
  });

  it('va en el layout raíz, que es de servidor', () => {
    const layout = readFileSync(join(__dirname, '..', 'app', 'layout.tsx'), 'utf-8');
    expect(layout).toMatch(/<AnaliticaWeb\s*\/>/);
    expect(layout).not.toMatch(/^\s*['"]use client['"]/);
  });

  it('sin dependencia de npm', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty('@vercel/analytics');
  });
});
