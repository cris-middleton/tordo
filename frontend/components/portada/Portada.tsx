import { Contenedor } from '@/components/cascara/Contenedor';
import { hayLecturas, lecturaCierres, lecturaPrecio, lecturaSectores, type Lecturas } from '@/lib/lecturasPortada';
import { actualizadoEnPalabras, franjaDeLaPortada, tiraDeLaPortada, usosAbiertos } from '@/lib/portada';
import type { SectoresBI } from '@/types/bi';
import type { CompraAgilDestacadasResponse } from '@/types/compraAgil';
import type { ProductoPublico, ResumenPortada } from '@/types/publico';

import { BloqueHoy } from './BloqueHoy';
import { BuscadorPortada } from './BuscadorPortada';
import { CierrePortada } from './CierrePortada';
import { FichaPortada } from './FichaPortada';
import { FranjaPortada } from './FranjaPortada';
import { PanelLecturas } from './PanelLecturas';
import { TiraCifras } from './TiraCifras';
import { UsosAbiertos } from './UsosAbiertos';

/**
 * La portada (spec docs/IDENTIDAD_Y_PORTADA_2026-10.md §3). **Componente de
 * servidor entero, sin JavaScript propio**; la cabecera y el pie los pone la
 * cáscara única.
 *
 * Dentro del contenedor único (spec PORTADA_V7 §4: el mismo borde izquierdo que
 * la cabecera). Dos columnas desde `lg` (D6), con 56 px entre ellas: a la
 * izquierda se busca —la pregunta, el buscador, las cifras y la ficha—; a la
 * derecha se lee —el panel oscuro con las tres lecturas—. Por debajo de `lg`,
 * una columna, con el panel después de la ficha. Debajo de las dos, la franja de
 * hoy, «Lo mejor de hoy», lo abierto y cómo se sostiene.
 *
 * Todo lo vivo llega de `app/page.tsx` y puede faltar: `null`, una hora
 * ilegible o un campo mal formado ocultan SU bloque y nada más. Sin ninguna
 * lectura no hay panel, y el buscador ocupa el ancho. El buscador no depende de
 * nada: la portada siempre sirve para buscar.
 */
export function Portada({
  destacadas,
  resumen,
  sectores,
  producto,
  repositorio,
  autor,
}: {
  destacadas: CompraAgilDestacadasResponse | null;
  resumen: ResumenPortada | null;
  /** `GET /bi/sector` (lectura 1), o null. */
  sectores: SectoresBI | null;
  /** La ficha de `PRODUCTO_PORTADA` (lectura 2), o null. */
  producto: ProductoPublico | null;
  /** `urlRepositorio()`: «Código» sólo con el repositorio publicado. */
  repositorio: string | null;
  /** `nombreAutor()`: «Lo hace» sólo con nombre. */
  autor: string | null;
}) {
  const tira = tiraDeLaPortada(resumen);
  const franja = franjaDeLaPortada(resumen);
  const lecturas: Lecturas = {
    sectores: lecturaSectores(sectores),
    precio: lecturaPrecio(producto),
    // Sin hora legible (sin franja) tampoco hay de cuándo son los tramos: se oculta (principio 4).
    cierres: franja ? lecturaCierres(resumen) : null,
  };
  const hayPanel = hayLecturas(lecturas);
  // Principio 4: «sin dato fresco, el bloque se oculta». Sin hora legible no hay
  // con qué decir de cuándo es la lista, y se oculta entera, no sólo su línea de hora.
  const horaHoy = destacadas ? actualizadoEnPalabras(destacadas.actualizado_en) : null;

  return (
    <Contenedor className="pb-16">
      <div className={`grid items-start gap-10 py-8 sm:py-12 ${hayPanel ? 'lg:grid-cols-2 lg:gap-14' : ''}`}>
        <div className="min-w-0">
          <BuscadorPortada />
          {tira && <TiraCifras tira={tira} />}
          <FichaPortada />
        </div>
        <PanelLecturas {...lecturas} />
      </div>

      {franja && <FranjaPortada franja={franja} />}
      {destacadas && horaHoy && (
        <BloqueHoy datos={destacadas} actualizado={horaHoy} horaEnLaFranja={franja !== null} />
      )}

      <UsosAbiertos usos={usosAbiertos(repositorio)} />
      <CierrePortada autor={autor} />
    </Contenedor>
  );
}
