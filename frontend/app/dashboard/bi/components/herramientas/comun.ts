import type { OrganismoConNombre } from '../../types';

/**
 * Lo que comparten las cinco herramientas avanzadas de BI.
 *
 * `extractErrorMessage` está aquí porque el backend devuelve el detalle en tres
 * formas distintas según de dónde venga el error, y cada pestaña lo enseña tal
 * cual: es texto escrito para que lo lea una persona.
 */

export function extractErrorMessage(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { detail?: string; motivo?: string } }; message?: string };
  const status = e?.response?.status;
  const detail = e?.response?.data?.detail || e?.response?.data?.motivo;

  if (status === 429) {
    return 'Se agotó tu cuota diaria de búsquedas BI (3 consultas/día en plan básico). Vuelve mañana o actualiza tu plan.';
  }
  if (status === 503) {
    return detail || 'Módulo no disponible en esta instalación.';
  }
  if (status === 401) {
    return 'Sesión expirada. Recarga la página.';
  }
  if (detail) return detail;
  if (e?.message) return `Error: ${e.message}`;
  return 'Error desconocido al consultar.';
}

export type Tab = 'matching' | 'precio' | 'descuento' | 'forecast' | 'simular';

export interface HerramientasAvanzadasProps {
  rubro: string;
  topOrganismos?: OrganismoConNombre[];
  allRubros?: string[];
}

export interface MatchingResult {
  CodigoProveedor?: string;
  NombreProveedor?: string;
  similarity_score?: number;
  n_oc?: number;
}

export interface PrecioBanda {
  p10?: number;
  p50?: number;
  p90?: number;
  n?: number;
  confianza?: string;
  NombreProductoGenerico?: string;
}

export interface PrecioResultado {
  disponible: boolean;
  resultado?: PrecioBanda[];
  nivel_usado?: string;
  motivo?: string;
}

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
  if (v >= 1e9) return `CLP ${(v / 1e9).toFixed(1)} mil M`;
  if (v >= 1e6) return `CLP ${(v / 1e6).toFixed(1)} M`;
  if (v >= 1e3) return `CLP ${(v / 1e3).toFixed(0)}K`;
  return `CLP ${Math.round(v).toLocaleString('es-CL')}`;
}
