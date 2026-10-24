import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * La portada de gráficos (octubre de 2026): a la izquierda el titular, el buscador
 * y las abiertas de ahora; a la derecha el gráfico grande —la red de compradores y
 * proveedores, o sin ella el gasto mensual por sector—; debajo, la ficha a lo ancho
 * y «Para empezar», con tres lecturas en fila. Y
 * `/acerca`, de punta a punta y SIN sesión.
 *
 * Lo vivo —las abiertas, las lecturas, la franja y «Lo mejor de hoy»— sale del
 * servidor con ISR. `scripts/e2e.sh` construye con el backend levantado y la
 * semilla puesta. Con el fixture del golden el gasto mensual tiene tres meses
 * (menos de los seis que pide), así que el gasto no sale; la red sale si el fixture
 * tiene compradores suficientes en `competitors_by_market`. De las lecturas, la concentración y los cierres (el
 * producto de la portada no está, así que entra la nota). La nota es contenido del
 * repo y sale siempre: **la sección de lecturas existe siempre**. Lo que no
 * depende de nada es el buscador, y eso se exige siempre: es lo primero que se ve,
 * también a 390 px (principio 1). El detalle de cada bloque oculto está en
 * `__tests__/portada.test.tsx`.
 *
 * Las capturas quedan en `test-results/` para mirarlas: el contraste roto en
 * oscuro es invisible en claro.
 */

const TITULAR = 'Cuánto paga el Estado por lo que vendes';
const CAMPO = 'Producto o servicio que vendes';
const ESTRECHO = { width: 320, height: 640 };
const MOVIL = { width: 390, height: 844 };
const TABLETA = { width: 1024, height: 768 };
const ESCRITORIO = { width: 1440, height: 900 };
const LECTURAS = 'Para empezar';
/**
 * El gráfico grande: la red si el backend la manda, y si no, el gasto mensual (si hay
 * meses suficientes). Una sección con la conclusión como `h2`.
 */
const RED = 'section[aria-labelledby="red-titulo"]';
const GASTO = 'section[aria-labelledby="gasto-titulo"]';
const grande = async (page: Page) => ((await page.locator(RED).count()) ? page.locator(RED) : page.locator(GASTO));

/** La conclusión del gráfico grande: el título que lo nombra. La de la red va en la otra columna. */
const tituloDe = async (page: Page, seccion: Locator) => page.locator(`#${await seccion.getAttribute('aria-labelledby')}`);

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

/** Las cajas de las lecturas, en orden. */
async function cajasDeLecturas(page: Page) {
  return page
    .getByRole('region', { name: LECTURAS })
    .getByRole('article')
    .evaluateAll((articulos) =>
      articulos.map((a) => {
        const r = a.getBoundingClientRect();
        return { x: r.x, y: r.y, ancho: r.width, derecha: r.right, abajo: r.bottom };
      }),
    );
}

test('lo primero es el buscador, y nada de lo que se fue', async ({ page }) => {
  const respuesta = await page.goto('/');
  expect(respuesta?.status()).toBe(200);

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITULAR);
  await expect(page.getByRole('searchbox', { name: CAMPO })).toBeVisible();
  // Los cuatro primeros, en una línea (`EJEMPLOS_EN_PORTADA`).
  await expect(page.getByRole('list', { name: 'Ejemplos de búsqueda' }).getByRole('link')).toHaveCount(4);
  // La nota es contenido del repo: la sección de lecturas sale siempre.
  await expect(page.getByRole('region', { name: LECTURAS })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Notas de datos' })).toBeVisible();
  await expect(page.getByText(/^Fuente: Dirección de Compras y Contratación Pública/)).toBeVisible();

  // Con o sin lo vivo (ISR); si está, completo.
  const bloque = page.locator('#hoy');
  if (await bloque.count()) {
    await expect(bloque.getByRole('list', { name: /compras ágiles destacadas de hoy/i })).toBeVisible();
  }
  const abiertas = page.getByText(/^Ahora puedes postular a /);
  if (await abiertas.count()) {
    await expect(abiertas.getByRole('link')).toHaveCount(2);
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
  await page.getByRole('searchbox', { name: CAMPO }).fill('guantes de nitrilo');
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
    page.getByRole('searchbox', { name: CAMPO }),
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
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^qué es /i);
  expect(await page.locator('#preguntas details').count()).toBeGreaterThanOrEqual(6);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/acerca$/);
});

