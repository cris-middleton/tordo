'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { GraficoEscalera } from '@/lib/escaleraPrecios';

import { FilaGlobo, Globo } from './Globo';

/**
 * Lo que pagó el Estado por varias cosas comunes, una por fila
 * (`lib/escaleraPrecios.ts`): el rango en pesos escrito al lado del nombre y,
 * debajo, la franja de la mitad de las compras **contra su propia mediana** (la
 * raya del medio), en escala logarítmica de «la mitad» a «el doble». Así un lápiz
 * y una impresora se comparan por cuánto se mueve su precio. En `dato` la fila que nombra la
 * conclusión (la que más varía); el resto, en `dato-tenue`.
 *
 * Cada fila escribe su rango al lado del nombre, así que los valores están en
 * texto; el dibujo es `aria-hidden`. Pasar el mouse (o tocar) una fila abre su
 * globo con la mediana y de cuántas compras sale; el nombre lleva a su ficha.
 */
export function EscaleraPrecios({ datos }: { datos: GraficoEscalera }) {
  const [activa, setActiva] = useState<number | null>(null);
  const fila = activa != null ? datos.filas[activa] : null;

  return (
    <figure className="min-w-0">
      <ul className="relative space-y-3" onPointerLeave={() => setActiva(null)}>
        {datos.filas.map((f, i) => (
          <li
            key={f.slug}
            data-fila={f.slug}
            className={`relative ${activa != null && activa !== i ? 'opacity-50' : ''}`}
            onPointerEnter={() => setActiva(i)}
            onPointerDown={() => setActiva(i)}
            // El nombre es un enlace: con el foco en él, su globo se abre como al pasar el mouse.
            onFocus={() => setActiva(i)}
            onBlur={() => setActiva(null)}
          >
            <p className="flex items-baseline justify-between gap-3 text-[13px] leading-snug">
              <Link href={f.href} className="min-w-0 truncate text-text underline-offset-2 hover:underline">
                {f.nombre}
              </Link>
              <span className={`cifra shrink-0 ${f.destacada ? 'font-semibold text-text' : 'text-muted'}`}>{f.rango}</span>
            </p>
            <div aria-hidden="true" className="relative mt-1 h-3">
              <div className="absolute inset-x-0 top-1/2 border-t border-border" />
              <div className="absolute -inset-y-1 left-1/2 border-l border-dashed border-muted" />
              <div
                className={`absolute inset-y-0 min-w-[3px] rounded-sm ${f.destacada ? 'bg-dato' : 'bg-dato-tenue'}`}
                style={{ left: `${f.desde}%`, width: `${Math.max(f.hasta - f.desde, 0.6)}%` }}
              />
              <div className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 bg-text" style={{ left: `${f.medio}%` }} />
            </div>
            {activa === i && fila && (
              <Globo x={(f.desde + f.hasta) / 2} modo={i < 2 ? 'debajo' : 'encima'}>
                <p className="font-semibold">{f.nombre}</p>
                <div className="mt-1 space-y-0.5">
                  <FilaGlobo nombre="La mitad de las compras" valor={f.rango} />
                  <FilaGlobo nombre="Mediana" valor={f.mediana} />
                </div>
                <p className="mt-1 text-muted">{f.base}</p>
              </Globo>
            )}
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="relative mt-2 h-8 border-t border-muted text-[12px] text-muted">
        {datos.marcas.map((m, i) => (
          <span
            key={m.texto}
            className={`cifra absolute top-1 whitespace-nowrap ${i === 0 ? '' : i === datos.marcas.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${m.x}%` }}
          >
            {m.texto}
          </span>
        ))}
        <span className="absolute left-0 top-5">escala logarítmica, contra la mediana de cada uno</span>
      </div>
    </figure>
  );
}
