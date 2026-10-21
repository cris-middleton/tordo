/**
 * El enlace que se copia desde `/mercado` («Copiar enlace», «Copiar resumen»).
 *
 * Sin rubro en la URL la pantalla abre en el de más mercados, y ese rubro por
 * defecto no se escribe en la URL (`/mercado` sigue siendo `/mercado`). Copiar
 * `location.href` a secas compartía entonces «el rubro por defecto de quien lo
 * abra», que cambia cada semana: quien recibía el enlace podía ver otro rubro.
 * El enlace copiado lleva el rubro que se está viendo.
 */
export function enlaceConRubro(href: string, rubro: string): string {
  if (!rubro) return href;
  const url = new URL(href);
  if (url.searchParams.get('rubro')) return href;
  url.searchParams.set('rubro', rubro);
  return url.toString();
}
