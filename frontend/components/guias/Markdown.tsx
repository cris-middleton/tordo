import Link from 'next/link';
import type { ReactNode } from 'react';

import type { Bloque, EnLinea } from '@/lib/markdown';

/**
 * Pinta el árbol de `lib/markdown.ts`. Componente de servidor: llega como HTML.
 *
 * Los estilos van en cada elemento, con tokens: sin `@tailwindcss/typography`
 * (otra dependencia, y su paleta propia habría que domarla a tokens en los dos
 * temas).
 */

/** Un enlace del contenido: interno con `Link`, correo y `https` como `<a>`; lo demás, texto. */
function Enlace({ href, children }: { href: string; children: ReactNode }) {
  const clase = 'enlace';
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={clase}>
        {children}
      </Link>
    );
  }
  if (href.startsWith('mailto:')) {
    return (
      <a href={href} className={clase}>
        {children}
      </a>
    );
  }
  if (href.startsWith('https://')) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={clase}>
        {children}
      </a>
    );
  }
  // `javascript:` y compañía no se convierten en enlace.
  return <>{children}</>;
}

function Linea({ nodos }: { nodos: EnLinea[] }) {
  return (
    <>
      {nodos.map((n, i) => {
        switch (n.t) {
          case 'texto':
            return <span key={i}>{n.v}</span>;
          case 'codigo':
            return (
              <code key={i} className="rounded bg-background px-1 py-0.5 font-mono text-[0.9em] text-text">
                {n.v}
              </code>
            );
          case 'negrita':
            return (
              <strong key={i} className="font-semibold text-text">
                <Linea nodos={n.hijos} />
              </strong>
            );
          case 'cursiva':
            return (
              <em key={i}>
                <Linea nodos={n.hijos} />
              </em>
            );
          case 'enlace':
            return (
              <Enlace key={i} href={n.href}>
                <Linea nodos={n.hijos} />
              </Enlace>
            );
        }
      })}
    </>
  );
}

const TITULOS = {
  2: 'mt-10 font-display text-xl font-bold text-text',
  3: 'mt-8 text-lg font-bold text-text',
  4: 'mt-6 text-base font-bold text-text',
} as const;

function UnBloque({ b }: { b: Bloque }) {
  switch (b.t) {
    case 'titulo': {
      const Etiqueta = `h${b.nivel}` as const;
      return (
        <Etiqueta className={TITULOS[b.nivel]}>
          <Linea nodos={b.hijos} />
        </Etiqueta>
      );
    }
    case 'parrafo':
      return (
        <p className="mt-4 leading-relaxed text-muted">
          <Linea nodos={b.hijos} />
        </p>
      );
    case 'lista': {
      const clase = `mt-4 space-y-2 pl-5 leading-relaxed text-muted ${b.ordenada ? 'list-decimal' : 'list-disc'}`;
      const items = b.items.map((item, i) => (
        <li key={i} className="pl-1">
          <Linea nodos={item} />
        </li>
      ));
      return b.ordenada ? (
        <ol className={clase} start={b.inicio}>
          {items}
        </ol>
      ) : (
        <ul className={clase}>{items}</ul>
      );
    }
    case 'cita':
      return (
        <blockquote className="mt-4 border-l-2 border-accent pl-4 text-text">
          <Linea nodos={b.hijos} />
        </blockquote>
      );
    case 'codigo':
      return (
        <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-background px-4 py-3 text-sm text-text">
          <code className="font-mono">{b.v}</code>
        </pre>
      );
    case 'tabla':
      return (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-background">
              <tr>
                {b.cabecera.map((c, i) => (
                  <th key={i} scope="col" className="px-3 py-2 font-semibold text-text">
                    <Linea nodos={c} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.filas.map((fila, i) => (
                <tr key={i} className="border-t border-border">
                  {fila.map((c, j) => (
                    <td key={j} className="px-3 py-2 align-top text-muted">
                      <Linea nodos={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function Markdown({ arbol }: { arbol: Bloque[] }) {
  return (
    <div className="text-[0.95rem]">
      {arbol.map((b, i) => (
        <UnBloque key={i} b={b} />
      ))}
    </div>
  );
}
