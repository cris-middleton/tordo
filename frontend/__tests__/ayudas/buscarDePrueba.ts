/**
 * Respuestas del backend para `/buscar`, según los contratos de
 * `/publico/productos`, `/tenders/` y `/compra-agil/destacadas`. Escritas a mano:
 * si la forma cambia en el backend, `types/` es lo primero que hay que tocar.
 */
import { vi } from 'vitest';

import type { Bloque, LicitacionesEncontradas, MotivoFallo } from '@/types/buscar';
import type { CompraAgilDestacada, CompraAgilDestacadasResponse } from '@/types/compraAgil';
import type { Tender } from '@/types/licitacion';
import type { ProductoEncontrado } from '@/types/publico';

import { PRODUCTO } from './publicoDePrueba';

export { PRODUCTO };

export const BACKEND = 'http://backend.prueba:8000';
export const SECRETO = 'secreto-de-prueba-del-proxy-0123456789';

/** El primero es `PRODUCTO` (su ficha): `guante-latex-nitrilo`. */
export const PRODUCTOS: ProductoEncontrado[] = [
  { slug: 'guante-latex-nitrilo', firma: 'guante latex nitrilo', n: 150, indexable: true },
  { slug: 'guante-nitrilo-talla', firma: 'guante nitrilo talla', n: 40, indexable: true },
  { slug: 'guante-nitrilo-azul', firma: 'guante nitrilo azul', n: 6, indexable: false },
];

function licitacion(n: number): Tender {
  return {
    id: n,
    codigo_externo: `1234-${n}-LE26`,
    nombre: `ADQUISICION DE GUANTES DE NITRILO ${n}`,
    fecha_publicacion: '2026-10-10T09:00:00-03:00',
    fecha_cierre: '2026-10-20T15:00:00-03:00',
    monto_estimado: 2_500_000,
    estado: 'Publicada',
    region: 'Región del Biobío ',
    nombre_organismo: 'HOSPITAL DE PRUEBA',
  };
}

/** Dos en la página y 12 en total: el total es el del enlace, no el largo de la página. */
export const LICITACIONES: LicitacionesEncontradas & { page: number; size: number; pages: number } = {
  items: [licitacion(1), licitacion(2)],
  total: 12,
  page: 1,
  size: 5,
  pages: 3,
};

function destacada(n: number): CompraAgilDestacada {
  return {
    codigo_externo: `5678-${n}-COT26`,
    nombre: `GUANTES DE NITRILO TALLA M ${n}`,
    nombre_organismo: 'Hospital de Prueba',
    region: 'Región Metropolitana de Santiago',
    monto_estimado: 500_000,
    fecha_publicacion: '2026-10-12T10:00:00Z',
    fecha_cierre: '2026-10-16T10:00:00Z',
    horas_restantes: 30,
    ofertas_recibidas: 1,
    ofertas_al: null,
    comprador: null,
    puntaje: 0.8,
    factores: { competencia: 1, comprador: 0.5, tiempo: 0.4, monto: 0.7 },
  };
}

export const DESTACADAS: CompraAgilDestacadasResponse = {
  actualizado_en: '2026-10-14T13:05:00-03:00',
  historia_disponible: false,
  ventana_desde: null,
  ventana_hasta: null,
  items: [destacada(1), destacada(2), destacada(3)],
};

export const ok = <T,>(datos: T): Bloque<T> => ({ estado: 'ok', datos });
export const fallo = <T,>(motivo: MotivoFallo = 'error'): Bloque<T> => ({ estado: 'fallo', motivo });

export const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

/** Un backend que no responde nunca: sólo termina si se aborta la petición. */
export const colgado = (_url: URL, init: RequestInit) =>
  new Promise<Response>((_resolver, rechazar) => {
    init.signal?.addEventListener('abort', () => rechazar(init.signal?.reason));
  });

export interface Pedida {
  url: URL;
  init: RequestInit;
}

type Responder = (url: URL, init: RequestInit) => Response | Promise<Response>;

/**
 * Sustituye `fetch`: responde por ruta, sin el prefijo `/api/v1`
 * (`'/tenders/'`, `'/publico/productos'`…). Lo que no está en `rutas` es 404.
 * Devuelve la lista (viva) de lo que se pidió.
 */
export function simularBackend(rutas: Record<string, Responder>): Pedida[] {
  const pedidas: Pedida[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const u = new URL(url);
      pedidas.push({ url: u, init });
      const responder = rutas[u.pathname.replace(/^\/api\/v1/, '')];
      return responder ? responder(u, init) : json({ detail: 'No existe' }, 404);
    }),
  );
  return pedidas;
}

export const COMPRADORES_POR_NOMBRE = [
  { codigo: '7297', nombre: 'HOSPITAL DE TALCA', n: 9000, indexable: true },
];

export const TODO_BIEN: Record<string, Responder> = {
  '/publico/productos': () => json(PRODUCTOS),
  '/publico/productos/guante-latex-nitrilo': () => json(PRODUCTO),
  '/tenders/': () => json(LICITACIONES),
  '/compra-agil/destacadas': () => json(DESTACADAS),
  // Lo normal al buscar un producto: ningún comprador se llama así.
  '/publico/compradores': () => json([]),
};
