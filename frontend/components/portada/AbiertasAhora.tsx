import Link from 'next/link';

import type { TiraPortada } from '@/lib/portada';

/**
 * Cuántas licitaciones y Compras Ágiles se pueden postular ahora, **en una frase**:
 * «Ahora puedes postular a 4.328 licitaciones y 610 Compras Ágiles.» Cada cifra
 * con lo que cuenta es un enlace al catálogo con el mismo filtro que la cuenta.
 *
 * Antes eran dos bloques con el número grande, la etiqueta chica y un filete
 * lateral grueso: la plantilla de «métrica de héroe» que se ve en cualquier
 * tablero. La frase dice lo mismo, se lee de corrido y deja el espacio al gráfico.
 * Sin tira (`tiraDeLaPortada` → null) no se llega aquí. Con el conteo atrasado
 * (`tira.atrasado`) no dice «Ahora»: dice de cuándo es.
 */
export function AbiertasAhora({ tira, className = '' }: { tira: TiraPortada; className?: string }) {
  const [lic, ca] = tira.cifras;
  const enlace = (c: TiraPortada['cifras'][number]) => (
    <Link href={c.href} className="whitespace-nowrap font-semibold text-text underline decoration-dato decoration-[1.5px] underline-offset-4 hover:text-primary">
      <span className="cifra">{c.numero}</span> {c.etiqueta.replace(/ abiertas?$/, '')}
    </Link>
  );
  return (
    <p className={`text-base leading-relaxed text-muted ${className}`.trim()}>
      {tira.atrasado ? (
        <>
          {tira.atrasado.charAt(0).toUpperCase() + tira.atrasado.slice(1)} se podía postular a {enlace(lic)} y {enlace(ca)}.
        </>
      ) : (
        <>
          Ahora puedes postular a {enlace(lic)} y {enlace(ca)}.
        </>
      )}
    </p>
  );
}
