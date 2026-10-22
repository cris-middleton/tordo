import Link from 'next/link';

import type { EnlaceMetodo } from '@/lib/metodo';

/**
 * El pie de método de un gráfico (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md V3): de
 * qué base sale, de qué periodo y cómo se calcula, y los enlaces para comprobarlo
 * —la guía, la API y el código—. Lo que hace que una cifra se lea como trabajo
 * de datos y no como un adorno.
 *
 * Componente de servidor. Los textos y los enlaces los arman `lib/lecturasPortada.ts`
 * y `lib/metodo.ts`; aquí sólo se pintan. Los enlaces van en una lista y en texto
 * corrido de pie, así que llevan `enlace` (subrayado).
 */
export function PieDeMetodo({
  texto,
  enlaces,
  className = '',
  completo = false,
}: {
  texto: string;
  enlaces: EnlaceMetodo[];
  className?: string;
  /**
   * Bajo un gráfico ancho, el texto ocupa el ancho del gráfico: con la medida de
   * lectura quedaba corto y corrido a la izquierda, sin acompañar al dibujo.
   */
  completo?: boolean;
}) {
  return (
    <div className={`border-t border-border pt-3 text-[13px] leading-snug text-muted ${className}`.trim()}>
      <p className={completo ? undefined : 'max-w-[62ch]'}>{texto}</p>
      {enlaces.length > 0 && (
        <ul aria-label="Método y datos" className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {enlaces.map((e) => (
            <li key={e.texto}>
              {e.externo ? (
                <a href={e.href} rel="noopener noreferrer" className="enlace">
                  {e.texto}
                </a>
              ) : (
                <Link href={e.href} className="enlace">
                  {e.texto}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
