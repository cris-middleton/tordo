import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';

import {
  hayLecturas,
  izquierdaDeRotulo,
  rotulosDeBanda,
  type EnlaceLectura,
  type LecturaCierres,
  type LecturaPrecio,
  type LecturaSectores,
  type Lecturas,
  type MarcaPrecio,
} from '@/lib/lecturasPortada';

/**
 * El panel de lecturas de la portada (spec docs/IDENTIDAD_Y_PORTADA_2026-10.md
 * §3.2, D4 y D9): quién compra, a qué precio y qué cierra pronto.
 *
 * **La superficie oscura del sitio**: `dark` sobre `bg-brand-navy`, invariante de
 * tema, así que se ve igual en claro y en oscuro y dentro todo toma la parada
 * oscura. Dentro sólo `text`, `muted`, `dato` y `primary` (la tinta de `.enlace`):
 * sus pares sobre `brand-navy` están en `contraste-wcag.test.ts`; `subtle` no
 * (4,18:1). Tampoco `accent`, ni al pasar el ratón (spec §5). Los divisores y lo que la conclusión no nombra, en `dato-tenue`.
 *
 * **Gráficos en HTML y CSS, sin JS** (D9): las barras van con `aria-hidden` y
 * cada valor va escrito al lado. Un lector de pantalla lee la conclusión y los
 * valores, sin descripciones de colores. Los textos, las cuentas y dónde cae
 * cada rótulo salen de `lib/lecturasPortada.ts`; aquí sólo se pintan.
 */
export function PanelLecturas(lecturas: Lecturas) {
  if (!hayLecturas(lecturas)) return null;
  const { sectores, precio, cierres } = lecturas;
  return (
    <section
      aria-labelledby="lecturas-titulo"
      className="dark min-w-0 overflow-hidden rounded-[14px] bg-brand-navy px-4 py-1.5 text-text sm:px-6"
    >
      <h2 id="lecturas-titulo" className="sr-only">
        Lo que dicen los datos
      </h2>
      <div className="divide-y divide-dato-tenue">
        {sectores && <VistaSectores lectura={sectores} />}
        {precio && <VistaPrecio lectura={precio} />}
        {cierres && <VistaCierres lectura={cierres} />}
      </div>
    </section>
  );
}

/**
 * Conclusión, pie con su base y periodo, enlace y gráfico (§3.2). La conclusión
 * es un `h3` en `text` y negrita, sin la familia de los titulares: es una frase.
 */
function Lectura({
  id,
  conclusion,
  pie,
  enlace,
  children,
}: {
  id: string;
  conclusion: string;
  pie: string;
  enlace: EnlaceLectura;
  children: ReactNode;
}) {
  return (
    <article aria-labelledby={id} className="py-5">
      <h3 id={id} className="text-base font-bold leading-snug text-text">
        {conclusion}
      </h3>
      <div className="mb-3 mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13px] text-muted">
        <p>{pie}</p>
        {/* El anillo del foco por defecto se separa con el fondo de la página; aquí, con el navy.
            `.enlace` pasa a `accent` al pasar el ratón; en el panel, a `text` (la utilidad gana). */}
        <Link
          href={enlace.href}
          className="enlace rounded-sm hover:text-text focus-visible:ring-text focus-visible:ring-offset-brand-navy"
        >
          {enlace.texto}
        </Link>
      </div>
      {children}
    </article>
  );
}

