/**
 * Una URL que viene en el dato de Mercado Público, sólo si es de Mercado Público.
 *
 * `url_licitacion` llega de la API de ChileCompra y se pinta como `href`. Sin
 * filtro, un `javascript:` o un dominio ajeno en ese campo sería un enlace del
 * sitio hacia donde dijera el dato. Se acepta `https:` o `http:` hacia
 * `mercadopublico.cl` o un subdominio, sin usuario ni contraseña; lo demás no
 * se enlaza.
 */

const DOMINIO = 'mercadopublico.cl';

export function urlDeMercadoPublico(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host !== DOMINIO && !host.endsWith(`.${DOMINIO}`)) return null;
  return url.href;
}

/**
 * La ficha pública de una licitación en Mercado Público, armada desde su código.
 *
 * `url_licitacion` casi nunca viene en el dato, y sin ella la ficha no tenía cómo
 * ir a postular. Esta dirección la publica el propio portal: redirige a la ficha
 * de esa licitación (comprobado el 2026-10-22 con 2450-100-LE26). La Compra Ágil
 * no vive ahí: su ficha es la del buscador (`urlMercadoPublico`, `lib/compraAgil.ts`).
 */
export function urlLicitacionMercadoPublico(codigo: string): string {
  return `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${encodeURIComponent(codigo)}`;
}
