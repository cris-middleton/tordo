import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * Piezas de las páginas públicas. Componentes de servidor: no llevan estado
 * ni efectos, así que llegan al navegador como HTML y nada más.
 */

/** La cabecera de una ficha: qué es, cómo se llama y de cuándo son los datos. */
export function CabeceraFicha({
  tipo,
  titulo,
  subtitulo,
  children,
}: {
  tipo: string;
  titulo: string;
  subtitulo?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{tipo}</p>
      <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-text sm:text-3xl">
        {titulo}
      </h1>
      {subtitulo && <p className="mt-2 text-sm text-muted">{subtitulo}</p>}
      {children}
    </header>
  );
}

export function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-bold text-text">{titulo}</h2>
      {descripcion && <p className="mt-1 text-sm text-muted">{descripcion}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Una cifra con su etiqueta, para las franjas de datos clave. */
export function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-subtle">{etiqueta}</p>
      <p className="cifra mt-1 text-xl font-bold leading-none text-text">{valor}</p>
    </div>
  );
}

export function FranjaDatos({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-4 rounded-xl border border-border bg-surface px-5 py-4">
      {children}
    </div>
  );
}

/**
 * Una tabla de enlaces a otras fichas: el comprador → sus rubros, el rubro →
 * sus compradores, el producto → quién lo compra. Es lo que convierte tres
 * tipos de página sueltos en un sitio que se recorre.
 */
export function TablaEnlaces({
  encabezados,
  filas,
  vacio,
}: {
  encabezados: [string, ...string[]];
  filas: { clave: string; href: string | null; nombre: string; celdas: string[] }[];
  vacio: string;
}) {
  if (filas.length === 0) return <p className="text-sm text-subtle">{vacio}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-subtle">
            {encabezados.map((e, i) => (
              <th key={e} scope="col" className={`px-4 py-2 font-semibold ${i > 0 ? 'text-right' : ''}`}>
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5">
                {f.href ? (
                  <Link href={f.href} className="font-medium text-primary hover:underline">
                    {f.nombre}
                  </Link>
                ) : (
                  <span className="font-medium">{f.nombre}</span>
                )}
              </td>
              {f.celdas.map((c, i) => (
                <td key={i} className="cifra whitespace-nowrap px-4 py-2.5 text-right text-muted">
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

/** La salida a la herramienta: el panel, ya filtrado. */
export function EnlacePanel({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-10 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-onAccent transition-opacity hover:opacity-90"
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
