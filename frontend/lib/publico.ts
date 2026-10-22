/**
 * Ayudantes de las páginas públicas (`app/(publico)/`): rutas, metadatos,
 * formato y textos.
 *
 * Funciones puras y sin secretos, así que se pueden probar sin servidor y
 * usar desde cualquier componente. Lo que habla con el backend está en
 * `publicoServidor.ts`.
 */

import type { Metadata } from 'next';

import { normalizeText } from '@/lib/nombresChile';
import { MESES_ANALISIS, MESES_PRECIOS, rangoDeMeses } from '@/lib/periodo';
import { IMAGEN_OPEN_GRAPH } from '@/lib/vistaPrevia';
import type { CompradorPerfil } from '@/types/bi';
import type {
  BandaUnidad,
  CompradorPublico,
  ProductoPublico,
  RubroPublico,
} from '@/types/publico';

// ── Rutas ───────────────────────────────────────────────────────────────────
//
// Siempre con el `codigo`/`slug` que manda el backend. Nunca se construye un
// slug aquí: si el frontend slugificara por su cuenta, una regla distinta de
// la del backend daría enlaces rotos sin que nada fallara.

export const rutaComprador = (codigo: string) => `/compradores/${encodeURIComponent(codigo)}`;
export const rutaRubro = (slug: string) => `/rubros/${encodeURIComponent(slug)}`;
export const rutaProducto = (slug: string) => `/productos/${encodeURIComponent(slug)}`;
/** El detalle de una licitación o Compra Ágil, por su código de Mercado Público. */
export const rutaLicitacion = (codigo: string) => `/licitaciones/${encodeURIComponent(codigo)}`;

/**
 * El parámetro de `/productos` que lleva el término buscado: `/productos?q=resma`.
 * El buscador lo lee al montar y lo escribe al buscar (`BuscadorProductos`).
 */
export const PARAMETRO_BUSQUEDA_PRODUCTOS = 'q';

/**
 * `/productos` con el término puesto: abre directamente con los resultados.
 * Es como `/buscar` y la portada mandan a «ver todos». Sin término, la página sola.
 */
export const rutaBusquedaProductos = (termino: string) => {
  const limpio = termino.trim();
  if (!limpio) return '/productos';
  return `/productos?${new URLSearchParams({ [PARAMETRO_BUSQUEDA_PRODUCTOS]: limpio })}`;
};

/** El panel con el rubro elegido. El panel lee el NOMBRE, no el slug. */
export const rutaPanelRubro = (nombre: string) =>
  `/mercado?rubro=${encodeURIComponent(nombre)}`;

/**
 * Las páginas fijas que van al sitemap, además de las de cada entidad. Las
 * secciones de la navegación (`lib/navegacion.ts`) están todas: `/mercado`
 * faltaba, aunque es indexable y tiene su canonical.
 */
export const PAGINAS_FIJAS = [
  '/',
  '/compra-agil',
  '/licitaciones',
  '/productos',
  '/mercado',
  '/guias',
  '/notas',
  '/abierto',
  '/acerca',
  '/apoyar',
  '/terminos',
  '/privacidad',
] as const;

/**
 * Lo que `robots.txt` pide no rastrear, porque no es una página:
 *
 * - `/api/` — el proxy al backend y la revalidación. Un buscador siguiendo
 *   enlaces al proxy gastaría el límite por IP del backend en nada.
 * - `/rss/` — los feeds son para lectores de RSS, no para el índice.
 * - `/guardados` — vive en el navegador de cada uno: para un buscador
 *   es una página vacía.
 */
export const NO_RASTREAR = ['/api/', '/rss/', '/guardados'] as const;

/**
 * Los rastreadores que bajan el sitio para entrenar un modelo. No traen
 * visitas, y recorrer miles de fichas cuesta: cada una que no está en caché se
 * genera y se escribe en la Data Cache de Vercel. El 2026-10-19 la cuenta Hobby
 * quedó pausada 30 días por esas escrituras (docs/DESPLIEGUE.md §13.4).
 *
 * Los que buscan o responden a una persona (OAI-SearchBot, ChatGPT-User,
 * Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User) siguen la
 * regla general: traen a alguien al sitio o citan el dato.
 */
export const RASTREADORES_DE_ENTRENAMIENTO = [
  'GPTBot',
  'ClaudeBot',
  'CCBot',
  'Bytespider',
  'meta-externalagent',
  'Amazonbot',
  'cohere-ai',
  'cohere-training-data-crawler',
] as const;

