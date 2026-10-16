import { expect, test, type Page } from '@playwright/test';

/**
 * La escala y el contenedor único (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §4), en
 * el navegador: lo que un test unitario no puede medir.
 *
 * La auditoría del 2026-10-16 midió a 1440 px cuatro bordes izquierdos (168, 176,
 * 192 y 232) y el `h1` a 16, 32 o ~90 px de la cabecera según la página. Aquí, a
 * 1440 y a 390 px:
 *
 * - el borde izquierdo del `h1` es el de la marca de la cabecera y el del pie, en
 *   todas las páginas (la portada incluida);
 * - la distancia de la cabecera al `h1` es el tope de página —48 px en escritorio,
 *   24 en móvil— y la misma en todas, salvo la portada, cuyo `h1` es otro (§3).
 *
 * Tolerancia: 1 px.
 */

const PAGINAS = [
  '/licitaciones',
  '/productos',
  '/acerca',
  '/guias',
  '/guias/de-donde-salen-los-datos',
];

const VISTAS = [
  { width: 1440, height: 900, tope: 48 },
  { width: 390, height: 844, tope: 24 },
];

interface Medida {
  marca: number;
  pie: number;
  h1: number;
  distancia: number;
}

async function medir(page: Page, ruta: string): Promise<Medida> {
  await page.goto(ruta);
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toBeVisible({ timeout: 15_000 });
  return page.evaluate(() => {
    const cabecera = document.querySelector('header')!.getBoundingClientRect();
    const marca = document.querySelector('header a[href="/"]')!.getBoundingClientRect();
    const pie = document.querySelector('footer nav')!.getBoundingClientRect();
    const titulo = document.querySelector('main h1')!.getBoundingClientRect();
    return {
      marca: marca.left,
      pie: pie.left,
      h1: titulo.left,
      distancia: titulo.top - cabecera.bottom,
    };
  });
}

for (const vista of VISTAS) {
  test.describe(`a ${vista.width} px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vista.width, height: vista.height });
    });

    test('un solo borde izquierdo: la marca, el h1 de cada página y el pie', async ({ page }) => {
      const medidas: Record<string, Medida> = {};
      for (const ruta of ['/', ...PAGINAS]) medidas[ruta] = await medir(page, ruta);
      const borde = medidas['/'].marca;
      // A 390 px el relleno del contenedor es 16; desde `lg`, 32 más el margen automático.
      expect(borde).toBeGreaterThanOrEqual(16);
      for (const [ruta, m] of Object.entries(medidas)) {
        expect(Math.abs(m.marca - borde), `${ruta}: la marca`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.h1 - borde), `${ruta}: el h1 empieza en ${m.h1}, la marca en ${borde}`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.pie - borde), `${ruta}: el pie empieza en ${m.pie}`).toBeLessThanOrEqual(1);
      }
    });

    test(`de la cabecera al h1, ${vista.tope} px en todas las páginas`, async ({ page }) => {
      for (const ruta of PAGINAS) {
        const { distancia } = await medir(page, ruta);
        expect(Math.abs(distancia - vista.tope), `${ruta}: ${distancia} px`).toBeLessThanOrEqual(1);
      }
    });
  });
}
