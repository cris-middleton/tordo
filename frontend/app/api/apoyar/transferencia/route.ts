import { datosTransferencia } from '@/lib/donaciones';

/**
 * `GET /api/apoyar/transferencia` — los datos para transferir, tras el clic de
 * «Ver datos para transferir» en `/apoyar`.
 *
 * Fuera del HTML a propósito (ver `lib/donaciones.ts`). Y por eso:
 *
 * - **`force-dynamic`**: un GET sin nada dinámico podría prerenderizarse en el
 *   build, y el texto acabaría en `.next/server/app/…` servido tal cual — justo
 *   lo que busca `check:secreto`.
 * - **`no-store`**: ni el CDN ni el navegador lo guardan. Si el dueño cambia de
 *   cuenta, nadie sigue viendo la vieja.
 * - **`noindex`**: `robots.txt` ya excluye `/api/`, pero eso pide no rastrear;
 *   no impide indexar una URL que alguien enlace.
 *
 * Sin `DONAR_TRANSFERENCIA`, 404: la página no ofrece el botón, así que sólo
 * llega aquí quien escribe la URL a mano.
 */
export const dynamic = 'force-dynamic';

const CABECERAS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

export function GET() {
  const texto = datosTransferencia();
  if (!texto) {
    return Response.json(
      { detail: 'La transferencia no está habilitada.' },
      { status: 404, headers: CABECERAS },
    );
  }
  return Response.json({ texto }, { headers: CABECERAS });
}
