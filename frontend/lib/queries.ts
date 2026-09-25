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
 * Los hooks envuelven `lib/api.ts`, no `fetch`. Esa capa es la que permitirá
 * mover el transporte a un proxy con cookie `httpOnly` sin tocar una sola
 * pantalla.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from './api';

// ── Claves ───────────────────────────────────────────────────────────────────
//
// Jerárquicas a propósito: invalidar `claves.empresas()` alcanza también a
// `claves.empresaMiembros(id)`, porque la primera es prefijo de la segunda.

export const claves = {
  usuario: () => ['usuario'] as const,

  empresas: () => ['empresas'] as const,
  empresaPlan: (empresaId: string) => ['empresas', empresaId, 'plan'] as const,
  empresaMiembros: (empresaId: string) => ['empresas', empresaId, 'miembros'] as const,
  empresaDocumentos: (empresaId: string) => ['empresas', empresaId, 'documentos'] as const,
  empresaEstadoHabil: (empresaId: string) => ['empresas', empresaId, 'estado-habil'] as const,
  empresaApiKeys: (empresaId: string) => ['empresas', empresaId, 'api-keys'] as const,
  empresaPrecios: (empresaId: string) => ['empresas', empresaId, 'precios-vigilados'] as const,
  empresaPerfil: (empresaId: string) => ['empresas', empresaId, 'perfil-semantico'] as const,

  licitaciones: (params: Record<string, unknown>) => ['licitaciones', params] as const,
  licitacion: (codigo: string) => ['licitaciones', codigo] as const,

  ordenes: (params: Record<string, unknown>) => ['ordenes', params] as const,

  alertas: (params: Record<string, unknown>) => ['alertas', params] as const,
  alertaPreferencias: (soloActivas: boolean) => ['alertas', 'preferencias', soloActivas] as const,

  postulaciones: (empresaId: string, params: Record<string, unknown>) =>
    ['postulaciones', empresaId, params] as const,

  panel: (empresaId?: string) => ['panel', empresaId ?? null] as const,
  panelEstadisticas: () => ['panel', 'estadisticas'] as const,

  cobroPlanes: () => ['cobro', 'planes'] as const,
  cobroEstado: () => ['cobro', 'estado'] as const,

  // BI: todas bajo el mismo prefijo, así que una invalidación las alcanza a
  // todas si algún día hace falta.
  bi: (nombre: string, params: unknown = null) => ['bi', nombre, params] as const,
};

// ── Consultas ────────────────────────────────────────────────────────────────

export function useUsuario(habilitada = true) {
  return useQuery({
    queryKey: claves.usuario(),
    queryFn: ({ signal }) => apiClient.getCurrentUser(signal),
    enabled: habilitada,
    // El usuario no cambia mientras navega. Pedirlo en cada pantalla era una
    // llamada por montaje.
    staleTime: 5 * 60_000,
  });
}

export function useEmpresas() {
  return useQuery({ queryKey: claves.empresas(), queryFn: () => apiClient.getEmpresas() });
}

export function usePlanEmpresa(empresaId?: string) {
  return useQuery({
    queryKey: claves.empresaPlan(empresaId ?? ''),
    queryFn: () => apiClient.getPlanEmpresa(empresaId as string),
    enabled: Boolean(empresaId),
  });
}

/**
 * ¿Encaja esta licitación con lo que vende la empresa?
 *
 * Es capacidad Pro y el backend responde 402 a los demás, así que quien llama
 * decide `habilitada` según el plan: sin eso, cada ficha abierta por un usuario
 * Free dispararía el aviso de mejora sin que hubiera pedido nada.
 */
export function useEncajeLicitacion(
  codigo: string,
  empresaId: string | undefined,
  texto: string,
  habilitada: boolean,
) {
  return useQuery({
    queryKey: claves.bi('encaje', { codigo, empresaId, texto }),
    queryFn: () =>
      apiClient.getBILicitacionMatch(codigo, { empresa_id: empresaId as string, texto }),
    enabled: habilitada && Boolean(codigo && empresaId) && texto.length >= 3,
    retry: false,
  });
}

export function useApiKeys(empresaId?: string) {
  return useQuery({
    queryKey: claves.empresaApiKeys(empresaId ?? ''),
    queryFn: () => apiClient.getApiKeys(empresaId as string),
    enabled: Boolean(empresaId),
  });
}

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

export function usePerfilSemantico(empresaId?: string) {
  return useQuery({
    queryKey: claves.empresaPerfil(empresaId ?? ''),
    queryFn: () => apiClient.getTFIDFPerfil(empresaId as string),
    enabled: Boolean(empresaId),
  });
}

export function useGuardarPerfilSemantico(empresaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { descripcion: string; rubros_usados: string[] }) =>
      apiClient.updateTFIDFPerfil(empresaId, datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.empresaPerfil(empresaId) }),
  });
}

export function useEmpresaMiembros(empresaId?: string) {
  return useQuery({
    queryKey: claves.empresaMiembros(empresaId ?? ''),
    queryFn: () => apiClient.getEmpresaMembers(empresaId as string),
    // `enabled` es lo que evita el patrón `if (!id) return` dentro de un efecto:
    // sin empresa no se pide, y el hook sigue siendo incondicional.
    enabled: Boolean(empresaId),
  });
}

export function usePreciosVigilados(empresaId?: string) {
  return useQuery({
    queryKey: claves.empresaPrecios(empresaId ?? ''),
    queryFn: () => apiClient.getPreciosVigilados(empresaId as string),
    enabled: Boolean(empresaId),
  });
}

