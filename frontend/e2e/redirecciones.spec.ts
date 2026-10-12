import { expect, test } from '@playwright/test';

import { CODIGO_VALVULAS } from './datos';

/**
 * Las URL viejas del panel (`/dashboard/*`) siguen funcionando: ya circulan en
 * lectores de RSS, marcadores y enlaces compartidos. Redirigen con 308 a la
 * pública y **conservan la query**, porque una búsqueda del catálogo es su URL.
 *
 * La tabla la fija `__tests__/redirecciones-panel.test.ts`; aquí se comprueba
 * que el servidor de verdad la aplica.
 */

test('una URL vieja con filtros responde 308 hacia la nueva, query incluida', async ({
  request,
}) => {
  const r = await request.get('/dashboard/tenders?search=Zafiro&region=Regi%C3%B3n%20del%20Biob%C3%ADo', {
    maxRedirects: 0,
  });
  expect(r.status()).toBe(308);
  const destino = new URL(r.headers()['location'], 'http://x');
  expect(destino.pathname).toBe('/licitaciones');
  expect(destino.searchParams.get('search')).toBe('Zafiro');
  expect(destino.searchParams.get('region')).toBe('Región del Biobío');
});

test('el navegador aterriza en la pantalla nueva con los filtros', async ({ page }) => {
  await page.goto('/dashboard/compra-agil?search=xyzzyqwerty-no-existe');
  await expect(page).toHaveURL(/\/compra-agil\?.*search=xyzzyqwerty-no-existe/);
  // El filtro llegó a la pantalla, no sólo a la barra de direcciones.
  await expect(page.getByText(/no hay compras ágiles abiertas con estos filtros/i)).toBeVisible({
    timeout: 15_000,
  });
});

test('el detalle viejo de una licitación lleva al nuevo', async ({ page }) => {
  await page.goto(`/dashboard/tenders/${CODIGO_VALVULAS}`);
  await expect(page).toHaveURL(new RegExp(`/licitaciones/${CODIGO_VALVULAS}$`));
});

test('/dashboard a secas, el panel de mercado y guardados redirigen con 308', async ({ request }) => {
  for (const [viejo, nuevo] of [
    ['/dashboard', '/licitaciones'],
    ['/dashboard/bi?rubro=Equipos', '/mercado?rubro=Equipos'],
    ['/dashboard/guardados', '/guardados'],
  ]) {
    const r = await request.get(viejo, { maxRedirects: 0 });
    expect(r.status(), viejo).toBe(308);
    const destino = new URL(r.headers()['location'], 'http://x');
    expect(destino.pathname + destino.search, viejo).toBe(nuevo);
  }
});
