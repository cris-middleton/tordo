import { Contenedor } from '@/components/cascara/Contenedor';
import { CLASE_SECCION } from '@/components/cascara/Seccion';
import { lecturaCierres, lecturaNota, lecturaPrecio, notaDeLaPortada, type Lecturas } from '@/lib/lecturasPortada';
import type { Nota } from '@/lib/notas';
import { actualizadoEnPalabras, baseDeLaFicha, franjaDeLaPortada, tiraDeLaPortada } from '@/lib/portada';
import type { SectoresBI } from '@/types/bi';
import type { CompraAgilDestacadasResponse } from '@/types/compraAgil';
import type { ProductoPublico, ResumenPortada } from '@/types/publico';

import { BloqueHoy } from './BloqueHoy';
import { BuscadorPortada } from './BuscadorPortada';
import { FichaPortada } from './FichaPortada';
import { FranjaPortada } from './FranjaPortada';
import { LecturasPortada } from './LecturasPortada';
import { NotasPortada } from './NotasPortada';
import { TiraCifras } from './TiraCifras';

/**
 * La portada (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3). **Componente de
 * servidor entero, sin JavaScript propio**; la cabecera y el pie los pone la
 * cáscara única.
 *
 * Desde `lg` (§3.1, opción 2 del 2026-10-17), dos columnas `11fr / 10fr` con 48 px
 * entre ellas: a la izquierda la pregunta y el buscador, las cifras y la ficha; a
 * la derecha «Lo que dicen los datos», con dos lecturas apiladas que empiezan a la
 * altura del `h1`. Debajo, a lo ancho, la franja de hoy, «Lo mejor de hoy» y las
 * notas con la ficha del autor.
 *
 * En móvil y tableta (§3.7), una columna: buscador, cifras, lecturas y ficha. Las
 * cifras y la primera conclusión tienen que caber en la primera pantalla, así que
 * la ficha va después de las lecturas en el DOM, y desde `lg` la rejilla la sube a
 * la columna izquierda (fila 3, bajo las cifras) y pone las lecturas a la derecha
 * cubriendo las tres filas. La fila 3 es `1fr`: si las lecturas miden más que la
 * izquierda, el sobrante va bajo la ficha y no entre el buscador y las cifras. Un
 * solo ejemplar de cada cosa: nada se pinta dos veces para esconder una.
 *
 * Todo lo vivo llega de `app/page.tsx` y puede faltar: `null`, una hora ilegible
 * o un campo mal formado ocultan SU bloque y nada más. El buscador no depende de
 * nada: la portada siempre sirve para buscar.
 */
export function Portada({
  destacadas,
  resumen,
  sectores,
  producto,
  notas,
  repositorio,
  autor,
  rol,
  urlAutor,
}: {
  destacadas: CompraAgilDestacadasResponse | null;
  resumen: ResumenPortada | null;
  /** `GET /bi/sector`: la fila «Base» de la ficha, o null. */
  sectores: SectoresBI | null;
  /** La ficha de `PRODUCTO_PORTADA` (la lectura de precio), o null. */
  producto: ProductoPublico | null;
  /** Las notas de datos, de la más nueva a la más vieja (`leerNotas()`). */
  notas: Nota[];
  /** `urlRepositorio()`: «Código» y «El script» sólo con el repositorio publicado. */
  repositorio: string | null;
  /** `nombreAutor()`: «Lo hace» y la ficha del autor sólo con nombre. */
  autor: string | null;
  /** `rolAutor()`: tras el nombre, en la ficha y en la ficha del autor; sin él, el nombre solo. */
  rol: string | null;
  /** `urlAutor()`: el enlace del nombre. */
  urlAutor: string | null;
}) {
  const tira = tiraDeLaPortada(resumen);
  const franja = franjaDeLaPortada(resumen);
  const lecturas: Lecturas = {
    precio: lecturaPrecio(producto, repositorio),
    cierres: lecturaCierres(resumen, repositorio),
    nota: lecturaNota(notaDeLaPortada(notas), repositorio),
  };
  // Principio 4: «sin dato fresco, el bloque se oculta». Sin hora legible no hay
  // con qué decir de cuándo es la lista, y se oculta entera, no sólo su línea de hora.
  const horaHoy = destacadas ? actualizadoEnPalabras(destacadas.actualizado_en) : null;

  return (
    <Contenedor pagina>
      <div className="grid lg:grid-cols-[11fr_10fr] lg:grid-rows-[auto_auto_1fr] lg:gap-x-12">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <BuscadorPortada />
        </div>
        {tira && (
          <div className="mt-6 min-w-0 lg:col-start-1 lg:row-start-2 lg:mt-12">
            <TiraCifras tira={tira} />
          </div>
        )}
        <LecturasPortada lecturas={lecturas} className="mt-8 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:mt-0" />
        <FichaPortada
          base={baseDeLaFicha(sectores)}
          autor={autor}
          rol={rol}
          urlAutor={urlAutor}
          className={`mt-8 lg:col-start-1 lg:row-start-3 lg:self-start ${tira ? 'lg:mt-6' : 'lg:mt-12'}`}
        />
      </div>

      {franja && (
        <div className={CLASE_SECCION}>
          <FranjaPortada franja={franja} />
        </div>
      )}
      {destacadas && horaHoy && (
        <BloqueHoy datos={destacadas} actualizado={horaHoy} horaEnLaFranja={franja !== null} />
      )}
      <NotasPortada notas={notas} autor={autor} rol={rol} urlAutor={urlAutor} />
    </Contenedor>
  );
}
