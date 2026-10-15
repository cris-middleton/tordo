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
  '/abierto',
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

/** El origen público del sitio, sin barra final. Lo usan sitemap y robots. */
export function origenDelSitio(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://tordo.cl').replace(/\/+$/, '');
}

// ── Formato ─────────────────────────────────────────────────────────────────

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

/**
 * El nombre con que se presenta un producto: su FIRMA, con mayúscula inicial.
 *
 * No el nombre genérico: ése es la categoría UNSPSC, y miles de productos
 * comparten la misma —«Guantes protectores» para el de nitrilo, el de látex y
 * el de vinilo—. Titular por ella daba miles de páginas con el mismo `<title>`,
 * que para un buscador son duplicados y para quien llega no dicen qué es.
 */
export function nombreProducto(p: Pick<ProductoPublico, 'firma'>): string {
  return capitalizar(p.firma.trim());
}

/** La categoría del catálogo, como contexto debajo del nombre; null si no hay. */
export function categoriaProducto(p: Pick<ProductoPublico, 'nombre_generico'>): string | null {
  const generico = p.nombre_generico?.trim();
  return generico ? capitalizar(generico) : null;
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
  const cifra =
    banda?.p50 != null
      ? `precio mediano ${plata(banda.p50)} por ${banda.unidad.toLowerCase()} (${entero(banda.n)} compras)`
      : 'precios pagados por el Estado';
  return base(
    rutaProducto(p.slug),
    `Precio de ${nombre} en compras públicas`,
    `${nombre}${categoria ? ` (${categoria})` : ''}: ${cifra}. ` +
      'Bandas de precio por unidad y quién lo compra, con datos de ChileCompra.',
    p.indexable,
  );
}
