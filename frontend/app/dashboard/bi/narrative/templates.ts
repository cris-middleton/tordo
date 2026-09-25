import { ResumenMercado } from '../types';

/**
 * Escapa lo que viene de fuera.
 *
 * Estas frases se pintan con `dangerouslySetInnerHTML` porque llevan `<b>`
 * propios, y dentro se interpolan **nombres de ChileCompra**: el rubro y la
 * razón social del comprador. Sin escapar, cualquier `<` en un nombre entra
 * como marcado. Es exactamente el fallo que ya se corrigió en el correo
 * semanal con `html.escape`; aquí faltaba.
 */
function esc(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  parts.push(`El mercado de <b>${esc(r.rubro)}</b>`);

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

  // Sin YoY o YoY muy pequeño.
  //
  // Aquí había una rama que comparaba los proveedores de hoy contra los de hace
  // tres años. El campo nunca llegó a existir en la respuesta: el teaser sólo
  // manda el conteo actual, así que `n_proveedores_hace_3_anios` era siempre
  // `undefined` y la rama estaba muerta desde el primer día. Contar una
  // evolución de la competencia exigiría una serie por rubro que el pipeline no
  // materializa — y decirla a medias es peor que no decirla.
  if (r.n_proveedores_actual != null) {
    return `${leading}, con <b>${r.n_proveedores_actual.toLocaleString('es-CL')} proveedores activos</b>.`;
  }

  return `${leading}.`;
}

/**
 * El comprador más activo del rubro.
 *
 * **Ya no dice a cuántos días paga.** Decía «paga en promedio en N días» sobre
 * `mediana_dias_pago`, y ese campo no mide un pago: mide los días entre la
 * emisión de la orden y su aceptación por el proveedor. La API de Mercado
 * Público no publica fecha de pago en ninguna parte. La mediana real es de 1,63
 * días — la frase le prometía al usuario un plazo de pago de dos días.
 *
 * En su lugar va el volumen, que sí sale del dato: cuántas órdenes emite. Es lo
 * que responde «¿vale la pena entenderlo a fondo?».
 */
export function frase3(r: ResumenMercado): string | null {
  const t = r.top_comprador;
  if (!t?.nombre) return null;

  // Las del RUBRO: es por eso que se le eligió como «el más activo». Con
  // `n_oc_total` —todas las suyas— salía «con 1.596.100 órdenes» en un rubro
  // que en total tenía 6.377.
  if (t.n_oc_rubro != null && t.n_oc_rubro > 0) {
    return `El comprador más activo es <b>${esc(t.nombre)}</b>, con <b>${t.n_oc_rubro.toLocaleString('es-CL')} órdenes</b> en este rubro.`;
  }
  return `El comprador más activo es <b>${esc(t.nombre)}</b>.`;
}

export function buildFrases(r: ResumenMercado): string[] {
  return [frase1(r), frase2(r), frase3(r)].filter((f): f is string => f !== null);
}
