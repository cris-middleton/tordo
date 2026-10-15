import { expect, test, type Page } from '@playwright/test';

import { CODIGO_ADJUDICADA, CODIGO_VALVULAS, TERMINO } from './datos';

/**
 * El bucle central del producto: buscar una licitación y abrirla.
 *
 * Recorre las tres capas de una vez —proxy de Next, backend, búsqueda de
 * Postgres— que es justo lo que ningún test unitario cubre. Y lo hace SIN
 * iniciar sesión: desde el pivote a sitio público el catálogo es de todos. Ya encontró dos
 * fallos que sólo se ven así: el proxy entraba en bucle de redirecciones con
 * cualquier ruta terminada en `/`, y `sort_by=relevance` sin modelo TF-IDF
 * ignoraba el término y devolvía el catálogo entero.
 */

/**
 * El código externo NO se pinta como texto: sólo vive en el enlace. Localizar
 * por `href` es además más estable que por el nombre, que la hoja de estilos
 * muestra con cada palabra en mayúscula inicial.
 */
function tarjeta(page: Page, codigo: string) {
  return page.locator(`a[href="/licitaciones/${codigo}"]`).first();
}

async function buscar(page: Page, termino: string) {
  await page.goto('/licitaciones');
  const buscador = page.getByPlaceholder(/Nombre, organismo o descripción/i);
  await buscador.fill(termino);
  await buscador.press('Enter');
}

test('buscar sin tildes encuentra lo que sí las lleva', async ({ page }) => {
  // "valvulas" sin tilde: en Chile se escribe así la mayoría de las veces, así
  // que este es el caso NORMAL, no el raro. La licitación sembrada dice
  // "válvulas".
  await buscar(page, 'valvulas');

  await expect(tarjeta(page, CODIGO_VALVULAS)).toBeVisible({ timeout: 15_000 });
});

test('el término filtra, no sólo ordena', async ({ page }) => {
  await buscar(page, TERMINO);

  await expect(tarjeta(page, CODIGO_VALVULAS)).toBeVisible({ timeout: 15_000 });
  // La adjudicada no menciona el término. Aparecía igualmente: el frontend pasa
  // a `sort_by=relevance` al escribir, y por esa rama el término se perdía.
  await expect(tarjeta(page, CODIGO_ADJUDICADA)).toBeHidden();
});

test('abrir el detalle desde el listado', async ({ page }) => {
  await buscar(page, TERMINO);
  await tarjeta(page, CODIGO_VALVULAS).click();

  await expect(page.getByRole('heading', { name: /detalle licitación/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/válvulas/i).first()).toBeVisible({ timeout: 15_000 });
});

test('un término sin resultados no rompe la pantalla', async ({ page }) => {
  await buscar(page, 'xyzzyqwerty-no-existe');

  // El fallo típico aquí es una pantalla en blanco por un `.map()` sobre
  // undefined, así que se comprueba que el buscador sigue en pie.
  await expect(page.getByText(/0 resultados/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByPlaceholder(/Nombre, organismo o descripción/i)).toBeVisible();
});

test('la búsqueda queda en la URL y sobrevive a recargar', async ({ page }) => {
  await buscar(page, TERMINO);
  await expect(page).toHaveURL(new RegExp(`search=${TERMINO}`));
  await expect(tarjeta(page, CODIGO_VALVULAS)).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(tarjeta(page, CODIGO_VALVULAS)).toBeVisible({ timeout: 15_000 });
  await expect(tarjeta(page, CODIGO_ADJUDICADA)).toBeHidden();
});

test('abiertas=1 llega al backend por el proxy y deja fuera lo cerrado', async ({ page }) => {
  // Unitarios: la pantalla lo PIDE. Aquí: que el booleano sobrevive al proxy y
  // a FastAPI, y que filtra de verdad.
  await page.goto('/licitaciones?abiertas=1');

  await expect(page.getByRole('checkbox', { name: /se pueden postular ahora/i })).toBeChecked();
  await expect(tarjeta(page, CODIGO_VALVULAS)).toBeVisible({ timeout: 15_000 });
  await expect(tarjeta(page, CODIGO_ADJUDICADA)).toBeHidden();
});
