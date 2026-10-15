import { expect, test } from '@playwright/test';

/**
 * `/apoyar`, de punta a punta y SIN sesión. El E2E construye sin las variables
 * `DONAR_*`, así que lo que se comprueba es el estado de un despliegue recién
 * hecho: la página existe, lo dice, y no ofrece botones muertos.
 */

test('sin medios configurados, lo dice', async ({ page }) => {
  const respuesta = await page.goto('/apoyar');
  expect(respuesta?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/todavía no hay medios de aporte habilitados/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /ver datos para transferir/i })).toHaveCount(0);
  await expect(page.getByText(/^Fuente: Dirección de Compras y Contratación Pública/)).toBeVisible();
});

test('la ruta de la transferencia no se cachea ni se indexa', async ({ request }) => {
  const r = await request.get('/api/apoyar/transferencia');
  expect(r.status()).toBe(404);
  expect(r.headers()['cache-control']).toMatch(/no-store/);
  expect(r.headers()['x-robots-tag']).toMatch(/noindex/);
});

test('se llega desde la cabecera, también en el panel', async ({ page }) => {
  await page.goto('/licitaciones');
  await page.getByRole('banner').getByRole('link', { name: /^apoyar$/i }).click();
  await expect(page).toHaveURL(/\/apoyar$/);
});
