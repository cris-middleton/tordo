import type { Metadata } from 'next';
import { headers } from 'next/headers';

import {
  BloqueAbiertas,
  BloqueCompradores,
  BloquePrecios,
  EjemplosBusqueda,
  SinResultados,
} from '@/components/buscar/Bloques';
import { FormularioBuscar } from '@/components/buscar/FormularioBuscar';
import {
  MAXIMO_CARACTERES_BUSCAR,
  MAXIMO_TERMINOS_BUSCAR,
  PARAMETRO_BUSCAR,
  estadoDeLaBusqueda,
  prepararBusqueda,
  type Busqueda,
} from '@/lib/buscar';
import { buscarTodo } from '@/lib/buscarServidor';
import { MESES_PRECIOS } from '@/lib/periodo';
import { IMAGEN_OPEN_GRAPH, IMAGEN_TWITTER } from '@/lib/vistaPrevia';
import type { ResultadosBusqueda } from '@/types/buscar';

/**
 * `/buscar?q=` — una búsqueda, tres respuestas (spec del rediseño §6.4): cuánto
 * ha pagado el Estado, qué está abierto ahora y quién lo compra.
 *
 * **Componente de servidor y dinámico** (lee `searchParams` y `headers()`):
 * pide al backend **como el visitante** (`lib/buscarServidor.ts`), así que cada
 * búsqueda cuenta en el límite por IP de quien busca. Con menos de tres letras
 * no llama a nada.
 *
 * **`noindex` por metadatos, y no en `robots.txt`**: un buscador que no rastrea
 * la página no ve su `noindex`. Tampoco va al sitemap.
 *
 * Un bloque que falla se oculta con una línea; la página nunca lanza por la API.
 */

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function leerBusqueda(searchParams: Props['searchParams']): Promise<Busqueda> {
  return prepararBusqueda((await searchParams)[PARAMETRO_BUSCAR]);
}

/** Por encima de los 12 s del peor caso (`TIEMPO_MAXIMO_BLOQUE_MS`, dos etapas). */
export const maxDuration = 20;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { termino, buscable } = await leerBusqueda(searchParams);
  const descripcion =
    'A qué precio compró el Estado lo que vendes, quién lo compra y qué licitaciones y Compras Ágiles están abiertas hoy. Con datos de ChileCompra.';
  return {
    // El término sólo va en `<title>`. Las tarjetas de vista previa (Open Graph y
    // Twitter) ignoran `noindex`: si llevaran el término, quien comparta una URL
    // fabricada controlaría el texto que se ve en la vista previa.
    title: buscable ? `Buscar «${termino}»` : 'Buscar',
    description: descripcion,
    robots: { index: false, follow: true },
    openGraph: { title: 'Buscar', description: descripcion, images: [IMAGEN_OPEN_GRAPH] },
    twitter: { card: 'summary_large_image', title: 'Buscar', description: descripcion, images: [IMAGEN_TWITTER] },
  };
}

function Resultados({ busqueda, resultados }: { busqueda: Busqueda; resultados: ResultadosBusqueda }) {
  if (estadoDeLaBusqueda(resultados) === 'sin-resultados') {
    return <SinResultados termino={busqueda.termino} />;
  }
  return (
    <>
      <BloquePrecios termino={busqueda.termino} productos={resultados.productos} ficha={resultados.ficha} />
      <BloqueAbiertas
        termino={busqueda.termino}
        terminos={busqueda.terminos}
        licitaciones={resultados.licitaciones}
        comprasAgiles={resultados.comprasAgiles}
      />
      {resultados.ficha && <BloqueCompradores ficha={resultados.ficha} />}
    </>
  );
}

export default async function PaginaBuscar({ searchParams }: Props) {
  const busqueda = await leerBusqueda(searchParams);
  const resultados = busqueda.buscable ? await buscarTodo(busqueda, await headers()) : null;

  return (
    <div>
      <div className="mb-2">
        <h1 className="page-title">
          {busqueda.buscable ? `Resultados para «${busqueda.termino}»` : 'Cuánto paga el Estado por lo que vendes'}
        </h1>
        <div className="mt-4">
          <FormularioBuscar termino={busqueda.termino} />
        </div>
        {busqueda.recortada && busqueda.buscable && (
          <p className="mt-2 text-xs text-subtle">
            Buscamos sólo las primeras {MAXIMO_TERMINOS_BUSCAR} palabras ({MAXIMO_CARACTERES_BUSCAR}{' '}
            caracteres como mucho).
          </p>
        )}
      </div>

      {resultados ? (
        <Resultados busqueda={busqueda} resultados={resultados} />
      ) : (
        <div className="mt-6 text-sm text-muted">
          <p>
            {busqueda.termino
              ? 'Escribe al menos tres letras.'
              : `Escribe un producto o un servicio. Te mostramos a qué precio lo compró el Estado en los últimos ${MESES_PRECIOS} meses, quién lo compra y dónde postular hoy.`}
          </p>
          <EjemplosBusqueda />
        </div>
      )}
    </div>
  );
}
