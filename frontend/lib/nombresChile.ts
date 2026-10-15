/**
 * Cómo se escriben los nombres que llegan de Mercado Público.
 *
 * Aparte de `licitacionEstado.ts` a propósito: ese módulo trae `date-fns`, y
 * estas dos funciones las necesita también `filtrosCatalogo.ts`, que a su vez
 * llega a la cabecera de TODAS las páginas (el contador de guardados). Aquí no
 * hay imports: puro texto.
 */

/**
 * Los nombres llegan en MAYÚSCULAS desde Mercado Público. Aquí se pasan a
 * capitular para que se puedan leer.
 */
export const normalizeText = (text: string | undefined): string => {
  if (!text) return '';
  return text
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const shortRegion = (region?: string) => {
  if (!region) return '';
  return normalizeText(region)
    .replace(/^Región (Metropolitana.*)$/i, 'RM')
    .replace(/^Región (del Libertador.*)$/i, "O'Higgins")
    .replace(/^Región (Aysén.*)$/i, 'Aysén')
    .replace(/^Región (de |del |de la )?/i, '')
    .trim();
};
