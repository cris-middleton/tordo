'use client';

import { useState } from 'react';
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react';

import { mensajeDeError } from '@/lib/errores';
import { useApiKeys, useCrearApiKey, useRevocarApiKey } from '@/lib/queries';
import type { ApiKeyCreada, ApiKeyResumen } from '@/types/cuenta';

/**
 * Claves de API de la empresa.
 *
 * La clave **pertenece a la empresa y la fija**: quien la use no puede nombrar
 * otra, aunque pertenezca a las dos. Por eso el panel vive en la pantalla de la
 * empresa y no en el perfil del usuario.
 *
 * El secreto sólo viaja al crearla — la base guarda el hash. Todo el diseño de
 * abajo sale de ahí: se muestra en su propio bloque, con copia a un clic, y no
 * desaparece hasta que se cierra a mano.
 */

function fecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function BotonCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
      className="btn-secondary gap-1.5 text-xs shrink-0"
    >
      {copiado ? <Check size={13} /> : <Copy size={13} />}
      {copiado ? 'Copiada' : 'Copiar'}
    </button>
  );
}

function ClaveReciénCreada({ clave, onCerrar }: { clave: ApiKeyCreada; onCerrar: () => void }) {
  return (
    <div className="rounded-xl border border-gold/30 bg-goldLight/40 p-4 mb-4">
      <p className="text-sm font-semibold text-text">Copia la clave ahora</p>
      <p className="text-xs text-muted mt-0.5 mb-3">
        No se vuelve a mostrar: guardamos sólo un hash. Si se pierde, se revoca y se emite otra.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded-lg bg-surface border border-border px-3 py-2 text-xs text-text">
          {clave.clave}
        </code>
        <BotonCopiar texto={clave.clave} />
      </div>
      <button
        type="button"
        onClick={onCerrar}
        className="text-xs text-muted hover:text-text mt-3 transition-colors"
      >
        Ya la guardé
      </button>
    </div>
  );
}

function Fila({
  clave,
  puedeGestionar,
  onRevocar,
  revocando,
}: {
  clave: ApiKeyResumen;
  puedeGestionar: boolean;
  onRevocar: (id: string) => void;
  revocando: boolean;
}) {
  const revocada = clave.revocada_en !== null;

  return (
    <div className={`flex items-center justify-between py-3 ${revocada ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text leading-tight truncate">
          {clave.nombre}
          {revocada && <span className="ml-1.5 text-xs font-normal text-danger">revocada</span>}
        </p>
        <p className="text-xs text-muted">
          <code>{clave.prefijo}…</code> · creada {fecha(clave.created_at)} · último uso{' '}
          {fecha(clave.ultimo_uso_en)}
        </p>
      </div>
      {puedeGestionar && !revocada && (
        <button
          type="button"
          onClick={() => onRevocar(clave.id)}
          disabled={revocando}
          className="p-1 text-subtle hover:text-danger transition-colors disabled:opacity-40"
          title="Revocar clave"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function PanelClavesApi({
  empresaId,
  puedeGestionar,
}: {
  empresaId: string;
  puedeGestionar: boolean;
}) {
  const [nombre, setNombre] = useState('');
  const [reciente, setReciente] = useState<ApiKeyCreada | null>(null);

  const consulta = useApiKeys(empresaId);
  const crear = useCrearApiKey(empresaId);
  const revocar = useRevocarApiKey(empresaId);

  const claves = consulta.data ?? [];
  const error = crear.error ?? revocar.error;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    try {
      // `mutateAsync` y no `mutate` porque el secreto sólo existe en ESTA
      // respuesta: hay que quedárselo aquí, no volver a pedirlo.
      const creada = await crear.mutateAsync(nombre.trim());
      setReciente(creada);
      setNombre('');
    } catch {
      // El mensaje sale de `crear.error`; sin este catch, además, la promesa
      // rechazada queda sin manejar.
    }
  }

  function pedirRevocacion(id: string) {
    const clave = claves.find((c) => c.id === id);
    // Es irreversible y rompe lo que esté integrado con ella: mejor un paso más.
    if (!confirm(`¿Revocar «${clave?.nombre}»? Lo que la use dejará de funcionar.`)) return;
    revocar.mutate(id);
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-5 mb-5">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-4 h-4 text-muted" />
        <h3 className="text-sm font-semibold text-text">Claves de API</h3>
      </div>
      <p className="text-xs text-muted mb-4">
        Para integrar TORDO con un ERP o un script. Cada clave da acceso a esta empresa con
        los mismos límites de plan que la aplicación.
      </p>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger mb-4">
          {mensajeDeError(error)}
        </div>
      )}

      {reciente && <ClaveReciénCreada clave={reciente} onCerrar={() => setReciente(null)} />}

      {consulta.isPending ? (
        <div className="animate-pulse h-12 bg-background rounded-xl" />
      ) : claves.length === 0 ? (
        <p className="text-sm text-muted">Sin claves emitidas.</p>
      ) : (
        <div className="divide-y divide-border">
          {claves.map((c) => (
            <Fila
              key={c.id}
              clave={c}
              puedeGestionar={puedeGestionar}
              onRevocar={pedirRevocacion}
              revocando={revocar.isPending}
            />
          ))}
        </div>
      )}

      {puedeGestionar && (
        <form onSubmit={enviar} className="flex gap-2 mt-4">
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la clave — p. ej. «ERP contabilidad»"
            maxLength={100}
            className="input-field flex-1 min-w-0"
          />
          <button
            type="submit"
            disabled={crear.isPending || !nombre.trim()}
            className="btn-primary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {crear.isPending ? 'Emitiendo…' : 'Emitir'}
          </button>
        </form>
      )}
    </div>
  );
}
