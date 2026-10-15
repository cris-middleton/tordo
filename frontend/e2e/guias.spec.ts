import { expect, test } from '@playwright/test';

/**
 * Las guías, de punta a punta y SIN sesión: el índice, una guía entera y que
 * sus enlaces internos lleven a algún sitio. Son estáticas —se generan en el
 * build—, así que no dependen del backend.
 */

test('el índice enlaza las guías', async ({ page }) => {
  const respuesta = await page.goto('/guias');
  expect(respuesta?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('a[href^="/guias/"]')).not.toHaveCount(0);
});

test('una guía, con fecha, fuentes, canonical y atribución', async ({ page }) => {
  const respuesta = await page.goto('/guias/como-leer-una-banda-de-precio');
  expect(respuesta?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/banda de precio/i);
  await expect(page.getByText(/actualizada el/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /fuentes/i })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/guias\/como-leer-una-banda-de-precio$/,
  );
  await expect(page.getByText(/^Fuente: Dirección de Compras y Contratación Pública/)).toBeVisible();
  // La tabla de predictibilidad se pinta como tabla, no como texto con barras.
  await expect(page.getByRole('table')).toBeVisible();
});

test('se llega desde la cabecera y un slug desconocido es 404', async ({ page }) => {
  await page.goto('/productos');
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Guías' }).click();
  await expect(page).toHaveURL(/\/guias$/);

  const respuesta = await page.goto('/guias/no-existe-e2e');
  expect(respuesta?.status()).toBe(404);
});

test('el sitemap incluye las guías', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).toMatch(/\/guias\/como-leer-una-banda-de-precio</);
});
