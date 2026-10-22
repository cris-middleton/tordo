'use client';

import { BuyerProfilePanel } from '@/components/BuyerProfilePanel';
import { BarrasHorizontales } from '@/components/graficos/BarrasHorizontales';
import { rango } from '@/components/publico/CifrasBanda';
import { decimal } from '@/lib/formato';
import { motivoParaPersona } from '@/lib/motivos';
import { nombresDeCategorias } from '@/lib/licitacionDetalle';
import { normalizeText } from '@/lib/nombresChile';
import { plata, rutaComprador } from '@/lib/publico';
import type { BIPanel, CompetidoresPanel, PrecioFallback, TenderDetail, VentanaPanel } from '@/types/licitacionDetalle';

const TITULO = 'font-sans text-lg font-semibold text-text';

/** De dónde salen los precios de referencia, en palabras (el fallback L1→L3 del BI). */
const ORIGEN_PRECIO: Record<string, string> = {
  L0: 'compras del mismo producto por este comprador',
  L0N: 'compras del mismo producto en todo el país',
  L1: 'compras de este comprador',
  L2: 'compras del sector',
  L3: 'compras de todo el país',
};

const TRAMO_MERCADO: Record<string, string> = {
  concentrado: 'Concentrado: pocos proveedores se llevan casi todo.',
  moderado: 'Moderado: hay competidores fuertes, pero el mercado no está cerrado.',
  fragmentado: 'Fragmentado: muchos proveedores se reparten lo que compra.',
  // Nombre viejo del mismo tramo; llega hasta la próxima materialización.
  competitivo: 'Fragmentado: muchos proveedores se reparten lo que compra.',
};

/**
 * El plazo frente a lo que este comprador suele dar. Sin dato no sale: un
 * título «El plazo» sobre «Todavía no tenemos…» era una sección vacía.
 */
function Plazo({ ventana }: { ventana: VentanaPanel }) {
  if (!ventana.disponible || ventana.window_days == null) return null;
  return (
    <section>
      <h3 className={TITULO}>El plazo</h3>
      <div className="mt-2 max-w-[65ch]">
        <p className="text-text">
          Hay <span className="cifra font-semibold">{ventana.window_days}</span>{' '}
          {ventana.window_days === 1 ? 'día' : 'días'} entre la publicación y el cierre
          {ventana.pct_del_tipico != null && (
            <>
              : el <span className="cifra font-semibold">{decimal(ventana.pct_del_tipico, 0)}{'\u00a0'}%</span> de lo que este
              comprador suele dar
            </>
          )}
          .
        </p>
        {ventana.alerta_ventana_corta && (
          <p className="mt-1 font-semibold text-danger">Es un plazo corto para este comprador.</p>
        )}
      </div>
    </section>
  );
}

function Competencia({ competidores }: { competidores: CompetidoresPanel }) {
  const lista = (competidores.top5 ?? []).filter((c) => c.market_share_pct != null);
  const tramo = competidores.tipo_mercado ? TRAMO_MERCADO[competidores.tipo_mercado.toLowerCase()] : null;
  return (
    <section>
      <h3 className={TITULO}>Quién le vende</h3>
      {!competidores.disponible || lista.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          {motivoParaPersona(competidores.motivo, 'Todavía no tenemos proveedores de este comprador.')}
        </p>
      ) : (
        <div className="mt-2 max-w-3xl">
          {tramo && <p className="mb-4 text-sm text-muted">{tramo}</p>}
          <BarrasHorizontales
            etiqueta="Qué parte de lo que compra se lleva cada proveedor"
            filas={lista.map((c, i) => ({
              clave: `${c.NombreProveedor ?? 'proveedor'}-${i}`,
              // Llegan en mayúsculas («STARCO S A»), como todo nombre de Mercado Público.
              etiqueta: c.NombreProveedor ? normalizeText(c.NombreProveedor) : 'Sin nombre',
              valor: c.market_share_pct ?? 0,
              texto: `${decimal(c.market_share_pct ?? 0, 1)} %`,
              detalle:
                c.n_oc != null ? `${c.n_oc.toLocaleString('es-CL')} ${c.n_oc === 1 ? 'orden' : 'órdenes'} de compra` : null,
            }))}
          />
        </div>
      )}
    </section>
  );
}

/**
 * El panel sólo trae el código ONU de cada categoría («53102706»); el nombre sale
 * de los ítems de la licitación (`nombresDeCategorias`). Sin nombre, la fila dice
 * al menos qué es el número.
 */