export function useDocumentos(empresaId?: string) {
  return useQuery({
    queryKey: claves.empresaDocumentos(empresaId ?? ''),
    queryFn: () => apiClient.getDocumentos(empresaId as string),
    enabled: Boolean(empresaId),
  });
}

export function useEstadoHabil(empresaId?: string) {
  return useQuery({
    queryKey: claves.empresaEstadoHabil(empresaId ?? ''),
    queryFn: () => apiClient.getEstadoHabil(empresaId as string),
    enabled: Boolean(empresaId),
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

export function useLicitacion(codigo?: string) {
  return useQuery({
    queryKey: claves.licitacion(codigo ?? ''),
    queryFn: () => apiClient.getTenderByCode(codigo as string),
    enabled: Boolean(codigo),
  });
}

export function useOrdenes(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: claves.ordenes(params),
    queryFn: () => apiClient.getOrders(params),
    placeholderData: (anterior) => anterior,
  });
}

export function useAlertas(params: Record<string, unknown> = {}) {
  return useQuery({ queryKey: claves.alertas(params), queryFn: () => apiClient.getAlerts(params) });
}

export function useAlertaPreferencias(soloActivas = true) {
  return useQuery({
    queryKey: claves.alertaPreferencias(soloActivas),
    queryFn: () => apiClient.getAlertPreferences(soloActivas),
  });
}

export function usePostulaciones(empresaId?: string, params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: claves.postulaciones(empresaId ?? '', params),
    queryFn: () => apiClient.getPostulaciones(empresaId as string, params),
    enabled: Boolean(empresaId),
  });
}

export function usePanel(empresaId?: string) {
  return useQuery({
    queryKey: claves.panel(empresaId),
    queryFn: () => apiClient.getDashboardHome(empresaId),
  });
}

export function useCobroPlanes() {
  return useQuery({
    queryKey: claves.cobroPlanes(),
    queryFn: () => apiClient.getBillingPlans(),
    // Los planes cambian con un despliegue, no durante una sesión.
    staleTime: 30 * 60_000,
  });
}

export function useCobroEstado() {
  return useQuery({ queryKey: claves.cobroEstado(), queryFn: () => apiClient.getBillingStatus() });
}

// ── Mutaciones ───────────────────────────────────────────────────────────────
//
// Cada una invalida lo que deja obsoleto. Es la mitad que se olvida: sin
// invalidar, la pantalla sigue mostrando lo de antes hasta que alguien recarga.

export function useCancelarSuscripcion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (empresaId?: string) => apiClient.cancelarSuscripcion(empresaId),
    // Invalidar es el motivo de que las claves vivan en un solo sitio: tras
    // cancelar, el estado de cobro y el plan de la empresa dejan de ser válidos.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: claves.cobroEstado() });
      qc.invalidateQueries({ queryKey: claves.empresas() });
    },
  });
}

// Sumar o quitar a alguien mueve DOS cosas: la lista y los asientos
// consumidos. Invalidar sólo la lista deja el contador "2 de 3" congelado justo
// al lado de la fila que acaba de aparecer.
function invalidarEquipo(qc: ReturnType<typeof useQueryClient>, empresaId: string) {
  qc.invalidateQueries({ queryKey: claves.empresaMiembros(empresaId) });
  qc.invalidateQueries({ queryKey: claves.empresaPlan(empresaId) });
}

export function useAgregarMiembro(empresaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, rol }: { email: string; rol: 'admin' | 'viewer' }) =>
      apiClient.addEmpresaMember(empresaId, email, rol),
    onSuccess: () => invalidarEquipo(qc, empresaId),
  });
}

export function useEliminarMiembro(empresaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => apiClient.removeEmpresaMember(empresaId, userId),
    onSuccess: () => invalidarEquipo(qc, empresaId),
  });
}

export function useCrearApiKey(empresaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nombre: string) => apiClient.crearApiKey(empresaId, nombre),
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.empresaApiKeys(empresaId) }),
  });
}

export function useRevocarApiKey(empresaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (claveId: string) => apiClient.revocarApiKey(empresaId, claveId),
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.empresaApiKeys(empresaId) }),
  });
}

export function useVigilarPrecio(empresaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: { codigo_producto: string; nombre_producto?: string; umbral_pct?: number }) =>
      apiClient.vigilarPrecio(empresaId, datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.empresaPrecios(empresaId) }),
  });
}

export function useDejarDeVigilarPrecio(empresaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suscripcionId: number) => apiClient.dejarDeVigilarPrecio(empresaId, suscripcionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.empresaPrecios(empresaId) }),
  });
}

export function useMarcarAlertaLeida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: number) => apiClient.markAlertAsRead(alertId),
    // Prefijo: alcanza a todas las combinaciones de filtros de alertas.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alertas'] }),
  });
}

export function useEliminarAlerta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: number) => apiClient.deleteAlert(alertId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alertas'] }),
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

export function useRadarSemanal(empresaId?: string) {
  return useBI(
    'radar',
    () => apiClient.getBIRadarSemanal(empresaId as string),
    empresaId,
    Boolean(empresaId),
  );
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

export function useMiPosicion(empresaId?: string, rubro?: string) {
  // `enabled` sustituye al efecto que disparaba la carga cuando ambos valores
  // estaban disponibles: la consulta simplemente no corre hasta que lo están.
  return useBI(
    'mi-posicion',
    () => apiClient.getBIMiPosicion({ empresa_id: empresaId as string, rubro: rubro as string }),
    { empresaId, rubro },
    Boolean(empresaId && rubro),
  );
}

export function usePanelLicitacion(codigoExterno?: string, empresaId?: string) {
  return useBI(
    'panel-licitacion',
    () => apiClient.getBIPanel(codigoExterno as string, empresaId),
    { codigoExterno, empresaId },
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
