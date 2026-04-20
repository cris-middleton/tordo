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
      parts.push(`entre <b>${r.n_organismos.toLocaleString('es-CL')} compradores</b>`);
    } else {
      parts.push(`tiene <b>${r.n_organismos.toLocaleString('es-CL')} compradores activos</b>`);
    }
  }

  return parts.join(' ') + '.';
}

export function frase2(r: ResumenMercado): string | null {
  const cagr = r.cagr_pct;
  const yoy = r.yoy_pct;
  if (cagr == null && yoy == null) return null;

  // Helpers
  const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;

  // Clasificación del CAGR histórico (lenguaje en pasado/promedio, no "está")
  let leading: string;
  if (cagr != null && cagr > 10) {
    leading = `Ha crecido en promedio <b>${fmtPct(cagr)} anual</b>`;
  } else if (cagr != null && cagr < -5) {
    leading = `Se ha contraído en promedio <b>${fmtPct(cagr).replace('+', '')} anual</b>`;
  } else if (cagr != null) {
    leading = `Ha sido <b>estable</b> (${fmtPct(cagr)} anual en promedio)`;
  } else {
    leading = `Tuvo una variación de <b>${fmtPct(yoy!)}</b> el último año`;
  }

  // Si CAGR y YoY divergen mucho (abs diff > 15pp) → tendencia reciente distinta al promedio
  const divergent = cagr != null && yoy != null && Math.abs(cagr - yoy) > 15;

  if (divergent) {
    if (Math.abs(yoy!) < 5) {
      return `${leading}, pero <b>se estabilizó el último año</b> (${fmtPct(yoy!)}).`;
    }
    if ((cagr < 0 && yoy! > 0) || (cagr > 0 && yoy! < 0)) {
      const direction = yoy! > 0 ? 'se recuperó' : 'retrocedió';
      return `${leading}, aunque el último año <b>${direction} ${fmtPct(yoy!)}</b>.`;
    }
    return `${leading}; el último año: <b>${fmtPct(yoy!)}</b>.`;
  }

  // Caso normal: CAGR y YoY consistentes (o solo tenemos uno)
  if (yoy != null && Math.abs(yoy) >= 2 && cagr != null) {
    if (r.n_proveedores_actual != null) {
      return `${leading} (último año: ${fmtPct(yoy)}), con <b>${r.n_proveedores_actual.toLocaleString('es-CL')} proveedores activos</b>.`;
    }
    return `${leading} (último año: ${fmtPct(yoy)}).`;
  }

  // Sin YoY o YoY muy pequeño: caer al comportamiento anterior
  if (r.n_proveedores_actual != null && r.n_proveedores_hace_3_anios != null) {
    if (r.n_proveedores_actual > r.n_proveedores_hace_3_anios) {
      return `${leading}, pero la competencia también: de ${r.n_proveedores_hace_3_anios} a <b>${r.n_proveedores_actual.toLocaleString('es-CL')} proveedores activos</b> en 3 años.`;
    }
    return `${leading}, con <b>${r.n_proveedores_actual.toLocaleString('es-CL')} proveedores activos</b>.`;
  }

  if (r.n_proveedores_actual != null) {
    return `${leading}, con <b>${r.n_proveedores_actual.toLocaleString('es-CL')} proveedores activos</b>.`;
  }

  return `${leading}.`;
}

// Helper: describe pago_mediana_dias en prosa
function describeDiasPago(dias: number): string {
  if (dias === 0) return 'paga el mismo día de emitida la orden';
  if (dias === 1) return 'paga al día siguiente';
  return `paga en promedio en <b>${dias} días</b>`;
}

export function frase3(r: ResumenMercado): string | null {
  const t = r.top_comprador;
  if (!t?.nombre) return null;

  const labelPago =
    t.clasificacion_pago === 'bueno' ? 'bueno' :
    t.clasificacion_pago === 'medio' ? 'normal' :
    t.clasificacion_pago === 'lento' ? 'lento' : null;

  if (t.pago_mediana_dias != null && labelPago) {
    const diasPart = describeDiasPago(t.pago_mediana_dias);
    return `El comprador más activo es <b>${t.nombre}</b>, que ${diasPart} (${labelPago} para el sector).`;
  }
  return `El comprador más activo es <b>${t.nombre}</b>.`;
}

export function buildFrases(r: ResumenMercado): string[] {
  return [frase1(r), frase2(r), frase3(r)].filter((f): f is string => f !== null);
}
