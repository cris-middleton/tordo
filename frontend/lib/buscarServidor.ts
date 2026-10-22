/**
 * Lo que `/buscar` pide al backend (spec del rediseño §6.4).
 *
 * **Sólo lo importa la página `app/(publico)/buscar/page.tsx`**: importa
 * `rssServidor.ts` → `backendServidor.ts`, que lee `PROXY_SECRETO`.
 *
 * - **Como el visitante** (`pedirAlBackend`, el de los feeds): cada búsqueda
 *   cuenta en el límite por IP de quien busca —hasta cinco llamadas: las cuatro
 *   listas, y después la ficha si hubo productos o la sugerencia si no hubo nada—. Una
 *   página dinámica, generada por visitante y exenta como un renderizado del
 *   servidor, sería una forma gratis de saltarse el límite.
 * - **Sin caché** (`no-store`): cada término es una URL distinta.
 * - **Pocas filas** (3 / 5 / 3 y una ficha) y **tiempo máximo por llamada**: la
 *   API de producción tiene 512 MB y un worker, y el 2026-10-14 murió por
 *   lecturas sin cota. Una página que esperara para siempre a una API caída se
 *   caería con ella.
 * - **Nunca lanza.** Un bloque que falla —error, 429, sin red, colgado o con
 *   otra forma— vuelve como `fallo` y la página lo oculta con una línea.
 */

import {
  COMPRADORES_POR_NOMBRE_EN_BUSCAR,
  COMPRAS_AGILES_EN_BUSCAR,
  PRODUCTOS_EN_BUSCAR,
  paramsLicitacionesAbiertas,
  type Busqueda,
} from './buscar';
import { segmento } from './publicoServidor';
import { ErrorDelBackend, pedirAlBackend } from './rssServidor';
import type { Bloque, LicitacionesEncontradas, ResultadosBusqueda } from '@/types/buscar';
import type { CompraAgilDestacadasResponse } from '@/types/compraAgil';
import type { CompradorEncontrado, ProductoEncontrado, ProductoPublico } from '@/types/publico';

/**
 * Lo que espera cada llamada. Dos etapas (la ficha va después de la lista de
 * productos): como mucho 12 s. La página fija `maxDuration` por encima de eso, para
 * no depender del tope por defecto de la función en Vercel (10 s sin Fluid compute):
 * si no, una API colgada daría 504 en vez de «No pudimos consultar».
 */
export const TIEMPO_MAXIMO_BLOQUE_MS = 6000;

export interface OpcionesBusqueda {
  /** Para los tests; en la página vale `TIEMPO_MAXIMO_BLOQUE_MS`. */
  tiempoMaximoMs?: number;
}

const esObjeto = (d: unknown): d is Record<string, unknown> => typeof d === 'object' && d !== null;

function esListaDeProductos(d: unknown): d is ProductoEncontrado[] {
  return Array.isArray(d) && d.every((p) => esObjeto(p) && typeof p.slug === 'string' && typeof p.firma === 'string');
}

function esListaDeCompradores(d: unknown): d is CompradorEncontrado[] {
  return Array.isArray(d) && d.every((c) => esObjeto(c) && typeof c.codigo === 'string' && typeof c.nombre === 'string');
}

function esListaDeLicitaciones(d: unknown): d is LicitacionesEncontradas {
  return esObjeto(d) && Array.isArray(d.items) && typeof d.total === 'number';
}

function esDestacadas(d: unknown): d is CompraAgilDestacadasResponse {
  return esObjeto(d) && Array.isArray(d.items);
}

function esSugerencia(d: unknown): d is { sugerencia: string | null } {
  return esObjeto(d) && (d.sugerencia === null || typeof d.sugerencia === 'string');
}

function esFicha(d: unknown): d is ProductoPublico {
  return esObjeto(d) && typeof d.slug === 'string' && Array.isArray(d.unidades) && Array.isArray(d.compradores);
}

