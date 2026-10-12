import type { NextRequest } from 'next/server';

import { describirBusqueda } from '@/lib/filtrosCatalogo';
import { formatCurrency, normalizeText, shortRegion } from '@/lib/licitacionEstado';
import {
  ITEMS_RSS,
  PARAMS_RSS_LICITACIONES,
  construirRss,
  fechaChile,
  filtrarParams,
  origenPublico,
} from '@/lib/rss';
import { NOMBRE_SITIO, pedirAlBackend, respuestaDeError, respuestaRss } from '@/lib/rssServidor';
import type { Tender } from '@/types/licitacion';

/**
 * `/rss/licitaciones?<filtros del catálogo>` — las últimas 50 publicadas que
 * cumplen una búsqueda, en RSS 2.0.
 *
 * Acepta los mismos parámetros que filtran en `/dashboard/tenders` (lista
 * blanca: `PARAMS_RSS_LICITACIONES`). El orden y el tamaño los pone el feed:
 * más recientes primero, 50.
 */
export async function GET(req: NextRequest) {
  const filtros = filtrarParams(req.nextUrl.searchParams, PARAMS_RSS_LICITACIONES);
  const alBackend = new URLSearchParams(filtros);
  alBackend.set('sort_by', 'fecha_publicacion');
  alBackend.set('sort_order', 'desc');
  alBackend.set('limit', String(ITEMS_RSS));
  alBackend.set('offset', '0');

  let respuesta: { items: Tender[] };
  try {
    respuesta = await pedirAlBackend('/tenders/', alBackend, req.headers);
  } catch (error) {
    return respuestaDeError(error);
  }

  const origen = origenPublico(req.headers, req.url);
  const consulta = filtros.toString();
  const busqueda = describirBusqueda(consulta);

  return respuestaRss(
    construirRss({
      titulo: `${busqueda} — ${NOMBRE_SITIO}`,
      enlace: `${origen}/dashboard/tenders${consulta ? `?${consulta}` : ''}`,
      descripcion: `Las últimas licitaciones publicadas en Mercado Público que cumplen esta búsqueda: ${busqueda}.`,
      items: (respuesta.items ?? []).map((t) => ({
        titulo: normalizeText(t.nombre),
        enlace: `${origen}/dashboard/tenders/${encodeURIComponent(t.codigo_externo)}`,
        guid: t.codigo_externo,
        fecha: t.fecha_publicacion,
        descripcion: [
          t.nombre_organismo && normalizeText(t.nombre_organismo),
          t.region && shortRegion(t.region),
          t.monto_estimado ? `Monto estimado ${formatCurrency(t.monto_estimado)}` : null,
          t.fecha_cierre ? `Cierra el ${fechaChile(t.fecha_cierre)}` : null,
          t.estado,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    }),
  );
}

export const dynamic = 'force-dynamic';
