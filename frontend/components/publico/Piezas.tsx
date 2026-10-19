import Link from 'next/link';

/**
 * Piezas de las páginas públicas. Componentes de servidor: no llevan estado
 * ni efectos, así que llegan al navegador como HTML y nada más.
 */

/**
 * La cabecera de una página pública: cómo se llama y de cuándo son los datos.
 *
 * Sin antetítulo en mayúsculas («PRECIO DE REFERENCIA», «ACERCA»): repetía la
 * navegación y es una señal de plantilla (spec PORTADA_V7, V10). Nada va antes
 * del `h1`: el tope lo pone el contenedor (§4).
 */
export function CabeceraFicha({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-8">
      <h1 className="page-title break-words">{titulo}</h1>
      {subtitulo && <p className="mt-2 max-w-3xl text-sm text-muted">{subtitulo}</p>}
      {children}
    </header>
  );
}

/** La sección de página es la de la cáscara: una sola separación en todo el sitio. */
export { Seccion } from '@/components/cascara/Seccion';

/** Una cifra con su etiqueta, para las franjas de datos clave. */
export function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-sm text-muted">{etiqueta}</p>
      <p className="cifra mt-1 text-lg font-semibold leading-none text-text">{valor}</p>
    </div>
  );
}

export function FranjaDatos({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-4 border-y border-border py-4">
      {children}
    </div>
  );
}

/**
 * Una tabla de enlaces a otras fichas: el comprador → sus rubros, el rubro →
 * sus compradores, el producto → quién lo compra. Es lo que convierte tres
 * tipos de página sueltos en un sitio que se recorre.
 *
 * Filas con filete y sin caja, como las tablas de cifras de las fichas.
 * `ocultarEnMovil` son los índices de `celdas` que no caben en un teléfono (la
 * unidad, cuando todas dicen lo mismo): bajo `sm` se ocultan, y el nombre no
 * queda partido en cuatro líneas.
 */
export function TablaEnlaces({
  encabezados,
  filas,
  vacio,
  ocultarEnMovil = [],
}: {
  encabezados: [string, ...string[]];
  filas: { clave: string; href: string | null; nombre: string; celdas: string[] }[];
  vacio: string;
  ocultarEnMovil?: number[];
}) {
  if (filas.length === 0) return <p className="text-sm text-subtle">{vacio}</p>;
  const oculta = (i: number) => (ocultarEnMovil.includes(i) ? 'hidden sm:table-cell' : '');
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            {encabezados.map((e, i) => (
              <th
                key={e}
                scope="col"
                className={`py-2 font-normal ${i > 0 ? `pl-4 text-right ${oculta(i - 1)}` : 'pr-2'}`}
              >
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave} className="border-b border-border">
              <td className="py-3 pr-2">
                {f.href ? (
                  <Link href={f.href} className="font-medium text-primary hover:text-accent">
                    {f.nombre}
                  </Link>
                ) : (
                  <span className="font-medium">{f.nombre}</span>
                )}
              </td>
              {f.celdas.map((c, i) => (
                <td key={i} className={`cifra whitespace-nowrap py-3 pl-4 text-right text-muted ${oculta(i)}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * La salida a la herramienta: el panel, ya filtrado. Un enlace de texto, sin
 * flecha: es una salida más de la ficha, no la acción principal de la página.
 */
export function EnlacePanel({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <p className="mt-10 text-sm">
      <Link href={href} className="enlace">
        {children}
      </Link>
    </p>
  );
}
