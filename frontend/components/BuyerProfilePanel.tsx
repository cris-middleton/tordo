'use client';

import { motivoParaPersona } from '@/lib/motivos';
import { decimal } from '@/lib/formato';

// ── Types ──────────────────────────────────────────────────────────────────

interface TransparenciaComprador {
  clasificacion?: string | null;
  pct_trato_directo?: number | null;
}

interface CompradorPanel {
  disponible: boolean;
  nombre?: string | null;
  buyer_score?: number | null;
  clasificacion?: string | null;
  tasa_adjudicacion?: number | null;
  n_flags?: number;
  n_base?: number | null;
  transparencia?: TransparenciaComprador | null;
  motivo?: string | null;
}

interface BuyerProfilePanelProps {
  comprador: CompradorPanel;
}

/**
 * Cómo compra un organismo, en cuatro cifras: su nota de 0 a 10, cuánto compra
 * por trato directo (lo que no llega a competencia abierta), cuánto adjudica de
 * lo que llama y sobre cuántas órdenes se calcula. Va en la ficha pública del
 * comprador, bajo su nombre, y en la de cada licitación.
 *
 * Sin colores de semáforo ni etiquetas que juzgan: la nota iba en verde, ámbar
 * o rojo y una «transparencia» decía «Muy abierto» u «Opaco», que se leían
 * como recomendación. Tampoco repite el nombre: el título de la página ya lo
 * dice.
 */
export function BuyerProfilePanel({
  comprador,
  titulo = 'Cómo compra',
  nivel = 'h2',
  extra,
}: BuyerProfilePanelProps & {
  titulo?: string;
  nivel?: 'h2' | 'h3';
  /** Más cifras en el mismo bloque (la ficha del comprador suma su volumen). Con ellas, la base no se repite. */
  extra?: { etiqueta: string; valor: string }[];
}) {
  const Titulo = nivel;
  const pct = (v?: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const cifras = [
    {
      etiqueta: 'Nota',
      // `buyer_score` viene de 0 a 1 (etl/analytics/buyer_scoring.py: «≥ 0,8» es su
      // tramo alto); se lee de 0 a 10. Se pintaba tal cual: «0,9/10» para un 9,1.
      valor: comprador.buyer_score != null ? `${decimal(comprador.buyer_score * 10, 1)} de 10` : '—',
    },
    { etiqueta: 'Trato directo', valor: pct(comprador.transparencia?.pct_trato_directo), detalle: 'de lo que compra' },
    { etiqueta: 'Adjudica', valor: pct(comprador.tasa_adjudicacion), detalle: 'de lo que llama' },
    ...(extra ?? [
      {
        etiqueta: 'Base',
        valor: comprador.n_base != null ? `${comprador.n_base.toLocaleString('es-CL')} órdenes` : '—',
      },
    ]),
  ];

  return (
    <section className="mt-2">
      <Titulo className={nivel === 'h2' ? 'section-title' : 'font-sans text-lg font-semibold text-text'}>
        {titulo}
      </Titulo>
      {!comprador.disponible ? (
        <p className="mt-3 text-sm text-muted">
          {motivoParaPersona(comprador.motivo, 'Todavía no tenemos historial de este comprador.')}
        </p>
      ) : (
        <>
          <dl className="mt-4 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 sm:grid-cols-4">
            {cifras.map((c) => (
              <div key={c.etiqueta}>
                <dt className="text-sm text-muted">{c.etiqueta}</dt>
                <dd className="cifra mt-1 font-semibold text-text">{c.valor}</dd>
                {'detalle' in c && c.detalle && <dd className="text-sm text-muted">{c.detalle}</dd>}
              </div>
            ))}
          </dl>
          {comprador.n_flags != null && comprador.n_flags > 0 && (
            <p className="mt-3 text-sm text-muted">
              Tiene {comprador.n_flags} {comprador.n_flags === 1 ? 'señal' : 'señales'} en su historia que conviene
              revisar antes de postular.
            </p>
          )}
        </>
      )}
    </section>
  );
}
