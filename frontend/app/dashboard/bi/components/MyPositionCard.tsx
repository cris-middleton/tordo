'use client';

import { Loader2, Trophy } from 'lucide-react';

import { InfoTooltip } from './InfoTooltip';
import type { MiPosicion } from '../types';

/**
 * Dónde está la empresa del usuario dentro del rubro.
 *
 * **Los tres números que enseña estaban mal, y no un poco.**
 * `competitors_by_market` tiene una fila por *(organismo, rubro, proveedor)*, y
 * el servicio tomaba la primera fila que coincidía con el RUT:
 *
 * - «compites contra N proveedores» contaba **filas**: sobre datos reales decía
 *   128.462 donde los proveedores distintos eran 77.720.
 * - «tu participación» era la cuota dentro de **un solo comprador**. Los tres
 *   primeros del ranking tenían 99,9 %, 99,9 % y 99,0 %… cada uno de un
 *   comprador distinto.
 * - el puesto ordenaba esas mismas filas, así que no significaba nada.
 *
 * Ahora los tres salen de agregar por proveedor sobre el rubro completo. La
 * tarjeta enseña además cuántos compradores atiende, porque es la palanca que
 * un proveedor chico sí puede mover.
 */

function pct(v?: number | null): string {
  if (v == null) return '—';
  // Por debajo de 0,01 % el redondeo a dos decimales da «0,00 %», que se lee
  // como «no vendes nada» en vez de «vendes poco».
  if (v > 0 && v < 0.01) return '<0,01%';
  return `${v.toFixed(2).replace('.', ',')}%`;
}

function entero(v?: number | null): string {
  return v == null ? '—' : v.toLocaleString('es-CL');
}

export function MyPositionCard({
  posicion,
  loading,
  rubro,
}: {
  posicion: MiPosicion | null;
  loading: boolean;
  rubro: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted" aria-hidden="true" />
      </div>
    );
  }

  if (!posicion?.disponible) return null;

  if (!posicion.tiene_historial) {
    return (
      <section className="rounded-xl border border-border bg-surface p-4">
        <header className="mb-3 flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Dónde estás tú</h3>
        </header>
        <p className="text-sm text-text">
          Tu empresa todavía no tiene órdenes adjudicadas en {rubro || 'este rubro'}.
        </p>
        {posicion.total_proveedores != null && (
          <p className="mt-1 text-xs text-muted">
            Hay {entero(posicion.total_proveedores)} proveedores con historial aquí. Es un mercado
            en el que puedes entrar.
          </p>
        )}
      </section>
    );
  }

  const div = posicion.diversificacion_disponible ? posicion.diversificacion : null;
  const soloUno = posicion.n_organismos_atendidos === 1;
  const bajoLaMediana =
    posicion.n_organismos_atendidos != null &&
    posicion.n_organismos_mediana_rubro != null &&
    posicion.n_organismos_atendidos < posicion.n_organismos_mediana_rubro;

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <header className="mb-3 flex items-center gap-1.5">
        <Trophy className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Dónde estás tú</h3>
        <InfoTooltip content="Tu monto adjudicado en este rubro, sumando todos tus compradores, sobre el monto total del rubro." />
      </header>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-subtle">Tu puesto</p>
          <p
            className="cifra text-2xl font-bold leading-none text-text"
            style={{ fontFamily: 'var(--font-display, system-ui)' }}
          >
            {posicion.rank ?? '—'}
            <span className="text-sm font-normal text-muted">
              {' '}
              de {entero(posicion.total_proveedores)}
            </span>
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-subtle">Tu participación</p>
          <p
            className="cifra text-2xl font-bold leading-none text-text"
            style={{ fontFamily: 'var(--font-display, system-ui)' }}
          >
            {pct(posicion.participacion_pct)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-subtle">Tus órdenes</p>
          <p
            className="cifra text-2xl font-bold leading-none text-text"
            style={{ fontFamily: 'var(--font-display, system-ui)' }}
          >
            {entero(posicion.n_oc_propias)}
          </p>
        </div>
      </div>

      {/* La lectura, no sólo la cifra. Es la diferencia entre un tablero y un
          consejo: «atiendes a 1 comprador y la mediana del rubro son 3» dice
          qué hacer mañana. */}
      {posicion.n_organismos_atendidos != null && (
        <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted">
          Le vendes a <b className="text-text">{entero(posicion.n_organismos_atendidos)}</b>{' '}
          {soloUno ? 'comprador' : 'compradores'} de este rubro
          {posicion.n_organismos_mediana_rubro != null && (
            <>
              , y un proveedor típico le vende a{' '}
              <b className="text-text">{posicion.n_organismos_mediana_rubro}</b>
            </>
          )}
          .{' '}
          {soloUno
            ? 'Depender de uno solo es el riesgo más común en Mercado Público: si ese comprador cambia de proveedor o deja de licitar, se va todo.'
            : bajoLaMediana
              ? 'Ampliar a un comprador más suele costar menos que crecer dentro de los que ya tienes.'
              : 'Estás por encima de la mediana del rubro en cantidad de compradores.'}
        </p>
      )}

      {/* Toda tu cartera, no sólo este rubro. Es la otra mitad de la pregunta:
          se puede estar bien posicionado aquí y aun así depender de un cliente
          único mirando el conjunto. */}
      {div && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-[11px] uppercase tracking-wider text-subtle">Tu cartera completa</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {entero(div.n_compradores_total)} compradores en {entero(div.n_rubros_total)}{' '}
            {div.n_rubros_total === 1 ? 'rubro' : 'rubros'}
            {div.n_regiones_total != null && (
              <>
                {' '}
                y {entero(div.n_regiones_total)}{' '}
                {div.n_regiones_total === 1 ? 'región' : 'regiones'}
              </>
            )}
            .{' '}
            {div.alerta_dependencia ? (
              <span className="text-danger">
                Tu facturación está muy concentrada en pocos clientes.
              </span>
            ) : (
              'Tu facturación está repartida entre varios clientes.'
            )}
          </p>
        </div>
      )}
    </section>
  );
}
