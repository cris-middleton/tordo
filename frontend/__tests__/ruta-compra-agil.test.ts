/**
 * El enlace a «Lo mejor de hoy» con una búsqueda puesta (`/compra-agil?search=`).
 *
 * Lo arma `rutaCompraAgil` y lo lee la página con el MISMO nombre de parámetro:
 * si uno cambia y el otro no, el enlace de `/buscar` abriría la lista sin filtrar
 * sin que nada fallara.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PARAMETRO_BUSQUEDA_COMPRA_AGIL, rutaCompraAgil } from '@/lib/compraAgil';

describe('rutaCompraAgil', () => {
  it('sin término, la página sola', () => {
    expect(rutaCompraAgil()).toBe('/compra-agil');
    expect(rutaCompraAgil('   ')).toBe('/compra-agil');
  });

  it('con término, en ?search= y escapado', () => {
    expect(PARAMETRO_BUSQUEDA_COMPRA_AGIL).toBe('search');
    expect(rutaCompraAgil(' guantes nitrilo ')).toBe('/compra-agil?search=guantes+nitrilo');
    expect(rutaCompraAgil('a&region=x')).toBe('/compra-agil?search=a%26region%3Dx');
  });

  it('la página lee y escribe el mismo parámetro que arma la ruta', () => {
    const pagina = readFileSync(join(__dirname, '..', 'app', '(panel)', 'compra-agil', 'page.tsx'), 'utf-8');
    expect(pagina).toContain('urlInicial.get(PARAMETRO_BUSQUEDA_COMPRA_AGIL)');
    expect(pagina).toContain('[PARAMETRO_BUSQUEDA_COMPRA_AGIL]: busqueda');
    expect(pagina).not.toMatch(/urlInicial\.get\('search'\)/);
  });
});
