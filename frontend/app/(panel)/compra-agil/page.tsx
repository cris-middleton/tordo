'use client';

import { Suspense, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Loader2, Rss, Search, Zap } from 'lucide-react';

import SelectField from '@/components/SelectField';
import TarjetaDestacada from '@/components/compraAgil/TarjetaDestacada';
import { useAhora } from '@/hooks/useAhora';
import {
  CON_PUESTO,
  DESCRIPCION_DESTACADAS,
  PARAMETRO_BUSQUEDA_COMPRA_AGIL,
  TITULO_DESTACADAS,
  frescura,
  mesesDeVentana,
} from '@/lib/compraAgil';
import { REGIONES_CHILE } from '@/lib/constantesChile';
import { mensajeDeError } from '@/lib/errores';
import { useCompraAgilDestacadas } from '@/lib/queries';

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
 * bajo `/rss/compra-agil`.
 */
function CompraAgilContenido() {
  const urlInicial = useSearchParams();
  const [region, setRegion] = useState(() => urlInicial.get('region') ?? '');
  const [busqueda, setBusqueda] = useState(() => urlInicial.get(PARAMETRO_BUSQUEDA_COMPRA_AGIL) ?? '');
  const [texto, setTexto] = useState(busqueda);
  const ahora = useAhora();
  const Lista = CON_PUESTO ? 'ol' : 'ul';

  const consultaUrl = new URLSearchParams(
    Object.entries({ region, [PARAMETRO_BUSQUEDA_COMPRA_AGIL]: busqueda }).filter(([, v]) => v),
  ).toString();
  useEffect(() => {
    window.history.replaceState({}, '', consultaUrl ? `?${consultaUrl}` : window.location.pathname);
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
    setBusqueda(texto.trim());
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Zap className="h-6 w-6 text-accent" aria-hidden="true" />
            {TITULO_DESTACADAS}
          </h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">{DESCRIPCION_DESTACADAS}</p>
        </div>
        <div className="text-right">
          {actualizacion ? (
            <p className="text-sm font-semibold text-text">
              Actualizado a las <span className="cifra">{actualizacion.hora}</span>
              {actualizacion.dia && <span className="font-normal text-muted"> del {actualizacion.dia}</span>}
            </p>
          ) : (
            datos && <p className="text-sm text-muted">Sin fecha de actualización</p>
          )}
          {/* `<a>` y no `Link`: es un route handler, no una página que Next
              pueda navegar en el cliente. */}
          <a
            href={`/rss/compra-agil${consultaUrl ? `?${consultaUrl}` : ''}`}
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted hover:text-primary"
          >
            <Rss className="h-3 w-3" aria-hidden="true" /> Seguir por RSS
          </a>
          <Link href="/guardados#rss" className="ml-2 text-xs text-muted hover:text-primary">
            ¿Qué es esto?
          </Link>
        </div>
      </div>

      {actualizacion?.desactualizado && (
        <div className="alert-warning" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Esta lista se saltó al menos una actualización programada y puede estar
            desactualizada: algunas de estas compras quizá ya cerraron o cambiaron. Confirma en
            Mercado Público antes de cotizar.
          </p>
        </div>
      )}

      <form onSubmit={buscar} className="card grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1fr_16rem_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Qué vendes: «resmas», «mantención», «guantes»…"
            aria-label="Buscar en las Compras Ágiles destacadas"
            className="input-field pl-9 text-sm"
            autoComplete="off"
          />
        </div>
        <SelectField
          value={region}
          onChange={setRegion}
          options={[
            { value: '', label: 'Todas las regiones' },
            ...REGIONES_CHILE.map((r) => ({ value: r, label: r.replace(/^Región (de |del )?/, '') })),
          ]}
        />
        <button type="submit" className="btn-secondary text-sm">
          Buscar
        </button>
      </form>

      {consulta.isPending ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        </div>
      ) : consulta.isError ? (
        <div className="alert-error" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{mensajeDeError(consulta.error)}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="font-medium text-text">No hay Compras Ágiles abiertas con estos filtros</p>
          <p className="mt-1 text-sm text-muted">
            Sólo salen las que cierran en más de 2 horas. Prueba con otra región o sin búsqueda.
          </p>
        </div>
      ) : (
        <Lista className="space-y-3" aria-label="Compras Ágiles destacadas">
          {items.map((item, i) => (
            <li key={item.codigo_externo}>
              <TarjetaDestacada
                item={item}
                posicion={CON_PUESTO ? i + 1 : undefined}
                mesesVentana={meses}
                actualizadoEn={datos?.actualizado_en ?? null}
                historiaDisponible={datos?.historia_disponible ?? false}
              />
            </li>
          ))}
        </Lista>
      )}
    </div>
  );
}

/** `useSearchParams` obliga a una frontera de Suspense. */
export default function CompraAgilPage() {
  return (
    <Suspense
      fallback={
        // El título va también en el respaldo: es lo que sirve el servidor (la
        // página entera se pinta en el cliente), y sin él el HTML no tenía <h1>.
        <div className="space-y-5">
          <h1 className="page-title">{TITULO_DESTACADAS}</h1>
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          </div>
        </div>
      }
    >
      <CompraAgilContenido />
    </Suspense>
  );
}
