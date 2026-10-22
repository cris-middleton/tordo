import { expect, test } from '@playwright/test';

/**
 * Las notas de datos, de punta a punta: el índice, una nota entera, el feed y que
 * se llega desde la cabecera. Son estáticas —se generan en el build y el feed lee
 * del disco—, así que no dependen del backend. A 390 px ninguna desborda.
 */

const NOTA = '/notas/precio-unitario-dividido-dos-veces';
const MOVIL = { width: 390, height: 844 };

test('el índice enlaza las notas, con su feed', async ({ page }) => {
  const respuesta = await page.goto('/notas');
  expect(respuesta?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notas de datos');
  await expect(page.locator('main a[href^="/notas/"]')).not.toHaveCount(0);
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute(
    'href',
    /\/rss\/notas$/,
  );
});

test('una nota, con fecha, estado, fuentes, el cambio, canonical y atribución', async ({ page }) => {
  const respuesta = await page.goto(NOTA);
  expect(respuesta?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dividíamos dos veces el precio por unidad');
  await expect(page.getByText(/^Nota de datos del 16 de octubre de 2026\./)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fuentes' })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${NOTA}$`));
  await expect(page.getByText(/^Fuente: Dirección de Compras y Contratación Pública/)).toBeVisible();
});

// Los datos de la nota, el gráfico y el cambio están dos veces en el HTML: bajo el
// título (bajo `lg`) y en el costado (desde `lg`). En cada ancho se ve una sola.
test('desde lg, el costado: el antes y el después, el índice y los datos, fijo al bajar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(NOTA);
  const costado = page.getByRole('complementary', { name: 'Sobre esta nota' });
  await expect(costado).toBeVisible();
  await expect(costado.getByText('Arreglado', { exact: true })).toBeVisible();
  await expect(costado.getByRole('link', { name: 'Pull request #10' })).toHaveAttribute(
    'href',
    'https://github.com/cris-middleton/tordo/pull/10',
  );
  await expect(page.getByRole('link', { name: 'El cambio' })).toHaveCount(0);
  await expect(page.locator('main figure:visible')).toHaveCount(1);
  // El gráfico se ve sin bajar.
  expect((await costado.locator('figure').boundingBox())!.y).toBeLessThan(900);

  // El índice lleva a su título (el desplazamiento es suave: se espera a que llegue),
  // y el costado sigue arriba, a 32 px del borde.
  await costado.getByRole('link', { name: 'Cómo lo medimos' }).click();
  await expect(page).toHaveURL(/#como-lo-medimos$/);
  await expect
    .poll(async () => (await page.getByRole('heading', { name: 'Cómo lo medimos' }).boundingBox())!.y)
    .toBeLessThan(60);
  await expect.poll(async () => Math.round((await costado.boundingBox())!.y)).toBe(32);
});

test('bajo lg, sin costado: los datos bajo el título y el cambio al final', async ({ page }) => {
  await page.setViewportSize(MOVIL);
  await page.goto(NOTA);
  await expect(page.getByRole('complementary', { name: 'Sobre esta nota' })).toBeHidden();
  await expect(page.getByText('Arreglado', { exact: true }).locator('visible=true')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'El cambio' })).toHaveAttribute(
    'href',
    'https://github.com/cris-middleton/tordo/pull/10',
  );
  await expect(page.locator('main figure:visible')).toHaveCount(1);
});

test('se llega desde la cabecera y un slug desconocido es 404', async ({ page }) => {
  await page.goto('/guias');
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Notas' }).click();
  await expect(page).toHaveURL(/\/notas$/);

  const respuesta = await page.goto('/notas/no-existe-e2e');
  expect(respuesta?.status()).toBe(404);
});

test('el feed es RSS y el sitemap incluye las notas', async ({ request }) => {
  const feed = await request.get('/rss/notas');
  expect(feed.status()).toBe(200);
  expect(feed.headers()['content-type']).toMatch(/application\/rss\+xml/);
  expect(await feed.text()).toContain(`${NOTA}</link>`);

  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).toMatch(/\/notas<\/loc>/);
  expect(xml).toContain(`${NOTA}</loc>`);
});

for (const ruta of ['/notas', NOTA]) {
  test(`${ruta} a 390 px no desborda`, async ({ page }) => {
    await page.setViewportSize(MOVIL);
    await page.goto(ruta);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOVIL.width);
  });
}
