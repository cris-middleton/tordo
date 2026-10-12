import type { NextRequest } from 'next/server';

import {
  textoComprador,
  textoCompetencia,
  textoMontoTipico,
  textoTiempo,
  mesesDeVentana,
} from '@/lib/compraAgil';
import { formatCurrency, normalizeText, shortRegion } from '@/lib/licitacionEstado';
import {
  PARAMS_RSS_COMPRA_AGIL,
  construirRss,
  fechaChile,
  filtrarParams,
  origenPublico,
} from '@/lib/rss';
import { NOMBRE_SITIO, pedirAlBackend, respuestaDeError, respuestaRss } from '@/lib/rssServidor';
import type { CompraAgilDestacadasResponse } from '@/types/compraAgil';

/**
 * `/rss/compra-agil[?region=…&search=…]` — «Lo mejor de hoy en Compra Ágil»,
 * en RSS 2.0. Los mismos filtros que la página; nada más se reenvía.
 */
export async function GET(req: NextRequest) {
  const filtros = filtrarParams(req.nextUrl.searchParams, PARAMS_RSS_COMPRA_AGIL);
  const alBackend = new URLSearchParams(filtros);
  alBackend.set('limite', '20');

  let respuesta: CompraAgilDestacadasResponse;
  try {
    respuesta = await pedirAlBackend('/compra-agil/destacadas', alBackend, req.headers);
  } catch (error) {
    return respuestaDeError(error);
  }

  const origen = origenPublico(req.headers, req.url);
  const consulta = filtros.toString();
  const meses = mesesDeVentana(respuesta.ventana_desde, respuesta.ventana_hasta);

  return respuestaRss(
    construirRss({
      titulo: `Lo mejor de hoy en Compra Ágil — ${NOMBRE_SITIO}`,
      enlace: `${origen}/compra-agil${consulta ? `?${consulta}` : ''}`,
      descripcion:
        'Compras Ágiles abiertas donde cotizar tiene más sentido: pocas cotizaciones, un comprador que adjudica y tiempo para preparar la oferta. Es una heurística, no una predicción.',
      items: (respuesta.items ?? []).map((item) => ({
        titulo: normalizeText(item.nombre),
        enlace: `${origen}/licitaciones/${encodeURIComponent(item.codigo_externo)}`,
        // El mismo código puede volver a salir mañana con otro puntaje; para
        // un lector es el mismo ítem, así que el guid es sólo el código.
        guid: item.codigo_externo,
        fecha: item.fecha_publicacion,
        descripcion: [
          item.nombre_organismo && normalizeText(item.nombre_organismo),
          item.region && shortRegion(item.region),
          item.monto_estimado ? `Monto estimado ${formatCurrency(item.monto_estimado)}` : null,
          textoCompetencia(item.ofertas_recibidas),
          textoComprador(item.comprador, meses),
          item.fecha_cierre ? `Cierra el ${fechaChile(item.fecha_cierre)}` : textoTiempo(item.horas_restantes),
          textoMontoTipico(item.comprador),
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    }),
  );
}

export const dynamic = 'force-dynamic';
