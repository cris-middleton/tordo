import { expect, test, type Page } from '@playwright/test';

/**
 * La portada (spec IDENTIDAD_Y_PORTADA §3 y §8) y `/acerca`, de punta a punta y
 * SIN sesión.
 *
 * Lo vivo —la tira, el panel de lecturas, la franja y «Lo mejor de hoy»— sale
 * del servidor con ISR. `scripts/e2e.sh` construye con el backend levantado y la
 * semilla puesta, así que la portada suele nacer con lo vivo (con el fixture del
 * golden, sólo la lectura de cierres: los sectores no traen ventana y el producto
 * de la portada no está); aun así se aceptan los dos estados. Lo que no depende
 * de nada es el buscador, y eso se exige siempre: **es lo primero que se ve,
 * también a 390 px** (principio 1). El detalle de cada bloque oculto está en
 * `__tests__/portada.test.tsx`.
 *
 * Las capturas quedan en `test-results/` para mirarlas: el contraste roto en
 * oscuro es invisible en claro, y el panel navy sobre el fondo oscuro se separa
 * menos que en claro (riesgo §12 de la spec).
 */

const PREGUNTA = '¿Qué le vendes al Estado?';
const ESTRECHO = { width: 320, height: 640 };
const MOVIL = { width: 390, height: 844 };
const TABLETA = { width: 1024, height: 768 };
const ESCRITORIO = { width: 1440, height: 900 };
const PANEL = 'Lo que dicen los datos';

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

/**
 * Lo que el panel recorta. Lleva `overflow-hidden` (por las esquinas), así que lo
 * que se le sale por dentro no ensancha el documento y el control de
 * `scrollWidth` de la página no lo ve: hay que mirarlo dentro. Fuera quedan los
 * `sr-only`, que miden 1 px y se salen a propósito con margen negativo.
 */
async function recorteDelPanel(page: Page) {
  return page.getByRole('region', { name: PANEL }).evaluate((panel) => {
    const caja = panel.getBoundingClientRect();
    const fuera = [...panel.querySelectorAll('*')]
      .filter((el) => !el.closest('.sr-only'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > caja.right + 1 || r.left < caja.left - 1);
      })
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').slice(0, 70)} «${(el.textContent ?? '').slice(0, 30)}»`);
    return { fuera, scroll: panel.scrollWidth, cliente: panel.clientWidth };
  });
}

/** El borde inferior de cada barra de «qué cierra pronto», en px. */
async function basesDeCierres(page: Page): Promise<number[]> {
  return page
    .getByRole('region', { name: PANEL })
    .locator('article[aria-labelledby="lectura-cierres"] li [style]')
    .evaluateAll((barras) => barras.map((b) => b.getBoundingClientRect().bottom));
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
    // La hora vive en la franja de abajo, con el día.
    await expect(page.getByText('Actualizado el', { exact: true })).toBeVisible();
  }

  // Nada de lo que se fue: ni cuentas, ni el hero, ni el hueco de RESPONSABLE_LEGAL.
  await expect(page.getByText(/prueba gratis|inicia sesión|informe semanal|alertas/i)).toHaveCount(0);
  await expect(page.getByText(/\[\[/)).toHaveCount(0);
  // La única superficie oscura es el panel de lecturas, y lleva `dark`.
  const oscuras = page.locator('.bg-brand-navy');
  expect(await oscuras.count()).toBeLessThanOrEqual(1);
  if (await oscuras.count()) await expect(oscuras).toHaveClass(/\bdark\b/);
  await expect(page.getByRole('heading', { name: /qué hay en el sitio|preguntas frecuentes/i })).toHaveCount(0);
});

test('metadatos y tarjeta de vista previa, sin «Inteligencia»', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Qué compra el Estado de Chile y a qué precio/);
  await expect(page).not.toHaveTitle(/gratis|sin cuenta/i);
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
  await page
    .getByRole('region', { name: 'Úsalo como quieras' })
    .getByRole('link', { name: 'API', exact: true })
    .click();
  await expect(page).toHaveURL(/\/abierto#api$/);

  await page.getByRole('contentinfo').getByRole('link', { name: 'Acerca', exact: true }).click();
  await expect(page).toHaveURL(/\/acerca$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^acerca de /i);
  expect(await page.locator('#preguntas details').count()).toBeGreaterThanOrEqual(6);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/acerca$/);
});

for (const viewport of [TABLETA, MOVIL]) {
  test(`a ${viewport.width} px el panel va ${viewport.width >= 1024 ? 'a la derecha del' : 'debajo del'} buscador`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    // La semilla del E2E trae cierres: el panel tiene que existir.
    const panel = page.getByRole('region', { name: PANEL });
    await expect(panel).toBeVisible();
    await expect(panel).toHaveClass(/\bdark\b/);
    const campo = await page.getByRole('searchbox', { name: PREGUNTA }).boundingBox();
    const caja = await panel.boundingBox();
    expect(campo && caja, 'sin caja: ¿no se pintó?').toBeTruthy();
    if (viewport.width >= 1024) expect(caja!.x).toBeGreaterThan(campo!.x + campo!.width);
    else expect(caja!.y).toBeGreaterThan(campo!.y + campo!.height);
  });
}

const PANTALLAS = [
  { ruta: '/', nombre: 'portada', titulo: PREGUNTA, anchos: [ESTRECHO, MOVIL, TABLETA, ESCRITORIO] },
  { ruta: '/acerca', nombre: 'acerca', titulo: /^acerca de /i, anchos: [ESCRITORIO, MOVIL] },
];

for (const tema of ['claro', 'oscuro'] as const) {
  for (const { ruta, nombre, titulo, anchos } of PANTALLAS) {
    for (const viewport of anchos) {
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

        if (ruta === '/') {
          // La semilla trae cierres: el panel existe. Y no esconde nada tras su overflow-hidden.
          await expect(page.getByRole('region', { name: PANEL })).toBeVisible();
          const { fuera, scroll, cliente } = await recorteDelPanel(page);
          expect(fuera, 'se sale del panel (y overflow-hidden lo corta)').toEqual([]);
          expect(scroll, 'el panel recorta contenido').toBeLessThanOrEqual(cliente + 1);
          if (viewport.width === MOVIL.width) {
            // «En 2 o 3 días» en dos líneas no puede subir su barra: una sola línea de base.
            const bases = await basesDeCierres(page);
            expect(bases).toHaveLength(4);
            expect(Math.max(...bases) - Math.min(...bases), `bases: ${bases.join(', ')}`).toBeLessThanOrEqual(1);
          }
        }
      });
    }
  }
}
