import { COSTOS, ETIQUETA_BASE, TOTAL } from '@/lib/costos';

/**
 * El costo mensual por concepto (`/apoyar#costos`). Componente de servidor; las
 * cifras y su fuente viven en `lib/costos.ts`, con test. Una tabla de verdad
 * (`th scope`), no una rejilla: un lector de pantalla tiene que poder leer
 * «API, ~US$1–2, estimado».
 */
export function TablaCostos() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Costo mensual de mantener el sitio, por concepto</caption>
        <thead className="bg-surface text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-semibold">Concepto</th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">Al mes</th>
            <th scope="col" className="px-4 py-2 font-semibold">Cómo se sabe</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {COSTOS.map((c) => (
            <tr key={c.id}>
              <th scope="row" className="px-4 py-2 font-medium text-text">{c.concepto}</th>
              <td className="cifra whitespace-nowrap px-4 py-2 text-right text-text">{c.monto}</td>
              <td className="px-4 py-2 text-muted">
                <span className="font-medium text-text">{ETIQUETA_BASE[c.base]}.</span> {c.detalle}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border">
          <tr>
            <th scope="row" className="px-4 py-2 font-semibold text-text">Total</th>
            <td className="cifra whitespace-nowrap px-4 py-2 text-right font-semibold text-text">{TOTAL.monto}</td>
            <td className="px-4 py-2 text-muted">{TOTAL.detalle}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
