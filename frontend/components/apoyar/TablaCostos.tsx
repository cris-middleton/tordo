import { COSTOS, ETIQUETA_BASE, TOTAL } from '@/lib/costos';

/**
 * El costo mensual por concepto (`/apoyar#costos`). Componente de servidor; las
 * cifras y su fuente viven en `lib/costos.ts`, con test. Una tabla de verdad
 * (`th scope`), no una rejilla: un lector de pantalla tiene que poder leer
 * «API, ~US$3,5, medido».
 *
 * **Una sola tabla en los dos anchos, sin copia para móvil.** Desde `sm` es una
 * tabla de tres columnas con filetes y sin caja. Por debajo, cada fila es una
 * rejilla: concepto y monto en una línea y «Cómo se sabe» debajo, en letra
 * chica; los encabezados quedan sólo para el lector de pantalla. A 390 px la
 * tabla medía ~2.300 px de alto con la tercera columna de 120 px de ancho.
 *
 * Al cambiar el `display` de una tabla, Safari y Chrome le quitan sus roles: van
 * explícitos (`role="table"`, `row`, `rowheader`, `cell`…) para que la tabla
 * siga siéndolo con el lector de pantalla.
 */
const TABLA = 'block w-full text-left text-sm sm:table';
const GRUPO = 'block sm:table-row-group';
const FILA =
  'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-3 sm:table-row sm:py-0';
const CELDA = 'block sm:table-cell sm:py-3 sm:align-top';
const CONCEPTO = `${CELDA} sm:w-[30%] sm:pr-4`;
const MONTO = `${CELDA} cifra whitespace-nowrap text-right sm:w-24 sm:pr-6`;
const DETALLE = `${CELDA} col-span-2 text-xs leading-relaxed text-muted sm:text-sm`;

export function TablaCostos() {
  return (
    <table role="table" className={TABLA}>
      <caption className="sr-only">Costo mensual de mantener el sitio, por concepto</caption>
      <thead role="rowgroup" className="sr-only sm:not-sr-only sm:table-header-group">
        <tr role="row" className="border-b border-border text-xs text-muted">
          <th role="columnheader" scope="col" className="pb-2 pr-4 font-semibold">Concepto</th>
          <th role="columnheader" scope="col" className="pb-2 pr-6 text-right font-semibold">Al mes</th>
          <th role="columnheader" scope="col" className="pb-2 font-semibold">Cómo se sabe</th>
        </tr>
      </thead>
      <tbody role="rowgroup" className={`${GRUPO} divide-y divide-border border-b border-border`}>
        {COSTOS.map((c) => (
          <tr role="row" key={c.id} className={FILA}>
            <th role="rowheader" scope="row" className={`${CONCEPTO} font-medium text-text`}>
              {c.concepto}
            </th>
            <td role="cell" className={`${MONTO} text-text`}>{c.monto}</td>
            <td role="cell" className={DETALLE}>
              <span className="font-medium text-text">{ETIQUETA_BASE[c.base]}.</span> {c.detalle}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot role="rowgroup" className={GRUPO}>
        <tr role="row" className={FILA}>
          <th role="rowheader" scope="row" className={`${CONCEPTO} font-semibold text-text`}>Total</th>
          <td role="cell" className={`${MONTO} font-semibold text-text`}>{TOTAL.monto}</td>
          <td role="cell" className={DETALLE}>{TOTAL.detalle}</td>
        </tr>
      </tfoot>
    </table>
  );
}
