/**
 * RSS 2.0 para seguir una búsqueda sin cuenta.
 *
 * Lo sirven dos route handlers de Next (`app/rss/*`), no el backend: la API es
 * JSON, y aquí el CDN de Vercel cachea cada feed media hora — un lector de RSS
 * pregunta cada pocos minutos y casi nunca llega al backend.
 *
 * Funciones puras. Las cabeceras y la llamada al backend viven en los handlers.
 */

import { FUENTE_DATOS } from './atribucion';
import { PARAMS_FILTRO } from './filtrosCatalogo';

/** Lo que cada feed reenvía al backend. **Nada más**: ni `limit`, ni `offset`. */
export const PARAMS_RSS_LICITACIONES = PARAMS_FILTRO;
export const PARAMS_RSS_COMPRA_AGIL = ['region', 'search'] as const;

/** Media hora en el CDN, y diez minutos más sirviendo lo viejo mientras se renueva. */
export const CACHE_RSS = 'public, s-maxage=1800, stale-while-revalidate=600';

/** Cuántos ítems lleva el feed del catálogo. */
export const ITEMS_RSS = 50;

/** La URL del feed de una búsqueda, absoluta: es lo que se pega en un lector. */
export function urlRssDeBusqueda(origen: string, consulta: string): string {
  return `${origen}/rss/licitaciones${consulta ? `?${consulta}` : ''}`;
}

/**
 * Escapa texto para XML. Los cinco de siempre, y además se quitan los
 * caracteres de control que XML 1.0 no admite ni escapados: un solo `\x0B`
 * en el nombre de una licitación invalidaría el feed entero.
 */
export function escaparXml(texto: string): string {
  return texto
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Sólo los parámetros de la lista blanca, recortados y sin vacíos. Un
 * parámetro desconocido no llega al backend: un feed no es un proxy abierto.
 */
export function filtrarParams(
  entrada: URLSearchParams,
  permitidos: readonly string[],
): URLSearchParams {
  const salida = new URLSearchParams();
  for (const nombre of permitidos) {
    const valor = entrada.get(nombre)?.trim();
    // Tope de largo: nadie busca con 500 caracteres, y la URL es la clave de caché.
    if (valor) salida.set(nombre, valor.slice(0, 200));
  }
  return salida;
}

/**
 * El origen público del sitio, para que los `<link>` sean absolutos.
 * `NEXT_PUBLIC_SITE_URL` si está; si no, el `host` de la petición.
 */
export function origenPublico(cabeceras: Headers, urlPeticion: string): string {
  const configurado = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configurado) return configurado.replace(/\/+$/, '');
  const url = new URL(urlPeticion);
  const host = cabeceras.get('host');
  if (!host) return url.origin;
  const protocolo = cabeceras.get('x-forwarded-proto')?.split(',')[0].trim() || url.protocol.replace(':', '');
  return `${protocolo}://${host}`;
}

/**
 * «12 oct 2026, 13:05», en hora de Chile. En un feed va la fecha y no «cierra
 * en 20 h»: el ítem se lee horas después, y el CDN lo guarda media hora.
 */
export function fechaChile(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export interface ItemRss {
  titulo: string;
  enlace: string;
  descripcion: string;
  /** Identificador estable: un lector lo usa para no repetir el ítem. */
  guid: string;
  fecha?: string | null;
}

export interface CanalRss {
  titulo: string;
  enlace: string;
  descripcion: string;
  items: ItemRss[];
}

function fechaRfc822(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toUTCString() : null;
}

/**
 * El documento RSS 2.0. **Cada ítem lleva la cita de la fuente**: un ítem de
 * RSS viaja solo, lejos del pie de la página, y la cita es una condición de uso
 * de los datos (`docs/DECLARACION_USO_DATOS.md`).
 */
export function construirRss(canal: CanalRss): string {
  const items = canal.items
    .map((item) => {
      const fecha = fechaRfc822(item.fecha);
      const descripcion = `${item.descripcion}\n\n${FUENTE_DATOS}`;
      return [
        '    <item>',
        `      <title>${escaparXml(item.titulo)}</title>`,
        `      <link>${escaparXml(item.enlace)}</link>`,
        `      <guid isPermaLink="false">${escaparXml(item.guid)}</guid>`,
        fecha ? `      <pubDate>${fecha}</pubDate>` : null,
        `      <description>${escaparXml(descripcion)}</description>`,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${escaparXml(canal.titulo)}</title>`,
    `    <link>${escaparXml(canal.enlace)}</link>`,
    `    <description>${escaparXml(`${canal.descripcion} ${FUENTE_DATOS}.`)}</description>`,
    '    <language>es-cl</language>',
    `    <copyright>${escaparXml(FUENTE_DATOS)}</copyright>`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ]
    .filter((linea) => linea !== '')
    .join('\n')
    .concat('\n');
}
