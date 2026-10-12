import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * `POST /api/revalidar`: lo que los cron (`etl/cron.py`, `Revalidador`) le piden
 * a Next al terminar. Dos partes:
 *
 * 1. **El contrato**: 401 sin secreto o con otro, 400 con una etiqueta que no
 *    está en la lista blanca, 200 `{"revalidadas": [...]}` con la buena.
 * 2. **Que de verdad marca la caché.** El servidor de Next de los E2E es el
 *    standalone del build de producción, así que ISR es el de verdad. Sin tocar
 *    la base: una página con la etiqueta `analytics` pasa a HIT; tras revalidar,
 *    la siguiente visita sale STALE (stale-while-revalidate, el perfil `'max'`)
 *    y luego vuelve a HIT. Que el CONTENIDO cambie exigiría mutar la base a
 *    mitad del test; ese recorrido completo está a mano en docs/DESPLIEGUE.md
 *    («Si algo falla»).
 *
 * `REVALIDAR_SECRETO` lo genera `scripts/e2e.sh`, como `PROXY_SECRETO`, y lo
 * reciben tanto el servidor de Next como este proceso.
 */

const SECRETO = process.env.REVALIDAR_SECRETO ?? '';
const CABECERA = 'X-Revalidar-Secreto';

function revalidar(request: APIRequestContext, cuerpo: unknown, secreto?: string) {
  return request.post('/api/revalidar', {
    data: cuerpo,
    headers: secreto === undefined ? {} : { [CABECERA]: secreto },
  });
}

test.beforeAll(() => {
  expect(SECRETO, 'scripts/e2e.sh tiene que exportar REVALIDAR_SECRETO').not.toBe('');
});

test('sin secreto, 401', async ({ request }) => {
  const r = await revalidar(request, { etiquetas: ['analytics'] });
  expect(r.status()).toBe(401);
});

test('con otro secreto, 401', async ({ request }) => {
  const r = await revalidar(request, { etiquetas: ['analytics'] }, `${SECRETO}-no`);
  expect(r.status()).toBe(401);
});

test('con el secreto y una etiqueta desconocida, 400', async ({ request }) => {
  const r = await revalidar(request, { etiquetas: ['todo'] }, SECRETO);
  expect(r.status()).toBe(400);
});

test('con el secreto y ["analytics"], 200 y la lista de revalidadas', async ({ request }) => {
  const r = await revalidar(request, { etiquetas: ['analytics'] }, SECRETO);
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({ revalidadas: ['analytics'] });
});

async function estadoDeCache(request: APIRequestContext, ruta: string): Promise<string> {
  const r = await request.get(ruta);
  expect(r.status()).toBe(200);
  return (r.headers()['x-nextjs-cache'] ?? '').toUpperCase();
}

async function hastaHit(request: APIRequestContext, ruta: string) {
  // La primera visita genera la página (MISS) o la sirve vieja si otro test la
  // dejó así (STALE); en un par de vueltas queda en caché.
  await expect.poll(() => estadoDeCache(request, ruta), { timeout: 15_000 }).toBe('HIT');
}

test('revalidar ["analytics"] marca como vieja una página con esa etiqueta', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  const ruta = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]).pathname)
    .find((r) => r.startsWith('/compradores/'));
  expect(ruta, 'el sitemap no trae ninguna ficha de comprador').toBeTruthy();

  await hastaHit(request, ruta as string);

  const r = await revalidar(request, { etiquetas: ['analytics'] }, SECRETO);
  expect(r.status()).toBe(200);

  // La primera visita tras revalidar sirve la copia vieja mientras regenera.
  expect(await estadoDeCache(request, ruta as string)).toBe('STALE');
  // Y la regeneración termina: vuelve a estar en caché, ya fresca.
  await hastaHit(request, ruta as string);
});
