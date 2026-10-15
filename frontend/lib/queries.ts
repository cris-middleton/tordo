'use client';

/**
 * Estado de servidor con TanStack Query.
 *
 * Antes cada pantalla hacía lo mismo a mano: `useState` para datos, otro para
 * `loading`, otro para `error`, y un `useEffect` que llamaba a la API y hacía
 * `setState`. **49 veces, en 28 archivos.** El compilador de React de Next 16 lo
 * marca con `set-state-in-effect`, y con razón: ese patrón no cancela la petición
 * anterior al cambiar de filtro, no deduplica dos componentes que piden lo mismo,
 * y deja el estado en pantalla si el componente se desmonta a mitad.
 *
 * Aquí las claves y los hooks viven en un solo sitio. **Las claves importan más
 * de lo que parece**: son lo que permite invalidar con precisión después de una
 * mutación — sin ellas, o refrescas todo o te quedas con datos viejos.
 *
 * Los hooks envuelven `lib/api.ts`, no `fetch`: el transporte (hoy, el proxy de
 * Next) se cambia ahí sin tocar una sola pantalla.
 */

import { useQuery } from '@tanstack/react-query';

import type { ParamsDestacadas } from '@/types/compraAgil';

import { apiClient } from './api';

// ── Claves ───────────────────────────────────────────────────────────────────
//
// Jerárquicas a propósito: invalidar `['bi']` alcanza a todas las consultas de
// analítica, porque es prefijo de cada una.

export const claves = {
  licitaciones: (params: Record<string, unknown>) => ['licitaciones', params] as const,
  licitacion: (codigo: string) => ['licitaciones', codigo] as const,

  compraAgilDestacadas: (params: ParamsDestacadas) => ['compra-agil', 'destacadas', params] as const,

  productosPublicos: (q: string) => ['publico', 'productos', q] as const,

  datosTransferencia: () => ['apoyar', 'transferencia'] as const,

  // BI: todas bajo el mismo prefijo, así que una invalidación las alcanza a
  // todas si algún día hace falta.
  bi: (nombre: string, params: unknown = null) => ['bi', nombre, params] as const,
};

// ── Consultas ────────────────────────────────────────────────────────────────

/**
 * Los datos de la pantalla de analítica.
 *
 * **Estas consultas existen porque la pantalla las tenía en `useState` +
 * `useEffect`.** Media docena de estados de carga a mano, un efecto de
 * inicialización de noventa líneas y tres `eslint-disable` para callar la regla
 * `set-state-in-effect`, que en este repo es `error` justamente para esto.
 * Además de la ceremonia, el patrón traía dos fallos reales: cambiar de rubro
 * dejaba datos del anterior en pantalla mientras cargaban los nuevos, y volver
 * a la pantalla re-pedía todo.
 *
 * `enabled` es lo que sustituye a los `if (!rubro) return` dentro de los
 * efectos: sin rubro no se pide, y el hook sigue siendo incondicional.
 */
export function useBIPanorama(rubro?: string) {
  return useQuery({
    queryKey: claves.bi('panorama', rubro ?? null),
    queryFn: () => apiClient.getBIPanorama(rubro as string),
    enabled: Boolean(rubro),
  });
}

export function useBIOportunidades(rubro?: string) {
  return useQuery({
    queryKey: claves.bi('oportunidades', rubro ?? null),
    queryFn: () => apiClient.getBIOportunidades({ rubro: rubro || undefined, min_score: 4, limit: 50 }),
  });
}

export function useBITendencia(rubro?: string) {
  return useQuery({
    queryKey: claves.bi('tendencia', rubro ?? null),
    queryFn: () => apiClient.getBITendencia({ rubro: rubro || undefined, limit: 15 }),
  });
}

export function useBIResumen(rubro?: string) {
  return useQuery({
    queryKey: claves.bi('resumen', rubro ?? null),
    queryFn: () => apiClient.getBIResumen(rubro as string),
    enabled: Boolean(rubro),
  });
}

export function useBIRubros() {
  return useQuery({
    queryKey: claves.bi('rubros'),
    queryFn: () => apiClient.getBIRubros(),
    // El catálogo de rubros cambia cuando corre el pipeline, una vez por
    // semana. Re-pedirlo en cada visita a la pantalla es tráfico por nada.
    staleTime: 60 * 60 * 1000,
  });
}

export function useLicitaciones(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: claves.licitaciones(params),
    queryFn: () => apiClient.getTenders(params),
    // Al cambiar de filtro o de página, mantiene lo anterior en pantalla en vez
    // de vaciarla. Sin esto la tabla parpadea en cada tecleo del buscador.
    placeholderData: (anterior) => anterior,
  });
}

/**
 * «Lo mejor de hoy en Compra Ágil». La lista cambia con cada corrida del cron
 * (cuatro al día), pero `horas_restantes` y el filtro de «cierra en más de
 * 2 h» los calcula el backend en cada petición: cinco minutos de frescura.
 */
export function useCompraAgilDestacadas(params: ParamsDestacadas) {
  return useQuery({
    queryKey: claves.compraAgilDestacadas(params),
    queryFn: () => apiClient.getCompraAgilDestacadas(params),
    placeholderData: (anterior) => anterior,
    staleTime: 5 * 60_000,
  });
}

