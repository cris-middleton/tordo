import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { CODIGO_VALVULAS } from './datos';

/**
 * La tipografía de la identidad (docs/IDENTIDAD_Y_PORTADA_2026-10.md §4), comprobada en el
 * navegador y no en el código fuente: lo que importa es lo que el navegador RESUELVE
 * después de la cascada, y una clase de componente puede ganarle a la regla que el test
 * estático sí ve (un `font-bold` en un h1 lo devuelve a 700).
 *
 * - Todo en Archivo. `h1` y `h2` semiexpandidos (`font-stretch` 112,5 %) y en 800; `h3`,
 *   el cuerpo y las etiquetas en `h2` («Fuentes»), a ancho normal.
 * - Toda `.cifra` en Archivo: un precio en otra familia es el fallo que se busca.
 * - Los identificadores en IBM Plex Mono, en 400 o 500: Plex Mono no trae más pesos y
 *   cualquier otro sería una negrita sintética.
 * - Las fuentes salen del propio dominio: ninguna petición a Google.
 */

interface Tipo {
  familia: string;
  ancho: string;
  peso: string;
}

/** Familia (la primera de la pila), ancho y peso que resuelve el navegador. */
async function tipo(l: Locator): Promise<Tipo> {
  return l.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      familia: s.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, ''),
      ancho: s.fontStretch,
      peso: s.fontWeight,
    };
  });
}

async function familiasDeTodas(l: Locator): Promise<string[]> {
  return l.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')),
  );
}

async function pesosDeTodas(l: Locator): Promise<string[]> {
  return l.evaluateAll((els) => els.map((el) => getComputedStyle(el).fontWeight));
}

const TITULAR = { familia: 'Archivo', ancho: '112.5%', peso: '800' };

/**
 * `font-family` computado es la pila DECLARADA: si el archivo de la fuente no
 * baja, sigue diciendo «Archivo» y el navegador pinta con la de respaldo.
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

test('una guía: titulares semiexpandidos en 800, cuerpo y etiqueta a ancho normal', async ({ page }) => {
  const aGoogle = await abrir(page, '/guias/como-leer-una-banda-de-precio', ['Archivo']);
  expect(aGoogle, 'las fuentes se sirven desde el propio dominio').toEqual([]);

  expect(await tipo(page.getByRole('heading', { level: 1 }))).toEqual(TITULAR);
  expect(await tipo(page.getByRole('heading', { level: 2, name: 'Los cinco números' }))).toEqual(TITULAR);
  // «Fuentes» es una etiqueta, no un titular: `font-sans` la devuelve a ancho normal.
  expect(await tipo(page.getByRole('heading', { level: 2, name: 'Fuentes' }))).toEqual({
    familia: 'Archivo',
    ancho: '100%',
    peso: '700',
  });
  expect(await tipo(page.locator('main p').first())).toMatchObject({ familia: 'Archivo', ancho: '100%' });

  const enlace = page.locator('main a.enlace').first();
  await expect(enlace).toBeVisible();
  expect(await enlace.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('underline');
});

test('una ficha de comprador: h3 a ancho normal, cifras en Archivo, código en mono', async ({ page, request }) => {
  await abrir(page, await primeraDelSitemap(request, 'compradores'), ['Archivo', 'IBM Plex Mono']);
  expect(await tipo(page.getByRole('heading', { level: 1 }))).toEqual(TITULAR);
  // `.section-title` va también en h3: si arrastrara font-display, saldría expandido y en 800.
  const h3 = await tipo(page.getByRole('heading', { level: 3, name: /perfil del comprador/i }));
  expect(h3.familia).toBe('Archivo');
  expect(h3.ancho).toBe('100%');

  const cifras = await familiasDeTodas(page.locator('.cifra'));
  expect(cifras.length).toBeGreaterThan(0);
  expect(new Set(cifras)).toEqual(new Set(['Archivo']));

  const mono = page.locator('main .font-mono');
  expect((await tipo(mono.first())).familia).toBe('IBM Plex Mono');
  for (const peso of await pesosDeTodas(mono)) expect(['400', '500']).toContain(peso);
});

test('una ficha de producto: el precio mediano va en Archivo', async ({ page, request }) => {
  await abrir(page, await primeraDelSitemap(request, 'productos'), ['Archivo']);
  await expect(page.getByRole('heading', { name: /cuánto se pagó/i })).toBeVisible();
  const cifras = await familiasDeTodas(page.locator('.cifra'));
  expect(cifras.length).toBeGreaterThan(0);
  expect(new Set(cifras)).toEqual(new Set(['Archivo']));
});

test('el detalle de una licitación: el código va en mono, sin negrita sintética', async ({ page }) => {
  await page.goto(`/licitaciones/${CODIGO_VALVULAS}`);
  // El título es el nombre; el código va debajo, en mono y en una cara cargada.
  const codigo = page.getByText(CODIGO_VALVULAS, { exact: true }).first();
  await expect(codigo).toBeVisible({ timeout: 15_000 });
  await esperarCaras(page, ['IBM Plex Mono']);
  const t = await tipo(codigo);
  expect(t.familia).toBe('IBM Plex Mono');
  // Su peso tiene que existir como cara cargada: sin ella sería negrita sintética.
  expect(await carasCargadas(page)).toEqual(
    expect.arrayContaining([expect.objectContaining({ familia: 'IBM Plex Mono', peso: t.peso })]),
  );
});