/**
 * Lo que esos rastreadores no recorren, además de `NO_RASTREAR`: las fichas que
 * se generan bajo pedido y se guardan en caché. Son miles, y el resto del sitio
 * cabe en unas decenas de páginas.
 */
export const FICHAS_BAJO_PEDIDO = ['/productos/', '/compradores/', '/rubros/'] as const;

/** El origen público del sitio, sin barra final. Lo usan sitemap y robots. */
export function origenDelSitio(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://tordo.cl').replace(/\/+$/, '');
}

// ── Formato ─────────────────────────────────────────────────────────────────

/**
 * Un monto en pesos, abreviado. La lectura de precio de la portada lo usa para
 * decidir si P25 y P75 se escriben igual («la mitad se pagó a $X»).
 */
export function plata(clp?: number | null): string {
  if (clp == null) return '—';
  const uno = (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 1 });
  // «$1 millón», no «$1 millones»: el singular cuando la cifra escrita es 1.
  const con = (cifra: string, singular: string, plural: string) => `$${cifra} ${cifra === '1' ? singular : plural}`;
  if (clp >= 1e12) return con(uno(clp / 1e12), 'billón', 'billones');
  if (clp >= 1e9) return `$${uno(clp / 1e9)} mil millones`;
  if (clp >= 1e6) return con(Math.round(clp / 1e6).toLocaleString('es-CL'), 'millón', 'millones');
  return `$${Math.round(clp).toLocaleString('es-CL')}`;
}

export function entero(n?: number | null): string {
  return n == null ? '—' : Math.round(n).toLocaleString('es-CL');
}

export function porcentaje(fraccion?: number | null): string {
  return fraccion == null ? '—' : `${Math.round(fraccion * 100)}%`;
}

