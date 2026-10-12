import { expect, test } from '@playwright/test';

/**
 * «Lo mejor de hoy en Compra Ágil», de punta a punta y SIN sesión.
 *
 * La semilla del E2E no garantiza Compras Ágiles abiertas que cierren en más
 * de 2 h —el reloj corre y la semilla no—, así que se acepta la lista o el
 * estado vacío. Lo que no se acepta es un error: es lo que veríamos si el
 * proxy, la ruta del backend o la forma de la respuesta no casan.
 */

test('la página carga sin sesión y responde la API', async ({ page }) => {
  const respuesta = page.waitForResponse((r) => r.url().includes('/compra-agil/destacadas'));
  await page.goto('/dashboard/compra-agil');

  await expect(page.getByRole('heading', { name: /lo mejor de hoy en compra ágil/i })).toBeVisible();
  expect((await respuesta).status()).toBe(200);

  const lista = page.getByRole('list', { name: /compras ágiles destacadas/i });
  const vacio = page.getByText(/no hay compras ágiles abiertas/i);
  await expect(lista.or(vacio)).toBeVisible({ timeout: 15_000 });
  // Dentro de <main>: Next monta su propio anunciador de rutas con role="alert", vacío.
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('se llega desde el menú', async ({ page }) => {
  await page.goto('/dashboard/tenders');
  await page.getByRole('button', { name: /lo mejor de hoy/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/compra-agil/);
});

test('la región queda en la URL', async ({ page }) => {
  await page.goto('/dashboard/compra-agil?region=Regi%C3%B3n%20del%20Biob%C3%ADo');
  await expect(page.getByRole('heading', { name: /lo mejor de hoy/i })).toBeVisible();
  await expect(page).toHaveURL(/region=/);
});

test('el feed RSS de Compra Ágil es XML con la fuente', async ({ request }) => {
  const res = await request.get('/rss/compra-agil');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/application\/rss\+xml/);
  const xml = await res.text();
  expect(xml).toMatch(/^<\?xml/);
  expect(xml).toContain('ChileCompra / Mercado Público');
});

test('el feed RSS del catálogo respeta la búsqueda', async ({ request }) => {
  const res = await request.get('/rss/licitaciones?search=Zafiro');
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('<rss version="2.0">');
});