for (const viewport of [TABLETA, ESCRITORIO]) {
  test(`a ${viewport.width} px el h1 no pasa de tres líneas`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const h1 = page.getByRole('heading', { level: 1 });
    const alto = (await h1.boundingBox())!.height;
    const linea = await h1.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
    expect(Math.round(alto / linea), `${alto} px de alto con líneas de ${linea}`).toBeLessThanOrEqual(3);
  });

  test(`a ${viewport.width} px «Para empezar» va en fila: misma altura, una al lado de otra, sin desborde`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const seccion = page.getByRole('region', { name: LECTURAS });
    await expect(seccion).toBeVisible();
    const caja = (await seccion.boundingBox())!;
    const cajas = await cajasDeLecturas(page);
    // La nota sale siempre; con la semilla, también la concentración y los cierres. Nunca más de tres.
    expect(cajas.length).toBeGreaterThanOrEqual(1);
    expect(cajas.length).toBeLessThanOrEqual(3);
    for (const [i, c] of cajas.entries()) {
      expect(c.derecha, 'no se sale de la sección').toBeLessThanOrEqual(caja.x + caja.width + 1);
      if (i > 0) {
        expect(Math.abs(c.y - cajas[0].y), 'todas empiezan a la misma altura').toBeLessThanOrEqual(1);
        expect(c.x, 'una al lado de la otra').toBeGreaterThanOrEqual(cajas[i - 1].derecha);
      }
    }
    expect(await anchoDelDocumento(page), (await quienSeSale(page)).join('\n')).toBeLessThanOrEqual(viewport.width);
  });

  test(`a ${viewport.width} px, si está, el gráfico grande va a la derecha del buscador y a su altura`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const gasto = await grande(page);
    test.skip((await gasto.count()) === 0, 'sin red ni meses suficientes en el fixture, el gráfico grande no sale');
    const caja = (await gasto.boundingBox())!;
    const buscador = (await page.getByRole('search').boundingBox())!;
    expect(caja.x, 'a la derecha del buscador').toBeGreaterThanOrEqual(buscador.x + buscador.width);
    expect(caja.y, 'empieza antes que el campo').toBeLessThan(buscador.y);
  });
}

test('a 1440×900 la primera conclusión de datos y su gráfico empiezan sobre el pliegue', async ({ page }) => {
  await page.setViewportSize(ESCRITORIO);
  await page.goto('/');
  const gasto = await grande(page);
  const primera = (await gasto.count()) ? gasto : page.getByRole('region', { name: LECTURAS }).getByRole('article').first();
  const titulo = (await gasto.count()) ? await tituloDe(page, gasto) : primera.getByRole('heading').first();
  const conclusion = (await titulo.boundingBox())!;
  expect(conclusion.y + conclusion.height, `la conclusión termina en y = ${conclusion.y + conclusion.height}`).toBeLessThanOrEqual(
    ESCRITORIO.height,
  );
  // Sólo lo que se ve: la red trae dos disposiciones y la del teléfono está oculta en escritorio.
  const grafico = (await primera.locator('svg:visible, [data-decimo]:visible, figure:visible').first().boundingBox())!;
  expect(grafico.y, `el gráfico empieza en y = ${grafico.y}`).toBeLessThan(ESCRITORIO.height);
});

test('a 390×844 la primera conclusión de datos queda sobre el pliegue', async ({ page }) => {
  await page.setViewportSize(MOVIL);
  await page.goto('/');
  const gasto = await grande(page);
  const primera = (await gasto.count())
    ? await tituloDe(page, gasto)
    : page.getByRole('region', { name: LECTURAS }).getByRole('heading', { level: 3 }).first();
  await expect(primera).toBeVisible();
  const caja = (await primera.boundingBox())!;
  expect(caja.y + caja.height, `la conclusión termina en y = ${caja.y + caja.height}`).toBeLessThanOrEqual(MOVIL.height);
});

test('el globo de un gráfico sale al pasar el mouse y se va al salir', async ({ page }) => {
  await page.setViewportSize(ESCRITORIO);
  await page.goto('/');
  const barras = page.getByRole('region', { name: LECTURAS }).locator('figure .cursor-crosshair');
  test.skip((await barras.count()) === 0, 'sin la lectura de concentración no hay barras con globo');
  await barras.last().hover();
  await expect(page.locator('[data-globo]')).toHaveCount(1);
  await expect(page.locator('[data-globo]')).toContainText('mercados', { ignoreCase: true });
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-globo]')).toHaveCount(0);
});

const PANTALLAS = [
  { ruta: '/', nombre: 'portada', titulo: TITULAR, anchos: [ESTRECHO, MOVIL, TABLETA, ESCRITORIO] },
  { ruta: '/acerca', nombre: 'acerca', titulo: /^qué es /i, anchos: [ESCRITORIO, MOVIL] },
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
          // La sección de lecturas existe siempre (la nota es del repo), y ninguna se sale de ella.
          const seccion = page.getByRole('region', { name: LECTURAS });
          await expect(seccion).toBeVisible();
          const caja = (await seccion.boundingBox())!;
          for (const c of await cajasDeLecturas(page)) {
            expect(c.derecha, 'una lectura se sale de su columna').toBeLessThanOrEqual(caja.x + caja.width + 1);
          }
        }
      });
    }
  }
}
