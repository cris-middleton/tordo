import { Contenedor } from '@/components/cascara/Contenedor';
import { CLASE_SECCION } from '@/components/cascara/Seccion';
import { lecturaConcentracion, lecturaGasto } from '@/lib/lecturasMercado';
import { lecturaRed } from '@/lib/redPortada';
import { lecturaCierres, lecturaNota, lecturaPrecio, notaDeLaPortada, type Lecturas } from '@/lib/lecturasPortada';
import type { Nota } from '@/lib/notas';
import {
  actualizadoEnPalabras,
  baseDeLaFicha,
  DESTACADAS_EN_PORTADA,
  POR_COMPRADOR_EN_PORTADA,
  variadas,
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
import { RedPortada } from './RedPortada';

/**
 * La portada. **Componente de servidor**; las únicas islas cliente son los
 * gráficos con globo (`components/graficos/`). La cabecera y el pie los pone la
 * cáscara única.
 *
 * Desde `lg`, dos columnas `5fr / 7fr` con 48 px entre ellas: a la izquierda el
 * titular, el buscador y las abiertas de ahora; a la derecha **el gráfico
 * grande**: la red de los organismos que más compran y sus proveedores, o sin
 * ella el gasto mensual. Debajo, a lo ancho: la ficha (cuatro celdas), el gasto
 * mensual si la red ocupó arriba, «Para empezar» (precio, concentración y
 * cierres, tres en fila), la franja de hoy, «Lo mejor de hoy» y las notas con la
 * ficha del autor.
 *
 * En móvil, una columna en el mismo orden. Un solo ejemplar de cada cosa.
 *
 * Todo lo vivo llega de `app/page.tsx` y puede faltar: `null`, una hora ilegible
 * o un campo mal formado ocultan SU bloque y nada más. Sin gráfico grande, la
 * columna izquierda ocupa el ancho de lectura. El buscador no depende de nada.
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
  const red = lecturaRed(mercado, repositorio);
  const lecturas: Lecturas = {
    precio: lecturaPrecio(producto, repositorio),
    concentracion: lecturaConcentracion(mercado, repositorio),
    // «Cierran hoy o mañana» es relativo al día del conteo: con uno atrasado o de ayer, mentiría.
    cierres: vigencia.alDia && vigencia.mismoDia ? lecturaCierres(resumen, repositorio) : null,
    nota: lecturaNota(notaDeLaPortada(notas), repositorio),
  };
  const ficha = <FichaPortada base={baseDeLaFicha(sectores)} autor={autor} rol={rol} urlAutor={urlAutor} className="mt-10 lg:mt-12" />;
  // Principio 4: «sin dato fresco, el bloque se oculta». Sin hora legible no hay
  // con qué decir de cuándo es la lista, y se oculta entera, no sólo su línea de hora.
  const horaHoy = destacadas ? actualizadoEnPalabras(destacadas.actualizado_en) : null;
  // Una Compra Ágil que ya cerró no se ofrece: con el cron atrasado, la lista guardada las trae.
  const hoy =
    destacadas && ahora !== undefined
      ? { ...destacadas, items: destacadas.items.filter((i) => !i.fecha_cierre || Date.parse(i.fecha_cierre) > ahora) }
      : destacadas;
  // El gráfico grande es la red; sin ella (un backend anterior, o sin la tabla), el gasto.
  const grande = red ? (
    <RedPortada lectura={red} className="mt-10 lg:mt-1" />
  ) : gasto ? (
    <GastoPortada lectura={gasto} className="mt-10 lg:mt-1" />
  ) : null;
  // Cinco, con como mucho dos de un mismo comprador (se piden más para poder elegir).
  const hoyVariadas = hoy ? { ...hoy, items: variadas(hoy.items, DESTACADAS_EN_PORTADA, POR_COMPRADOR_EN_PORTADA) } : null;

  return (
    <Contenedor pagina>
      <div className={grande ? 'grid lg:grid-cols-[5fr_7fr] lg:gap-x-12' : 'max-w-2xl'}>
        <div className="min-w-0">
          <BuscadorPortada />
          {tira && <AbiertasAhora tira={tira} className="mt-8" />}
        </div>
        {grande}
      </div>
      {ficha}

      {red && gasto && <GastoPortada lectura={gasto} ancho className={CLASE_SECCION} />}

      <LecturasPortada lecturas={lecturas} className={CLASE_SECCION} />

      {franja && (
        <div className={CLASE_SECCION}>
          <FranjaPortada franja={franja} />
        </div>
      )}
      {hoyVariadas && horaHoy && (
        <BloqueHoy datos={hoyVariadas} actualizado={horaHoy} horaEnLaFranja={franja !== null} />
      )}
      <NotasPortada notas={notas} autor={autor} rol={rol} urlAutor={urlAutor} />
    </Contenedor>
  );
}
