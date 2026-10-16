import { expect, test, type Page } from '@playwright/test';

/**
 * El navegador no oscurece el tema claro (`__tests__/oscurecido-forzado.test.ts` fija la
 * declaración; aquí se mira lo que se PINTA).
 *
 * Chromium con `forceDarkModeEnabled` y el sistema en oscuro es lo que hace Chrome en
 * Android con «oscurecer sitios web». Antes del arreglo, la portada en tema claro salía
 * negra: el fondo declarado era blanco y el píxel pintado, (18, 18, 18). El tema oscuro
 * declara `dark` y el navegador lo deja tal cual.
 *
 * Fuera de alcance, a propósito: el sistema en CLARO con el oscurecido encendido. Es el
 * modo `FORCE_DARK_ONLY` de algunas WebView, y Blink oscurece ahí sin mirar el
 * `color-scheme`; ninguna declaración de la página lo evita.
 */

test.use({
  colorScheme: 'dark',
  viewport: { width: 390, height: 844 },
  launchOptions: {
    args: ['--enable-features=WebContentsForceDark', '--blink-settings=forceDarkModeEnabled=true'],
  },
});

/** El fondo que declara la hoja y el color que de verdad quedó en pantalla, en el margen. */
async function fondoDeclaradoYPintado(page: Page): Promise<{ declarado: number[]; pintado: number[] }> {
  const declarado = await page.evaluate(() =>
    getComputedStyle(document.body)
      .backgroundColor.match(/\d+/g)!
      .slice(0, 3)
      .map(Number),
  );
  const captura = await page.screenshot({ clip: { x: 2, y: 300, width: 1, height: 1 } });
  // La captura es lo pintado; leerla con un canvas da sus bytes, sin filtro del navegador.
  const pintado = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const lienzo = document.createElement('canvas');
    lienzo.width = img.width;
    lienzo.height = img.height;
    const ctx = lienzo.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  }, captura.toString('base64'));
  return { declarado, pintado };
}

function seParecen(a: number[], b: number[]): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) <= 2);
}

test('tema claro por defecto: el navegador no lo oscurece', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  const { declarado, pintado } = await fondoDeclaradoYPintado(page);
  expect(declarado).toEqual([255, 255, 255]);
  expect(seParecen(pintado, declarado), `pintado ${pintado}, declarado ${declarado}`).toBe(true);
  // Los controles del formulario, también claros.
  expect(await page.locator('input').first().evaluate((el) => getComputedStyle(el).colorScheme)).toBe(
    'light only',
  );
});

for (const tema of ['dark', 'system']) {
  test(`tema «${tema}»: se ve el oscuro del sitio, no uno invertido`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('theme', t), tema);
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    const { declarado, pintado } = await fondoDeclaradoYPintado(page);
    expect(declarado).not.toEqual([255, 255, 255]);
    expect(seParecen(pintado, declarado), `pintado ${pintado}, declarado ${declarado}`).toBe(true);
    expect(await page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme)).toBe('dark');
  });
}
