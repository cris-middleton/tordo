'use client';

import { useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';

import { mensajeDeError } from '@/lib/errores';
import { apiClient } from '@/lib/api';
import { useGuardarPerfilSemantico, usePerfilSemantico } from '@/lib/queries';
import { motivoParaPersona } from '@/lib/motivos';

/**
 * El perfil de búsqueda de la empresa.
 *
 * **Es la pieza de la que colgaba todo y no tenía pantalla.** El backend
 * guardaba el perfil TF-IDF desde hacía meses, el cliente de API tenía los
 * métodos, y ninguna vista los llamaba: sin perfil no hay vector, sin vector no
 * hay encaje, y sin encaje el motor de alertas recorre cero empresas. El
 * producto de descubrimiento entero dependía de un formulario que no existía.
 *
 * Dos decisiones de diseño que no son estéticas:
 *
 * - **Se pide una descripción, no una lista de rubros.** «Describe a qué se
 *   dedica tu empresa» tiene fricción cero; «elige tus RubroN2» exige entender
 *   la taxonomía de ChileCompra antes de recibir el primer resultado. Los
 *   rubros se *sugieren* a partir del texto para que el usuario corrija en vez
 *   de elegir a ciegas entre 354.
 * - **Se avisa cuando el perfil quedó sin vector.** Si el modelo no está
 *   cargado, el backend guarda la descripción con un vector vacío — y una
 *   empresa con perfil guardado y vector vacío no recibe ninguna alerta. Sin
 *   este aviso, el fallo es completamente silencioso.
 */

interface RubroSugerido {
  nombre: string;
  similitud: number;
}

export default function PanelPerfilSemantico({
  empresaId,
  puedeGestionar,
}: {
  empresaId: string;
  puedeGestionar: boolean;
}) {
  const consulta = usePerfilSemantico(empresaId);
  const guardar = useGuardarPerfilSemantico(empresaId);

  const perfil = consulta.data as
    | { descripcion?: string | null; rubros_usados?: string[] | null; tiene_vector?: boolean }
    | undefined;

  // El formulario se inicializa una vez desde el servidor y a partir de ahí es
  // del usuario. Sincronizarlo con un efecto pisaría lo que está escribiendo
  // cada vez que la consulta se refresca.
  const [descripcion, setDescripcion] = useState<string | null>(null);
  const [rubros, setRubros] = useState<string[] | null>(null);
  const [sugerencias, setSugerencias] = useState<RubroSugerido[]>([]);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  const textoActual = descripcion ?? perfil?.descripcion ?? '';
  const rubrosActuales = rubros ?? perfil?.rubros_usados ?? [];

  const pedirSugerencias = async () => {
    if (textoActual.trim().length < 10) {
      setError('Escribe un poco más para poder sugerirte rubros.');
      return;
    }
    setSugiriendo(true);
    setError(null);
    try {
      const r = await apiClient.sugerirRubros(textoActual);
      setSugerencias(r.disponible ? (r.sugerencias ?? []) : []);
      if (r.disponible && !(r.sugerencias ?? []).length) {
        setError(motivoParaPersona(r.motivo, 'No encontramos rubros parecidos.'));
      }
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setSugiriendo(false);
    }
  };

  const alternar = (nombre: string) => {
    const base = rubrosActuales;
    setRubros(base.includes(nombre) ? base.filter((r) => r !== nombre) : [...base, nombre]);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardado(false);
    try {
      await guardar.mutateAsync({
        descripcion: textoActual.trim(),
        rubros_usados: rubrosActuales,
      });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 3000);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  };

  if (consulta.isPending) {
    return <div className="animate-pulse h-40 bg-background rounded-2xl mb-5" />;
  }

  const sinVector = perfil && perfil.descripcion && perfil.tiene_vector === false;

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-5 mb-5">
      <div className="flex items-start gap-2.5 mb-1">
        <Sparkles size={17} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="font-semibold text-text">Perfil de búsqueda</h2>
          <p className="text-sm text-muted mt-0.5">
            Con esto decidimos qué licitaciones te avisamos. Escríbelo como se lo explicarías
            a un cliente.
          </p>
        </div>
      </div>

      {sinVector && (
        <div className="alert-warning mt-3 text-sm">
          Guardamos tu descripción pero todavía no pudimos procesarla, así que aún no te
          llegan avisos por encaje. Se reintenta solo; si sigue igual mañana, escríbenos.
        </div>
      )}

      <form onSubmit={enviar} className="mt-4 space-y-3">
        <label htmlFor="descripcion-empresa" className="sr-only">
          A qué se dedica tu empresa
        </label>
        <textarea
          id="descripcion-empresa"
          value={textoActual}
          onChange={(e) => setDescripcion(e.target.value)}
          disabled={!puedeGestionar}
          rows={4}
          maxLength={2000}
          className="input-field text-sm w-full resize-y min-h-[92px]"
          placeholder="Ej: Vendemos e instalamos equipos de refrigeración industrial para hospitales y casinos. También hacemos mantención preventiva y correctiva."
        />

        {puedeGestionar && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={pedirSugerencias}
              disabled={sugiriendo}
              className="btn-secondary gap-1.5 text-xs"
            >
              {sugiriendo ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Buscando…
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  Sugerir rubros
                </>
              )}
            </button>
            <span className="text-xs text-subtle">{textoActual.length}/2000</span>
          </div>
        )}

        {sugerencias.length > 0 && (
          <div>
            <p className="text-xs text-muted mb-1.5">
              Según lo que escribiste. Marca los que te calcen — puedes cambiarlos cuando quieras.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sugerencias.map((s) => {
                const activo = rubrosActuales.includes(s.nombre);
                return (
                  <button
                    key={s.nombre}
                    type="button"
                    onClick={() => alternar(s.nombre)}
                    aria-pressed={activo}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                      activo
                        ? 'bg-accent text-onAccent border-accent'
                        : 'bg-surface text-muted border-border hover:border-accent/40'
                    }`}
                  >
                    {activo && <Check size={11} aria-hidden="true" />}
                    {s.nombre}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {rubrosActuales.length > 0 && (
          <div>
            <p className="text-xs text-muted mb-1.5">Tus rubros</p>
            <div className="flex flex-wrap gap-1.5">
              {rubrosActuales.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/[0.07] px-2.5 py-1 text-xs text-text"
                >
                  {r}
                  {puedeGestionar && (
                    <button
                      type="button"
                      onClick={() => alternar(r)}
                      aria-label={`Quitar ${r}`}
                      className="text-subtle hover:text-text"
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {error && <div className="alert-error text-sm">{error}</div>}

        {puedeGestionar && (
          <div className="flex items-center justify-end gap-3 pt-1">
            {guardado && (
              <span className="text-xs text-accent flex items-center gap-1">
                <Check size={13} />
                Guardado
              </span>
            )}
            <button
              type="submit"
              disabled={guardar.isPending || !textoActual.trim()}
              className="btn-primary gap-1.5 text-sm"
            >
              {guardar.isPending && <Loader2 size={14} className="animate-spin" />}
              Guardar perfil
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
