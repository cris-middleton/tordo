import { PASO_PUNTOS, RADIO_PUNTO, ROTULO_FRANJA, type GraficoPrecio as Datos } from '@/lib/graficoPrecio';

/** Lo que mide cada franja horizontal del SVG, en px. */
const ARRIBA = 20; // el rótulo «la mitad central»
const ALTO_MINIMO = 104;
const BAJO_EJE = 18; // de la línea del eje a la base de sus rótulos
const NOTA_ESCALA = 18; // «escala logarítmica»

/**
 * El gráfico de precio (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3.2, V7): la
 * franja P25–P75 en `dato-tenue` con su etiqueta directa, un punto en `dato` por
 * comprador en su mediana, y el eje logarítmico con P25 y P75 en negrita y dos
 * valores redondos de contexto en `muted`. Sin leyenda.
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
  const { franja, puntos, filas, marcas, rotuloFranja } = datos;
  const alto = Math.max(ALTO_MINIMO, 2 * filas * PASO_PUNTOS + 2 * RADIO_PUNTO + 16);
  const centro = ARRIBA + alto / 2;
  const eje = ARRIBA + alto + 4;
  const rotulos = eje + BAJO_EJE;
  const total = rotulos + NOTA_ESCALA;

  return (
    <svg width="100%" height={total} aria-hidden="true" focusable="false" className="cifra block overflow-visible">
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
      {rotuloFranja && (
        <text x={`${rotuloFranja.xTexto}%`} y={13} textAnchor={rotuloFranja.ancla} className="fill-muted text-[12px]">
          {ROTULO_FRANJA}
        </text>
      )}

      {puntos.map((p, i) => (
        <circle key={i} cx={`${p.x}%`} cy={centro + p.fila * PASO_PUNTOS} r={RADIO_PUNTO} className="fill-dato" />
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
      <text x="0" y={total - 2} className="fill-muted text-[11px]">
        escala logarítmica
      </text>
    </svg>
  );
}
