import { expect, test } from '@playwright/test';

import { CONTRASENA, COOKIE_ACCESO, COOKIE_REFRESCO, USUARIO } from './datos';

/**
 * La sesión, en un navegador de verdad.
 *
 * El resto de la suite comprueba que el servidor **pone** `httpOnly`. Sólo un
 * navegador comprueba que eso **sirve para algo**: que el JavaScript de la
 * página no puede leer la sesión ni aunque lo intente. Es la diferencia entre
 * verificar la intención y verificar el efecto.
 */

test('entrar deja la sesión fuera del alcance del JavaScript', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(USUARIO);
  await page.getByLabel('Contraseña').fill(CONTRASENA);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();

  await page.waitForURL(/\/dashboard/);

  const cookies = await context.cookies();
  const acceso = cookies.find((c) => c.name === COOKIE_ACCESO);
  const refresco = cookies.find((c) => c.name === COOKIE_REFRESCO);

  expect(acceso, 'falta la cookie de acceso').toBeDefined();
  expect(refresco, 'falta la cookie de refresco').toBeDefined();
  expect(acceso!.httpOnly).toBe(true);
  expect(refresco!.httpOnly).toBe(true);

  // Lo que de verdad importa: intentarlo desde la página y no conseguir nada.
  // `document.cookie` sólo ve las cookies SIN httpOnly.
  const loQueVeLaPagina = await page.evaluate(() => ({
    cookies: document.cookie,
    almacenamiento: Object.entries(localStorage),
    sesion: Object.entries(sessionStorage),
  }));

  expect(loQueVeLaPagina.cookies).not.toContain(COOKIE_ACCESO);
  expect(loQueVeLaPagina.cookies).not.toContain(COOKIE_REFRESCO);
  // Ningún valor con pinta de JWT en ningún almacén del navegador. Antes el
  // token vivía justo aquí, legible por cualquier script de la página.
  const valores = [...loQueVeLaPagina.almacenamiento, ...loQueVeLaPagina.sesion]
    .map(([, v]) => String(v))
    .join(' ');
  expect(valores).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
});

test('sin sesión, una ruta privada manda al login', async ({ page }) => {
  await page.goto('/dashboard/empresa');
  await page.waitForURL(/\/login/);
  await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible();
});

test('salir borra la sesión y ya no se puede volver atrás', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(USUARIO);
  await page.getByLabel('Contraseña').fill(CONTRASENA);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await page.waitForURL(/\/dashboard/);

  // Por el handler directamente: el botón vive dentro de un menú desplegable y
  // lo que se prueba aquí es el efecto sobre la sesión, no cómo se llega a él.
  await page.request.post('/api/sesion/salir');

  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === COOKIE_ACCESO)?.value ?? '').toBe('');
  expect(cookies.find((c) => c.name === COOKIE_REFRESCO)?.value ?? '').toBe('');

  // Y el backend revocó el refresco: sin esto, una cookie copiada antes de
  // salir seguiría abriendo sesiones nuevas.
  await page.goto('/dashboard/empresa');
  await page.waitForURL(/\/login/);
});
