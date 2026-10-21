'use client';

import { useState } from 'react';

import type { GraficoGasto } from '@/lib/graficoGasto';

import { FilaGlobo, Globo } from './Globo';

/**
 * Cuánto compra el Estado, mes a mes: una columna por mes, apilada por sector
 * con el color fijo de cada uno (`lib/sectores.ts`). Debajo, la leyenda, que es a
 * la vez la cifra de cada sector en el periodo.
 *
 * **Interactivo**, y por eso componente cliente (se pinta igual en el servidor):
 * - pasar el mouse o tocar un mes abre su globo con el total y el % de cada sector;
 * - pasar el mouse por un sector de la leyenda lo resalta en todos los meses.
 * Lo que dice el globo está también en texto: la leyenda escribe el total de cada
 * sector y la tabla `sr-only` el de cada mes. El dibujo es `aria-hidden`.
 *
 * Cajas y no SVG: las alturas van en % (`lib/graficoGasto.ts`) y el ancho lo
 * reparte `flex`, así que cabe igual a 320 que a 1440 px.
 */
export function GastoMensual({ datos }: { datos: GraficoGasto }) {
  const [mes, setMes] = useState<number | null>(null);
  const [serie, setSerie] = useState<number | null>(null);
  const n = datos.meses.length;
  const activo = mes != null ? datos.meses[mes] : null;

  return (
    <figure className="min-w-0">
      <p aria-hidden="true" className="mb-2 text-[12px] text-muted">{datos.unidad}</p>
      <div className="relative pl-9" onPointerLeave={() => setMes(null)}>
        <div aria-hidden="true" className="relative h-52 sm:h-64">
          {datos.marcas.map((m) => (
            <div key={m.valor} className="absolute -left-9 right-0 border-t border-border" style={{ bottom: `${m.y}%` }}>
              <span className="cifra absolute left-0 top-0 -translate-y-1/2 bg-surface pr-1 text-[12px] text-muted">{m.texto}</span>
            </div>
          ))}
          <div className="absolute inset-0 flex items-end gap-px sm:gap-0.5">
            {datos.meses.map((m, i) => (
              <div
                key={m.clave}
                data-mes={m.clave}
                className={`flex h-full min-w-0 flex-1 cursor-crosshair items-end ${mes != null && mes !== i ? 'opacity-50' : ''}`}
                onPointerEnter={() => setMes(i)}
                onPointerDown={() => setMes(i)}
              >
                <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm" style={{ height: `${m.alto}%` }}>
                  {datos.series.map((s, j) =>
                    m.partes[j] > 0 ? (
                      <div
                        key={s.clave}
                        className={`${s.fondo} border-t border-surface first:border-t-0 ${serie != null && serie !== j ? 'opacity-25' : ''}`}
                        style={{ height: `${(m.partes[j] / m.total) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 border-t border-muted" />
          {activo && mes != null && (
            <Globo x={((mes + 0.5) / n) * 100} medio={50 / n}>
              <p className="text-muted first-letter:uppercase">{activo.largo}</p>
              <p className="cifra text-base font-bold">{activo.texto}</p>
              <div className="mt-1.5 space-y-0.5">
                {datos.series
                  .map((s, j) => ({ s, v: activo.partes[j] }))
                  .filter(({ v }) => v > 0)
                  .sort((a, b) => b.v - a.v)
                  .map(({ s, v }) => (
                    <FilaGlobo key={s.clave} llave={s.fondo} nombre={s.nombre} valor={`${Math.round((v / activo.total) * 100)} %`} />
                  ))}
              </div>
            </Globo>
          )}
        </div>
        <div aria-hidden="true" className="relative mt-1 h-5 text-[12px] text-muted">
          {datos.anios.map((a) => (
            <span key={a.anio} className="cifra absolute top-0 border-l border-border pl-1" style={{ left: `${(a.indice / n) * 100}%` }}>
              {a.anio}
            </span>
          ))}
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3" onPointerLeave={() => setSerie(null)}>
        {datos.series
          .map((s, j) => ({ s, j }))
          .filter(({ s }) => s.total > 0)
          .map(({ s, j }) => (
            <li
              key={s.clave}
              className={`flex min-w-0 gap-2 ${serie != null && serie !== j ? 'opacity-50' : ''}`}
              onPointerEnter={() => setSerie(j)}
            >
              <span aria-hidden="true" className={`mt-1 h-3 w-3 shrink-0 rounded-sm ${s.fondo}`} />
              <span className="min-w-0 text-sm leading-snug">
                <span className="block text-text">{s.nombre}</span>
                <span className="cifra block text-muted">
                  {s.texto}, {s.parte} %
                </span>
              </span>
            </li>
          ))}
      </ul>

      {/* Una tabla no respeta el ancho de 1 px de `sr-only`: va dentro de un div, o ensancha la página. */}
      <div className="sr-only">
        <table>
          <caption>Monto de las órdenes de compra por mes</caption>
          <tbody>
            {datos.meses.map((m) => (
              <tr key={m.clave}>
                <th scope="row">{m.largo}</th>
                <td>{m.texto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
