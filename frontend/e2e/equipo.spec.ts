import { expect, test } from '@playwright/test';

import { entrar } from './ayudas';
import { COLEGA, EMPRESA } from './datos';

/**
 * Invitar a alguien al equipo, con el contador de asientos.
 *
 * Es el flujo donde el frontend y las cuotas del backend se tocan, y donde un
 * fallo cuesta dinero directamente: si el contador miente o el 402 no se ve, o
 * se regalan asientos o se bloquea a quien sí puede sumarlos.
 */

test('el equipo muestra los asientos del plan y deja invitar', async ({ page }) => {
  await entrar(page);
  await page.goto('/dashboard/empresa');

  await expect(page.getByRole('heading', { name: EMPRESA })).toBeVisible({ timeout: 15_000 });

  // La empresa sembrada es `pyme`: 3 asientos, 1 ocupado por la owner. El texto
  // sale del backend, no de una constante del frontend — que es justamente lo
  // que este test protege.
  const asientos = page.getByText(/de 3\s+asientos/i);
  await expect(asientos).toBeVisible();
  await expect(page.getByText(/plan PYME/i)).toBeVisible();

  await page.getByLabel('Email del usuario').fill(COLEGA);
  await page.getByRole('button', { name: /añadir miembro/i }).click();

  await expect(page.getByText(new RegExp(`${COLEGA}.*añadido`, 'i'))).toBeVisible({
    timeout: 15_000,
  });

  // Y el contador se movió. Es la mitad que se olvida: sin invalidar la consulta
  // del plan, la fila nueva aparece al lado de un "1 de 3" congelado.
  await expect(page.getByText(/2 de 3\s+asientos/i)).toBeVisible({ timeout: 15_000 });
});

test('las claves de API se emiten y el secreto se muestra una sola vez', async ({ page }) => {
  await entrar(page);
  await page.goto('/dashboard/empresa');

  await expect(page.getByRole('heading', { name: /claves de api/i })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByPlaceholder(/Nombre de la clave/i).fill('Clave E2E');
  await page.getByRole('button', { name: /^emitir$/i }).click();

  await expect(page.getByText(/copia la clave ahora/i)).toBeVisible({ timeout: 15_000 });
  // El secreto entero, con su prefijo. Es la única respuesta que lo trae.
  await expect(page.getByText(/^tordo_/)).toBeVisible();

  await page.getByRole('button', { name: /ya la guardé/i }).click();
  await expect(page.getByText(/copia la clave ahora/i)).toBeHidden();

  // Recargar no lo devuelve: la base guarda un hash.
  await page.reload();
  await expect(page.getByText('Clave E2E')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^tordo_[a-z0-9]{6,}_/)).toBeHidden();
});
