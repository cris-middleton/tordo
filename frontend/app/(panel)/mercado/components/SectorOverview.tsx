'use client';

import { BarrasHorizontales } from '@/components/graficos/BarrasHorizontales';
import { monto } from '@/lib/formato';
import { rangoDeMeses } from '@/lib/periodo';
import { sectorConColor } from '@/lib/sectores';
import { useSectores } from '@/lib/queries';

interface SectorRow {
  sector: string;
  monto_total: number;
  n_oc?: number;
  n_organismos?: number;
  n_proveedores?: number;
  ventana_desde?: string | null;
  ventana_hasta?: string | null;
}

/**
 * Lo que dice cada sector que el dato no cuenta entero. Obras Públicas compra
 * casi todo por contratos de obra, y ChileCompra no los publica en su descarga
 * de órdenes de compra: medido, 0,75 contra 3,09 billones oficiales en 2025.
 */
const NOTAS_SECTOR: Record<string, string> = {
  'Obras Públicas':
    'No incluye los contratos de obra del MOP: ChileCompra no los publica en su descarga de órdenes de compra.',
};

const conMiles = (n: number) => n.toLocaleString('es-CL');

/**
 * Cuánto compra cada sector del Estado: el contexto nacional antes de bajar a un
 * rubro. Barras con su monto escrito, cada una con el color de su sector —el
 * mismo de la portada (`lib/sectores.ts`)—; debajo de cada una, cuántos
 * organismos compran y cuántos proveedores venden.
 *
 * Antes eran seis tarjetas iguales en un recuadro teal que se podía cerrar «por
 * hoy»: el dato no se comparaba a la vista, y cerrarlo escondía lo único nacional
 * de la página. Si la consulta falla o viene vacía, no sale: es contexto.
 */
export function SectorOverview() {
  const { data: res } = useSectores(true);
  const sectores = ((res?.disponible ? (res.sectores ?? res.resultados) : []) ?? []) as SectorRow[];
  if (sectores.length === 0) return null;

  const ordenados = [...sectores].sort((a, b) => (b.monto_total ?? 0) - (a.monto_total ?? 0));
  const desde = ordenados.map((s) => s.ventana_desde).filter(Boolean).sort()[0];
  const hasta = ordenados.map((s) => s.ventana_hasta).filter(Boolean).sort().at(-1);
  const periodo = rangoDeMeses(desde, hasta);
  const mayor = ordenados[0];

  return (
    <section aria-labelledby="sectores-titulo" className="mt-8">
      <h2 id="sectores-titulo" className="section-title">
        Quién compra más
      </h2>
      <p className="mt-2 max-w-[65ch] text-muted">
        {mayor.sector} es el sector que más compra: {monto(mayor.monto_total ?? 0)} en órdenes de compra
        {periodo ? `, ${periodo}` : ''}.
      </p>
      <div className="mt-6 max-w-3xl">
        <BarrasHorizontales
          etiqueta="Monto en órdenes de compra por sector"
          filas={ordenados.map((s) => ({
            clave: s.sector,
            etiqueta: s.sector || 'Sin sector',
            relleno: sectorConColor(s.sector).fondo,
            valor: s.monto_total ?? 0,
            texto: monto(s.monto_total ?? 0),
            detalle: (
              <>
                {[
                  s.n_organismos != null ? `${conMiles(s.n_organismos)} organismos` : null,
                  s.n_proveedores != null ? `${conMiles(s.n_proveedores)} proveedores` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
                {NOTAS_SECTOR[s.sector] && <span className="block">{NOTAS_SECTOR[s.sector]}</span>}
              </>
            ),
          }))}
        />
      </div>
    </section>
  );
}
