import type { NextRequest } from 'next/server';

import { DESCRIPCION_NOTAS, ETIQUETA_ESTADO, leerNotas, rutaNota } from '@/lib/notas';
import { construirRss, origenPublico } from '@/lib/rss';
import { NOMBRE_SITIO, respuestaRss } from '@/lib/rssServidor';

/**
 * `/rss/notas` — las notas de datos en RSS 2.0, de la más nueva a la más vieja.
 *
 * Sale del disco, no del backend (`content/notas`, en la traza del handler por
 * `next.config.js`): no gasta límite por IP y no falla con la API caída. La
 * misma caché de CDN que los otros feeds, y la cita de la fuente en cada ítem
 * (`construirRss`).
 */
export async function GET(req: NextRequest) {
  const origen = origenPublico(req.headers, req.url);
  return respuestaRss(
    construirRss({
      titulo: `Notas de datos | ${NOMBRE_SITIO}`,
      enlace: `${origen}/notas`,
      descripcion: DESCRIPCION_NOTAS,
      items: leerNotas().map((n) => ({
        titulo: n.titulo,
        enlace: `${origen}${rutaNota(n.slug)}`,
        guid: n.slug,
        fecha: n.fecha,
        descripcion: `${n.resumen} ${ETIQUETA_ESTADO[n.estado]}.`,
      })),
    }),
  );
}

export const dynamic = 'force-dynamic';
