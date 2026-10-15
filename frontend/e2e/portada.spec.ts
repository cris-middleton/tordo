import { expect, test, type Page } from '@playwright/test';

/**
 * La portada nueva (spec del rediseño §6.3) y `/acerca`, de punta a punta y
 * SIN sesión.
 *
 * Lo vivo —la tira de cifras y «Lo mejor de hoy»— sale del servidor con ISR. El
 * E2E construye sin backend, así que la portada nace sin esos bloques y se
 * regenera a la media hora: aquí se aceptan los dos estados. Lo que no depende
 * de nada es el buscador, y eso se exige siempre: **es lo primero que se ve,
 * también a 390 px** (principio 1). El caso «backend caído» con detalle está en
 * `__tests__/portada.test.tsx`.
 *
 * Las capturas quedan en `test-results/` para mirarlas: el contraste roto en
 * oscuro es invisible en claro, que es el que se revisa por defecto.
 */

const PREGUNTA = '¿Qué le vendes al Estado?';
const MOVIL = { width: 390, height: 844 };
const ESCRITORIO = { width: 1440, height: 900 };

async function anchoDelDocumento(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

/** Qué se sale por la derecha, para que un fallo diga dónde mirar. */
async function quienSeSale(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > ancho + 1)
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').slice(0, 70)}`);
  });
}

test('lo primero es el buscador, y nada de lo que se fue', async ({ page }) => {
  const respuesta = await page.goto('/');
  expect(respuesta?.status()).toBe(200);

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(PREGUNTA);
  await expect(page.getByRole('searchbox', { name: PREGUNTA })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Ejemplos de búsqueda' }).getByRole('link')).toHaveCount(6);
  await expect(page.getByRole('heading', { level: 2, name: 'Úsalo como quieras' })).toBeVisible();
  await expect(page.getByText(/^Fuente: Dirección de Compras y Contratación Pública/)).toBeVisible();

  // Con o sin lo vivo (ISR); si está, completo.
  const bloque = page.locator('#hoy');
  if (await bloque.count()) {
    await expect(bloque.getByRole('list', { name: /compras ágiles destacadas de hoy/i })).toBeVisible();
  }
  const tira = page.getByRole('list', { name: 'Abiertas ahora' });
  if (await tira.count()) {
    await expect(tira.getByRole('link')).toHaveCount(2);
    await expect(page.getByText(/^actualizado el/)).toBeVisible();
  }

  // Nada de lo que se fue: ni cuentas, ni el hero, ni el hueco de RESPONSABLE_LEGAL.
  await expect(page.getByText(/prueba gratis|inicia sesión|informe semanal|alertas/i)).toHaveCount(0);
  await expect(page.getByText(/\[\[/)).toHaveCount(0);
  await expect(page.locator('.bg-brand-navy')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /qué hay en el sitio|preguntas frecuentes/i })).toHaveCount(0);
});

test('metadatos y tarjeta de vista previa, sin «Inteligencia»', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/gratis y sin cuenta/i);
  await expect(page).not.toHaveTitle(/inteligencia/i);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  const alt = await page.locator('meta[property="og:image:alt"]').getAttribute('content');
  expect(alt ?? '').not.toMatch(/inteligencia/i);
  const descripcion = await page.locator('meta[name="description"]').getAttribute('content');
  expect(descripcion ?? '').not.toMatch(/inteligencia/i);
});

test('buscar desde la portada abre /buscar con el término', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: PREGUNTA }).fill('guantes de nitrilo');
  await page.getByRole('search').getByRole('button', { name: 'Buscar' }).click();
  await expect(page).toHaveURL(/\/buscar\?q=guantes\+de\+nitrilo$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('un ejemplo abre su búsqueda', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('list', { name: 'Ejemplos de búsqueda' }).getByRole('link', { name: 'tóner' }).click();
  await expect(page).toHaveURL(/\/buscar\?q=t%C3%B3ner$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('a 390 px el buscador y su botón quedan en la primera pantalla, sin desbordes', async ({ page }) => {
  await page.setViewportSize(MOVIL);
  await page.goto('/');
  for (const control of [
    page.getByRole('searchbox', { name: PREGUNTA }),
    page.getByRole('search').getByRole('button', { name: 'Buscar' }),
  ]) {
    await expect(control).toBeVisible();
    const caja = await control.boundingBox();
    expect(caja, 'sin caja: ¿no se pintó?').not.toBeNull();
    expect(caja!.y + caja!.height, 'queda bajo el pliegue').toBeLessThanOrEqual(MOVIL.height);
  }
  expect(await anchoDelDocumento(page), (await quienSeSale(page)).join('\n')).toBeLessThanOrEqual(MOVIL.width);
});

test('lo abierto lleva a /abierto, y el pie a /acerca', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('main').getByRole('link', { name: 'API', exact: true }).click();
  await expect(page).toHaveURL(/\/abierto#api$/);

  await page.getByRole('contentinfo').getByRole('link', { name: 'Acerca', exact: true }).click();
  await expect(page).toHaveURL(/\/acerca$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^acerca de /i);
  expect(await page.locator('#preguntas details').count()).toBeGreaterThanOrEqual(6);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/acerca$/);
});

const PANTALLAS = [
  { ruta: '/', nombre: 'portada', titulo: PREGUNTA },
  { ruta: '/acerca', nombre: 'acerca', titulo: /^acerca de /i },
];

for (const tema of ['claro', 'oscuro'] as const) {
  for (const viewport of [ESCRITORIO, MOVIL]) {
    for (const { ruta, nombre, titulo } of PANTALLAS) {
      test(`${ruta} a ${viewport.width} px en tema ${tema}: sin desbordes, con captura`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        if (tema === 'oscuro') {
          await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
        }
        await page.goto(ruta);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(titulo);
        await page.waitForLoadState('networkidle');
        if (tema === 'oscuro') await expect(page.locator('html')).toHaveClass(/\bdark\b/);
        else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

        await page.screenshot({
          path: testInfo.outputPath(`captura-${nombre}-${tema}-${viewport.width}.png`),
          fullPage: true,
        });

        expect(await anchoDelDocumento(page), `se sale del ancho:\n${(await quienSeSale(page)).join('\n')}`).toBeLessThanOrEqual(
          viewport.width,
        );
      });
    }
  }
}
