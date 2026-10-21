'use client';

import { Suspense, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Loader2, Rss, Search } from 'lucide-react';

import SelectField from '@/components/SelectField';
import { ErrorDeCarga } from '@/components/ErrorDeCarga';
import { FilaCompraAgil } from '@/components/compraAgil/FilaCompraAgil';
import { useAhora } from '@/hooks/useAhora';
import { useClaveDeUrlExterna } from '@/hooks/useClaveDeUrlExterna';
import { MAXIMO_CARACTERES_BUSCAR, prepararBusqueda } from '@/lib/buscar';
import {
  CON_PUESTO,
  descripcionDestacadas,
  PARAMETRO_BUSQUEDA_COMPRA_AGIL,
  TITULO_DESTACADAS,
  frescura,
  mesesDeVentana,
} from '@/lib/compraAgil';
import { REGIONES_CHILE } from '@/lib/constantesChile';
import { shortRegion } from '@/lib/nombresChile';
import { useCompraAgilDestacadas } from '@/lib/queries';
import { escribirUrlPropia } from '@/lib/urlPropia';

/**
 * «Lo mejor de hoy en Compra Ágil».
 *
 * Las Compras Ágiles abiertas que cierran en más de 2 h, ordenadas por un
 * puntaje que calcula el backend (`GET /compra-agil/destacadas`): ver
 * `DESCRIPCION_DESTACADAS` en `lib/compraAgil.ts`. **Es una heurística, no un
 * modelo**, y la página lo dice.
 *
 * **La hora de la última actualización va a la vista**, y si falta una
 * corrida del horario del cron (`seSaltoUnaCorrida`) se avisa: una corrida
 * fallida no puede dejar la página ofreciendo como «lo mejor de hoy» lo de
 * anteayer.
 *
 * Región y búsqueda viven en la URL, con el patrón de la analítica: el enlace
 * se comparte con sus filtros, y el RSS de la misma búsqueda es la misma URL
 * bajo `/rss/compra-agil`. Una URL que llega de fuera vuelve a montar la
 * pantalla (`useClaveDeUrlExterna`); la búsqueda se recorta a las cotas de la
 * API (`prepararBusqueda`): con más de ocho palabras responde 422.
 */
