import { NextRequest, NextResponse } from 'next/server';

import { cabecerasHaciaElBackend, ipDelVisitante } from '@/lib/backendServidor';
import { API } from '@/lib/versionApi';

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
 *
 * **Sólo reenvía `GET` bajo `/api/v1/`**, que es todo lo que pide el navegador
 * (`lib/api.ts`). Antes reenviaba cualquier ruta y cualquier método, así que
 * `/api/proxy/docs` servía el Swagger del backend en el origen del sitio, y
 * `/mcp`, `/redoc` o un `POST` llegaban al backend desde aquí. Lo demás da 404;
 * un método que no sea `GET` (o `HEAD`, que Next arma a partir de `GET`), 405.
 */

const BACKEND = process.env.API_URL || 'http://localhost:8000';

function urlBackend(ruta: string): string {
  return `${BACKEND}${ruta.startsWith('/') ? ruta : `/${ruta}`}`;
}

/** Los segmentos de la versión de la API (`['api', 'v1']`), de `lib/versionApi.ts`. */
const SEGMENTOS_API = API.split('/').filter(Boolean);

/**
 * La ruta pedida, si es de la API versionada; `null` si no. Se comprueba la
 * lista de segmentos Y la ruta ya resuelta: un `..` (o `%2e%2e`, que el parser
 * de URL trata igual) sacaría la petición de `/api/v1/`, y una barra, `?` o `#`
 * dentro de un segmento (llegan decodificados) cambiarían la ruta o la consulta.
 * Un `%` sólo aparece si el cliente codificó dos veces —ningún código ni slug
 * del sitio lo lleva— y el backend lo volvería a decodificar.
 */
function rutaDeLaApi(ruta: string[]): string | null {
  if (ruta.length <= SEGMENTOS_API.length) return null;
  if (!SEGMENTOS_API.every((s, i) => ruta[i] === s)) return null;
  if (ruta.some((s) => s === '' || s === '.' || s === '..' || /[/\\?#%]/.test(s))) return null;
  const completa = `/${ruta.join('/')}`;
  if (!new URL(completa, 'http://x').pathname.startsWith(`${API}/`)) return null;
  return completa;
}

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
    // Tampoco fuera de la API versionada: la misma frontera que la petición.
    if (!absoluto.pathname.startsWith(`${API}/`)) return actual;
    actual = await reenviar(urlBackend(`${absoluto.pathname}${absoluto.search}`));
  }
  return actual;
}

async function manejar(req: NextRequest, ctx: { params: Promise<{ ruta: string[] }> }) {
  const { ruta } = await ctx.params;
  // El cliente ya manda la ruta completa del backend (`/api/v1/tenders`), así
  // que aquí sólo se quita el prefijo del proxy.
  const deLaApi = rutaDeLaApi(ruta);
  if (!deLaApi) {
    return NextResponse.json({ detail: 'No encontrado' }, { status: 404 });
  }
  const destino = urlBackend(`${deLaApi}${req.nextUrl.search}`);

  const cabecerasHaciaBackend = {
    'Content-Type': req.headers.get('content-type') ?? 'application/json',
    ...cabecerasHaciaElBackend(ipDelVisitante(req.headers)),
  };

  const pedir = (url: string) =>
    fetch(url, {
      method: req.method,
      headers: cabecerasHaciaBackend,
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

// Sólo `GET`: Next responde `HEAD` con este mismo manejador y 405 a los demás.
export const GET = manejar;

// Sin caché en el proxy: el backend decide qué se puede cachear y cuánto.
export const dynamic = 'force-dynamic';
