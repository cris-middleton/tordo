import { expect, test } from '@playwright/test';

/**
 * La portada, de punta a punta y SIN sesión.
 *
 * El bloque «Lo mejor de hoy» sale del servidor con ISR. El E2E construye sin
 * backend —la portada nace sin el bloque— y la regenera a la media hora, así
 * que aquí se aceptan los dos estados: con el bloque o sin él. **Si está, trae
 * la lista**: la semilla deja tres Compras Ágiles abiertas, y «no hay abiertas»
 * sería un fallo. Lo que no se acepta es que la portada caiga o quede a medias:
 * es el caso «sin destacadas» (backend caído), que el test unitario fija con
 * detalle (`__tests__/portada.test.tsx`).
 */

test('responde qué es y qué hacer, sin cuenta', async ({ page }) => {
  const respuesta = await page.goto('/');
  expect(respuesta?.status()).toBe(200);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/gratis y sin cuenta/i);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /^lo mejor de hoy en compra ágil$/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /buscar precios/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /qué hay en el sitio/i })).toBeVisible();
  await expect(page.getByText(/^Fuente: Dirección de Compras y Contratación Pública/)).toBeVisible();

  // Con o sin bloque (ISR); si está, con la lista de lo sembrado.
  const bloque = page.locator('#hoy');
  if (await bloque.count()) {
    await expect(bloque.getByRole('list', { name: /compras ágiles destacadas de hoy/i })).toBeVisible();
  }

  // Nada de lo que se fue con las cuentas.
  await expect(page.getByText(/prueba gratis|inicia sesión|informe semanal|alertas/i)).toHaveCount(0);
});

test('metadatos y tarjeta de preview', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/gratis y sin cuenta/i);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
});

test('de la portada al catálogo y a donar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /^licitaciones/i }).first().click();
  await expect(page).toHaveURL(/\/licitaciones/);

  await page.goto('/');
  await page.getByRole('link', { name: /apoyar el sitio/i }).first().click();
  await expect(page).toHaveURL(/\/apoyar$/);
});