function CompraAgilContenido() {
  const urlInicial = useSearchParams();
  const [region, setRegion] = useState(() => urlInicial.get('region') ?? '');
  const [busqueda, setBusqueda] = useState(
    () => prepararBusqueda(urlInicial.get(PARAMETRO_BUSQUEDA_COMPRA_AGIL)).termino,
  );
  const [texto, setTexto] = useState(busqueda);
  const ahora = useAhora();
  const Lista = CON_PUESTO ? 'ol' : 'ul';

  const consultaUrl = new URLSearchParams(
    Object.entries({ region, [PARAMETRO_BUSQUEDA_COMPRA_AGIL]: busqueda }).filter(([, v]) => v),
  ).toString();
  useEffect(() => {
    escribirUrlPropia('compra-agil', consultaUrl);
  }, [consultaUrl]);

  const consulta = useCompraAgilDestacadas({
    limite: 20,
    region: region || undefined,
    search: busqueda || undefined,
  });
  const datos = consulta.data;
  const items = datos?.items ?? [];
  const actualizacion = frescura(datos?.actualizado_en ?? null, ahora);
  const meses = mesesDeVentana(datos?.ventana_desde ?? null, datos?.ventana_hasta ?? null);

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    const { termino } = prepararBusqueda(texto);
    setBusqueda(termino);
    setTexto(termino);
  };

  return (
    <div>
      <h1 className="page-title">{TITULO_DESTACADAS}</h1>
      <p className="mt-2 max-w-[65ch] text-muted">{descripcionDestacadas(datos?.historia_disponible === true)}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        {actualizacion ? (
          <span>
            Lista actualizada a las <span className="cifra font-semibold text-text">{actualizacion.hora}</span>
            {actualizacion.dia && <> del {actualizacion.dia}</>}
          </span>
        ) : (
          datos && <span>Sin fecha de actualización</span>
        )}
        {/* `<a>` y no `Link`: es un route handler, no una página que Next
            pueda navegar en el cliente. */}
        <a
          href={`/rss/compra-agil${consultaUrl ? `?${consultaUrl}` : ''}`}
          className="inline-flex items-center gap-1 py-1 hover:text-primary"
        >
          <Rss className="h-3.5 w-3.5" aria-hidden="true" /> Seguir por RSS
        </a>
        <Link href="/guardados#rss" className="py-1 hover:text-primary">
          Qué es un RSS
        </Link>
      </p>

      {actualizacion?.desactualizado && (
        <div className="alert-warning mt-4" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Esta lista se saltó al menos una actualización programada. Algunas de estas compras
            pueden haber cerrado o cambiado: revisa cada una en Mercado Público antes de preparar
            tu oferta.
          </p>
        </div>
      )}

      <form onSubmit={buscar} role="search" className="mt-6 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[1fr_16rem_auto]">
        <div className="relative col-span-2 sm:col-span-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Qué vendes: resmas, mantención…"
            aria-label="Buscar en esta lista"
            enterKeyHint="search"
            maxLength={MAXIMO_CARACTERES_BUSCAR}
            className="input-field h-12 pl-11"
            autoComplete="off"
          />
        </div>
        <SelectField
          value={region}
          onChange={setRegion}
          options={[
            { value: '', label: 'Todas las regiones' },
            ...REGIONES_CHILE.map((r) => ({ value: r, label: shortRegion(r) })),
          ]}
        />
        <button type="submit" className="btn-secondary h-12">
          Buscar
        </button>
      </form>

      {consulta.isPending ? (
        <ul aria-hidden="true" className="mt-6 divide-y divide-border border-y border-border">
          {[...Array(8)].map((_, i) => (
            <li key={i} className="flex animate-pulse gap-3 py-3">
              <div className="h-4 w-6 rounded bg-border" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-4/5 rounded bg-border" />
                <div className="h-3 w-2/5 rounded bg-border" />
              </div>
              <div className="h-4 w-20 rounded bg-border" />
            </li>
          ))}
        </ul>
      ) : consulta.isError ? (
        <div className="mt-6">
          <ErrorDeCarga
            titulo="No pudimos cargar las Compras Ágiles"
            error={consulta.error}
            onReintentar={() => void consulta.refetch()}
            reintentando={consulta.isFetching}
          />
        </div>
      ) : items.length === 0 ? (
        <div className="py-12">
          <p className="font-semibold text-text">No hay Compras Ágiles abiertas con estos filtros</p>
          <p className="mt-1 text-muted">
            La lista sólo trae las que cierran en más de 2 horas. Prueba con otra región o borra la
            búsqueda.
          </p>
        </div>
      ) : (
        <Lista className="mt-6 divide-y divide-border border-y border-border" aria-label="Compras Ágiles destacadas">
          {items.map((item, i) => (
            <li key={item.codigo_externo}>
              <FilaCompraAgil
                item={item}
                posicion={CON_PUESTO ? i + 1 : undefined}
                actualizadoEn={datos?.actualizado_en ?? null}
                historia={{ meses, disponible: datos?.historia_disponible ?? false }}
              />
            </li>
          ))}
        </Lista>
      )}
    </div>
  );
}

/** Vuelve a montar la lista cuando la URL llega de fuera: ver `lib/urlPropia.ts`. */
function CompraAgilDeLaUrl() {
  const clave = useClaveDeUrlExterna('compra-agil');
  return <CompraAgilContenido key={clave} />;
}

/** `useSearchParams` obliga a una frontera de Suspense. */
export default function CompraAgilPage() {
  return (
    <Suspense
      fallback={
        // El título va también en el respaldo: es lo que sirve el servidor (la
        // página entera se pinta en el cliente), y sin él el HTML no tenía <h1>.
        <div>
          <h1 className="page-title">{TITULO_DESTACADAS}</h1>
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          </div>
        </div>
      }
    >
      <CompraAgilDeLaUrl />
    </Suspense>
  );
}
