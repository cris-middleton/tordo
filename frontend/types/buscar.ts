/**
 * Lo que `/buscar` pide al backend y cómo vuelve cada bloque (spec del rediseño §6.4).
 *
 * Un bloque **nunca lanza**: vuelve `ok` con sus datos o `fallo` con un motivo,
 * y la página lo oculta con una línea. `limite` es el 429 del límite por IP —
 * quien busca seguido tiene que esperar, no es una caída— y `error` todo lo demás.
 */

import type { CompraAgilDestacadasResponse } from './compraAgil';
import type { Tender } from './licitacion';
import type { ProductoEncontrado, ProductoPublico } from './publico';

export type MotivoFallo = 'limite' | 'error';

export type Bloque<T> = { estado: 'ok'; datos: T } | { estado: 'fallo'; motivo: MotivoFallo };

/** Lo que se usa de `GET /tenders/`: la página pedida y el total que cumple el filtro. */
export interface LicitacionesEncontradas {
  items: Tender[];
  total: number;
}

export interface ResultadosBusqueda {
  productos: Bloque<ProductoEncontrado[]>;
  /** La ficha del primer producto; `null` si no hubo producto que pedir. */
  ficha: Bloque<ProductoPublico> | null;
  licitaciones: Bloque<LicitacionesEncontradas>;
  comprasAgiles: Bloque<CompraAgilDestacadasResponse>;
}
