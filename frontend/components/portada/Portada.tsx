import { Contenedor } from '@/components/cascara/Contenedor';
import { CLASE_SECCION } from '@/components/cascara/Seccion';
import { lecturaConcentracion, lecturaGasto } from '@/lib/lecturasMercado';
import { lecturaCierres, lecturaNota, lecturaPrecio, notaDeLaPortada, type Lecturas } from '@/lib/lecturasPortada';
import type { Nota } from '@/lib/notas';
import {
  actualizadoEnPalabras,
  baseDeLaFicha,
  franjaDeLaPortada,
  tiraDeLaPortada,
  VIGENTE,
  vigenciaDelResumen,
} from '@/lib/portada';
import type { SectoresBI } from '@/types/bi';
import type { CompraAgilDestacadasResponse } from '@/types/compraAgil';
import type { MercadoPortada, ProductoPublico, ResumenPortada } from '@/types/publico';

import { AbiertasAhora } from './AbiertasAhora';
import { BloqueHoy } from './BloqueHoy';
import { BuscadorPortada } from './BuscadorPortada';
import { FichaPortada } from './FichaPortada';
import { FranjaPortada } from './FranjaPortada';
import { GastoPortada } from './GastoPortada';
import { LecturasPortada } from './LecturasPortada';
import { NotasPortada } from './NotasPortada';

/**
 * La portada. **Componente de servidor**; las únicas islas cliente son los
 * gráficos con globo (`components/graficos/`). La cabecera y el pie los pone la
 * cáscara única.
 *
 * Desde `lg`, dos columnas `5fr / 7fr` con 48 px entre ellas: a la izquierda el
 * titular, el buscador, las abiertas de ahora y la ficha; a la derecha **el
 * gráfico grande**, cuánto compra el Estado mes a mes y por sector, a la altura
 * del `h1`. Debajo, a lo ancho: «Para empezar» (precio, concentración y cierres,
 * tres en fila), la franja de hoy, «Lo mejor de hoy» y las notas con la ficha del
 * autor.
 *
 * En móvil, una columna: buscador, abiertas, el gráfico grande y la ficha. La
 * ficha va después del gráfico en el DOM y desde `lg` la rejilla la sube a la
 * columna izquierda (fila 2). Sin el gráfico grande, la ficha baja después de
 * «Para empezar». Un solo ejemplar de cada cosa.
 *
 * Todo lo vivo llega de `app/page.tsx` y puede faltar: `null`, una hora ilegible
 * o un campo mal formado ocultan SU bloque y nada más. Sin el gráfico grande, la
 * columna izquierda ocupa el ancho. El buscador no depende de nada.
 */
export function Portada({
  destacadas,
  resumen,
  sectores,
  mercado,
  producto,
  notas,
  repositorio,
  autor,
  rol,
  urlAutor,
  ahora,
}: {
  destacadas: CompraAgilDestacadasResponse | null;
  resumen: ResumenPortada | null;
  /** `GET /bi/sector`: la fila «Base» de la ficha, o null. */
  sectores: SectoresBI | null;
  /** `GET /publico/mercado`: el gasto mensual por sector y la concentración, o null. */
  mercado: MercadoPortada | null;
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
  /**
   * La hora del render (`Date.now()` en `app/page.tsx`): decide si lo vivo sigue
   * siendo de ahora (`vigenciaDelResumen`), qué mes va a medias y qué Compra Ágil
   * ya cerró. Sin ella todo se da por vigente.
   */
  ahora?: number;
}) {
  const vigencia = resumen && ahora !== undefined ? vigenciaDelResumen(resumen.actualizado_en, ahora) : VIGENTE;
  const tira = tiraDeLaPortada(resumen, vigencia);
  const franja = franjaDeLaPortada(resumen, vigencia);
  const gasto = lecturaGasto(mercado, repositorio, ahora);
  const lecturas: Lecturas = {
    precio: lecturaPrecio(producto, repositorio),
    concentracion: lecturaConcentracion(mercado, repositorio),
    // «Cierran hoy o mañana» es relativo al día del conteo: con uno atrasado o de ayer, mentiría.
    cierres: vigencia.alDia && vigencia.mismoDia ? lecturaCierres(resumen, repositorio) : null,
    nota: lecturaNota(notaDeLaPortada(notas), repositorio),
  };
  // Principio 4: «sin dato fresco, el bloque se oculta». Sin hora legible no hay
  // con qué decir de cuándo es la lista, y se oculta entera, no sólo su línea de hora.
  const ficha = (className: string) => (
    <FichaPortada base={baseDeLaFicha(sectores)} autor={autor} rol={rol} urlAutor={urlAutor} className={className} />
  );
  const horaHoy = destacadas ? actualizadoEnPalabras(destacadas.actualizado_en) : null;
  // Una Compra Ágil que ya cerró no se ofrece: con el cron atrasado, la lista guardada las trae.
  const hoy =
    destacadas && ahora !== undefined
      ? { ...destacadas, items: destacadas.items.filter((i) => !i.fecha_cierre || Date.parse(i.fecha_cierre) > ahora) }
      : destacadas;

  return (
    <Contenedor pagina>
      <div className={gasto ? 'grid lg:grid-cols-[5fr_7fr] lg:grid-rows-[auto_1fr] lg:gap-x-12' : 'max-w-2xl'}>
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <BuscadorPortada />
          {tira && <AbiertasAhora tira={tira} className="mt-8" />}
        </div>
        {gasto && (
          <>
            <GastoPortada lectura={gasto} className="mt-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-1" />
            {ficha('mt-10 lg:col-start-1 lg:row-start-2 lg:self-end')}
          </>
        )}
      </div>

      <LecturasPortada lecturas={lecturas} className={CLASE_SECCION} />
      {/* Sin el gráfico grande, la ficha va después de las lecturas: así la primera conclusión cabe en la primera pantalla del teléfono. */}
      {!gasto && ficha(`${CLASE_SECCION} max-w-2xl`)}

      {franja && (
        <div className={CLASE_SECCION}>
          <FranjaPortada franja={franja} />
        </div>
      )}
      {hoy && horaHoy && (
        <BloqueHoy datos={hoy} actualizado={horaHoy} horaEnLaFranja={franja !== null} />
      )}
      <NotasPortada notas={notas} autor={autor} rol={rol} urlAutor={urlAutor} />
    </Contenedor>
  );
}
