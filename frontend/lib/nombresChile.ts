/**
 * Cómo se escriben los nombres que llegan de Mercado Público.
 *
 * Aparte de `licitacionEstado.ts` a propósito: ese módulo trae `date-fns`, y
 * estas dos funciones las necesita también `filtrosCatalogo.ts`, que a su vez
 * llega a la cabecera de TODAS las páginas (el contador de guardados). Aquí no
 * hay imports: puro texto.
 */

/**
 * Las palabras que en español van en minúscula dentro de un nombre: «Policía de
 * Investigaciones de Chile», no «Policía De Investigaciones De Chile». La primera
 * palabra del nombre va siempre con mayúscula.
 */
const MINUSCULAS = new Set(['a', 'al', 'con', 'de', 'del', 'e', 'en', 'la', 'las', 'los', 'o', 'para', 'por', 'y']);

/** Los artículos que también forman parte de un nombre de lugar («Las Condes»). */
const ARTICULOS = new Set(['la', 'las', 'los']);

/**
 * Lo que sigue a un artículo cuando el artículo es parte del nombre propio: las
 * comunas y regiones de Chile que lo llevan («Municipalidad de La Florida»,
 * «Región de Los Ríos»). Sin tildes, porque el dato casi nunca las trae. Frente a
 * la duda, la mayúscula: «de La Cruz Roja» se lee igual; «de la Florida», no.
 */
const LUGARES_CON_ARTICULO = new Set([
  'alamos',
  'andes',
  'angeles',
  'araucania',
  'cabras',
  'calera',
  'casas',
  'cisterna',
  'condes',
  'cruz',
  'estrella',
  'florida',
  'granja',
  'higuera',
  'higueras',
  'lagos',
  'ligua',
  'muermos',
  'pintana',
  'reina',
  'rios',
  'sauces',
  'serena',
  'union',
  'vilos',
]);

const sinTildes = (palabra: string) => palabra.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** «(SERVIU» → «(Serviu»: la mayúscula va en la primera letra, no en el signo. */
const capitalizar = (palabra: string) =>
  palabra.toLowerCase().replace(/^([^\p{L}\p{N}]*)(\p{L})/u, (_, signos: string, letra: string) => signos + letra.toUpperCase());

/**
 * Los nombres llegan en MAYÚSCULAS desde Mercado Público. Aquí se pasan a
 * mayúscula inicial para que se puedan leer, con las preposiciones, artículos y
 * conjunciones en minúscula (`MINUSCULAS`) salvo al principio. Las tildes que
 * faltan vienen del dato y no se inventan.
 */
export const normalizeText = (text: string | undefined): string => {
  if (!text) return '';
  const palabras = text.split(' ');
  let primera = true;
  return palabras
    .map((word, i) => {
      if (!word) return word;
      const baja = word.toLowerCase();
      const esPrimera = primera;
      primera = false;
      if (esPrimera || !MINUSCULAS.has(baja)) return capitalizar(word);
      if (ARTICULOS.has(baja)) {
        const siguiente = palabras.slice(i + 1).find(Boolean);
        if (siguiente && LUGARES_CON_ARTICULO.has(sinTildes(siguiente.toLowerCase()))) return capitalizar(word);
      }
      return baja;
    })
    .join(' ');
};

export const shortRegion = (region?: string) => {
  if (!region) return '';
  const corta = normalizeText(region)
    .replace(/^Región (Metropolitana.*)$/i, 'RM')
    .replace(/^Región (del Libertador.*)$/i, "O'Higgins")
    .replace(/^Región (Aysén.*)$/i, 'Aysén')
    .replace(/^Región (de |del |de la )?/i, '')
    .trim();
  // Sin «Región de», la que quede primera es el principio del nombre.
  return corta.charAt(0).toUpperCase() + corta.slice(1);
};
