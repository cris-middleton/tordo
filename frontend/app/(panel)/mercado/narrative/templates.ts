import { ResumenMercado } from '../types';
import { decimal } from '@/lib/formato';
import { MESES_ANALISIS } from '@/lib/periodo';
import { normalizeText } from '@/lib/nombresChile';

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

/** Quién se dice que crece: «las compras de <rubro>», o del rubro si no hay nombre. */
function sujeto(r: ResumenMercado): string {
  return r.rubro ? `Las compras de <b>${esc(r.rubro)}</b>` : 'Las compras del rubro';
}

/**
 * Cómo ha cambiado el rubro: la única cifra del resumen.
 *
 * El monto del año, los compradores y los proveedores ya no van aquí: están en
 * las cifras de justo debajo (`PanoramaRubro`), cada una con su periodo. Aquí
 * se repetían, y los compradores salían dos veces con dos periodos distintos
 * —los del último año en la frase y los de 36 meses en la cifra—, uno al lado
 * del otro.
 */
export function frase2(r: ResumenMercado): string | null {
  const cagr = r.cagr_pct;
  const yoy = r.yoy_pct;
  if (cagr == null && yoy == null) return null;

  // Un decimal, como la conclusión del gráfico por año (`TendenciasSection`):
  // «12 %» arriba y «12,4 %» abajo parecían dos cifras.
  const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${decimal(v, 1)} %`;
  const sinSigno = (v: number) => `${decimal(Math.abs(v), 1)} %`;
  const quien = sujeto(r);

  // Clasificación del CAGR histórico (lenguaje en pasado/promedio, no "está")
  let leading: string;
  if (cagr != null && cagr > 10) {
    leading = `${quien} han crecido <b>${sinSigno(cagr)} al año</b> en promedio`;
  } else if (cagr != null && cagr < -5) {
    leading = `${quien} se han achicado <b>${sinSigno(cagr)} al año</b> en promedio`;
  } else if (cagr != null) {
    leading = `${quien} se han mantenido <b>estables</b> (${fmtPct(cagr)} al año en promedio)`;
  } else {
    leading = `${quien} cambiaron <b>${fmtPct(yoy!)}</b> el último año`;
  }

  // Si CAGR y YoY divergen mucho (abs diff > 15pp) → tendencia reciente distinta al promedio
  const divergent = cagr != null && yoy != null && Math.abs(cagr - yoy) > 15;

  if (divergent) {
    if (Math.abs(yoy!) < 5) {
      return `${leading}, pero el último año <b>se estancaron</b> (${fmtPct(yoy!)}).`;
    }
    if ((cagr < 0 && yoy! > 0) || (cagr > 0 && yoy! < 0)) {
      const direction = yoy! > 0 ? 'subieron' : 'bajaron';
      return `${leading}, aunque el último año <b>${direction} ${sinSigno(yoy!)}</b>.`;
    }
    return `${leading}, y el último año cambiaron <b>${fmtPct(yoy!)}</b>.`;
  }

  if (yoy != null && Math.abs(yoy) >= 2 && cagr != null) {
    return `${leading} (el último año, ${fmtPct(yoy)}).`;
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
    // `n_transacciones` de `opportunity_scores`: las órdenes de la ventana de
    // analytics (`competitors_by_market`), no las de un año.
    return `El comprador más activo es <b>${esc(normalizeText(t.nombre))}</b>, con <b>${t.n_oc_rubro.toLocaleString('es-CL')} órdenes</b> en este rubro en los últimos ${MESES_ANALISIS} meses.`;
  }
  return `El comprador más activo es <b>${esc(normalizeText(t.nombre))}</b>.`;
}

export function buildFrases(r: ResumenMercado): string[] {
  return [frase2(r), frase3(r)].filter((f): f is string => f !== null);
}
