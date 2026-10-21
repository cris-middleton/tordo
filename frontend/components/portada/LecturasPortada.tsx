import type { ReactNode } from 'react';
import Link from 'next/link';

import { PieDeMetodo } from '@/components/metodo/PieDeMetodo';
import { AntesDespues } from '@/components/notas/AntesDespues';
import { Concentracion } from '@/components/graficos/Concentracion';
import { BarraCierres } from '@/components/portada/BarraCierres';
import { GraficoPrecio } from '@/components/precio/GraficoPrecio';
import {
  lecturasDeLaPortada,
  type LecturaCierres,
  type LecturaDeLaPortada,
  type LecturaNota,
  type LecturaPrecio,
  type Lecturas,
} from '@/lib/lecturasPortada';
import type { LecturaConcentracion } from '@/lib/lecturasMercado';
import type { EnlaceMetodo } from '@/lib/metodo';

export const TITULO_LECTURAS = 'Para empezar';

/**
 * Una lectura: la conclusión, el gráfico y el pie de método, uno tras otro. Desde
 * `lg` van tres en fila; cada una es una subrejilla de tres filas (conclusión,
 * gráfico, pie), así que los gráficos empiezan a la misma altura aunque una
 * conclusión ocupe una línea más, y los pies quedan alineados abajo.
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
    <article
      aria-labelledby={id}
      className={`grid min-w-0 grid-rows-[auto_1fr_auto] py-6 lg:row-span-3 lg:grid-rows-subgrid lg:border-t-0 lg:py-0 ${primera ? '' : 'border-t border-border'}`.trim()}
    >
      <header>{cabecera}</header>
      <div className="mt-4">{children}</div>
      <PieDeMetodo texto={pie} enlaces={enlaces} className="mt-6 self-end" />
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

function VistaConcentracion({ lectura, primera }: { lectura: LecturaConcentracion; primera: boolean }) {
  return (
    <Lectura
      id="lectura-concentracion"
      primera={primera}
      cabecera={<Conclusion id="lectura-concentracion">{lectura.conclusion}</Conclusion>}
      pie={lectura.pie}
      enlaces={lectura.enlaces}
    >
      <Concentracion datos={lectura.grafico} />
    </Lectura>
  );
}

/**
 * La barra de diez décimos (`BarraCierres`) y debajo la tabla de los cuatro
 * tramos con su cifra; hoy y mañana en negrita.
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
      <BarraCierres decimos={decimos} />
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
    case 'concentracion':
      return <VistaConcentracion lectura={elegida.lectura} primera={primera} />;
    case 'cierres':
      return <VistaCierres lectura={elegida.lectura} primera={primera} />;
    case 'nota':
      return <VistaNota lectura={elegida.lectura} primera={primera} />;
  }
}

/**
 * «Para empezar»: las lecturas cortas de la portada, bajo el buscador y el gráfico
 * grande. Desde `lg`, tres en fila, alineadas por subrejilla; en móvil, una tras
 * otra. Las tres primeras disponibles en el orden precio → concentración →
 * cierres → nota (`lecturasDeLaPortada`). Sin ninguna, la sección no sale.
 *
 * Cada lectura: la conclusión que sale del dato, el gráfico (con globo al pasar
 * el mouse donde lo tiene) y su pie de método.
 */
export function LecturasPortada({ lecturas, className = '' }: { lecturas: Lecturas; className?: string }) {
  const elegidas = lecturasDeLaPortada(lecturas);
  if (elegidas.length === 0) return null;

  return (
    <section aria-labelledby="lecturas-titulo" className={`min-w-0 ${className}`.trim()}>
      <h2 id="lecturas-titulo" className="section-title">
        {TITULO_LECTURAS}
      </h2>
      <div className="mt-2 grid lg:mt-6 lg:grid-cols-3 lg:gap-x-10 lg:border-t lg:border-border lg:pt-6">
        {elegidas.map((elegida, i) => (
          <Vista key={elegida.tipo} elegida={elegida} primera={i === 0} />
        ))}
      </div>
    </section>
  );
}