function Precios({ precios, nombres }: { precios: PrecioFallback[]; nombres: Map<string, string> }) {
  const con = precios.filter((p) => p.disponible && p.p50 != null);
  return (
    <section>
      <h3 className={TITULO}>Cuánto se pagó en las mismas categorías</h3>
      <p className="mt-1 max-w-[65ch] text-sm text-muted">
        Precio por unidad en órdenes de compra de las categorías del catálogo que pide esta licitación. La
        mediana es el precio del medio: la mitad de las compras se pagó menos y la otra mitad, más.
      </p>
      {con.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Todavía no hay compras de estas categorías para comparar.</p>
      ) : (
        <div className="mt-3 max-w-3xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th scope="col" className="py-2 pr-4 font-normal">Categoría</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">Mediana</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">La mitad de las compras</th>
                <th scope="col" className="hidden py-2 text-left font-normal sm:table-cell">De dónde sale</th>
              </tr>
            </thead>
            <tbody>
              {con.map((p, i) => (
                <tr key={`${p.codigo_producto ?? 'sin-codigo'}-${i}`} className="border-b border-border">
                  <th scope="row" className="py-3 pr-4 text-left font-normal">
                    {p.codigo_producto && nombres.get(p.codigo_producto) && (
                      <span className="block text-text">{nombres.get(p.codigo_producto)}</span>
                    )}
                    <span
                      className={
                        p.codigo_producto && nombres.get(p.codigo_producto) ? 'block text-muted' : 'block text-text'
                      }
                    >
                      {p.codigo_producto ? (
                        <>
                          Categoría ONU <span className="font-mono">{p.codigo_producto}</span>
                        </>
                      ) : (
                        'Sin categoría'
                      )}
                    </span>
                  </th>
                  <td className="cifra whitespace-nowrap py-3 pr-4 text-right font-semibold text-text">{plata(p.p50)}</td>
                  <td className="cifra whitespace-nowrap py-3 pr-4 text-right text-muted">
                    {/* Con P25 y P75 iguales, un precio y no «$18.000 a $18.000» (`rango`). */}
                    {rango(p.p25 ?? null, p.p75 ?? null) ?? '—'}
                  </td>
                  <td className="hidden py-3 text-muted sm:table-cell">
                    {(p.nivel_usado && ORIGEN_PRECIO[p.nivel_usado]) || 'compras comparables'}
                    {p.n != null ? `, ${p.n.toLocaleString('es-CL')} compras` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * El mercado de una licitación: el plazo frente a lo que este comprador suele
 * dar, cómo compra, quién le vende y a qué precio se compró lo mismo. Cada
 * bloque dice lo que el dato mide, con su cifra.
 *
 * Antes abría con un «score de oportunidad» de 0 a 10 que calculaba el
 * navegador con pesos inventados (una confianza «alta» valía 0,85) y lo
 * explicaba con «el comprador tiene buenas métricas de pago», un dato que
 * ChileCompra no publica. Se fue, con la línea de hitos que repetía las fechas
 * de arriba y la tarjeta «Mercado» que repetía este mismo panel.
 */
export default function BIPanelSection({ panel, tender }: { panel: BIPanel; tender?: TenderDetail }) {
  const { comprador, ventana, competidores, precios, organismo_id } = panel;
  const nombres = nombresDeCategorias(tender?.items);
  // Sin nada que comparar (lo normal en una Compra Ágil de un comprador sin
  // historia en el análisis), una línea y no cuatro «Todavía no tenemos…».
  const vacio =
    !comprador.disponible &&
    (!ventana.disponible || ventana.window_days == null) &&
    (!competidores.disponible || (competidores.top5 ?? []).length === 0) &&
    !precios.some((p) => p.disponible && p.p50 != null);
  if (vacio) {
    return (
      <p className="max-w-[65ch] text-muted">
        Todavía no tenemos compras anteriores de este comprador ni precios para comparar. Lo recalculamos todo
        cada domingo con las órdenes de compra de ChileCompra.
      </p>
    );
  }
  return (
    <div className="space-y-10">
      <Plazo ventana={ventana} />
      <BuyerProfilePanel
        comprador={comprador}
        titulo="Cómo compra"
        nivel="h3"
        senales={organismo_id ? { enlace: rutaComprador(organismo_id) } : 'contar'}
      />
      <Competencia competidores={competidores} />
      <Precios precios={precios} nombres={nombres} />
    </div>
  );
}
