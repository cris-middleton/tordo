import { NextRequest, NextResponse } from 'next/server';

import { cabecerasHaciaElBackend, ipDelVisitante } from '@/lib/backendServidor';

/**
 * Proxy hacia el backend. Todo el tráfico del navegador pasa por aquí.
 *
 * Desde el pivote a sitio público no hay cuentas: el proxy ya no lee cookies,
 * no pone `Authorization` ni renueva nada. Sigue existiendo por dos motivos:
 *
 * 1. **La URL del backend es de servidor** (`API_URL`). El navegador habla con
 *    `/api/proxy` en su mismo origen y no necesita saber dónde vive la API.
 * 2. **Las redirecciones internas del backend se resuelven aquí** — ver
 *    `seguirRedirecciones`.
 *
 * Tampoco reenvía las cabeceras del navegador: no hay nada que el backend
 * necesite de ellas, y reenviarlas tal cual le pasaría las cookies de este
 * dominio a un tercero.
 *
 * Lo que sí añade es **quién es el visitante** y el secreto que hace que el
 * backend lo crea (`lib/backendServidor.ts`): sin eso el límite por IP del
 * backend contaría a todo el sitio como un solo cliente.
 */

const BACKEND = process.env.API_URL || 'http://localhost:8000';

function urlBackend(ruta: string): string {
  return `${BACKEND}${ruta.startsWith('/') ? ruta : `/${ruta}`}`;
}

const SIN_CUERPO = new Set(['GET', 'HEAD']);

/**
 * Cuántas redirecciones internas del backend se siguen antes de rendirse.
 * Una basta para el `redirect_slashes` de FastAPI; el tope existe para que un
 * backend mal configurado no deje al proxy dando vueltas.
 */
const MAX_REDIRECCIONES = 3;

/** Cabeceras de la respuesta del backend que sí le importan al navegador. */
const CABECERAS_DE_VUELTA = [
  'content-type',
  'content-disposition',
  // El límite por IP: sin ellas el cliente sólo se entera por el 429.
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
];

/**
 * Sigue las redirecciones del backend AQUÍ, sin devolvérselas al navegador.
 *
 * Sin esto, cualquier ruta terminada en `/` —`/api/v1/tenders/`— entraba en un
 * bucle infinito y **nunca cargaba**:
 *
 *   1. El navegador pide `/api/proxy/api/v1/tenders/`.
 *   2. Next normaliza y responde **308** a `/api/proxy/api/v1/tenders`.
 *   3. El proxy reenvía a `/api/v1/tenders`, y FastAPI (`redirect_slashes`)
 *      responde **307** a `/api/v1/tenders/`.
 *   4. Ese 307 se le pasaba al navegador, que volvía al paso 1.
 *
 * Son redirecciones del enrutado interno del backend: al navegador no le
 * incumben. Se siguen sólo si apuntan al MISMO backend — `redirect: 'follow'`
 * a secas convertiría un Location manipulado en una petición nuestra hacia
 * donde dijera ese Location.
 *
 * Se compara el HOST, no el origen, y se vuelve a pedir por `API_URL`. Desde el
 * rediseño 0d la API responde `Location` RELATIVO (`app/core/redirecciones.py`)
 * y se resuelve contra `API_URL`. La comparación por host se queda por el caso
 * de #155: un `Location` absoluto en `http://` —lo que escribía la API detrás
 * del TLS de Railway— no se seguía, el navegador recibía un 307 sin Location y
 * el catálogo no cargaba.
 */
async function seguirRedirecciones(
  respuesta: Response,
  reenviar: (destino: string) => Promise<Response>,
): Promise<Response> {
  let actual = respuesta;
  for (let i = 0; i < MAX_REDIRECCIONES; i++) {
    if (actual.status < 300 || actual.status >= 400) return actual;
    const destino = actual.headers.get('location');
    if (!destino) return actual;
    const absoluto = new URL(destino, urlBackend('/'));
    if (absoluto.host !== new URL(urlBackend('/')).host) return actual;
    actual = await reenviar(urlBackend(`${absoluto.pathname}${absoluto.search}`));
  }
  return actual;
}

async function manejar(req: NextRequest, ctx: { params: Promise<{ ruta: string[] }> }) {
  const { ruta } = await ctx.params;
  // El cliente ya manda la ruta completa del backend (`/api/v1/tenders`), así
  // que aquí sólo se quita el prefijo del proxy.
  const destino = urlBackend(`/${ruta.join('/')}${req.nextUrl.search}`);

  // El cuerpo se lee UNA vez: un `Request` no se puede consumir dos veces, y
  // seguir una redirección necesita el mismo cuerpo.
  const cuerpo = SIN_CUERPO.has(req.method) ? undefined : await req.arrayBuffer();

  const cabecerasHaciaBackend = {
    'Content-Type': req.headers.get('content-type') ?? 'application/json',
    ...cabecerasHaciaElBackend(ipDelVisitante(req.headers)),
  };

  const pedir = (url: string) =>
    fetch(url, {
      method: req.method,
      headers: cabecerasHaciaBackend,
      body: cuerpo && cuerpo.byteLength > 0 ? cuerpo : undefined,
      cache: 'no-store',
      redirect: 'manual',
    });

  const respuesta = await seguirRedirecciones(await pedir(destino), pedir);

  const cabeceras = new Headers();
  for (const nombre of CABECERAS_DE_VUELTA) {
    const valor = respuesta.headers.get(nombre);
    if (valor) cabeceras.set(nombre, valor);
  }
  if (!cabeceras.has('content-type')) cabeceras.set('content-type', 'application/json');

  return new NextResponse(await respuesta.arrayBuffer(), {
    status: respuesta.status,
    headers: cabeceras,
  });
}

export const GET = manejar;
export const POST = manejar;
export const PUT = manejar;
export const PATCH = manejar;
export const DELETE = manejar;

// Sin caché en el proxy: el backend decide qué se puede cachear y cuánto.
export const dynamic = 'force-dynamic';
