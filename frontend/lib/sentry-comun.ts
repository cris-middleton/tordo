/**
 * Lo que comparten las tres inicializaciones de Sentry (navegador, servidor de
 * Node y edge). Vive aparte porque un ajuste de privacidad puesto en dos de los
 * tres sitios es exactamente igual de malo que no ponerlo.
 *
 * Espeja las decisiones del backend (`app/observability/sentry.py`): sin DSN no
 * se inicializa nada, no se manda PII, y se muestrea el 10 % de las trazas.
 */

/**
 * El DSN SÍ lleva `NEXT_PUBLIC_`, al contrario que `API_URL`.
 *
 * No es un descuido: para reportar un error del navegador, el navegador tiene
 * que saber a dónde mandarlo. Un DSN es público por diseño — sólo permite
 * escribir eventos en el proyecto, no leerlos.
 */
export const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || '';

export const ENTORNO = process.env.NEXT_PUBLIC_ENVIRONMENT || 'development';

/**
 * Opciones comunes. `enabled: false` sin DSN es redundante con el propio SDK,
 * pero deja explícito que en local y en los tests no sale nada a la red.
 */
export const OPCIONES_COMUNES = {
  dsn: DSN,
  environment: ENTORNO,
  enabled: Boolean(DSN),
  tracesSampleRate: 0.1,
  // Mismo criterio que el backend: por aquí pasan RUTs, licitaciones y
  // documentos de empresas. Los datos de los usuarios no salen del sistema.
  sendDefaultPii: false,
} as const;

/**
 * Ruido que no es un fallo de la aplicación y sí consume cuota.
 *
 * `AbortError` sobre todo: el cliente cancela peticiones a propósito —
 * `getCurrentUser` recibe un `AbortSignal`— y TanStack Query cancela las que
 * quedan obsoletas. Reportarlas convierte el comportamiento correcto en alarma.
 */
const IGNORADOS = [
  'AbortError',
  'CanceledError',
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
];

export function esRuido(mensaje: string | undefined): boolean {
  if (!mensaje) return false;
  return IGNORADOS.some((patron) => mensaje.includes(patron));
}