function VistaSectores({ lectura }: { lectura: LecturaSectores }) {
  const { conclusion, pie, enlace, barras } = lectura;
  return (
    <Lectura id="lectura-sectores" conclusion={conclusion} pie={pie} enlace={enlace}>
      <ul className="space-y-1.5 text-sm">
        {barras.map((b) => (
          <li
            key={b.nombre}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[7.5rem_minmax(0,1fr)_6.5rem]"
          >
            <span className="min-w-0 truncate" title={b.nombre}>
              {b.nombre}
            </span>
            <span
              className={`cifra text-right sm:col-start-3 sm:row-start-1 ${b.destacada ? 'font-bold text-text' : 'text-muted'}`}
            >
              {b.monto}
            </span>
            <span aria-hidden="true" className="col-span-2 h-3 sm:col-span-1 sm:col-start-2 sm:row-start-1">
              <span
                className={`block h-full rounded-r-[3px] ${b.destacada ? 'bg-dato' : 'bg-dato-tenue'}`}
                style={{ width: `${b.ancho}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </Lectura>
  );
}

/**
 * Dónde va un rótulo de precio: `left-[var(--izquierda)]` con el `clamp()` de
 * `izquierdaDeRotulo`. Va en una variable y no en `left` porque así el valor
 * llega igual al navegador y a jsdom, que descarta un `left: clamp(…)` y dejaría
 * el test sin nada que mirar.
 */
const CLASE_ROTULO = 'absolute left-[var(--izquierda)] -translate-x-1/2 whitespace-nowrap';

function estiloRotulo(posicion: number, texto: string): CSSProperties {
  return { '--izquierda': izquierdaDeRotulo(posicion, texto) } as CSSProperties;
}

/**
 * Un cuartil bajo la banda: el valor que se ve y, para un lector de pantalla,
 * qué es. Su `left` lo acota su propio ancho (`izquierdaDeRotulo`).
 */
function RotuloCuartil({ marca, nombre, posicion }: { marca: MarcaPrecio; nombre: string; posicion: number }) {
  return (
    <li className={`${CLASE_ROTULO} bottom-0 text-text`} style={estiloRotulo(posicion, marca.valor)}>
      <span className="sr-only">{nombre}: </span>
      <span className="cifra">{marca.valor}</span>
    </li>
  );
}

/**
 * La banda de precio (§3.4): el riel de p10 a p90 en `dato-tenue`, la mitad
 * central (p25–p75) en `dato` y la mediana como una marca. Rótulos: «mediana $X»
 * encima de su marca, p25 y p75 debajo de la banda, y p10/p90 sin rótulo (con
 * precios sesgados los cinco se pisaban). Si p25 y p75 caen casi en el mismo
 * sitio (cola larga a un lado), un solo rótulo «$p25 – $p75».
 */
function VistaPrecio({ lectura }: { lectura: LecturaPrecio }) {
  const { conclusion, pie, enlace, p25, p50, p75 } = lectura;
  const rotulos = rotulosDeBanda(p25, p75);
  const juntos = `${p25.valor} – ${p75.valor}`;
  const mediana = p50 ? `mediana ${p50.valor}` : '';
  return (
    <Lectura id="lectura-precio" conclusion={conclusion} pie={pie} enlace={enlace}>
      <div className="relative h-16 text-[13px]">
        <div aria-hidden="true" className="absolute inset-x-0 top-6 h-3">
          <div className="absolute inset-0 rounded-full bg-dato-tenue" />
          <div
            className="absolute inset-y-0 rounded-full bg-dato"
            style={{ left: `${p25.posicion}%`, width: `${Math.max(1, p75.posicion - p25.posicion)}%` }}
          />
          {p50 && (
            <div className="absolute -top-1.5 h-6 w-[3px] -translate-x-1/2 bg-text" style={{ left: `${Math.min(100, Math.max(0, p50.posicion))}%` }} />
          )}
        </div>
        <ul aria-label="Precios pagados" className="absolute inset-0">
          {rotulos.juntos ? (
            <li className={`${CLASE_ROTULO} bottom-0 text-text`} style={estiloRotulo(rotulos.centro, juntos)}>
              <span className="sr-only">Percentil 25: </span>
              <span className="cifra">{p25.valor}</span> – <span className="sr-only">Percentil 75: </span>
              <span className="cifra">{p75.valor}</span>
            </li>
          ) : (
            <RotuloCuartil marca={p25} nombre="Percentil 25" posicion={rotulos.p25} />
          )}
          {p50 && (
            // La negrita va en el <li>: su `ch` es el del peso más grueso del rótulo.
            <li className={`${CLASE_ROTULO} top-0 text-xs font-bold text-text`} style={estiloRotulo(p50.posicion, mediana)}>
              <span className="font-normal text-muted">mediana </span>
              <span className="cifra">{p50.valor}</span>
            </li>
          )}
          {!rotulos.juntos && <RotuloCuartil marca={p75} nombre="Percentil 75" posicion={rotulos.p75} />}
        </ul>
      </div>
    </Lectura>
  );
}

/**
 * Las Compras Ágiles abiertas por día de cierre (§3.5), como en la maqueta: cada
 * valor justo encima de su barra y las cuatro barras sobre una misma línea de
 * base.
 *
 * - **La zona de barra va primero y mide lo mismo en las cuatro columnas** (`mt-6`
 *   para el valor de la más alta + `h-12`), así que el nombre de debajo puede
 *   ocupar dos líneas («En 2 o 3 días» a 390 px) sin mover ninguna barra. Antes
 *   la columna se alineaba abajo y ese nombre subía su barra.
 * - **El valor cuelga de la barra** (`absolute bottom-full`): sube y baja con ella.
 * - Se oye «Hoy: 312» (`sr-only`, primero) y lo visible va en `aria-hidden`: el
 *   orden visual dejaba la cifra sin decir de qué era hasta después.
 */
function VistaCierres({ lectura }: { lectura: LecturaCierres }) {
  const { conclusion, pie, enlace, columnas } = lectura;
  return (
    <Lectura id="lectura-cierres" conclusion={conclusion} pie={pie} enlace={enlace}>
      <ul className="grid grid-cols-4 gap-3 text-center text-[13px] sm:gap-5 sm:text-sm">
        {columnas.map((c) => (
          <li key={c.nombre} className="flex min-w-0 flex-col">
            <span className="sr-only">
              {c.nombre}: {c.valor}
            </span>
            <span aria-hidden="true" className="mt-6 flex h-12 items-end">
              <span
                className={`relative block w-full rounded-t-[3px] ${c.destacada ? 'bg-dato' : 'bg-dato-tenue'}`}
                style={{ height: `${c.alto}%` }}
              >
                <span
                  className={`cifra absolute inset-x-0 bottom-full mb-1 whitespace-nowrap ${c.destacada ? 'font-extrabold text-text' : 'font-semibold text-muted'}`}
                >
                  {c.valor}
                </span>
              </span>
            </span>
            <span aria-hidden="true" className="mt-1.5 leading-tight text-muted">
              {c.nombre}
            </span>
          </li>
        ))}
      </ul>
    </Lectura>
  );
}
