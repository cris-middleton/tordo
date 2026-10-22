/**
 * `/buscar?q=` (spec del rediseño §6.4): una búsqueda, tres respuestas —cuánto
 * ha pagado el Estado, qué está abierto ahora y quién lo compra—.
 *
 * Funciones puras y sin secretos: las usan la página (servidor), sus bloques,
 * la portada (PR 6, los ejemplos) y los tests. Lo que habla con el backend está
 * en `buscarServidor.ts`.
 *
 * **Las constantes de búsqueda no se importan de `queries.ts`**: ese módulo es
 * `'use client'`, y un componente de servidor no recibe sus valores sino
 * referencias de cliente. `__tests__/buscar-lib.test.ts` fija que coinciden.
 */

import { leerFiltros, paramsDeApi, urlCatalogoAbiertas } from './filtrosCatalogo';
import type { MotivoFallo, ResultadosBusqueda } from '@/types/buscar';
import type { CompradorDeProducto } from '@/types/publico';

/** El parámetro de `/buscar` con el término. */
export const PARAMETRO_BUSCAR = 'q';

/**
 * Desde cuántos caracteres se busca. La regla de `/productos`
 * (`MINIMO_BUSQUEDA_PRODUCTOS`): la búsqueda de precios descarta las palabras
 * de menos de tres letras, y con menos no hay nada que encontrar.
 */
export const MINIMO_LETRAS_BUSCAR = 3;

/** Copia de `limites.TEXTO` (`backend/app/api/limites.py`): `q` y `search` lo tienen de `max_length`. */
export const MAXIMO_CARACTERES_BUSCAR = 100;

/**
 * Copia de `limites.MAX_TERMINOS`: Compra Ágil responde 422 con más palabras.
 * El recorte vale para los TRES bloques —y sus enlaces—, para que cada total
 * sea el del enlace que lo acompaña. `test_buscar_limites_del_frontend.py`
 * falla si estas dos copias se separan del backend.
 */
export const MAXIMO_TERMINOS_BUSCAR = 8;

// Cuántas filas pide cada bloque. Pocas a propósito: la API tiene 512 MB y un
// worker, y cada búsqueda cuenta en el límite por IP de quien busca.
export const PRODUCTOS_EN_BUSCAR = 3;
export const LICITACIONES_EN_BUSCAR = 5;
export const COMPRAS_AGILES_EN_BUSCAR = 3;
/** Cuántos compradores por su nombre: es un atajo a una ficha, no una lista. */
export const COMPRADORES_POR_NOMBRE_EN_BUSCAR = 3;
export const COMPRADORES_EN_BUSCAR = 5;

/**
 * Los ejemplos clicables de `/buscar` y de la portada (spec PORTADA_V7 §3.8).
 * Verificados contra producción el 2026-10-16: cada uno trae una ficha indexable.
 * Cosas que una PYME vende y un comprador público pide, de varios rubros.
 * Sin nombres cortos ni alfanuméricos («pc», «A4», «3M»): la búsqueda de precios
 * los descarta y no encontrarían nada.
 */
export const EJEMPLOS_BUSQUEDA = [
  'lápiz pasta',
  'cloro',
  'agua mineral',
  'impresora',
  'pendón',
  'cambio de aceite',
] as const;

/** Cuántos caben en una línea bajo el buscador de la portada (los primeros). `/buscar` los muestra todos. */
export const EJEMPLOS_EN_PORTADA = 4;

export interface Busqueda {
  /** Lo que se busca y se muestra: limpio y recortado. Es `terminos.join(' ')`. */
  termino: string;
  terminos: string[];
  /** ¿Se llama al backend? Sólo desde `MINIMO_LETRAS_BUSCAR` caracteres. */
  buscable: boolean;
  /** ¿Se cortó lo que llegó en la URL? La página lo dice. */
  recortada: boolean;
}

/**
 * Lo que separa palabras, como `str.split()` de Python en el backend: `\s` de JS más
 * los separadores U+001C–U+001F, que Python también corta. Sin ellos, un `q`
 * armado a propósito llegaba a Compra Ágil con más de 8 palabras (422).
 */
export const ESPACIOS = /[\s\u001c-\u001f]+/;

/**
 * El término de `?q=` listo para buscar. Con dos `q` vale la primera; los
 * espacios se colapsan; se queda con `MAXIMO_TERMINOS_BUSCAR` palabras y
 * `MAXIMO_CARACTERES_BUSCAR` caracteres. Nunca lanza.
 */
