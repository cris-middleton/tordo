import { expect, test } from '@playwright/test';

/**
 * /mercado con la API caída (spec del rediseño §8.2): el 502 del borde de
 * Railway se simula en el navegador. La pantalla tiene que decirlo pronto —sin
 * spinner— y recuperarse al reintentar cuando la API vuelve.
 */
test('un 502 en /bi/rubros se explica y se recupera al reintentar', async ({ page }) => {
  let fallar = true;
  await page.route('**/api/proxy/api/v1/bi/rubros**', async (ruta) => {
    if (!fallar) return ruta.continue();
    return ruta.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'error', code: 502, message: 'Application failed to respond' }),
    });
  });

  const inicio = Date.now();
  await page.goto('/mercado');
  await expect(page.getByText(/no pudimos cargar los rubros/i)).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - inicio).toBeLessThan(10_000);
  await expect(page.locator('main .animate-spin')).toHaveCount(0);

  fallar = false;
  await page.getByRole('button', { name: /reintentar/i }).click();
  await expect(page.getByText(/no pudimos cargar los rubros/i)).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: /inteligencia de mercado/i })).toBeVisible();
});
