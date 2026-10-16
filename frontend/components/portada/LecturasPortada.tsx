import type { ReactNode } from 'react';
import Link from 'next/link';

import { CLASE_SECCION } from '@/components/cascara/Seccion';
import { PieDeMetodo } from '@/components/metodo/PieDeMetodo';
import { AntesDespues } from '@/components/notas/AntesDespues';
import { GraficoPrecio } from '@/components/precio/GraficoPrecio';
import {
  cuantasLecturas,
  type LecturaCierres,
  type LecturaNota,
  type LecturaPrecio,
  type Lecturas,
} from '@/lib/lecturasPortada';
import type { EnlaceMetodo } from '@/lib/metodo';

export const TITULO_LECTURAS = 'Lo que dicen los datos';
export const FRASE_LECTURAS = 'Cada lectura dice de dónde sale, cómo se calcula y dónde bajarla.';

/** Columnas desde `lg`, una por lectura: las que están se reparten el ancho. */
const COLUMNAS: Record<number, string> = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 lg:grid-cols-3' };

/**
 * Los bordes y rellenos de la lectura `i` de `n`. En móvil, una debajo de otra
 * con un borde encima; entre 768 y 1023, dos por fila (la tercera debajo); desde
 * `lg`, todas en una fila con un borde vertical entre ellas.
 */
function clasesDeLectura(i: number, n: number): string {
  const clases = ['py-6'];
  if (i > 0) clases.push('border-t border-border');
  if (n >= 2) {
    if (i === 1) clases.push('md:border-t-0 md:border-l md:pl-6');
    if (i === 0) clases.push('md:pr-6');
    if (i === 2) clases.push('md:pr-6 lg:border-t-0 lg:border-l lg:pl-6 lg:pr-0');
    if (i === 1 && n === 3) clases.push('lg:pr-6');
  }
  return clases.join(' ');
}

/**
 * Una lectura: cabecera (la conclusión), cuerpo (el gráfico) y pie de método.
 * **Desde `lg` las tres partes son filas de una subrejilla**: la cabecera más alta
 * fija dónde empiezan los tres gráficos y el cuerpo más alto, dónde empiezan los
 * tres pies. Sin eso, una conclusión de dos líneas bajaba su gráfico y los pies
 * quedaban a alturas distintas. Por debajo, columna flexible con el pie abajo.
 */
function Lectura({
  id,
  clases,
  cabecera,
  pie,
  enlaces,
  children,
}: {
  id: string;
  clases: string;
  cabecera: ReactNode;
  pie: string;
  enlaces: EnlaceMetodo[];
  children: ReactNode;
}) {
  return (
    <article
      aria-labelledby={id}
      className={`flex min-w-0 flex-col lg:row-span-3 lg:grid lg:grid-rows-subgrid ${clases}`}
    >
      <header>{cabecera}</header>
      <div className="mt-4 flex-1">{children}</div>
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

function VistaPrecio({ lectura, clases }: { lectura: LecturaPrecio; clases: string }) {
  return (
    <Lectura
      id="lectura-precio"
      clases={clases}
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
function VistaCierres({ lectura, clases }: { lectura: LecturaCierres; clases: string }) {
  const { decimos } = lectura;
  return (
    <Lectura
      id="lectura-cierres"
      clases={clases}
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

function VistaNota({ lectura, clases }: { lectura: LecturaNota; clases: string }) {
  return (
    <Lectura
      id="lectura-nota"
      clases={clases}
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

/**
 * «Lo que dicen los datos» (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3.1–§3.4, V1):
 * las tres lecturas sobre blanco, en una banda a lo ancho con un filete de 2 px
 * en `primary` (el navy en tema claro) bajo su título. Precio, cierres y la
 * última nota; si una falta, las demás se reparten el ancho, y sin ninguna la
 * banda no sale.
 *
 * `dato` sólo en lo que nombra la conclusión, `dato-tenue` el resto. Cada lectura
 * lleva su pie de método.
 */
export function LecturasPortada({ lecturas, className = '' }: { lecturas: Lecturas; className?: string }) {
  const n = cuantasLecturas(lecturas);
  if (n === 0) return null;
  const vistas: ((clases: string) => ReactNode)[] = [];
  if (lecturas.precio) {
    const l = lecturas.precio;
    vistas.push((c) => <VistaPrecio key="precio" lectura={l} clases={c} />);
  }
  if (lecturas.cierres) {
    const l = lecturas.cierres;
    vistas.push((c) => <VistaCierres key="cierres" lectura={l} clases={c} />);
  }
  if (lecturas.nota) {
    const l = lecturas.nota;
    vistas.push((c) => <VistaNota key="nota" lectura={l} clases={c} />);
  }

  return (
    <section aria-labelledby="lecturas-titulo" className={`${CLASE_SECCION} ${className}`.trim()}>
      <div className="flex flex-col gap-1 border-b-2 border-primary pb-3 md:flex-row md:items-baseline md:justify-between md:gap-6">
        <h2 id="lecturas-titulo" className="section-title">
          {TITULO_LECTURAS}
        </h2>
        <p className="text-sm text-muted">{FRASE_LECTURAS}</p>
      </div>
      <div className={`grid grid-cols-1 lg:grid-rows-[auto_1fr_auto] ${COLUMNAS[n]}`}>
        {vistas.map((vista, i) => vista(clasesDeLectura(i, n)))}
      </div>
    </section>
  );
}
