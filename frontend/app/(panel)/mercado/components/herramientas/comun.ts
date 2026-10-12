import { mensajeDeError } from '@/lib/errores';

import type { Periodo } from '@/lib/periodo';

import type { OrganismoConNombre } from '../../types';
import { motivoParaPersona } from '@/lib/motivos';
import { decimal } from '@/lib/formato';

/**
 * Lo que comparten las cuatro herramientas avanzadas de BI.
 *
 * `extractErrorMessage` está aquí porque el backend devuelve el detalle en
 * formas distintas según de dónde venga el error, y cada pestaña lo enseña tal
 * cual: es texto escrito para que lo lea una persona.
 *
 * Quien lee el `detail` es `mensajeDeError`: esta función tenía su propia copia,
 * tipada como `string`, y en un 422 no lo es. Lo propio de BI —el límite de
 * consultas, el módulo apagado, `motivo`— se queda aquí.
 */

export function extractErrorMessage(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { motivo?: string } }; message?: string };
  const status = e?.response?.status;
  // Respaldo vacío: distingue «el backend explicó» de «no hay nada que enseñar».
  const detail = mensajeDeError(err, '') || motivoParaPersona(e?.response?.data?.motivo, '');

  // Sin cuentas no hay cuota diaria ni plan que mejorar: un 429 es el límite
  // de peticiones por minuto, y basta con esperar.
  if (status === 429) {
    return 'Demasiadas consultas seguidas. Espera un momento y vuelve a intentarlo.';
  }
  if (status === 503) {
    return detail || 'Módulo no disponible en esta instalación.';
  }
  if (detail) return detail;
  if (e?.message) return `Error: ${e.message}`;
  return 'Error desconocido al consultar.';
}

export type Tab = 'precio' | 'descuento' | 'forecast' | 'simular';

export interface HerramientasAvanzadasProps {
  rubro: string;
  topOrganismos?: OrganismoConNombre[];
  allRubros?: string[];
}

export interface PrecioBanda {
  codigoProductoONU?: string;
  NombreProductoGenerico?: string;
  /** Sólo en L0/L0N: firma normalizada de `EspecificacionComprador`, usada
   *  para agrupar. Es una bolsa de palabras — buena para agrupar, mala para
   *  leer — así que no se enseña; se enseña `descripcion`. */
  firma_producto?: string;
  /** Sólo en L0/L0N: cómo escribió el producto quien más veces lo compró.
   *  Es lo que distingue una banda de otra cuando una categoría UNSPSC se
   *  separó en varios productos reales — sin esto, dos bandas se ven iguales. */
  descripcion?: string;
  /** La unidad en la que está expresado el precio (p10..p90, pu_mean). Un
   *  precio sin unidad es una respuesta ambigua con forma de respuesta
   *  exacta — la misma clase de error que la categoría que mezclaba un
   *  calibrador y un criovial. Ausente en L4 (agrega por rubro, no por
   *  producto): cuando falta, no se asume una unidad plausible. */
  UnidadMedida?: string;
  p10?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
  pu_mean?: number;
  cv?: number;
  /** Coeficiente cuartílico de dispersión, (p75−p25)/(p75+p25), en [0,1].
   *  La medida de dispersión que hay que mirar (ver backend/app/schemas/bi.py). */
  qcd?: number;
  /** 'alta' | 'media' | 'baja' — la lectura de `qcd` y `n` que ya hizo el
   *  backend. 'baja' no es un hueco: significa que este comprador pagó
   *  precios muy distintos por lo mismo. */
  predictibilidad?: string;
  // El backend la produce como Float64 (0–1), no como texto: declararla `string`
  // aquí es el mismo bug que tuvo el schema del backend hasta que se corrigió
  // (ver el comentario en backend/app/schemas/bi.py).
  confianza?: number;
  n?: number;
}

export interface PrecioResultado {
  disponible: boolean;
  resultado?: PrecioBanda[];
  nivel_usado?: string;
  motivo?: string;
  /** De qué meses sale la banda: ver `lib/periodo.ts`. */
  periodo?: Periodo | null;
}

/**
 * "L0" | "L0N" | "L1" | "L2" | "L3" | "L4", de más a menos específico (ver
 * backend/app/services/bi/precio.py). L0 y L0N agrupan por producto real; de
 * L1 en adelante, por categoría UNSPSC — que puede mezclar artículos que
 * difieren en varios órdenes de magnitud. Esta función es la única que
 * traduce el nivel a un texto que un dueño de PYME entiende: si un nivel
 * nuevo cae en el `default`, aparece el código crudo ("Fuente: L0") en vez
 * de una frase — que es exactamente el bug que se corrige aquí para L0/L0N.
 */
export function nivelLabel(nivel?: string): string {
  switch (nivel) {
    case 'L0':
      return 'este producto exacto, en el organismo consultado';
    case 'L0N':
      return 'este producto exacto, a nivel nacional';
    case 'L1':
      return 'datos del organismo específico';
    case 'L2':
      return 'datos del sector';
    case 'L3':
      return 'datos a nivel nacional';
    case 'L4':
      return 'contexto general del organismo, sin datos de este producto';
    default:
      return nivel || '';
  }
}

// Vive en `lib/` porque también la usa la página pública de cada producto.
export { predictibilidadInfo } from '@/lib/predictibilidad';

export interface DescuentoItem {
  n_oferentes_rango?: string;
  p10?: number;
  p50?: number;
  p90?: number;
  senial_competencia?: string;
  n?: number;
}

export interface ForecastDataRow {
  n?: number;
  p10?: number;
  p50?: number;
  p90?: number;
  media?: number;
  pct_sin_competencia?: number;
  pct_baja_competencia?: number;
}

export interface ForecastResultado {
  disponible: boolean;
  nivel_usado?: string;
  fallback?: boolean;
  data?: ForecastDataRow[];
  motivo?: string;
}

export function formatCLPShort(v: number): string {
  if (v >= 1e9) return `CLP ${decimal(v / 1e9, 1)} mil M`;
  if (v >= 1e6) return `CLP ${decimal(v / 1e6, 1)} M`;
  if (v >= 1e3) return `CLP ${decimal(v / 1e3, 0)}K`;
  return `CLP ${Math.round(v).toLocaleString('es-CL')}`;
}
