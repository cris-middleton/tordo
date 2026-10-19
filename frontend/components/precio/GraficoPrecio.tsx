import { ROTULO_FRANJA, type GraficoPrecio as Datos } from '@/lib/graficoPrecio';

/** Lo que mide cada franja horizontal del SVG, en px. */
const ARRIBA = 20; // el rótulo «la mitad central»
const ALTO_MINIMO = 72; // con puntos: la nube manda, pero nunca más baja que esto
const ALTO_SIN_PUNTOS = 44; // sin puntos, la franja no necesita alto: es un rango
const BAJO_EJE = 18; // de la línea del eje a la base de sus rótulos
const NOTA_ESCALA = 18; // «escala logarítmica»

/**
 * El gráfico de precio (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3.2, V7): la
 * franja P25–P75 en `dato-tenue` con su etiqueta directa, la mediana como una
 * raya en `text`, la línea fina de P10 a P90 en `muted`, un punto en `dato` por
 * comprador en su mediana (sólo con `MINIMO_PUNTOS` o más; sin puntos, la franja
 * baja a 44 px: es un rango, no una nube), y el eje logarítmico con P25 y P75 en
 * negrita y dos valores redondos de contexto en `muted`. Sin leyenda: el pie de
 * método dice qué es cada trazo.
 *
 * **SVG de servidor y sin `viewBox`**: lo horizontal va en % del ancho de la
 * columna y lo vertical en px, así que un punto es redondo y un rótulo mide 12 px
 * a cualquier ancho. Dónde va cada cosa —y que nada se pise al ancho más estrecho—
 * lo decide `lib/graficoPrecio.ts`; aquí sólo se dibuja. Lo mismo en la portada y
 * en la ficha de producto.
 *
 * `aria-hidden`: quien no lo ve lee la conclusión y los valores en texto, que
 * pinta quien lo usa.
 */
export function GraficoPrecio({ datos }: { datos: Datos }) {
  const { franja, bigotes, mediana, puntos, filas, marcas, rotuloFranja, radio } = datos;
  const paso = 2 * radio + 1;
  const alto = puntos.length ? Math.max(ALTO_MINIMO, 2 * filas * paso + 2 * radio + 32) : ALTO_SIN_PUNTOS;
  const centro = ARRIBA + alto / 2;
  const eje = ARRIBA + alto + 4;
  const rotulos = eje + BAJO_EJE;
  const total = rotulos + NOTA_ESCALA;

  return (
    <svg width="100%" height={total} aria-hidden="true" focusable="false" className="cifra block overflow-visible">
      {bigotes && (
        <g className="stroke-muted">
          <line x1={`${bigotes.desde}%`} x2={`${bigotes.hasta}%`} y1={centro} y2={centro} strokeWidth={1.5} />
          <line x1={`${bigotes.desde}%`} x2={`${bigotes.desde}%`} y1={centro - 6} y2={centro + 6} strokeWidth={1.5} />
          <line x1={`${bigotes.hasta}%`} x2={`${bigotes.hasta}%`} y1={centro - 6} y2={centro + 6} strokeWidth={1.5} />
        </g>
      )}
      {franja &&
        (franja.desde === franja.hasta ? (
          <line
            x1={`${franja.desde}%`}
            x2={`${franja.desde}%`}
            y1={ARRIBA}
            y2={ARRIBA + alto}
            strokeWidth={4}
            className="stroke-dato-tenue"
          />
        ) : (
          <rect
            x={`${franja.desde}%`}
            width={`${franja.hasta - franja.desde}%`}
            y={ARRIBA}
            height={alto}
            rx={2}
            className="fill-dato-tenue"
          />
        ))}
      {mediana != null && franja && franja.desde !== franja.hasta && (
        <line
          x1={`${mediana}%`}
          x2={`${mediana}%`}
          y1={ARRIBA}
          y2={ARRIBA + alto}
          strokeWidth={2}
          className="stroke-text"
        />
      )}
      {rotuloFranja && (
        <text x={`${rotuloFranja.xTexto}%`} y={13} textAnchor={rotuloFranja.ancla} className="fill-muted text-[12px]">
          {ROTULO_FRANJA}
        </text>
      )}

      {puntos.map((p, i) => (
        <circle key={i} cx={`${p.x}%`} cy={centro + p.fila * paso} r={radio} className="fill-dato" />
      ))}

      <line x1="0" x2="100%" y1={eje} y2={eje} className="stroke-border" />
      {marcas.map((m, i) => (
        <g key={i}>
          <line
            x1={`${m.x}%`}
            x2={`${m.x}%`}
            y1={eje}
            y2={eje + 5}
            className={m.fuerte ? 'stroke-text' : 'stroke-muted'}
          />
          {m.texto && (
            <text
              x={`${m.xTexto}%`}
              y={rotulos}
              textAnchor={m.ancla}
              className={`text-[12px] ${m.fuerte ? 'fill-text font-semibold' : 'fill-muted'}`}
            >
              {m.texto}
            </text>
          )}
        </g>
      ))}
      <text x="0" y={total - 2} className="fill-muted text-[12px]">
        escala logarítmica
      </text>
    </svg>
  );
}
