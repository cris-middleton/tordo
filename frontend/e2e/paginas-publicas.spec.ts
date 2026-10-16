import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Las páginas públicas indexables (paso 10 del pivote), de punta a punta y SIN
 * sesión: una de cada tipo —comprador, rubro, producto—, con el backend real
 * detrás del servidor de Next (ISR) y no un simulacro.
 *
 * **Las URL salen del propio `/sitemap.xml`**, que las saca de
 * `/publico/sitemap`. Así no se duplican aquí códigos ni slugs del fixture, y
 * de paso se prueba que el sitemap enlaza páginas que existen. Requiere que
 * `scripts/e2e.sh` materialice el fixture de analytics antes de arrancar el
 * backend; sin eso el sitemap trae sólo las páginas fijas y estos tests fallan
 * diciendo qué tipo falta, que es lo que se quiere.
 */

type Tipo = 'compradores' | 'rubros' | 'productos';

async function primeraDelSitemap(request: APIRequestContext, tipo: Tipo): Promise<string> {
  const respuesta = await request.get('/sitemap.xml');
  expect(respuesta.status()).toBe(200);
  const xml = await respuesta.text();
  // El sitemap lleva URL absolutas sobre NEXT_PUBLIC_SITE_URL, que en el E2E no
  // es este servidor: se queda la ruta.
  const rutas = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const ruta = rutas.find((r) => r.startsWith(`/${tipo}/`));
  expect(ruta, `el sitemap no trae ninguna página de /${tipo}/`).toBeTruthy();
  return ruta as string;
}

async function comprobarFicha(page: Page, ruta: string) {
  const respuesta = await page.goto(ruta);
  expect(respuesta?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Indexable (viene del sitemap): canonical a sí misma y sin noindex.
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${ruta}$`));
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  // La cita de la fuente y los enlaces legales, como en todo el sitio.
  await expect(page.getByText(/^Fuente: Dirección de Compras y Contratación Pública/)).toBeVisible();
  const pie = page.getByRole('contentinfo');
  await expect(pie.getByRole('link', { name: 'Términos de uso' })).toBeVisible();
  await expect(pie.getByRole('link', { name: 'Privacidad' })).toBeVisible();
}

test('una ficha de comprador', async ({ page, request }) => {
  const ruta = await primeraDelSitemap(request, 'compradores');
  await comprobarFicha(page, ruta);
  await expect(page.getByText(/perfil del comprador/i)).toBeVisible();
});

test('una ficha de rubro, y de ahí al panel', async ({ page, request }) => {
  const ruta = await primeraDelSitemap(request, 'rubros');
  await comprobarFicha(page, ruta);
  await page.getByRole('link', { name: /analizar este rubro en el panel/i }).click();
  await expect(page).toHaveURL(/\/mercado\?rubro=/);
});

test('una ficha de producto', async ({ page, request }) => {
  const ruta = await primeraDelSitemap(request, 'productos');
  await comprobarFicha(page, ruta);
  await expect(page.getByRole('heading', { name: /bandas de precio/i })).toBeVisible();
});

test('el buscador de productos se carga sin sesión', async ({ page }) => {
  const respuesta = await page.goto('/productos');
  expect(respuesta?.status()).toBe(200);
  await expect(page.getByLabel(/buscar un producto/i)).toBeVisible();
  await expect(page.getByText(/al menos tres letras/i)).toBeVisible();
});

test('/productos?q= abre con los resultados, sin escribir nada', async ({ page }) => {
  const respuesta = await page.goto('/productos?q=resma');
  expect(respuesta?.status()).toBe(200);
  await expect(page.getByLabel(/buscar un producto/i)).toHaveValue('resma');
  // No indexable (n < 10 en el fixture): la búsqueda la trae igual, marcada.
  const enlace = page.getByRole('link', { name: /resma papel prueba/i });
  await expect(enlace).toBeVisible();
  await expect(enlace).toHaveAttribute('href', '/productos/resma-papel-prueba');
  await expect(enlace).toContainText(/orientativo/);
});

test('buscar en /productos deja la búsqueda en la URL', async ({ page }) => {
  await page.goto('/productos');
  await page.getByLabel(/buscar un producto/i).fill('jabón líquido');
  await expect(page).toHaveURL(/\/productos\?q=jab%C3%B3n\+l%C3%ADquido$/);
  await expect(page.getByRole('link', { name: /liquido prueba/i })).toBeVisible();
  // Recargar conserva la búsqueda: es lo que permite compartirla.
  await page.reload();
  await expect(page.getByLabel(/buscar un producto/i)).toHaveValue('jabón líquido');
  await expect(page.getByRole('link', { name: /liquido prueba/i })).toBeVisible();
});

test('volver desde una ficha devuelve la búsqueda con sus resultados', async ({ page }) => {
  await page.goto('/productos?q=resma');
  const enlace = page.getByRole('link', { name: /resma papel prueba/i });
  await enlace.click();
  await expect(page).toHaveURL(/\/productos\/resma-papel-prueba$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/productos\?q=resma$/);
  await expect(page.getByLabel(/buscar un producto/i)).toHaveValue('resma');
  await expect(page.getByRole('link', { name: /resma papel prueba/i })).toBeVisible();
});

test('lo que no existe es un 404, no una página vacía', async ({ page }) => {
  for (const ruta of ['/compradores/no-existe-e2e', '/rubros/no-existe-e2e', '/productos/no-existe-e2e']) {
    const respuesta = await page.goto(ruta);
    expect(respuesta?.status(), ruta).toBe(404);
    // El 404 propio, con salida, y no la página genérica de Next.
    await expect(page.getByRole('heading', { name: /no encontramos esta página/i })).toBeVisible();
  }
});

test('las respuestas llevan las cabeceras de seguridad', async ({ request }) => {
  const r = await request.get('/');
  expect(r.headers()['x-frame-options']).toBe('DENY');
  expect(r.headers()['x-content-type-options']).toBe('nosniff');
  expect(r.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
});

test('la tarjeta de vista previa se genera', async ({ request }) => {
  const r = await request.get('/opengraph-image');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('image/png');
});

test('robots.txt enlaza el sitemap y deja fuera la API', async ({ request }) => {
  const texto = await (await request.get('/robots.txt')).text();
  expect(texto).toMatch(/Disallow: \/api\//);
  expect(texto).toMatch(/Sitemap: .*\/sitemap\.xml/);
});
