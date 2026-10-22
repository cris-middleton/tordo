/**
 * Los pies de método (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md V3, §3.2–§3.4): bajo
 * cada gráfico, de qué base sale, de qué periodo, y tres enlaces —«Cómo se
 * calcula», «Ver en la API» y «Código»—. Es lo que comparten los sitios de datos
 * que se leen como trabajo serio: la procedencia a la vista.
 *
 * Cada método se declara aquí, una vez, con la guía y el ancla que lo explican y
 * el fichero del repo que lo calcula. `__tests__/metodo.test.ts` recorre
 * `METODOS` y falla si un fichero ya no existe o si la guía o su ancla cambiaron:
 * un «Cómo se calcula» roto es peor que ninguno.
 *
 * Puro y sin secretos: el repositorio llega como argumento (`urlRepositorio()` se
 * lee en el servidor). Sin repositorio, no hay «Código».
 */

import { BASE_API_PUBLICA } from './abierto';
import { urlEnRepositorio } from './repositorio';

export interface EnlaceMetodo {
  texto: string;
  href: string;
  /** Fuera del sitio (la API, el repositorio): `<a>`, no `Link`. */
  externo: boolean;
}

export interface Metodo {
  /** La guía (`content/explicativos/<guia>.mdx`) y el `id` del título que lo explica. */
  guia?: { slug: string; ancla: string };
  /** El fichero del repositorio que lo calcula. */
  codigo: string;
}

/** La banda de precio por producto: P25–P75 y la mediana de cada comprador. */
export const METODO_PRECIO: Metodo = {
  guia: { slug: 'como-leer-una-banda-de-precio', ancla: 'los-cinco-numeros' },
  codigo: 'etl/analytics/product_price_bands.py',
};

/** Las Compras Ágiles abiertas por día de cierre, en hora de Chile. */
export const METODO_CIERRES: Metodo = {
  codigo: 'backend/app/repositories/licitaciones.py',
};

/** El monto de las órdenes de compra por mes y sector (`analytics.time_series`). */
export const METODO_GASTO: Metodo = {
  guia: { slug: 'de-donde-salen-los-datos', ancla: 'las-dos-fuentes' },
  codigo: 'etl/analytics/trend_analysis.py',
};

/** Cuánto se lleva el proveedor principal de cada mercado (`analytics.market_concentration`). */
export const METODO_CONCENTRACION: Metodo = {
  guia: { slug: 'concentracion-de-mercado', ancla: 'como-se-calcula' },
  codigo: 'etl/analytics/competitor_analysis.py',
};

/** Quién le compra a quién: los organismos que más compran y sus proveedores (`analytics.competitors_by_market`). */
export const METODO_RED: Metodo = {
  guia: { slug: 'concentracion-de-mercado', ancla: 'la-red-de-la-portada' },
  codigo: 'backend/app/repositories/analytics_sync.py',
};

/** Todos, para el test: uno nuevo se añade aquí y el test lo revisa. */
export const METODOS: Readonly<Record<string, Metodo>> = {
  precio: METODO_PRECIO,
  cierres: METODO_CIERRES,
  gasto: METODO_GASTO,
  concentracion: METODO_CONCENTRACION,
  red: METODO_RED,
};

/** `/guias/<slug>#<ancla>`. */
export const rutaComoSeCalcula = ({ slug, ancla }: { slug: string; ancla: string }) => `/guias/${slug}#${ancla}`;

/**
 * Los enlaces del pie, en su orden: `primero` (el enlace de la lectura: «Ver el
 * producto», «Las que cierran primero»), «Cómo se calcula», «Ver en la API»
 * (`api` es la ruta bajo `/api/v1`, en la dirección pública de la API) y
 * «Código», sólo con repositorio.
 */
export function enlacesDeMetodo(
  metodo: Metodo,
  { primero, api, repositorio }: { primero?: EnlaceMetodo; api?: string; repositorio: string | null },
): EnlaceMetodo[] {
  const enlaces: EnlaceMetodo[] = primero ? [primero] : [];
  if (metodo.guia) enlaces.push({ texto: 'Cómo se calcula', href: rutaComoSeCalcula(metodo.guia), externo: false });
  if (api) enlaces.push({ texto: 'Ver en la API', href: `${BASE_API_PUBLICA}${api}`, externo: true });
  const codigo = urlEnRepositorio(repositorio, metodo.codigo);
  if (codigo) enlaces.push({ texto: 'Código', href: codigo, externo: true });
  return enlaces;
}
