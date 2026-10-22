import type { AntesDespues as Datos } from '@/lib/notas';

/**
 * El antes y el después de una nota (`antes_despues` del frontmatter): dos barras
 * con su etiqueta y su valor escrito al lado, y el rótulo —qué se mide—.
 *
 * El rótulo va debajo cuando el gráfico cuelga de una conclusión que ya lo
 * presenta (la lectura de la portada) y arriba, en negrita, cuando el gráfico se
 * lee solo: en las páginas de notas, bajo «Qué cambió», en el costado y en la lista.
 *
 * `dato` sólo en el después, que es lo que la nota nombra; el antes en
 * `dato-tenue`, que es decorativo y nunca lleva texto encima (frontend/CLAUDE.md, tokens de
 * dato). Las barras son `aria-hidden`: el valor va como texto.
 */
export function AntesDespues({
  datos,
  className = 'mt-6',
  rotulo = 'abajo',
}: {
  datos: Datos;
  className?: string;
  rotulo?: 'arriba' | 'abajo';
}) {
  const filas = [
    { ...datos.antes, clase: 'bg-dato-tenue' },
    { ...datos.despues, clase: 'bg-dato' },
  ];
  return (
    <figure className={className}>
      {rotulo === 'arriba' && <figcaption className="mb-3 text-sm font-semibold text-text">{datos.rotulo}</figcaption>}
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 text-sm">
        {filas.map((f) => (
          <div key={f.etiqueta} className="contents">
            <dt className="text-muted">{f.etiqueta}</dt>
            <dd className="flex items-center gap-2">
              {/* El 100 % ocupa el 80 % del ancho: el resto es para el valor. */}
              <span
                aria-hidden="true"
                className={`block h-3 flex-none rounded-sm ${f.clase}`}
                style={{ width: `${f.valor * 0.8}%` }}
              />
              <span className="cifra font-semibold text-text">{f.valor.toLocaleString('es-CL')}{'\u00a0'}%</span>
            </dd>
          </div>
        ))}
      </dl>
      {rotulo === 'abajo' && <figcaption className="mt-3 text-sm text-muted">{datos.rotulo}</figcaption>}
    </figure>
  );
}