async function pedirBloque<T>(
  nombre: string,
  ruta: string,
  params: URLSearchParams,
  cabeceras: Headers,
  esValida: (d: unknown) => d is T,
  tiempoMaximoMs: number,
): Promise<Bloque<T>> {
  try {
    const datos = await pedirAlBackend<unknown>(ruta, params, cabeceras, { tiempoMaximoMs });
    if (!esValida(datos)) throw new Error(`Respuesta inesperada de ${ruta}`);
    return { estado: 'ok', datos };
  } catch (error) {
    console.error(`buscar: ${nombre} no respondió; se oculta el bloque`, error);
    const limite = error instanceof ErrorDelBackend && error.status === 429;
    return { estado: 'fallo', motivo: limite ? 'limite' : 'error' };
  }
}

/**
 * Los bloques de una búsqueda. Productos, licitaciones, Compra Ágil y
 * compradores por su nombre en paralelo; la ficha del primer producto, después
 * (depende de la lista).
 */
export async function buscarTodo(
  busqueda: Busqueda,
  cabeceras: Headers,
  { tiempoMaximoMs = TIEMPO_MAXIMO_BLOQUE_MS }: OpcionesBusqueda = {},
): Promise<ResultadosBusqueda> {
  if (!busqueda.buscable) {
    throw new Error('buscarTodo: búsqueda de menos de tres letras; la página no debía llamar al backend');
  }
  const { termino, terminos } = busqueda;
  const [productos, licitaciones, comprasAgiles, compradoresPorNombre] = await Promise.all([
    pedirBloque(
      'los productos',
      '/publico/productos',
      new URLSearchParams({ q: termino, limite: String(PRODUCTOS_EN_BUSCAR) }),
      cabeceras,
      esListaDeProductos,
      tiempoMaximoMs,
    ),
    pedirBloque(
      'las licitaciones',
      '/tenders/',
      paramsLicitacionesAbiertas(terminos),
      cabeceras,
      esListaDeLicitaciones,
      tiempoMaximoMs,
    ),
    pedirBloque(
      'las Compras Ágiles',
      '/compra-agil/destacadas',
      new URLSearchParams({ search: termino, limite: String(COMPRAS_AGILES_EN_BUSCAR) }),
      cabeceras,
      esDestacadas,
      tiempoMaximoMs,
    ),
    pedirBloque(
      'los compradores',
      '/publico/compradores',
      new URLSearchParams({ q: termino, limite: String(COMPRADORES_POR_NOMBRE_EN_BUSCAR) }),
      cabeceras,
      esListaDeCompradores,
      tiempoMaximoMs,
    ),
  ]);

  const primero = productos.estado === 'ok' ? productos.datos[0] : undefined;
  const ficha = primero
    ? await pedirBloque(
        'la ficha del producto',
        `/publico/productos/${segmento(primero.slug)}`,
        new URLSearchParams(),
        cabeceras,
        esFicha,
        tiempoMaximoMs,
      )
    : null;

  return { productos, ficha, licitaciones, comprasAgiles, compradoresPorNombre };
}

/**
 * «¿Quisiste decir…?» (`GET /publico/sugerencia`). Sólo se pide cuando ningún
 * bloque encontró nada, así que nunca suma una quinta llamada. Nunca lanza: sin
 * respuesta, o con la misma búsqueda, `null`.
 */
export async function pedirSugerencia(
  termino: string,
  cabeceras: Headers,
  { tiempoMaximoMs = TIEMPO_MAXIMO_BLOQUE_MS }: OpcionesBusqueda = {},
): Promise<string | null> {
  const bloque = await pedirBloque(
    'la sugerencia',
    '/publico/sugerencia',
    new URLSearchParams({ q: termino }),
    cabeceras,
    esSugerencia,
    tiempoMaximoMs,
  );
  if (bloque.estado !== 'ok' || !bloque.datos.sugerencia) return null;
  const sugerencia = bloque.datos.sugerencia.trim();
  return sugerencia && sugerencia.toLowerCase() !== termino.trim().toLowerCase() ? sugerencia : null;
}
