import { expect, test, type Page } from '@playwright/test';

import { SECCIONES } from '../lib/navegacion';

/**
 * La cáscara única (spec del rediseño §6.1), en el navegador: lo que el test
 * unitario no puede medir —anchos, una línea, lo que queda en la primera
 * pantalla— y las dos pantallas que asumían el hueco de la barra lateral
 * (`lg:pl-64`): `/mercado` y `/licitaciones`, a 1440 y 390 px, en claro y oscuro.
 *
 * Las capturas quedan en `test-results/` para mirarlas: el contraste roto en
 * oscuro es invisible en claro, que es el que se revisa por defecto.
 */

// 320 px es la referencia de WCAG 1.4.10 (Reflow): ahí la cabecera dejó de caber.
const MUY_ESTRECHO = { width: 320, height: 640 };
const MOVIL = { width: 390, height: 844 };
const TABLETA = { width: 768, height: 1024 };
const LG = { width: 1024, height: 768 };
const ESCRITORIO = { width: 1440, height: 900 };

async function anchoDelDocumento(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

/**
 * Qué se sale por la derecha, para que un fallo diga dónde mirar. Sólo cuenta lo
 * que ensancha la página: lo que está dentro de un contenedor con su propio
 * desplazamiento (`overflow-x-auto`, una tabla con scroll) se recorta ahí y no
 * la ensancha, aunque su caja se pase.
 */
async function quienSeSale(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const recortado = (el: Element): boolean => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o !== 'visible') return true;
      }
      return false;
    };
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > ancho + 1 && !recortado(el))
      .slice(0, 8)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').slice(0, 70)} [${Math.round(r.left)}..${Math.round(r.right)}]`;
      });
  });
}

for (const viewport of [MUY_ESTRECHO, MOVIL, TABLETA, LG, ESCRITORIO]) {
  test(`la cabecera ocupa una línea a ${viewport.width} px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/guias');
    const cabecera = page.getByRole('banner');
    const caja = await cabecera.boundingBox();
    expect(caja, 'no hay <header>').not.toBeNull();
    expect(caja!.height).toBeLessThanOrEqual(64);

    // Todo lo visible de la cabecera, en la misma fila.
    const centros = await cabecera
      .locator('a:visible, summary:visible')
      .evaluateAll((els) => els.map((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      }));
    // Escritorio: marca, seis secciones, «API y MCP», guardados, «Apoyar» (sin
    // REPOSITORIO_URL en el E2E). Móvil y tableta: marca, guardados, «Apoyar», «Menú».
    expect(centros.length).toBe(viewport.width >= 1024 ? 10 : 4);
    expect(Math.max(...centros) - Math.min(...centros)).toBeLessThanOrEqual(6);

    expect(await anchoDelDocumento(page), (await quienSeSale(page)).join('\n')).toBeLessThanOrEqual(
      viewport.width,
    );
  });
}

// WCAG 2.5.8 (AA): un destino de toque de al menos 24×24 px. Se mide la caja
// pintada, no el CSS: el relleno puede quedar sin efecto y nadie lo vería.
for (const viewport of [MUY_ESTRECHO, MOVIL, ESCRITORIO]) {
  test(`«Apoyar» y los guardados miden 24×24 px o más a ${viewport.width} px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/guias');
    const cabecera = page.getByRole('banner');
    const destinos = {
      Apoyar: cabecera.getByRole('link', { name: 'Apoyar', exact: true }),
      Guardados: cabecera.getByRole('link', { name: /^Guardados en este navegador/ }),
    };
    for (const [nombre, enlace] of Object.entries(destinos)) {
      await expect(enlace).toBeVisible();
      const caja = await enlace.boundingBox();
      expect(caja!.width, `${nombre}: ancho`).toBeGreaterThanOrEqual(24);
      expect(caja!.height, `${nombre}: alto`).toBeGreaterThanOrEqual(24);
    }
  });
}

