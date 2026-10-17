import type { ReactNode } from 'react';
import Link from 'next/link';

import { PieDeMetodo } from '@/components/metodo/PieDeMetodo';
import { AntesDespues } from '@/components/notas/AntesDespues';
import { GraficoPrecio } from '@/components/precio/GraficoPrecio';
import {
  lecturasDeLaPortada,
  type LecturaCierres,
  type LecturaDeLaPortada,
  type LecturaNota,
  type LecturaPrecio,
  type Lecturas,
} from '@/lib/lecturasPortada';
import type { EnlaceMetodo } from '@/lib/metodo';

export const TITULO_LECTURAS = 'Lo que dicen los datos';

/**
 * Una lectura: la conclusión, el gráfico y el pie de método, uno tras otro. Van
 * apiladas en una sola columna, así que no hay nada que alinear entre lecturas
 * (la subrejilla de la banda a lo ancho se fue con ella). La primera sin borde
 * encima: el filete del título ya la separa. La última sin relleno debajo: lo que
 * sigue (la ficha en móvil, la franja desde `lg`) pone su propia separación.
 */
function Lectura({
  id,
  primera,
  cabecera,
  pie,
  enlaces,
  children,
}: {
  id: string;
  primera: boolean;
  cabecera: ReactNode;
  pie: string;
  enlaces: EnlaceMetodo[];
  children: ReactNode;
}) {
  return (
    <article aria-labelledby={id} className={`min-w-0 py-6 last:pb-0 ${primera ? '' : 'border-t border-border'}`.trim()}>
      <header>{cabecera}</header>
      <div className="mt-4">{children}</div>
      <PieDeMetodo texto={pie} enlaces={enlaces} className="mt-6" />
    </article>
  );
}

/** La conclusión: un `h3` de 17 px en negrita, sin la familia de los titulares (spec §4). */
function Conclusion({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="font-sans text-[17px] font-bold leading-snug text-text">
      {children}
    </h3>
  );
}

function VistaPrecio({ lectura, primera }: { lectura: LecturaPrecio; primera: boolean }) {
  return (
    <Lectura
      id="lectura-precio"
      primera={primera}
      cabecera={
        <Conclusion id="lectura-precio">
          {lectura.enlace ? (
            // La conclusión es el enlace al producto (spec §3.2): el pie queda para el método.
            <Link href={lectura.enlace} className="hover:text-primary hover:underline">
              {lectura.conclusion}
            </Link>
          ) : (
            lectura.conclusion
          )}
        </Conclusion>
      }
      pie={lectura.pie}
      enlaces={lectura.enlaces}
    >
      <GraficoPrecio datos={lectura.grafico} />
      <ul className="sr-only">
        {lectura.accesible.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </Lectura>
  );
}

/**
 * Diez celdas: tantas en `dato` como décimos de «hoy o mañana», con el mismo
 * redondeo que la frase («6 de cada 10» se cuenta a la vista). Debajo, la tabla
 * de los cuatro tramos con su cifra; hoy y mañana en negrita.
 */
function VistaCierres({ lectura, primera }: { lectura: LecturaCierres; primera: boolean }) {
  const { decimos } = lectura;
  return (
    <Lectura
      id="lectura-cierres"
      primera={primera}
      cabecera={<Conclusion id="lectura-cierres">{lectura.conclusion}</Conclusion>}
      pie={lectura.pie}
      enlaces={lectura.enlaces}
    >
      <div aria-hidden="true">
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} data-decimo={i < decimos ? 'si' : 'no'} className={`h-8 rounded-sm ${i < decimos ? 'bg-dato' : 'bg-dato-tenue'}`} />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted">
          {decimos > 0 && <span>hoy o mañana</span>}
          {decimos < 10 && <span className="ml-auto">después</span>}
        </div>
      </div>
      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Compras Ágiles abiertas por día de cierre</caption>
        <tbody>
          {lectura.tramos.map((t) => (
            <tr key={t.nombre} className="border-b border-border">
              <th scope="row" className={`py-1 text-left ${t.destacada ? 'font-semibold text-text' : 'font-normal text-muted'}`}>
                {t.nombre}
              </th>
              <td className={`cifra py-1 text-right ${t.destacada ? 'font-semibold text-text' : 'text-muted'}`}>{t.valor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Lectura>
  );
}

function VistaNota({ lectura, primera }: { lectura: LecturaNota; primera: boolean }) {
  return (
    <Lectura
      id="lectura-nota"
      primera={primera}
      cabecera={
        <>
          <p className="text-[13px] text-muted">{lectura.antetitulo}</p>
          <Conclusion id="lectura-nota">{lectura.titulo}</Conclusion>
        </>
      }
      pie={lectura.pie}
      enlaces={lectura.enlaces}
    >
      <p className="text-sm leading-relaxed text-muted">{lectura.resumen}</p>
      {lectura.antesDespues && <AntesDespues datos={lectura.antesDespues} />}
    </Lectura>
  );
}

/** Una lectura elegida, con la vista que le toca. */
function Vista({ elegida, primera }: { elegida: LecturaDeLaPortada; primera: boolean }) {
  switch (elegida.tipo) {
    case 'precio':
      return <VistaPrecio lectura={elegida.lectura} primera={primera} />;
    case 'cierres':
      return <VistaCierres lectura={elegida.lectura} primera={primera} />;
    case 'nota':
      return <VistaNota lectura={elegida.lectura} primera={primera} />;
  }
}

/**
 * «Lo que dicen los datos» (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3.1–§3.4, V1,
 * y la opción 2 del 2026-10-17): desde `lg`, la columna derecha de la portada, a
 * la altura del buscador. El título en chico (18 px) con un filete de 2 px en
 * `primary` (el navy en tema claro) y debajo **dos lecturas apiladas**: las dos
 * primeras disponibles en el orden precio → cierres → nota (`lecturasDeLaPortada`).
 * Sin ninguna, la sección no sale.
 *
 * `dato` sólo en lo que nombra la conclusión, `dato-tenue` el resto. Cada lectura
 * lleva su pie de método.
 */
export function LecturasPortada({ lecturas, className = '' }: { lecturas: Lecturas; className?: string }) {
  const elegidas = lecturasDeLaPortada(lecturas);
  if (elegidas.length === 0) return null;

  return (
    <section aria-labelledby="lecturas-titulo" className={`min-w-0 ${className}`.trim()}>
      <h2 id="lecturas-titulo" className="border-b-2 border-primary pb-3 text-lg leading-snug text-text">
        {TITULO_LECTURAS}
      </h2>
      {elegidas.map((elegida, i) => (
        <Vista key={elegida.tipo} elegida={elegida} primera={i === 0} />
      ))}
    </section>
  );
}
