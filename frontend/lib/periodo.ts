/**
 * De qué meses sale una banda de precio o una cuota de mercado.
 *
 * El backend lo devuelve como `periodo` (`ventana_desde`/`ventana_hasta` del
 * pipeline): 12 meses las bandas por producto, 36 las cuotas y la concentración.
 * Una cifra sin periodo se lee como «de siempre», y no lo es.
 */

import { fechaCortaDeIntl } from './formato';

/**
 * Cuántos meses de historia lee cada análisis. **Copias de las constantes del
 * ETL** —`VENTANA_ANALYTICS_MESES` (`etl/analytics/data_loader.py`),
 * `VENTANA_BANDAS_PRECIO_MESES` (`etl/analytics/product_price_bands.py`) y
 * `VENTANA_COMPRA_AGIL_MESES` (`etl/analytics/compra_agil_comprador.py`)—, para
 * que los textos digan el número sin escribirlo a mano.
 * `etl/tests/test_ventanas_del_frontend.py` falla si se separan.
 */
export const MESES_ANALISIS = 36;
export const MESES_PRECIOS = 12;
export const MESES_COMPRA_AGIL = 6;

export interface Periodo {
  desde?: string | null;
  hasta?: string | null;
}

const MES = new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function mesCorto(iso: string): string {
  // «abr 2025» y «sep 2025»: sin el punto que Intl le pone a la abreviatura ni su «sept».
  return fechaCortaDeIntl(MES.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)));
}

/** «abr 2025 – mar 2026 (12 meses)», o null si no hay periodo. */
export function textoPeriodo(periodo?: Periodo | null): string | null {
  if (!periodo?.desde || !periodo?.hasta) return null;
  const [a1, m1] = periodo.desde.split('-').map(Number);
  const [a2, m2] = periodo.hasta.split('-').map(Number);
  const meses = (a2 - a1) * 12 + (m2 - m1) + 1;
  return `${mesCorto(periodo.desde)} – ${mesCorto(periodo.hasta)} (${meses} meses)`;
}

/**
 * «nov 2025 a oct 2026», o null si falta un extremo. La forma de los pies de
 * método de la portada y de la ficha (spec PORTADA_V7 §3.2, §3.5): sin raya y sin
 * el número de meses, que el texto de al lado ya dice cuando importa.
 */
export function rangoDeMeses(desde?: string | null, hasta?: string | null): string | null {
  if (!desde || !hasta) return null;
  return `${mesCorto(desde)} a ${mesCorto(hasta)}`;
}

/**
 * Desde cuándo se cuentan las Compras Ágiles **publicadas** de un comprador: el
 * ETL las acumula desde que el sitio empezó a recogerlas (`compra_agil_mensual`,
 * octubre de 2026), y no hay historia previa. Las órdenes, en cambio, cubren la
 * ventana entera.
 */
export const INICIO_PUBLICADAS = '2026-10';

/**
 * «Publicadas desde oct 2026» mientras la ventana de Compra Ágil
 * (`MESES_COMPRA_AGIL`, terminada en `hasta`) incluya meses sin recoger;
 * «Publicadas» cuando ya los cubre enteros. Sin `hasta`, con la fecha: es lo seguro.
 */
export function etiquetaPublicadas(hasta?: string | null): string {
  const conFecha = `Publicadas desde ${mesCorto(`${INICIO_PUBLICADAS}-01`)}`;
  if (!hasta) return conFecha;
  const [anio, mes] = hasta.split('-').map(Number);
  if (!Number.isFinite(anio) || !Number.isFinite(mes)) return conFecha;
  const indice = anio * 12 + (mes - 1) - (MESES_COMPRA_AGIL - 1);
  const desde = `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, '0')}`;
  // Octubre de 2026 cuenta a medias (se empezó el 11): sólo una ventana que
  // empieza después lo cubre entero.
  return desde <= INICIO_PUBLICADAS ? conFecha : 'Publicadas';
}