// El peor caso de la fila: el contador de guardados con dos cifras.
test('a 320 px la cabecera cabe con muchas cosas guardadas, y «Apoyar» conserva su nombre', async ({ page }) => {
  await page.setViewportSize(MUY_ESTRECHO);
  await page.addInitScript(() => {
    const licitaciones = Array.from({ length: 99 }, (_, i) => ({
      id: i + 1,
      codigo_externo: `E2E-${i + 1}`,
      nombre: `Licitación ${i + 1}`,
      storedAt: '2026-10-14T12:00:00Z',
    }));
    window.localStorage.setItem(
      'licit_dashboard_collections_v1',
      JSON.stringify({ tenders: { saved: licitaciones, applied: [] } }),
    );
  });
  await page.goto('/guias');
  const cabecera = page.getByRole('banner');
  await expect(cabecera.getByRole('link', { name: 'Guardados en este navegador: 99' })).toBeVisible();
  // El texto se oculta a la vista, no al lector de pantalla.
  await expect(cabecera.getByRole('link', { name: 'Apoyar', exact: true })).toBeVisible();
  expect(await anchoDelDocumento(page), (await quienSeSale(page)).join('\n')).toBeLessThanOrEqual(
    MUY_ESTRECHO.width,
  );
});

test('en móvil, tocar la marca, los guardados o «Apoyar» también cierra el menú', async ({ page }) => {
  await page.setViewportSize(MOVIL);
  const cabecera = page.getByRole('banner');
  const menu = cabecera.locator('details');
  const enlaces = [
    { nombre: 'la marca', enlace: () => cabecera.getByRole('link', { name: /, inicio$/ }), url: /\/$/ },
    { nombre: 'los guardados', enlace: () => cabecera.getByRole('link', { name: /^Guardados en este navegador/ }), url: /\/guardados/ },
    { nombre: '«Apoyar»', enlace: () => cabecera.getByRole('link', { name: 'Apoyar', exact: true }), url: /\/apoyar/ },
  ];
  for (const { nombre, enlace, url } of enlaces) {
    await page.goto('/guias');
    await cabecera.locator('summary').click();
    await expect(menu).toHaveAttribute('open', '');
    await enlace().click();
    await expect(page, nombre).toHaveURL(url);
    await expect(menu, `${nombre}: el menú sigue abierto`).not.toHaveAttribute('open');
  }
});

test('la marca lleva el pájaro, y el fondo de página es blanco en tema claro', async ({ page }) => {
  await page.goto('/licitaciones');
  const marca = page.getByRole('banner').getByRole('link', { name: /, inicio$/ });
  const pajaro = marca.locator('svg');
  await expect(pajaro).toBeVisible();
  const caja = await pajaro.boundingBox();
  expect(caja!.height, 'el pájaro mide lo que la línea de la marca').toBeGreaterThanOrEqual(20);
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
});

