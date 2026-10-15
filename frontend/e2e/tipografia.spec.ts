import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { CODIGO_VALVULAS } from './datos';

/**
 * La tipografía del rediseño, comprobada en el navegador y no en el código
 * fuente: lo que importa es la familia que el navegador RESUELVE después de la
 * cascada, y una clase de componente o un estilo en línea pueden ganarle a la
 * regla que el test estático sí ve.
 *
 * - `h1` y `h2` en Newsreader; `h3` y el cuerpo en Public Sans.
 * - Toda `.cifra` en Public Sans: un precio en serif es el fallo que se busca.
 * - Los identificadores en IBM Plex Mono, en 400 o 500: Plex Mono no trae más
 *   pesos y cualquier otro sería una negrita sintética.
 * - Las fuentes salen del propio dominio: ninguna petición a Google.
 */

/** La primera familia de la pila que resuelve el navegador. */
async function familia(l: Locator): Promise<string> {
  const pila = await l.evaluate((el) => getComputedStyle(el).fontFamily);
  return pila.split(',')[0].trim().replace(/^["']|["']$/g, '');
}

async function familiasDeTodas(l: Locator): Promise<string[]> {
  return l.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')),
  );
}

async function pesosDeTodas(l: Locator): Promise<string[]> {
  return l.evaluateAll((els) => els.map((el) => getComputedStyle(el).fontWeight));
}

/**
 * `font-family` computado es la pila DECLARADA: si el archivo de la fuente no
 * baja, sigue diciendo «Newsreader» y el navegador pinta con la de respaldo.
 * Lo que prueba que la cara se usó de verdad es que figure como CARGADA.
 */
async function carasCargadas(page: Page): Promise<{ familia: string; peso: string }[]> {
  return page.evaluate(() =>
    [...document.fonts]
      .filter((f) => f.status === 'loaded')
      .map((f) => ({ familia: f.family.replace(/["']/g, ''), peso: String(f.weight) })),
  );
}

async function esperarCaras(page: Page, esperadas: string[]): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(async () => (await carasCargadas(page)).map((c) => c.familia), {
      message: `el navegador no cargó ${esperadas.join(', ')}: la familia computada sería sólo la declarada`,
    })
    .toEqual(expect.arrayContaining(esperadas));
}

/** Abre la página, espera a las fuentes y devuelve las peticiones a Google que hizo. */
async function abrir(page: Page, ruta: string, caras: string[]): Promise<string[]> {
  const aGoogle: string[] = [];
  page.on('request', (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) aGoogle.push(r.url());
  });
  const respuesta = await page.goto(ruta);
  expect(respuesta?.status()).toBe(200);
  await esperarCaras(page, caras);
  return aGoogle;
}

async function primeraDelSitemap(request: APIRequestContext, tipo: 'compradores' | 'productos'): Promise<string> {
  const xml = await (await request.get('/sitemap.xml')).text();
  const ruta = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]).pathname)
    .find((r) => r.startsWith(`/${tipo}/`));
  expect(ruta, `el sitemap no trae ninguna página de /${tipo}/`).toBeTruthy();
  return ruta as string;
}

test('una guía: titulares en Newsreader, cuerpo en Public Sans, enlaces subrayados', async ({ page }) => {
  const aGoogle = await abrir(page, '/guias/como-leer-una-banda-de-precio', ['Newsreader', 'Public Sans']);
  expect(aGoogle, 'las fuentes se sirven desde el propio dominio').toEqual([]);

  expect(await familia(page.getByRole('heading', { level: 1 }))).toBe('Newsreader');
  expect(await familia(page.getByRole('heading', { level: 2, name: 'Los cinco números' }))).toBe('Newsreader');
  // «Fuentes» es una etiqueta, no un titular editorial.
  expect(await familia(page.getByRole('heading', { level: 2, name: 'Fuentes' }))).toBe('Public Sans');
  expect(await familia(page.locator('main p').first())).toBe('Public Sans');

  const enlace = page.locator('main a.enlace').first();
  await expect(enlace).toBeVisible();
  expect(await enlace.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('underline');
});

test('una ficha de comprador: h3 en sans, cifras en sans, código en mono', async ({ page, request }) => {
  await abrir(page, await primeraDelSitemap(request, 'compradores'), ['Newsreader', 'Public Sans', 'IBM Plex Mono']);
  expect(await familia(page.getByRole('heading', { level: 1 }))).toBe('Newsreader');
  // `.section-title` va también en h3: si arrastrara font-display, saldría en serif.
  expect(await familia(page.getByRole('heading', { level: 3, name: /perfil del comprador/i }))).toBe('Public Sans');

  const cifras = await familiasDeTodas(page.locator('.cifra'));
  expect(cifras.length).toBeGreaterThan(0);
  expect(new Set(cifras)).toEqual(new Set(['Public Sans']));

  const mono = page.locator('main .font-mono');
  expect(await familia(mono.first())).toBe('IBM Plex Mono');
  for (const peso of await pesosDeTodas(mono)) expect(['400', '500']).toContain(peso);
});

test('una ficha de producto: el precio mediano no sale en serif', async ({ page, request }) => {
  await abrir(page, await primeraDelSitemap(request, 'productos'), ['Newsreader', 'Public Sans']);
  await expect(page.getByRole('heading', { name: /bandas de precio/i })).toBeVisible();
  const cifras = await familiasDeTodas(page.locator('.cifra'));
  expect(cifras.length).toBeGreaterThan(0);
  expect(new Set(cifras)).toEqual(new Set(['Public Sans']));
});

test('el detalle de una licitación: el código va en mono, sin negrita sintética', async ({ page }) => {
  await page.goto(`/licitaciones/${CODIGO_VALVULAS}`);
  const codigo = page.getByRole('heading', { level: 2, name: CODIGO_VALVULAS });
  await expect(codigo).toBeVisible({ timeout: 15_000 });
  await esperarCaras(page, ['IBM Plex Mono']);
  // El peso 500 tiene que existir como cara cargada: sin ella sería negrita sintética.
  expect(await carasCargadas(page)).toEqual(
    expect.arrayContaining([expect.objectContaining({ familia: 'IBM Plex Mono', peso: '500' })]),
  );
  expect(await familia(codigo)).toBe('IBM Plex Mono');
  expect(await codigo.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('500');
});