export function prepararBusqueda(crudo: string | string[] | null | undefined): Busqueda {
  const primero = Array.isArray(crudo) ? crudo[0] : crudo;
  const todas = (primero ?? '').normalize('NFC').split(ESPACIOS).filter(Boolean);
  // Por caracteres (puntos de código), como cuenta el backend: `.slice` corta
  // unidades UTF-16 y partiría un emoji dejando media pareja suelta.
  const unido = Array.from(todas.slice(0, MAXIMO_TERMINOS_BUSCAR).join(' '))
    .slice(0, MAXIMO_CARACTERES_BUSCAR)
    .join('');
  const terminos = unido.split(ESPACIOS).filter(Boolean);
  const termino = terminos.join(' ');
  return {
    termino,
    terminos,
    buscable: termino.length >= MINIMO_LETRAS_BUSCAR,
    recortada: termino !== todas.join(' '),
  };
}

/** `/buscar` con el término puesto. Nadie arma esta URL a mano. */
export function rutaBuscar(termino: string): string {
  const limpio = termino.trim();
  if (!limpio) return '/buscar';
  return `/buscar?${new URLSearchParams({ [PARAMETRO_BUSCAR]: limpio })}`;
}

/**
 * Los parámetros de `GET /tenders/` del bloque de licitaciones: **los del
 * enlace «ver todas»** (`urlCatalogoAbiertas`), leídos como los lee el
 * catálogo, con una página de `LICITACIONES_EN_BUSCAR`. Así el total que se
 * muestra es, por construcción, el que se encuentra al seguir el enlace.
 */
export function paramsLicitacionesAbiertas(terminos: string[]): URLSearchParams {
  const enlace = new URL(urlCatalogoAbiertas('licitaciones', terminos), 'https://enlace.invalid');
  const api = { ...paramsDeApi(leerFiltros(enlace.searchParams)), offset: 0, limit: LICITACIONES_EN_BUSCAR };
  const params = new URLSearchParams();
  for (const [nombre, valor] of Object.entries(api)) params.set(nombre, String(valor));
  return params;
}

/**
 * Un comprador por código, en el orden del backend (más compras primero). Los
 * compradores de la ficha traen una fila por comprador y unidad
 * (`product_price_compradores`, o L0 mientras la tabla no exista).
 */
export function compradoresDistintos(
  compradores: CompradorDeProducto[],
  maximo: number,
): CompradorDeProducto[] {
  const vistos = new Set<string>();
  const salida: CompradorDeProducto[] = [];
  for (const c of compradores) {
    if (vistos.has(c.codigo)) continue;
    vistos.add(c.codigo);
    salida.push(c);
    if (salida.length === maximo) break;
  }
  return salida;
}

/** `monto_estimado` llega como texto (un `Decimal` de Pydantic) o como número; null si no es una cifra. */
export function montoNumerico(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** La línea con que un bloque fallido se oculta. Un 429 no es una caída: pide esperar. */
export function textoDeFallo(que: string, motivo: MotivoFallo): string {
  return motivo === 'limite'
    ? `Hiciste muchas búsquedas seguidas: espera un momento y vuelve a cargar la página para ver ${que}.`
    : `No pudimos consultar ${que} ahora. Prueba de nuevo en un momento.`;
}

export type EstadoBusqueda = 'con-resultados' | 'sin-resultados' | 'incompleta';

/**
 * ¿Puede la página decir «no encontramos nada»? Sólo si los tres bloques
 * (productos, licitaciones y Compra Ágil) respondieron y ninguno trae nada, ni
 * hay un comprador con ese nombre.
 *
 * **Los compradores por su nombre no deciden si la búsqueda está completa**: son
 * un atajo, no una de las tres respuestas, y una API que todavía no tiene
 * `/publico/compradores` (el frontend se despliega antes que la API) los da
 * por fallidos. Si contaran, ninguna búsqueda vacía diría «no encontramos» ni
 * propondría «¿Quisiste decir…?». Con alguno caído no se sabe: `incompleta`.
 */
export function estadoDeLaBusqueda(r: ResultadosBusqueda): EstadoBusqueda {
  const hay =
    (r.productos.estado === 'ok' && r.productos.datos.length > 0) ||
    (r.licitaciones.estado === 'ok' && r.licitaciones.datos.items.length > 0) ||
    (r.comprasAgiles.estado === 'ok' && r.comprasAgiles.datos.items.length > 0) ||
    (r.compradoresPorNombre.estado === 'ok' && r.compradoresPorNombre.datos.length > 0);
  if (hay) return 'con-resultados';
  const todos = [r.productos, r.licitaciones, r.comprasAgiles].every((b) => b.estado === 'ok');
  return todos ? 'sin-resultados' : 'incompleta';
}
