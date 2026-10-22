'use client';

import { useState } from 'react';

import { teclasDeRecorrido } from './teclado';

import type { GraficoConcentracion } from '@/lib/lecturasMercado';

import { FilaGlobo, Globo } from './Globo';

/**
 * Cuánto se lleva el proveedor principal de cada mercado: diez columnas, una por
 * tramo de 10 puntos, del alto del monto que se compra en esos mercados. En `dato`
 * los tramos de la conclusión (más de la mitad), en `dato-tenue` el resto.
 *
 * Pasar el mouse o tocar un tramo abre su globo: cuántos mercados y cuánto monto.
 * La conclusión y la tabla `sr-only` dicen lo mismo en texto; el dibujo es
 * `aria-hidden`.
 */
export function Concentracion({ datos }: { datos: GraficoConcentracion }) {
  const [activo, setActivo] = useState<number | null>(null);
  const tramo = activo != null ? datos.tramos[activo] : null;

  return (
    <figure className="min-w-0">
      <div
        tabIndex={0}
        role="group"
        aria-label="Los tramos del gráfico: recórrelos con las flechas"
        className="rounded-sm"
        onKeyDown={teclasDeRecorrido(datos.tramos.length, activo, setActivo)}
        onBlur={() => setActivo(null)}
      >
      <p aria-live="polite" className="sr-only">
        {tramo ? `${tramo.rotulo}: ${tramo.textoMonto}, ${tramo.textoMercados}` : ''}
      </p>
      <div aria-hidden="true" className="relative" onPointerLeave={() => setActivo(null)}>
        <div className="relative flex h-40 items-end gap-1">
          {datos.tramos.map((t, i) => (
            <div
              key={t.desde}
              className={`flex h-full flex-1 cursor-crosshair items-end ${activo != null && activo !== i ? 'opacity-50' : ''}`}
              onPointerEnter={() => setActivo(i)}
              onPointerDown={() => setActivo(i)}
            >
              <div className={`w-full rounded-t-sm ${t.destacado ? 'bg-dato' : 'bg-dato-tenue'}`} style={{ height: `${t.alto}%` }} />
            </div>
          ))}
          <div className="absolute inset-x-0 bottom-0 border-t border-muted" />
          {tramo && activo != null && (
            <Globo x={((activo + 0.5) / datos.tramos.length) * 100} modo="encima">
              <p className="font-semibold">{tramo.rotulo}</p>
              <div className="mt-1 space-y-0.5">
                <FilaGlobo nombre="Monto" valor={tramo.textoMonto} />
                <FilaGlobo nombre="Mercados" valor={tramo.textoMercados} />
              </div>
            </Globo>
          )}
        </div>
        <div className="mt-1 flex justify-between text-[12px] text-muted">
          <span>0 %</span>
          <span>la mitad</span>
          <span>100 %</span>
        </div>
        <p className="mt-0.5 text-center text-[12px] text-muted">lo que se lleva el proveedor principal</p>
      </div>
      </div>
      {/* Una tabla no respeta el ancho de 1 px de `sr-only`: va dentro de un div, o ensancha la página. */}
      <div className="sr-only">
        <table>
          <caption>Monto por cuánto se lleva el proveedor principal del mercado</caption>
          <tbody>
            {datos.tramos.map((t) => (
              <tr key={t.desde}>
                <th scope="row">{t.rotulo}</th>
                <td>
                  {t.textoMonto}, {t.textoMercados} mercados
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
