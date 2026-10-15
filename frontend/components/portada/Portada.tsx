import { actualizadoEnPalabras, lemaPortada, tiraDeLaPortada, usosAbiertos } from '@/lib/portada';
import type { CompraAgilDestacadasResponse } from '@/types/compraAgil';
import type { ResumenPortada } from '@/types/publico';

import { BloqueHoy } from './BloqueHoy';
import { BuscadorPortada } from './BuscadorPortada';
import { CierrePortada } from './CierrePortada';
import { TiraCifras } from './TiraCifras';
import { UsosAbiertos } from './UsosAbiertos';

/**
 * La portada (spec del rediseño §6.3). **Componente de servidor entero, sin
 * JavaScript propio**; la cabecera y el pie los pone la cáscara única.
 *
 * Lo primero es la herramienta, no la promesa (principio 1): la pregunta y el
 * buscador, sus ejemplos, la frase de lo libre y la tira de cifras. Debajo, «Lo
 * mejor de hoy» en filas, lo abierto y cómo se sostiene. Sin hero de color, sin
 * rejilla de accesos y sin preguntas frecuentes: eso está en `/acerca`.
 *
 * Lo vivo llega de `app/page.tsx` y puede faltar: `destacadas = null`, o una hora
 * ilegible (`actualizadoEnPalabras` → null; `tiraDeLaPortada` → null), es que el
 * backend falló, y ese bloque no se pinta. El buscador no depende de nada: la portada siempre sirve
 * para buscar.
 */
export function Portada({
  destacadas,
  resumen,
  repositorio,
  autor,
}: {
  destacadas: CompraAgilDestacadasResponse | null;
  resumen: ResumenPortada | null;
  /** `urlRepositorio()`: «Código» y «código abierto» sólo con el repositorio publicado. */
  repositorio: string | null;
  /** `nombreResponsable()`: «hecho por» sólo con nombre. */
  autor: string | null;
}) {
  const tira = tiraDeLaPortada(resumen);
  // Principio 4: «sin dato fresco, el bloque se oculta». Sin hora legible no hay
  // con qué decir de cuándo es la lista, y se oculta entera, no sólo su línea de hora.
  const horaHoy = destacadas ? actualizadoEnPalabras(destacadas.actualizado_en) : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
      <BuscadorPortada />
      <p className="mt-4 text-sm font-medium text-text">{lemaPortada(repositorio)}</p>
      {tira && <TiraCifras tira={tira} />}

      {destacadas && horaHoy && <BloqueHoy datos={destacadas} actualizado={horaHoy} />}

      <UsosAbiertos usos={usosAbiertos(repositorio)} />
      <CierrePortada autor={autor} />
    </div>
  );
}
