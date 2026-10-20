/**
 * Ayudantes de las páginas públicas (`app/(publico)/`): rutas, metadatos,
 * formato y textos.
 *
 * Funciones puras y sin secretos, así que se pueden probar sin servidor y
 * usar desde cualquier componente. Lo que habla con el backend está en
 * `publicoServidor.ts`.
 */

import type { Metadata } from 'next';

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

/** Las páginas fijas que van al sitemap, además de las de cada entidad. */
export const PAGINAS_FIJAS = [
  '/',
  '/compra-agil',
  '/licitaciones',
  '/productos',
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
  if (clp >= 1e12) return `$${uno(clp / 1e12)} billones`;
  if (clp >= 1e9) return `$${uno(clp / 1e9)} mil millones`;
  if (clp >= 1e6) return `$${Math.round(clp / 1e6).toLocaleString('es-CL')} millones`;
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
 * «46 compras de 40 organismos». Sin el dato de compradores (un backend o una
 * tabla anteriores), sólo las compras. Con una sola compra, sin organismos: se
 * da por dicho.
 */
export function comprasDeOrganismos(n: number, compradores?: number | null): string {
  if (n === 1) return '1 compra';
  const compras = `${entero(n)} compras`;
  if (compradores == null) return compras;
  return `${compras} de ${entero(compradores)} ${compradores === 1 ? 'organismo' : 'organismos'}`;
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
  if (banda.compradores === 1) return 'Todas son de un mismo organismo: es el precio de su contrato.';
  if (banda.cuota_mayor == null || banda.cuota_mayor <= 0.5) return null;
  const suyas = Math.round(banda.cuota_mayor * banda.n);
  return `${entero(suyas)} de las ${entero(banda.n)} compras son de un mismo organismo.`;
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
    openGraph: { title: titulo, description: descripcion, url: ruta, type: 'website' },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

export function metadataComprador(c: CompradorPublico): Metadata {
  const ordenes = c.perfil.volumen?.n_oc_total;
  const cifra =
    ordenes != null
      ? `${entero(ordenes)} órdenes de compra`
      : c.compra_agil
        ? `${entero(c.compra_agil.ordenes)} órdenes por Compra Ágil`
        : 'su historial de compras';
  const rubro = c.rubros[0]?.nombre;
  return base(
    rutaComprador(c.codigo),
    `${c.nombre}: qué compra y cómo`,
    `${c.nombre} en Mercado Público: ${cifra}${rubro ? `, sobre todo en ${rubro}` : ''}. ` +
      'Nota del comprador, trato directo, adjudicación y rubros, con datos de ChileCompra.',
    c.indexable,
  );
}

export function metadataRubro(r: RubroPublico): Metadata {
  const m = r.panorama.mercado;
  const cifra =
    m?.monto_clp != null && m.anio != null
      ? `${plata(m.monto_clp)} en compras públicas en ${m.anio}`
      : 'compras públicas';
  const proveedores = r.panorama.competencia?.n_proveedores;
  return base(
    rutaRubro(r.slug),
    `${r.nombre}: mercado público en Chile`,
    `${r.nombre}: ${cifra}${proveedores != null ? `, ${entero(proveedores)} proveedores` : ''}. ` +
      'Quién compra, contra quién se compite y cuándo, con datos de ChileCompra.',
    r.indexable,
  );
}

export function metadataProducto(p: ProductoPublico): Metadata {
  const nombre = nombreProducto(p);
  const categoria = categoriaProducto(p);
  const banda = bandaPrincipal(p.unidades);
  const unidad = unidadDeclarada(banda?.unidad);
  const cifra =
    banda?.p50 != null
      ? `precio mediano ${plata(banda.p50)}${unidad ? ` por ${unidad}` : ''} (${entero(banda.n)} compras)`
      : 'precios pagados por el Estado';
  return base(
    rutaProducto(p.slug),
    `Precio de ${nombre} en compras públicas`,
    `${nombre}${categoria ? ` (${categoria})` : ''}: ${cifra}. ` +
      'Bandas de precio por unidad y quién lo compra, con datos de ChileCompra.',
    p.indexable,
  );
}