/** «2026-10-04» → «4 oct 2026». Sin `Date`, para no depender del huso. */
export function fechaCorta(iso?: string | null): string | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}`;
}

const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** Largo máximo del nombre de un producto: lo que cabe en un `<title>` con su contexto. */
export const LARGO_NOMBRE_PRODUCTO = 80;

/** Un token sin letras al principio de la descripción: «(4194153)», «0900317», «353-0050». */
const CODIGO_INICIAL = /^[([]?[\d.,/\-]+[)\]]?$/;

/**
 * La descripción que escribe el comprador, lista para titular: sin los códigos
 * internos del principio ni tabuladores o saltos de línea, en tipo oración si
 * venía toda en mayúsculas y cortada en una palabra si es larga. `null` si no
 * queda nada con letras.
 */
function tituloDeDescripcion(descripcion: string | null | undefined): string | null {
  if (typeof descripcion !== 'string') return null;
  const palabras = descripcion.replace(/\s+/g, ' ').trim().split(' ');
  while (palabras.length && CODIGO_INICIAL.test(palabras[0])) palabras.shift();
  let texto = palabras.join(' ').replace(/[\s.,;:\-–]+$/u, '');
  if (!/\p{L}/u.test(texto)) return null;
  // Toda en mayúsculas: a tipo oración. Con minúsculas, el comprador ya eligió.
  if (!/\p{Ll}/u.test(texto)) texto = texto.toLowerCase();
  if (texto.length > LARGO_NOMBRE_PRODUCTO) {
    const corte = texto.lastIndexOf(' ', LARGO_NOMBRE_PRODUCTO);
    texto = `${texto.slice(0, corte > 0 ? corte : LARGO_NOMBRE_PRODUCTO).replace(/[\s.,;:\-–]+$/u, '')}…`;
  }
  return capitalizar(texto);
}

/**
 * El nombre con que se presenta un producto: **cómo lo escribe quien lo compra**
 * (`descripcion`, la especificación más frecuente de su banda con más compras),
 * y si no hay una legible, la firma.
 *
 * No la firma de entrada: son sus palabras ordenadas y sin relleno, y
 * «Higiénico jumbo papel» no se lee como un nombre. Tampoco el nombre genérico:
 * es la categoría UNSPSC, y miles de productos la comparten —«Guantes
 * protectores» para el de nitrilo, el de látex y el de vinilo—. Dos productos no
 * pueden quedar con el mismo nombre: la firma sale de la descripción, así que
 * firmas distintas vienen de descripciones distintas. La firma sigue siendo la
 * identidad y el slug.
 */
export function nombreProducto(p: { firma: string; descripcion?: string | null }): string {
  return tituloDeDescripcion(p.descripcion) ?? capitalizar(p.firma.trim());
}

/**
 * «46 compras de 40 compradores» (la misma palabra que el pie del gráfico, al
 * lado: docs/VOZ.md §4). Sin el dato de compradores (un backend o una tabla
 * anteriores), sólo las compras. Con una sola compra, sin compradores: se da por
 * dicho.
 */
export function comprasDeOrganismos(n: number, compradores?: number | null): string {
  if (n === 1) return '1 compra';
  const compras = `${entero(n)} compras`;
  if (compradores == null) return compras;
  return `${compras} de ${entero(compradores)} ${compradores === 1 ? 'comprador' : 'compradores'}`;
}

/**
 * La frase de la banda. «Entre $1.150 y $1.150» no dice nada: si p25 y p75 se
 * escriben igual con `plata()`, se dice el precio; y si también p10 y p90, que
 * todas las compras se pagaron a él.
 */
export function frasePrecio(banda: BandaUnidad): string {
  const { n, p10, p25, p75, p90 } = banda;
  const a = plata(p25);
  if (a !== plata(p75)) return `La mitad de las ${entero(n)} compras se pagó entre ${a} y ${plata(p75)}.`;
  if (n === 1) return `La única compra se pagó a ${a}.`;
  if (plata(p10 ?? p25) === a && plata(p90 ?? p75) === a) return `Las ${entero(n)} compras se pagaron a ${a}.`;
  return `La mitad de las ${entero(n)} compras se pagó a ${a}.`;
}

/**
 * Lo que hay que saber de una banda que NO es un precio de mercado (`de_mercado`,
 * la regla vive en el backend): de un solo organismo, o con uno que hizo más de
 * la mitad de las compras. `null` si es de mercado o si no se sabe.
 */
export function notaCompradores(banda: BandaUnidad): string | null {
  if (banda.de_mercado !== false || banda.compradores == null) return null;
  if (banda.compradores === 1) return 'Todas las compras son de un mismo comprador: es el precio de su contrato.';
  if (banda.cuota_mayor == null || banda.cuota_mayor <= 0.5) return null;
  const suyas = Math.round(banda.cuota_mayor * banda.n);
  return `${entero(suyas)} de las ${entero(banda.n)} compras son de un mismo comprador.`;
}

/**
 * Cuántas compras pide L0 a un comprador para listarlo (`MIN_N_L0` en
 * `etl/analytics/product_price_bands.py`). Hasta que la semanal materializa
 * `product_price_compradores`, «Quién lo compra» sale de L0.
 */
export const MINIMO_COMPRAS_L0 = 3;

/**
 * Qué dice la lista de «Quién lo compra». Con `medianas_compradores` (la tabla
 * de todos los compradores) son los que más veces lo compraron. Sin ella la
 * lista sale de L0, que sólo cuenta a quien lo compró `MINIMO_COMPRAS_L0` veces
 * o más: «87 compras de 63 compradores» sobre una lista de uno se leía como un
 * error. Entonces se dice el corte y cuántos quedan fuera.
 */
export function listaDeL0(p: Pick<ProductoPublico, 'unidades'>): boolean {
  return p.unidades.length > 0 && p.unidades.every((u) => u.medianas_compradores == null);
}

export function descripcionCompradores(p: Pick<ProductoPublico, 'unidades' | 'compradores'>): string {
  if (!listaDeL0(p)) return 'Los que más veces lo compraron, y lo que pagó cada uno (su mediana).';
  const corte = `Los que lo compraron ${MINIMO_COMPRAS_L0} veces o más, y lo que pagó cada uno (su mediana).`;
  const principal = p.unidades[0];
  const listados = new Set(p.compradores.filter((c) => c.unidad === principal.unidad).map((c) => c.codigo)).size;
  if (principal.compradores == null || listados >= principal.compradores) return corte;
  const cuantos = listados === 1 ? 'Es uno' : `Son ${entero(listados)}`;
  return `${corte} ${cuantos} de ${entero(principal.compradores)}: los demás lo compraron una o dos veces.`;
}

/** La categoría del catálogo, como contexto debajo del nombre; null si no hay. */
export function categoriaProducto(p: Pick<ProductoPublico, 'nombre_generico'>): string | null {
  const generico = p.nombre_generico?.trim();
  return generico ? capitalizar(generico) : null;
}

/**
 * La unidad ausente, tal como la escribe el pipeline
 * (`etl/analytics/normalizacion.py`, `UNIDAD_SIN_DECLARAR`): un texto, no un nulo.
 */
const UNIDAD_SIN_DECLARAR = 'sin unidad declarada';

/**
 * La unidad de una banda en minúsculas, o `null` si no hay ninguna que decir:
 * nula, vacía o el literal «sin unidad declarada» (con cualquier mayúscula,
 * tilde o espacio de más). «Por sin unidad declarada» no es una frase.
 */
export function unidadDeclarada(unidad: string | null | undefined): string | null {
  const limpia = (unidad ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!limpia || limpia === UNIDAD_SIN_DECLARAR) return null;
  return (unidad ?? '').trim().toLowerCase();
}

/** El título de una banda: «Por caja», o «Sin unidad declarada». */
export function tituloDeBanda(unidad: string | null | undefined): string {
  const u = unidadDeclarada(unidad);
  return u ? `Por ${u}` : 'Sin unidad declarada';
}

/**
 * El sujeto de la frase de precio de una banda, en la ficha y en `/buscar`:
 * «Precio por caja: la mitad de las compras se pagó entre…». Con «Por caja» a
 * secas, la frase no decía de qué era la mitad.
 */
export function precioDeLaBanda(unidad: string | null | undefined): string {
  const u = unidadDeclarada(unidad);
  return u ? `Precio por ${u}` : 'Precio sin unidad declarada';
}

/**
 * Un nombre dentro de una frase: «Cuánto paga el Estado por resmas tamaño
 * oficio». Baja la primera letra sólo si la segunda ya es minúscula, para no
 * tocar una sigla («HP», «UPS»).
 */
export function enFrase(nombre: string): string {
  return /^\p{Lu}\p{Ll}/u.test(nombre) ? nombre.charAt(0).toLowerCase() + nombre.slice(1) : nombre;
}

/** La banda con más observaciones: la que resume el producto en el título. */
export function bandaPrincipal(unidades: BandaUnidad[]): BandaUnidad | null {
  return unidades.reduce<BandaUnidad | null>((mejor, u) => (!mejor || u.n > mejor.n ? u : mejor), null);
}

// ── Comprador ───────────────────────────────────────────────────────────────

/**
 * Las señales del historial del comprador, en palabras. Los mismos textos que
 * el panel (`CompradoresSection`). Lo que dicen las banderas de aceptación es
 * lo que tarda el PROVEEDOR en aceptar la orden: no es un plazo de pago.
 */
const SENALES: { clave: keyof NonNullable<CompradorPerfil['risk_flags']>; texto: string }[] = [
  { clave: 'aceptacion_lenta', texto: 'Sus órdenes tardan en aceptarse bastante más que lo habitual' },
  { clave: 'aceptacion_impredecible', texto: 'El tiempo hasta aceptar una orden varía mucho' },
  { clave: 'cancelaciones', texto: 'Cancela órdenes con frecuencia' },
  { clave: 'licitaciones_fallidas', texto: 'Declara desierta una parte alta de lo que licita' },
  { clave: 'baja_calificacion', texto: 'Los proveedores le ponen baja calificación' },
  { clave: 'compras_irregulares', texto: 'Compra de forma muy irregular a lo largo del año' },
];

export function senalesDelComprador(perfil: CompradorPerfil): string[] {
  const banderas = perfil.risk_flags;
  if (!banderas) return [];
  return SENALES.filter((s) => banderas[s.clave] === true).map((s) => s.texto);
}

/** `CompradorResponse` → lo que pinta `BuyerProfilePanel` (la forma del panel de licitación). */
export function panelDesdePerfil(perfil: CompradorPerfil, nombre: string) {
  return {
    disponible: perfil.disponible,
    nombre: perfil.nombre ?? nombre,
    buyer_score: perfil.buyer_score,
    clasificacion: perfil.clasificacion,
    tasa_adjudicacion: perfil.tramitacion?.tasa_adjudicacion ?? null,
    n_flags: perfil.risk_flags?.n_flags ?? 0,
    n_base: perfil.volumen?.n_oc_total ?? null,
    transparencia: perfil.transparencia
      ? {
          clasificacion: perfil.transparencia.clasificacion,
          pct_trato_directo: perfil.transparencia.pct_trato_directo,
        }
      : null,
    motivo: perfil.motivo,
  };
}

// ── Metadatos ───────────────────────────────────────────────────────────────

/** Lo que mide una meta description antes de que el buscador la corte. */
export const LARGO_DESCRIPCION = 155;

/**
 * La primera opción que cabe en `LARGO_DESCRIPCION`, de la más completa a la más
 * corta. Si ninguna cabe (un nombre de 80 caracteres), la última, cortada en una
 * palabra.
 */
function laQueCabe(...opciones: string[]): string {
  const cabe = opciones.find((o) => o.length <= LARGO_DESCRIPCION);
  if (cabe) return cabe;
  const ultima = opciones[opciones.length - 1];
  const corte = ultima.lastIndexOf(' ', LARGO_DESCRIPCION - 1);
  return `${ultima.slice(0, corte > 0 ? corte : LARGO_DESCRIPCION - 1)}…`;
}

/**
 * Lo común a las tres: canonical y, si el backend dice que la página no tiene
 * datos suficientes, `noindex`. La página existe igual —se llega por
 * búsqueda o por un enlace— pero no compite en Google con una ficha vacía.
 */
function base(ruta: string, titulo: string, descripcion: string, indexable: boolean): Metadata {
  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: ruta },
    openGraph: { title: titulo, description: descripcion, url: ruta, type: 'website', images: [IMAGEN_OPEN_GRAPH] },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

/**
 * El nombre con que se titula la ficha de un comprador: el de analytics, escrito
 * como en el resto del sitio (`normalizeText`), o «Comprador {código}» si no
 * trae ninguno. Hay compradores indexables con `nombre: null` en la API, y sin
 * esto su ficha salía con el `h1` vacío y el título «: qué compra y cómo».
 */
export function nombreDeComprador(nombre: string | null | undefined, codigo: string): string {
  return normalizeText(nombre?.trim() || undefined) || `Comprador ${codigo}`;
}

export function metadataComprador(c: CompradorPublico): Metadata {
  const ordenes = c.perfil.volumen?.n_oc_total;
  const meses = rangoDeMeses(c.periodo?.ventana_desde, c.periodo?.ventana_hasta);
  const cifra =
    ordenes != null
      ? `${entero(ordenes)} órdenes de compra${meses ? ` de ${meses}` : ''}`
      : c.compra_agil
        ? `${entero(c.compra_agil.ordenes)} órdenes por Compra Ágil`
        : null;
  const rubro = c.rubros[0]?.nombre;
  const resumen = cifra
    ? `${c.nombre}: ${cifra}${rubro ? `, sobre todo en ${enFrase(rubro)}` : ''}.`
    : `${c.nombre} en Mercado Público.`;
  return base(
    rutaComprador(c.codigo),
    `${c.nombre}: qué compra y cómo`,
    laQueCabe(
      `${resumen} Qué compra, si adjudica lo que licita y cómo compra por Compra Ágil.`,
      `${resumen} Qué compra y si adjudica lo que licita.`,
      resumen,
    ),
    c.indexable,
  );
}

export function metadataRubro(r: RubroPublico): Metadata {
  const m = r.panorama.mercado;
  const nombre = enFrase(r.nombre);
  const proveedores = r.panorama.competencia?.n_proveedores;
  const monto =
    m?.monto_clp != null && m.anio != null
      ? `El Estado compró ${plata(m.monto_clp)} en ${nombre} en ${m.anio}.`
      : `Lo que compra el Estado en ${nombre}.`;
  const vendedores =
    proveedores != null ? ` ${entero(proveedores)} proveedores le vendieron en los últimos ${MESES_ANALISIS} meses.` : '';
  return base(
    rutaRubro(r.slug),
    `Cuánto compra el Estado en ${nombre}`,
    laQueCabe(
      `${monto}${vendedores} Quién compra más, quién vende más y en qué meses.`,
      `${monto}${vendedores}`,
      monto,
    ),
    r.indexable,
  );
}

export function metadataProducto(p: ProductoPublico): Metadata {
  const nombre = nombreProducto(p);
  const banda = bandaPrincipal(p.unidades);
  const unidad = unidadDeclarada(banda?.unidad);
  const meses = rangoDeMeses(p.periodo?.ventana_desde, p.periodo?.ventana_hasta);
  const cifra =
    banda?.p50 != null
      ? `precio mediano ${plata(banda.p50)}${unidad ? ` por ${unidad}` : ''} en ${comprasDeOrganismos(banda.n, banda.compradores)}`
      : `lo que pagó el Estado en los últimos ${MESES_PRECIOS} meses`;
  const resumen = `${nombre}: ${cifra}${banda?.p50 != null && meses ? `, ${meses}` : ''}.`;
  return base(
    rutaProducto(p.slug),
    `Cuánto paga el Estado por ${enFrase(nombre)}`,
    laQueCabe(`${resumen} Quién lo compra y a qué precio.`, resumen, `${nombre}: ${cifra}.`),
    p.indexable,
  );
}
