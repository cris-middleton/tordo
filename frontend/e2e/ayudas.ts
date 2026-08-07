import type { Page } from '@playwright/test';

import { CONTRASENA, USUARIO } from './datos';

/**
 * Entra por el formulario de verdad, no inyectando cookies.
 *
 * Inyectarlas sería más rápido, pero entonces ningún test tocaría el camino que
 * las emite — y ese camino es el que cambia cuando se toca la autenticación.
 */
export async function entrar(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(USUARIO);
  await page.getByLabel('Contraseña').fill(CONTRASENA);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await page.waitForURL(/\/dashboard/);
}
