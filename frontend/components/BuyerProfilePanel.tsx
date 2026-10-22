'use client';

import Link from 'next/link';

import { motivoParaPersona } from '@/lib/motivos';
import { decimal } from '@/lib/formato';
import { METODO_COMPRADOR, rutaComoSeCalcula } from '@/lib/metodo';
import { textoTratoDirecto } from '@/lib/comprador';

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

interface Cifra {
  etiqueta: string;
  valor: string;
  detalle?: React.ReactNode;
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
  senales = 'contar',
}: BuyerProfilePanelProps & {
  titulo?: string;
  nivel?: 'h2' | 'h3';
  /** Más cifras en el mismo bloque (la ficha del comprador suma su volumen). Con ellas, la base no se repite. */
  extra?: { etiqueta: string; valor: string }[];
  /**
   * Qué hacer con las señales del historial. Sólo llega cuántas son (el panel
   * de una licitación no trae cuáles), y «tiene 2 señales» sin decir cuáles no
   * le sirve a nadie: con la ruta de su ficha, la línea enlaza ahí, donde se
   * nombran. `'ocultar'` en la propia ficha, que las lista justo debajo.
   */
  senales?: 'contar' | 'ocultar' | { enlace: string };
}) {
  const Titulo = nivel;
  const pct = (v?: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const tratoDirecto = textoTratoDirecto(comprador.transparencia?.pct_trato_directo);
  const cifras: Cifra[] = [
    {
      etiqueta: 'Nota como comprador',
      // `buyer_score` viene de 0 a 1 (etl/analytics/buyer_scoring.py: «≥ 0,8» es su
      // tramo alto); se lee de 0 a 10. Se pintaba tal cual: «0,9/10» para un 9,1.
      valor: comprador.buyer_score != null ? `${decimal(comprador.buyer_score * 10, 1)} de 10` : '—',
      // Una nota sin método no se cree: el enlace dice de qué siete cifras sale.
      detalle:
        comprador.buyer_score != null ? (
          <Link href={rutaComoSeCalcula(METODO_COMPRADOR.guia!)} className="enlace">
            Cómo se calcula
          </Link>
        ) : null,
    },
    ...(tratoDirecto ? [{ etiqueta: 'Trato directo', valor: tratoDirecto, detalle: 'de lo que compra, sin licitar' }] : []),
    { etiqueta: 'Adjudica', valor: pct(comprador.tasa_adjudicacion), detalle: 'de lo que licita' },
    // «Calculado con —» no dice nada: sin la base (el panel de una licitación no la
    // trae), la celda no sale.
    ...(extra ??
      (comprador.n_base != null
        ? [{ etiqueta: 'Calculado con', valor: `${comprador.n_base.toLocaleString('es-CL')} órdenes` }]
        : [])),
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
                {c.detalle && <dd className="text-sm text-muted">{c.detalle}</dd>}
              </div>
            ))}
          </dl>
          {senales !== 'ocultar' && comprador.n_flags != null && comprador.n_flags > 0 && (
            <p className="mt-3 text-sm text-muted">
              Su historial tiene {comprador.n_flags} {comprador.n_flags === 1 ? 'señal' : 'señales'} que conviene
              conocer antes de postular
              {typeof senales === 'object' ? (
                <>
                  :{' '}
                  <Link href={senales.enlace} className="enlace">
                    {comprador.n_flags === 1 ? 'cuál es' : 'cuáles son'}, en su ficha
                  </Link>
                  .
                </>
              ) : (
                '.'
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
