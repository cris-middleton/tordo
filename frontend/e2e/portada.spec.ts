import { expect, test, type Page } from '@playwright/test';

/**
 * La portada v7 (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3 y §9) y `/acerca`, de
 * punta a punta y SIN sesión.
 *
 * Lo vivo —la tira, las lecturas de precio y de cierres, la franja y «Lo mejor de
 * hoy»— sale del servidor con ISR. `scripts/e2e.sh` construye con el backend
 * levantado y la semilla puesta, así que la portada suele nacer con lo vivo (con
 * el fixture del golden, de las dos lecturas vivas sólo la de cierres: el
 * producto de la portada no está). La de la nota es contenido del repo y sale
 * siempre: **la banda de lecturas existe siempre**. Lo que no depende de nada es
 * el buscador, y eso se exige siempre: es lo primero que se ve, también a 390 px
 * (principio 1). El detalle de cada bloque oculto está en `__tests__/portada.test.tsx`.
 *
 * Las capturas quedan en `test-results/` para mirarlas: el contraste roto en
 * oscuro es invisible en claro.
 */

const PREGUNTA = '¿Qué le vendes al Estado?';
const ESTRECHO = { width: 320, height: 640 };
const MOVIL = { width: 390, height: 844 };
const TABLETA = { width: 1024, height: 768 };
const ESCRITORIO = { width: 1440, height: 900 };
const LECTURAS = 'Lo que dicen los datos';

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

/** Las cajas de las lecturas de la banda, en orden. */
async function cajasDeLecturas(page: Page) {
  return page
    .getByRole('region', { name: LECTURAS })
    .getByRole('article')
    .evaluateAll((articulos) =>
      articulos.map((a) => {
        const r = a.getBoundingClientRect();
        return { x: r.x, y: r.y, ancho: r.width, derecha: r.right };
      }),
    );
}

/**
 * Las líneas del `h1`: la posición vertical de «¿Qué» y de «al Estado?». Con un
 * Range sobre el texto, que es lo que se pinta (la caja del h1 no dice dónde parte).
 */
async function lineasDelTitular(page: Page) {
  return page.getByRole('heading', { level: 1 }).evaluate((h1) => {
    const texto = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT).nextNode() as Text;
    const arriba = (desde: number, hasta: number) => {
      const r = document.createRange();
      r.setStart(texto, desde);
      r.setEnd(texto, hasta);
      return r.getBoundingClientRect().top;
    };
    const t = texto.data;
    return {
      que: arriba(0, 4),
      vendes: arriba(t.indexOf('vendes'), t.indexOf('vendes') + 6),
      al: arriba(t.indexOf(' al ') + 1, t.indexOf(' al ') + 3),
      estado: arriba(t.indexOf('Estado'), t.indexOf('Estado') + 6),
    };
  });
}

test('lo primero es el buscador, y nada de lo que se fue', async ({ page }) => {
  const respuesta = await page.goto('/');
  expect(respuesta?.status()).toBe(200);

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(PREGUNTA);
  await expect(page.getByRole('searchbox', { name: PREGUNTA })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Ejemplos de búsqueda' }).getByRole('link')).toHaveCount(6);
  // La nota es contenido del repo: la banda de lecturas sale siempre.
  await expect(page.getByRole('region', { name: LECTURAS })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Notas de datos' })).toBeVisible();
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
  // V1: sin panel navy. Ninguna superficie oscura dentro de la página.
  await expect(page.locator('main .bg-brand-navy, main .dark')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Úsalo como quieras' })).toHaveCount(0);
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
  await page.getByRole('list', { name: 'Ejemplos de búsqueda' }).getByRole('link', { name: 'cloro' }).click();
  await expect(page).toHaveURL(/\/buscar\?q=cloro$/);
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

test('el pie lleva a /acerca', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Acerca', exact: true }).click();
  await expect(page).toHaveURL(/\/acerca$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^acerca de /i);
  expect(await page.locator('#preguntas details').count()).toBeGreaterThanOrEqual(6);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/acerca$/);
});

for (const viewport of [TABLETA, ESCRITORIO]) {
  test(`a ${viewport.width} px el h1 va en dos líneas, «¿Qué le vendes / al Estado?»`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const l = await lineasDelTitular(page);
    expect(Math.abs(l.vendes - l.que), '«vendes» en la primera línea').toBeLessThanOrEqual(2);
    expect(l.al - l.que, '«al» baja a la segunda línea').toBeGreaterThan(20);
    expect(Math.abs(l.estado - l.al), '«Estado?» junto a «al»').toBeLessThanOrEqual(2);
  });

  test(`a ${viewport.width} px las lecturas van en una fila, debajo del buscador y sin desborde`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const banda = page.getByRole('region', { name: LECTURAS });
    await expect(banda).toBeVisible();
    const cajas = await cajasDeLecturas(page);
    expect(cajas.length, 'la nota sale siempre; con la semilla, también los cierres').toBeGreaterThanOrEqual(2);
    const caja = (await banda.boundingBox())!;
    for (const [i, c] of cajas.entries()) {
      expect(Math.abs(c.y - cajas[0].y), 'todas arrancan a la misma altura').toBeLessThanOrEqual(1);
      expect(c.derecha, 'no se sale de la banda').toBeLessThanOrEqual(caja.x + caja.width + 1);
      if (i > 0) expect(c.x, 'una al lado de la otra').toBeGreaterThanOrEqual(cajas[i - 1].derecha - 1);
      // Las que están se reparten el ancho por igual.
      expect(Math.abs(c.ancho - caja.width / cajas.length), `ancho ${c.ancho}`).toBeLessThanOrEqual(caja.width * 0.05);
    }
    const campo = (await page.getByRole('searchbox', { name: PREGUNTA }).boundingBox())!;
    expect(caja.y).toBeGreaterThan(campo.y + campo.height);
    expect(await anchoDelDocumento(page), (await quienSeSale(page)).join('\n')).toBeLessThanOrEqual(viewport.width);
  });
}

test('a 390×844 la conclusión de la primera lectura queda sobre el pliegue', async ({ page }) => {
  await page.setViewportSize(MOVIL);
  await page.goto('/');
  // Con la semilla del E2E, la primera es la de cierres (el producto de la portada no está).
  const primera = page.getByRole('region', { name: LECTURAS }).getByRole('heading', { level: 3 }).first();
  await expect(primera).toBeVisible();
  const caja = (await primera.boundingBox())!;
  expect(caja.y + caja.height, `la conclusión termina en y = ${caja.y + caja.height}`).toBeLessThanOrEqual(MOVIL.height);
});

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
          // La banda de lecturas existe siempre (la nota es del repo), y ninguna se sale de ella.
          const banda = page.getByRole('region', { name: LECTURAS });
          await expect(banda).toBeVisible();
          const caja = (await banda.boundingBox())!;
          for (const c of await cajasDeLecturas(page)) {
            expect(c.derecha, 'una lectura se sale de la banda').toBeLessThanOrEqual(caja.x + caja.width + 1);
          }
        }
      });
    }
  }
}
