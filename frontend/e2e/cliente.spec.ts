import { expect, test } from '@playwright/test';

import { entrar } from './ayudas';
import { CODIGO_VALVULAS } from './datos';

/**
 * El recorrido de un cliente, de punta a punta.
 *
 * Nació de recorrer el producto como lo haría una PYME y encontrar, en una
 * tarde, fallos que ninguna otra capa veía — todos compilaban y pasaban el
 * lint:
 *
 * - subir un documento devolvía 500 a todo el mundo;
 * - quien estaba en los 14 días de prueba (o pagaba Pro) veía «Plan Free» y
 *   candados;
 * - la primera tarea de toda empresa nueva era «Estado desconocido — revisa
 *   deudas en Tesorería».
 *
 * La suite de E2E sólo cubría sesión, equipo y búsqueda. Esto cubre lo que
 * hace un cliente el primer día.
 */

/** Un RUT válido (con su dígito verificador) que ningún otro test usa. */
function rutNuevo(): string {
  const cuerpo = 70_000_000 + Math.floor(Math.random() * 9_000_000);
  let suma = 0;
  let factor = 2;
  for (const d of String(cuerpo).split('').reverse()) {
    suma += Number(d) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return `${cuerpo}-${dv}`;
}

test('un cliente nuevo se registra, arma su empresa y queda en la prueba Pro', async ({ page }) => {
  const sufijo = Date.now().toString().slice(-7);
  const correo = `cliente${sufijo}@tordo-pruebas.cl`;
  const clave = 'ClaveDePrueba2026!';

  await page.goto('/register');
  await page.locator('#username').fill(`cliente${sufijo}`);
  await page.locator('#email').fill(correo);
  await page.locator('#password').fill(clave);
  await page.locator('#confirmPassword').fill(clave);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/login/);

  // Con el CORREO, no con el usuario: es lo que la gente escribe.
  await page.getByLabel('Usuario').fill(correo);
  await page.getByLabel('Contraseña').fill(clave);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await page.waitForURL(/\/onboarding/);

  await page.locator('#rut').fill(rutNuevo());
  await page.locator('#nombre').fill(`Pruebas ${sufijo} SpA`);
  await page.getByRole('button', { name: /continuar/i }).click();
  await expect(page.getByText('¿Qué vendes?')).toBeVisible({ timeout: 15_000 });

  await page.locator('textarea').fill('artículos de aseo, detergentes industriales');
  await page.getByRole('button', { name: /empezar a buscar/i }).click();
  await page.getByRole('button', { name: /ir a mi panel/i }).click();
  await page.waitForURL(/\/dashboard$/);

  // El plan sale de la EMPRESA y es el efectivo: en la prueba, Pro. Leía
  // `user.plan_tier`, que `/auth/me` ya no trae, y decía «Plan Free».
  await expect(page.getByText(/prueba pro/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/plan free/i)).toHaveCount(0);

  // «Todavía no lo sabemos» no es una alarma.
  await expect(page.getByText(/tesorer/i)).toHaveCount(0);
  await expect(page.getByText(/estado desconocido/i)).toHaveCount(0);
});

test('subir un documento lo deja en la lista', async ({ page }) => {
  await entrar(page);
  await page.goto('/dashboard/documentos');

  await page.getByRole('button', { name: /subir documento/i }).first().click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'certificado-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'),
  });
  await page.getByRole('button', { name: /^subir$/i }).click();

  // Daba 500 a todo el mundo: la cuota se medía sobre el usuario.
  await expect(page.getByText(/error interno/i)).toHaveCount(0);
  await expect(page.getByText('certificado-e2e.pdf')).toBeVisible({ timeout: 15_000 });
});

test('iniciar una postulación desde la ficha la lleva al tablero', async ({ page }) => {
  await entrar(page);
  await page.goto(`/dashboard/tenders/${CODIGO_VALVULAS}`);

  await page.getByRole('button', { name: /iniciar postulación/i }).click();
  await page.waitForURL(/\/dashboard\/postulaciones/);

  await expect(page.getByText(CODIGO_VALVULAS)).toBeVisible({ timeout: 15_000 });
});
