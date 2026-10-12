import { expect, test } from '@playwright/test';

/**
 * «Lo mejor de hoy en Compra Ágil», de punta a punta y SIN sesión.
 *
 * La semilla (`backend/scripts/sembrar_e2e.py`) deja tres Compras Ágiles
 * abiertas que cierran en dos días y las re-fecha en cada corrida, así que la
 * lista tiene que estar: el estado vacío aquí sería un fallo que antes se daba
 * por bueno. El vacío se prueba aparte, con una búsqueda que no casa con nada.
 */

const CODIGOS_SEMBRADOS = ['E2E-2001-COT26', 'E2E-2002-COT26', 'E2E-2003-COT26'];

test('la página carga sin sesión y lista las abiertas', async ({ page }) => {
  const respuesta = page.waitForResponse((r) => r.url().includes('/compra-agil/destacadas'));
  await page.goto('/compra-agil');

  await expect(page.getByRole('heading', { name: /lo mejor de hoy en compra ágil/i })).toBeVisible();
  expect((await respuesta).status()).toBe(200);

  const lista = page.getByRole('list', { name: /compras ágiles destacadas/i });
  await expect(lista).toBeVisible({ timeout: 15_000 });
  // `:scope > li`: cada tarjeta lleva su propia lista de datos dentro.
  await expect(lista.locator(':scope > li')).toHaveCount(CODIGOS_SEMBRADOS.length);
  for (const codigo of CODIGOS_SEMBRADOS) {
    await expect(lista.locator(`a[href="/licitaciones/${codigo}"]`).first()).toBeVisible();
  }
  // Dentro de <main>: Next monta su propio anunciador de rutas con role="alert", vacío.
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('una búsqueda sin coincidencias muestra el estado vacío', async ({ page }) => {
  await page.goto('/compra-agil?search=xyzzyqwerty-no-existe');
  await expect(page.getByText(/no hay compras ágiles abiertas con estos filtros/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('list', { name: /compras ágiles destacadas/i })).toHaveCount(0);
});

test('se llega desde el menú', async ({ page }) => {
  await page.goto('/licitaciones');
  await page.getByRole('button', { name: /lo mejor de hoy/i }).click();
  await expect(page).toHaveURL(/\/compra-agil/);
});

test('la región queda en la URL', async ({ page }) => {
  await page.goto('/compra-agil?region=Regi%C3%B3n%20del%20Biob%C3%ADo');
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