test('en escritorio, la sección actual se marca y «Código» no aparece sin REPOSITORIO_URL', async ({ page }) => {
  await page.setViewportSize(ESCRITORIO);
  await page.goto('/licitaciones');
  const nav = page.getByRole('navigation', { name: 'Secciones' });
  await expect(nav.getByRole('link', { name: 'Licitaciones', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Código' })).toHaveCount(0);
  await expect(page.locator('main')).toHaveCount(1);
});

test('en móvil, el menú lleva a cada sección y se cierra al navegar', async ({ page }) => {
  await page.setViewportSize(MOVIL);
  await page.goto('/guias');
  const cabecera = page.getByRole('banner');
  await expect(cabecera.getByRole('navigation', { name: 'Secciones' })).toBeHidden();

  const menu = cabecera.locator('details');
  await expect(menu).not.toHaveAttribute('open');
  await cabecera.locator('summary').click();
  await expect(menu).toHaveAttribute('open', '');

  const nav = cabecera.getByRole('navigation', { name: 'Menú de secciones' });
  for (const s of SECCIONES) {
    await expect(nav.getByRole('link', { name: s.nombre, exact: true })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'API y MCP' })).toBeVisible();

  await nav.getByRole('link', { name: 'Licitaciones', exact: true }).click();
  await expect(page).toHaveURL(/\/licitaciones(\?|$)/);
  await expect(page.getByRole('heading', { level: 1, name: 'Licitaciones' })).toBeVisible();
  // La cáscara no se desmonta al navegar: sin el cierre del enlace, el menú
  // seguiría abierto encima de la página nueva.
  await expect(menu).not.toHaveAttribute('open');
});

test('en móvil, la búsqueda de cada pantalla queda en la primera pantalla', async ({ page }) => {
  await page.setViewportSize(MOVIL);
  const campos = [
    { ruta: '/productos', campo: () => page.locator('#buscar-producto') },
    { ruta: '/licitaciones', campo: () => page.getByPlaceholder(/producto o comprador/i) },
  ];
  for (const { ruta, campo } of campos) {
    await page.goto(ruta);
    await expect(campo()).toBeVisible({ timeout: 15_000 });
    const caja = await campo().boundingBox();
    expect(caja!.y + caja!.height, `${ruta}: la búsqueda queda bajo el pliegue`).toBeLessThanOrEqual(MOVIL.height);
    await campo().fill('resma');
    await expect(campo()).toHaveValue('resma');
  }
});

test('/mercado conserva sus filtros dentro de la página, y se quedan arriba al bajar', async ({ page }) => {
  await page.setViewportSize(ESCRITORIO);
  await page.goto('/mercado');
  await expect(page.getByRole('heading', { level: 1, name: /^mercados$/i })).toBeVisible({ timeout: 15_000 });
  const filtro = page.getByRole('main').getByRole('button', { name: /^Rubro: / });
  await expect(filtro).toBeVisible();

  const recorrido = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  test.skip(recorrido < 400, 'con estos datos /mercado no es lo bastante larga para probar el sticky');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => (await filtro.boundingBox())!.y).toBeLessThan(40);
});

test('/mercado a 390 px: un tooltip abierto con el teclado queda dentro de la pantalla', async ({ page }) => {
  await page.setViewportSize(MOVIL);
  await page.goto('/mercado');
  await expect(page.getByRole('heading', { level: 1, name: /^mercados$/i })).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState('networkidle');

  // El disparador es el padre del globo (`role="tooltip"`); cerrado no pesa en el layout.
  const globos = page.locator('[role="tooltip"]');
  const cuantos = await globos.count();
  expect(cuantos, 'no hay ningún InfoTooltip en /mercado').toBeGreaterThan(0);
  for (let i = 0; i < cuantos; i++) {
    const globo = globos.nth(i);
    await globo.locator('xpath=..').focus();
    await expect(globo, `tooltip ${i + 1}: no se abre con el foco`).toBeVisible();
    const caja = await globo.boundingBox();
    expect(caja!.x, `tooltip ${i + 1}: se sale por la izquierda`).toBeGreaterThanOrEqual(0);
    expect(caja!.x + caja!.width, `tooltip ${i + 1}: se sale por la derecha`).toBeLessThanOrEqual(MOVIL.width);
    expect(await anchoDelDocumento(page), `tooltip ${i + 1}: ensancha la página`).toBeLessThanOrEqual(MOVIL.width);
  }
});

const PANTALLAS = [
  { ruta: '/mercado', titulo: /^mercados$/i },
  { ruta: '/licitaciones', titulo: /^licitaciones y compras ágiles$/i },
];

for (const tema of ['claro', 'oscuro'] as const) {
  for (const viewport of [ESCRITORIO, MOVIL]) {
    for (const { ruta, titulo } of PANTALLAS) {
      test(`${ruta} a ${viewport.width} px en tema ${tema}: sin desbordes, con captura`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        if (tema === 'oscuro') {
          await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
        }
        await page.goto(ruta);
        await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible({ timeout: 15_000 });
        await page.waitForLoadState('networkidle');
        if (tema === 'oscuro') await expect(page.locator('html')).toHaveClass(/\bdark\b/);
        else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

        await page.screenshot({ path: testInfo.outputPath(`captura-${ruta.slice(1)}-${tema}-${viewport.width}.png`), fullPage: true });

        expect(await anchoDelDocumento(page), `se sale del ancho:\n${(await quienSeSale(page)).join('\n')}`).toBeLessThanOrEqual(
          viewport.width,
        );
      });
    }
  }
}

// Las demás pantallas con captura, para la revisión humana de la cáscara: la
// portada, lo abierto y una guía. Mismo criterio de desborde que arriba.
const OTRAS = [
  { ruta: '/', nombre: 'portada' },
  { ruta: '/abierto', nombre: 'abierto' },
  { ruta: '/guias/de-donde-salen-los-datos', nombre: 'guia' },
];

for (const tema of ['claro', 'oscuro'] as const) {
  for (const viewport of [ESCRITORIO, MOVIL]) {
    for (const { ruta, nombre } of OTRAS) {
      test(`${ruta} a ${viewport.width} px en tema ${tema}: sin desbordes, con captura`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        if (tema === 'oscuro') {
          await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
        }
        await page.goto(ruta);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
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
