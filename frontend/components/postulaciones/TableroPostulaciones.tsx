'use client';

import { useState } from 'react';
import { CheckCircle2, Clock, GripVertical, Send, XCircle } from 'lucide-react';

/**
 * El tablero de postulaciones.
 *
 * **Las columnas NO son configurables, y eso es una decisión.** La competencia
 * deja renombrarlas porque las suyas son texto libre; las nuestras están en un
 * `CHECK` de la base y **significan algo**: `adjudicada` es lo que cruza contra
 * el ZIP de licitaciones para cerrar el ciclo del resultado
 * (`services/resultados.py`). Columnas libres romperían eso a cambio de nada.
 *
 * Arrastrar usa la API nativa de HTML5 en vez de una librería. No es
 * minimalismo: una dependencia de arrastre son ~30 kB en el bundle y una entrada
 * más en `make audit` para una pantalla. Lo que sí hace falta y las librerías dan
 * gratis es el camino de teclado, así que cada tarjeta lleva además un selector
 * de columna — que en móvil es la única forma de moverla.
 */

export const COLUMNAS = [
  { estado: 'en_seguimiento', titulo: 'En seguimiento', icon: Clock, tono: 'text-muted' },
  { estado: 'en_preparacion', titulo: 'En preparación', icon: Clock, tono: 'text-gold' },
  { estado: 'enviada', titulo: 'Enviada', icon: Send, tono: 'text-info' },
  { estado: 'adjudicada', titulo: 'Adjudicada', icon: CheckCircle2, tono: 'text-accent' },
  { estado: 'no_adjudicada', titulo: 'No adjudicada', icon: XCircle, tono: 'text-danger' },
  { estado: 'descartada', titulo: 'Descartada', icon: XCircle, tono: 'text-subtle' },
] as const;

export interface TarjetaPostulacion {
  id: string;
  estado: string;
  licitacion?: { nombre?: string; codigo_externo?: string };
  checklist: { completado: boolean }[];
}

function Progreso({ hechos, total }: { hechos: number; total: number }) {
  if (!total) return null;
  const pct = Math.round((hechos / total) * 100);
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[11px] text-subtle">
        <span>
          {hechos}/{total} documentos
        </span>
        <span className="cifra">{pct}%</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full ${pct === 100 ? 'bg-accent' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function TableroPostulaciones({
  postulaciones,
  onMover,
}: {
  postulaciones: TarjetaPostulacion[];
  onMover: (id: string, estado: string) => void;
}) {
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [encima, setEncima] = useState<string | null>(null);

  const soltar = (estado: string) => {
    if (arrastrando) {
      const actual = postulaciones.find((p) => p.id === arrastrando);
      // Soltar en la misma columna no es un cambio: sin esta guarda se manda
      // una petición por cada arrastre fallido.
      if (actual && actual.estado !== estado) onMover(arrastrando, estado);
    }
    setArrastrando(null);
    setEncima(null);
  };

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
      {COLUMNAS.map((col) => {
        const dentro = postulaciones.filter((p) => p.estado === col.estado);
        const Icon = col.icon;
        return (
          <section
            key={col.estado}
            onDragOver={(e) => {
              e.preventDefault();
              setEncima(col.estado);
            }}
            onDragLeave={() => setEncima((c) => (c === col.estado ? null : c))}
            onDrop={() => soltar(col.estado)}
            aria-label={col.titulo}
            className={`flex w-[16rem] shrink-0 flex-col rounded-xl border p-2.5 transition-colors ${
              encima === col.estado
                ? 'border-accent bg-accent/[0.06]'
                : 'border-border bg-background'
            }`}
          >
            <header className="mb-2 flex items-center gap-1.5 px-1">
              <Icon className={`h-3.5 w-3.5 ${col.tono}`} aria-hidden="true" />
              <h3 className="text-xs font-bold text-text">{col.titulo}</h3>
              <span className="cifra ml-auto text-xs text-subtle">{dentro.length}</span>
            </header>

            <div className="flex flex-col gap-2">
              {dentro.map((p) => {
                const total = p.checklist?.length ?? 0;
                const hechos = p.checklist?.filter((i) => i.completado).length ?? 0;
                return (
                  <article
                    key={p.id}
                    draggable
                    onDragStart={() => setArrastrando(p.id)}
                    onDragEnd={() => setArrastrando(null)}
                    className={`cursor-grab rounded-lg border border-border bg-surface p-3 shadow-sm transition-opacity active:cursor-grabbing ${
                      arrastrando === p.id ? 'opacity-40' : ''
                    }`}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle"
                        aria-hidden="true"
                      />
                      <p className="text-xs font-semibold leading-snug text-text">
                        {p.licitacion?.nombre ?? p.licitacion?.codigo_externo ?? 'Sin nombre'}
                      </p>
                    </div>
                    {p.licitacion?.codigo_externo && (
                      <p className="mt-1 pl-5 text-[11px] text-subtle">
                        {p.licitacion.codigo_externo}
                      </p>
                    )}
                    <div className="pl-5">
                      <Progreso hechos={hechos} total={total} />
                    </div>

                    {/* El camino sin ratón. En móvil es el único que hay: no se
                        puede arrastrar con el dedo sin una librería de gestos. */}
                    <label className="mt-2 block pl-5">
                      <span className="sr-only">Mover esta postulación a otra etapa</span>
                      <select
                        value={p.estado}
                        onChange={(e) => onMover(p.id, e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-muted focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {COLUMNAS.map((c) => (
                          <option key={c.estado} value={c.estado}>
                            {c.titulo}
                          </option>
                        ))}
                      </select>
                    </label>
                  </article>
                );
              })}

              {dentro.length === 0 && (
                <p className="px-1 py-4 text-center text-[11px] text-subtle">
                  Nada por aquí todavía
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
