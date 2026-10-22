import { expect, test } from '@playwright/test';

/**
 * `/abierto` y `/apoyar#costos`, de punta a punta y SIN sesión, sobre el build
 * de producción. Lo que sólo se ve aquí: que el navegador no pide NADA fuera
 * del sitio (ni un badge, ni una fuente, ni un script), y que se llega desde
 * la cabecera (en lo público y en el panel) y el pie.
 *
 * **Alcance:** la comprobación de «nada de terceros» cubre SÓLO `/abierto`. No es
 * una garantía de todo el sitio: otra página puede pedir un recurso ajeno sin
 * que este test lo vea.
 */

test('/abierto: las cinco secciones, la URL del MCP con barra y nada de terceros', async ({ page, baseURL }) => {
  const origen = new URL(baseURL as string).origin;
  const ajenas: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.protocol.startsWith('http') && url.origin !== origen) ajenas.push(r.url());
  });

  const respuesta = await page.goto('/abierto');
  expect(respuesta?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  for (const ancla of ['api', 'mcp', 'datos', 'codigo', 'licencias']) {
    await expect(page.locator(`section#${ancla}`)).toHaveCount(1);
  }
  await expect(page.getByRole('group', { name: 'URL del servidor MCP' })).toHaveText('https://api.tordo.cl/mcp/');
  await expect(page.locator('a[href^="cursor://"]')).toHaveCount(1);
  // El E2E construye sin REPOSITORIO_URL: el estado de un despliegue con el repo privado.
  await expect(page.locator('section#codigo').getByText(/todavía no está publicado/i)).toBeVisible();

  await page.waitForLoadState('networkidle');
  expect(ajenas).toEqual([]);
});

test('se llega desde la cabecera, en lo público y en el panel', async ({ page }) => {
  for (const desde of ['/guias', '/licitaciones']) {
    await page.goto(desde);
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'API y MCP' }).click();
    await expect(page).toHaveURL(/\/abierto$/);
  }
});

test('el pie lleva al costo desglosado', async ({ page }) => {
  await page.goto('/abierto');
  await page.getByRole('link', { name: 'Cuánto cuesta' }).click();
  await expect(page).toHaveURL(/\/apoyar#costos$/);
  await expect(page.locator('section#costos').getByRole('table')).toBeVisible();
});
