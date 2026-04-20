import { ResumenMercado } from '../types';

function formatCLP(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `CLP ${(value / 1e12).toFixed(1)} billones`;
  if (abs >= 1e9) return `CLP ${(value / 1e9).toFixed(1)} mil millones`;
  if (abs >= 1e6) return `CLP ${(value / 1e6).toFixed(1)} millones`;
  return `CLP ${value.toLocaleString('es-CL')}`;
}

export function frase1(r: ResumenMercado): string | null {
  if (!r.rubro) return null;
  if (r.monto_anual_clp == null && r.n_organismos == null) return null;

  const parts: string[] = [];
  parts.push(`El mercado de <b>${r.rubro}</b>`);

  if (r.monto_anual_clp != null) {
    parts.push(`movió <b>${formatCLP(r.monto_anual_clp)}</b> el último año`);
  }

  if (r.n_organismos != null) {
    if (r.monto_anual_clp != null) {
      parts.push(`entre <b>${r.n_organismos.toLocaleString('es-CL')} organismos</b>`);
    } else {
      parts.push(`tiene <b>${r.n_organismos.toLocaleString('es-CL')} organismos compradores activos</b>`);
    }
  }

  return parts.join(' ') + '.';
}

export function frase2(r: ResumenMercado): string | null {
  if (r.cagr_pct == null) return null;

  const cagr = r.cagr_pct;
  const cagrStr = `${cagr > 0 ? '+' : ''}${cagr.toFixed(0)}%`;

  // Construir según magnitud del CAGR
  let leading: string;
  if (cagr > 10) {
    leading = `Está <b>creciendo ${cagrStr} anual</b>`;
  } else if (cagr < -5) {
    leading = `Se está <b>contrayendo ${cagrStr.replace('-', '')} anual</b>`;
  } else {
    leading = `Se mantiene <b>estable</b> (${cagrStr} anual)`;
  }

  // Contexto de competencia si hay datos
  if (r.n_proveedores_actual != null && r.n_proveedores_hace_3_anios != null) {
    if (r.n_proveedores_actual > r.n_proveedores_hace_3_anios) {
      return `${leading}, pero la competencia también: de ${r.n_proveedores_hace_3_anios} a <b>${r.n_proveedores_actual.toLocaleString('es-CL')} proveedores activos</b> en 3 años.`;
    }
    return `${leading}, con <b>${r.n_proveedores_actual.toLocaleString('es-CL')} proveedores activos</b>.`;
  }

  if (r.n_proveedores_actual != null) {
    return `${leading}, con <b>${r.n_proveedores_actual.toLocaleString('es-CL')} proveedores activos</b>.`;
  }

  if (cagr > 10) {
    return `${leading}.`;
  } else if (cagr < -5) {
    return `${leading} — cuidado con presión de precios.`;
  }
  return `${leading}.`;
}

export function frase3(r: ResumenMercado): string | null {
  const t = r.top_comprador;
  if (!t?.nombre) return null;

  const labelPago =
    t.clasificacion_pago === 'bueno' ? 'bueno' :
    t.clasificacion_pago === 'medio' ? 'normal' :
    t.clasificacion_pago === 'lento' ? 'lento' : null;

  if (t.pago_mediana_dias != null && labelPago) {
    return `El comprador más activo es <b>${t.nombre}</b>, que paga en promedio en <b>${t.pago_mediana_dias} día${t.pago_mediana_dias === 1 ? '' : 's'}</b> (${labelPago} para el sector).`;
  }
  return `El comprador más activo es <b>${t.nombre}</b>.`;
}

export function buildFrases(r: ResumenMercado): string[] {
  return [frase1(r), frase2(r), frase3(r)].filter((f): f is string => f !== null);
}