/**
 * La búsqueda de `/productos`. Quien llama pasa el texto ya retardado
 * (`useValorRetardado`); con menos de tres letras no se pide: la búsqueda del
 * backend descarta las palabras más cortas (la firma del producto no las
 * guarda), así que «pc» o «tv» nunca encontrarían nada. El backend sigue
 * aceptando dos y responde `[]`. Los productos cambian con el cron semanal:
 * una hora de frescura sobra.
 */
export const MINIMO_BUSQUEDA_PRODUCTOS = 3;

/**
 * Los datos para transferir de `/apoyar`, sólo cuando se piden con el clic
 * (`habilitada`). Sin reintentos: un 404 dice que no está configurada, y
 * reintentarlo no lo arregla.
 */
export function useDatosTransferencia(habilitada: boolean) {
  return useQuery({
    queryKey: claves.datosTransferencia(),
    queryFn: () => apiClient.getDatosTransferencia(),
    enabled: habilitada,
    retry: false,
    staleTime: Infinity,
  });
}

export function useBuscarProductosPublicos(texto: string) {
  const q = texto.trim();
  return useQuery({
    queryKey: claves.productosPublicos(q),
    queryFn: () => apiClient.getProductosPublicos(q),
    enabled: q.length >= MINIMO_BUSQUEDA_PRODUCTOS,
    placeholderData: (anterior) => anterior,
    staleTime: 60 * 60_000,
  });
}

export function useLicitacion(codigo?: string) {
  return useQuery({
    queryKey: claves.licitacion(codigo ?? ''),
    queryFn: () => apiClient.getTenderByCode(codigo as string),
    enabled: Boolean(codigo),
  });
}

// ── BI ───────────────────────────────────────────────────────────────────────
//
// Un hook genérico en vez de veinte casi idénticos: los 22 endpoints de BI se
// llaman igual —parámetros dentro, objeto fuera— y lo único que cambia es cuál.
// Escribir veinte envoltorios sería veinte sitios donde equivocarse con la clave.

export function useBI<T>(
  nombre: string,
  fn: () => Promise<T>,
  params: unknown = null,
  habilitada = true,
) {
  return useQuery({
    queryKey: claves.bi(nombre, params),
    queryFn: fn,
    enabled: habilitada,
    // BI sale de tablas que el ETL materializa una vez al día: cinco minutos de
    // frescura es conservador y ahorra la mayoría de las llamadas.
    staleTime: 5 * 60_000,
  });
}

export function useComprador(organismoId?: string) {
  // Sustituye a `useCompradorCache`, que era una caché de promesas hecha a mano
  // con un `useRef<Map>` y un contexto propio. TanStack Query deduplica y cachea
  // de serie, así que el proveedor entero sobra.
  return useBI(
    'comprador',
    () => apiClient.getBIComprador(organismoId as string),
    organismoId,
    Boolean(organismoId),
  );
}

export function useCompetidores(organismoId?: string, rubro?: string) {
  return useBI(
    'competidores',
    () =>
      apiClient.getBICompetidores(organismoId as string, {
        rubro: rubro || undefined,
        top_n: 10,
      }),
    { organismoId, rubro },
    Boolean(organismoId),
  );
}

export function usePanelLicitacion(codigoExterno?: string) {
  return useBI(
    'panel-licitacion',
    () => apiClient.getBIPanel(codigoExterno as string),
    codigoExterno,
    Boolean(codigoExterno),
  );
}

export function usePrecioProducto(codigo?: string) {
  return useBI(
    'precio',
    () => apiClient.getBIPrecio(codigo as string),
    codigo,
    Boolean(codigo),
  );
}

export function useSectores(habilitada = true) {
  return useBI('sector', () => apiClient.getBISector({ limit: 6 }), { limit: 6 }, habilitada);
}

/**
 * Consulta genérica de BI con función libre.
 *
 * La usan las secciones que combinan varias llamadas en una sola vista —
 * `CompareMode` pide resumen, oportunidades y tendencia de un rubro— y que por
 * eso no encajan en un hook por endpoint.
 */
export function useBILibre<T>(nombre: string, params: unknown, fn: () => Promise<T>, habilitada = true) {
  return useBI(nombre, fn, params, habilitada);
}

export function useEstacionalidad(organismoId?: string, rubro?: string) {
  return useBI(
    'estacionalidad',
    () => apiClient.getBIEstacionalidad(organismoId as string, { rubro: rubro || undefined }),
    { organismoId, rubro },
    Boolean(organismoId),
  );
}

export function useDescuento(rubro?: string) {
  return useBI('descuento', () => apiClient.getBIDescuento({ rubro: rubro as string }), rubro, Boolean(rubro));
}

export function useBuscarProductos(texto: string) {
  // Se pide sólo con dos caracteres o más. El "debounce" ya no hace falta como
  // efecto: quien llama pasa el texto ya retardado y la clave hace el resto.
  return useBI(
    'productos',
    () => apiClient.getBIProductos({ q: texto, limit: 20 }),
    texto,
    texto.trim().length >= 2,
  );
}
