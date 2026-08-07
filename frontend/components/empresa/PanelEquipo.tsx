'use client';

import { useState } from 'react';
import { Crown, Eye, Shield, Trash2, UserPlus } from 'lucide-react';

import SelectField from '@/components/SelectField';
import UsoDeAsientos from '@/components/empresa/UsoDeAsientos';
import { mensajeDeError } from '@/lib/errores';
import {
  useAgregarMiembro,
  useEliminarMiembro,
  useEmpresaMiembros,
  usePlanEmpresa,
} from '@/lib/queries';

export interface Miembro {
  user_id: number;
  email: string;
  full_name: string | null;
  rol: string;
  joined_at: string;
}

export const ROL_CONFIG: Record<string, { label: string; Icon: React.ElementType; cls: string }> = {
  owner: { label: 'Owner', Icon: Crown, cls: 'text-gold bg-gold/10' },
  admin: { label: 'Admin', Icon: Shield, cls: 'text-info bg-info/10' },
  viewer: { label: 'Viewer', Icon: Eye, cls: 'text-muted bg-border' },
};

export function EtiquetaRol({ rol }: { rol: string }) {
  const r = ROL_CONFIG[rol] ?? ROL_CONFIG.viewer;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${r.cls}`}>
      <r.Icon className="w-3 h-3" /> {r.label}
    </span>
  );
}

export default function PanelEquipo({
  empresaId,
  puedeGestionar,
  idUsuario,
}: {
  empresaId: string;
  puedeGestionar: boolean;
  idUsuario?: number;
}) {
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<'admin' | 'viewer'>('viewer');
  const [invitado, setInvitado] = useState<string | null>(null);

  const consulta = useEmpresaMiembros(empresaId);
  const plan = usePlanEmpresa(empresaId);
  const agregar = useAgregarMiembro(empresaId);
  const eliminar = useEliminarMiembro(empresaId);

  // La API devolvió en algún momento el listado envuelto en `data`; se acepta
  // cualquiera de las dos formas.
  const datos = consulta.data as unknown;
  const miembros: Miembro[] = Array.isArray(datos)
    ? (datos as Miembro[])
    : ((datos as { data?: Miembro[] })?.data ?? []);

  const error = agregar.error ?? eliminar.error;
  const limite = plan.data?.limites.max_usuarios ?? null;
  const sinAsientos = limite !== null && (plan.data?.uso.usuarios ?? 0) >= limite;

  async function invitar(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await agregar.mutateAsync({ email: email.trim(), rol });
      setInvitado(`${email.trim()} añadido como ${rol}`);
      setEmail('');
    } catch {
      // El mensaje viene de `agregar.error`. Si es un 402, el interceptor ya
      // levantó además el banner de plan.
    }
  }

  function quitar(m: Miembro) {
    if (!confirm(`¿Eliminar a ${m.email} del equipo?`)) return;
    eliminar.mutate(m.user_id);
  }

  return (
    <>
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-5 mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
          <h3 className="text-sm font-semibold text-text">
            Equipo ({miembros.length} {miembros.length === 1 ? 'miembro' : 'miembros'})
          </h3>
          {plan.data && <UsoDeAsientos plan={plan.data} />}
        </div>

        {consulta.isPending ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse h-12 bg-background rounded-xl" />
            ))}
          </div>
        ) : miembros.length === 0 ? (
          <p className="text-sm text-muted">Sin miembros registrados.</p>
        ) : (
          <div className="divide-y divide-border">
            {miembros.map((m) => {
              const soyYo = m.user_id === idUsuario;
              return (
                <div key={m.user_id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-info/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-info">
                        {(m.full_name ?? m.email)[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text leading-tight">
                        {m.full_name ?? m.email}
                        {soyYo && <span className="ml-1 text-xs font-normal text-muted">(tú)</span>}
                      </p>
                      {m.full_name && <p className="text-xs text-muted">{m.email}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <EtiquetaRol rol={m.rol} />
                    {puedeGestionar && m.rol !== 'owner' && !soyYo && (
                      <button
                        type="button"
                        onClick={() => quitar(m)}
                        disabled={eliminar.isPending}
                        className="p-1 text-subtle hover:text-danger transition-colors disabled:opacity-40"
                        title="Eliminar miembro"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {puedeGestionar ? (
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-4 h-4 text-muted" />
            <h3 className="text-sm font-semibold text-text">Añadir miembro</h3>
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger mb-4">
              {mensajeDeError(error, 'No se pudo actualizar el equipo')}
            </div>
          )}
          {invitado && !error && (
            <div className="bg-accent/10 border border-accent/30 rounded-xl px-4 py-3 text-sm text-accent mb-4">
              ✓ {invitado}
            </div>
          )}

          <form onSubmit={invitar} className="space-y-3">
            <div>
              <label htmlFor="email-invitado" className="block text-xs font-medium text-muted mb-1">
                Email del usuario
              </label>
              <input
                id="email-invitado"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@empresa.cl"
                required
                className="input-field w-full"
              />
              <p className="text-xs text-muted mt-1">El usuario debe tener una cuenta en TORDO.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Rol</label>
              <SelectField
                value={rol}
                onChange={(v) => setRol(v as 'admin' | 'viewer')}
                options={[
                  { value: 'viewer', label: 'Viewer — solo puede leer' },
                  { value: 'admin', label: 'Admin — puede editar y añadir miembros' },
                ]}
              />
            </div>
            <button
              type="submit"
              // Se deshabilita con el plan lleno, pero sólo cuando ya sabemos el
              // límite: mientras el plan carga, `sinAsientos` es falso y el botón
              // queda activo — es el backend quien decide de verdad.
              disabled={agregar.isPending || !email.trim() || sinAsientos}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {agregar.isPending
                ? 'Añadiendo…'
                : sinAsientos
                  ? 'Sin asientos disponibles'
                  : 'Añadir miembro'}
            </button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-muted text-center py-4">
          Solo el owner o admin puede gestionar miembros.
        </p>
      )}
    </>
  );
}
