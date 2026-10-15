import { expect, test } from '@playwright/test';

import { TERMINO } from './datos';

/**
 * `/buscar?q=` de punta a punta (spec del rediseño §6.4), con el backend real,
 * la base sembrada (`sembrar_e2e.py`) y el fixture de productos sintéticos.
 *
 * - «guante»: un producto con banda y compradores (`guante nitrilo prueba`) y
 *   una Compra Ágil (`E2E-2002-COT26`), sin licitaciones;
 * - «Zafiro»: dos licitaciones abiertas y una cerrada que no debe salir; el
 *   enlace lleva al catálogo con el mismo filtro y el mismo total;
 * - algo que no existe: «no encontramos nada» y los ejemplos.
 *
 * Las URL esperadas van escritas: Playwright no resuelve el alias `@/` y no
 * puede importar `lib/filtrosCatalogo.ts`.
 */

const URL_CATALOGO_ZAFIRO = `/licitaciones?search=${TERMINO}&tipo_convocatoria=licitacion%2Cconvenio_marco%2Ctrato_directo&abiertas=1`;

test('sin término: el formulario y los ejemplos, y nada se indexa', async ({ page }) => {
  const respuesta = await page.goto('/buscar');
  expect(respuesta?.status()).toBe(200);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: '¿Qué le vendes al Estado?' })).toBeVisible();
  await expect(main.getByRole('searchbox', { name: /qué le vendes al estado/i })).toHaveValue('');
  await expect(main.getByRole('link', { name: 'guantes de nitrilo' })).toHaveAttribute(
    'href',
    '/buscar?q=guantes+de+nitrilo',
  );
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
});

test('con menos de tres letras lo dice y no pinta bloques', async ({ page }) => {
  await page.goto('/buscar?q=ab');
  const main = page.getByRole('main');
  await expect(main.getByText('Escribe al menos tres letras.')).toBeVisible();
  await expect(main.getByRole('heading', { level: 2 })).toHaveCount(0);
});

test('un producto: su banda, quién lo compra y la Compra Ágil que coincide', async ({ page }) => {
  await page.goto('/buscar?q=guante');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'Resultados para «guante»' })).toBeVisible();
  await expect(main.getByRole('searchbox')).toHaveValue('guante');

  const precios = main.locator('#precios');
  await expect(precios.getByRole('link', { name: 'Guante nitrilo prueba' })).toHaveAttribute(
    'href',
    '/productos/guante-nitrilo-prueba',
  );
  await expect(precios.getByRole('heading', { name: 'Por caja' })).toBeVisible();
  await expect(precios.getByRole('link', { name: /ver todos los productos/i })).toHaveAttribute(
    'href',
    '/productos?q=guante',
  );

  const abiertas = main.locator('#abiertas');
  await expect(abiertas.getByText(/ninguna licitación abierta coincide/i)).toBeVisible();
  await expect(abiertas.locator('a[href="/licitaciones/E2E-2002-COT26"]').first()).toBeVisible();
  await expect(abiertas.getByRole('link', { name: /^ver todas en «/i })).toHaveAttribute(
    'href',
    '/compra-agil?search=guante',
  );

  const compradores = main.locator('#compradores');
  await expect(compradores.getByRole('link', { name: /organismo de prueba a/i })).toHaveAttribute(
    'href',
    '/compradores/111875',
  );
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
});

test('«ver todas» de Compra Ágil abre la lista con la búsqueda puesta', async ({ page }) => {
  await page.goto('/buscar?q=guante');
  await page.getByRole('main').locator('#abiertas').getByRole('link', { name: /^ver todas en «/i }).click();
  await expect(page).toHaveURL(/\/compra-agil\?search=guante$/);
  await expect(page.locator('a[href="/licitaciones/E2E-2002-COT26"]').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('a[href="/licitaciones/E2E-2001-COT26"]')).toHaveCount(0);
});

test('licitaciones abiertas: el total es el del catálogo al que lleva su enlace', async ({ page }) => {
  await page.goto(`/buscar?q=${TERMINO}`);
  const abiertas = page.getByRole('main').locator('#abiertas');
  await expect(abiertas.locator('a[href="/licitaciones/E2E-1001-LR24"]').first()).toBeVisible();
  await expect(abiertas.locator('a[href="/licitaciones/E2E-1002-LP24"]').first()).toBeVisible();
  // La cerrada (`E2E-1003-LE23`) no puede colarse en «abiertas».
  await expect(abiertas.locator('a[href="/licitaciones/E2E-1003-LE23"]')).toHaveCount(0);
  await expect(abiertas.getByText(/2 abiertas coinciden/)).toBeVisible();

  const verTodas = abiertas.getByRole('link', { name: 'Ver las 2 en el catálogo' });
  await expect(verTodas).toHaveAttribute('href', URL_CATALOGO_ZAFIRO);
  await verTodas.click();
  await expect(page).toHaveURL(/\/licitaciones\?.*abiertas=1/);
  await expect(page.locator('a[href="/licitaciones/E2E-1001-LR24"]').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('a[href="/licitaciones/E2E-1002-LP24"]').first()).toBeVisible();
});

test('sin resultados en ninguno: lo dice, y un ejemplo lleva a su búsqueda con el campo al día', async ({ page }) => {
  await page.goto('/buscar?q=xqzwvk');
  const main = page.getByRole('main');
  await expect(main.getByText(/no encontramos nada para «xqzwvk»/i)).toBeVisible();
  const ejemplo = main.getByRole('link', { name: 'tóner' });
  await expect(ejemplo).toHaveAttribute('href', '/buscar?q=t%C3%B3ner');
  await ejemplo.click();
  await expect(page).toHaveURL(/\/buscar\?q=t%C3%B3ner$/);
  // Navegación de cliente: sin la `key` del campo se quedaría con «xqzwvk».
  await expect(main.getByRole('searchbox')).toHaveValue('tóner');
});

test('el formulario busca con un GET a /buscar', async ({ page }) => {
  await page.goto('/buscar');
  const main = page.getByRole('main');
  await main.getByRole('searchbox').fill('resma');
  await main.getByRole('button', { name: 'Buscar' }).click();
  await expect(page).toHaveURL(/\/buscar\?q=resma$/);
  await expect(main.locator('#precios').getByRole('link', { name: /resma papel prueba/i })).toBeVisible();
});

test('en móvil, la búsqueda queda en la primera pantalla y nada se sale por la derecha', async ({ page }) => {
  const MOVIL = { width: 390, height: 844 };
  await page.setViewportSize(MOVIL);
  await page.goto('/buscar?q=guante');
  const caja = await page.getByRole('main').getByRole('searchbox').boundingBox();
  expect(caja, 'no hay campo de búsqueda').not.toBeNull();
  expect(caja!.y + caja!.height).toBeLessThanOrEqual(MOVIL.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOVIL.width);
});
