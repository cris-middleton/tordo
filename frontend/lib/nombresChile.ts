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

/**
 * «(SERVIU» → «(Serviu»: la mayúscula va en la primera letra, no en el signo. Y
 * también tras un punto o un apóstrofo: «S.A.», «I.Municipalidad», «Dr.Victor»
 * y «O'Higgins», no «S.a.», «I.municipalidad»…
 */
const capitalizar = (palabra: string) =>
  palabra
    .toLowerCase()
    .replace(/^([^\p{L}\p{N}]*)(\p{L})/u, (_, signos: string, letra: string) => signos + letra.toUpperCase())
    .replace(/(['.’])(\p{L})/gu, (_, signo: string, letra: string) => signo + letra.toUpperCase());

/** «II Región», no «Ii Region». Las de una letra salen bien con `capitalizar`. */
const ROMANO = /^(?=[ivx]{2,}$)x{0,3}(ix|iv|v?i{0,3})$/;

/** «OO PP», «FF.AA.», «EE.UU.»: las abreviaturas de plural se escriben con la letra doble en mayúscula. */
const LETRA_DOBLE = /^((\p{L})\2)+$/u;

/**
 * Una palabra sin vocales es una sigla («DCYF», «PVC», «XL»), salvo estas
 * abreviaturas, que se escriben con mayúscula inicial («Dr Salvador Allende»).
 */
const ABREVIATURAS_SIN_VOCAL = new Set(['dr', 'dra', 'sr', 'sra', 'srta', 'sn', 'st', 'mr', 'pbro', 'hn', 'hnos', 'ltd']);

/** Las formas societarias, como se escriben. */
const SOCIETARIAS: Record<string, string> = { spa: 'SpA', eirl: 'EIRL', sa: 'SA' };

/**
 * Palabras que llegan partidas en el dato de ChileCompra. Unirlas no inventa
 * nada: es la misma palabra, sin el espacio de más. «MINISTERIO DE OBRAS
 * PUBLICAS DIREC CION GRAL DE OO PP DCYF» salía «Direc Cion Gral de Oo Pp Dcyf».
 */
const PARTIDAS: [RegExp, string][] = [[/\bDIREC CION\b/gi, 'DIRECCION']];

/** Cómo se escribe una palabra que no va en minúscula. */
function escribir(palabra: string): string {
  const baja = palabra.toLowerCase();
  const letras = baja.replace(/[^\p{L}]/gu, '');
  if (SOCIETARIAS[letras] && letras === baja) return SOCIETARIAS[letras];
  if (ROMANO.test(letras) && letras === baja) return palabra.toUpperCase();
  if (letras.length >= 2 && LETRA_DOBLE.test(letras)) return palabra.toUpperCase();
  if (letras.length >= 2 && !/[aeiouáéíóúü]/.test(letras) && !ABREVIATURAS_SIN_VOCAL.has(letras)) {
    return palabra.toUpperCase();
  }
  return capitalizar(palabra);
}

/**
 * Los nombres llegan en MAYÚSCULAS desde Mercado Público. Aquí se pasan a
 * mayúscula inicial para que se puedan leer, con las preposiciones, artículos y
 * conjunciones en minúscula (`MINUSCULAS`) salvo al principio, y las siglas,
 * los números romanos y las abreviaturas en mayúscula (`escribir`). Las tildes
 * que faltan vienen del dato y no se inventan.
 */
export const normalizeText = (text: string | undefined): string => {
  if (!text) return '';
  const palabras = PARTIDAS.reduce((t, [patron, arreglo]) => t.replace(patron, arreglo), text).split(' ');
  let primera = true;
  return palabras
    .map((word, i) => {
      if (!word) return word;
      const baja = word.toLowerCase();
      const esPrimera = primera;
      primera = false;
      if (esPrimera || !MINUSCULAS.has(baja)) return escribir(word);
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
