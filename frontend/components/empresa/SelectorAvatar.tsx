'use client';

import { setAvatar, useAvatar } from '@/lib/avatar';

const AVATARS = ['🦅', '🦉', '🕊️', '🐧', '🐦', '🐥', '🦆', '🦚', '🦜', '🦢', '🦩', '🐓', '🦃'];

export default function SelectorAvatar({
  nombre,
  usuario,
}: {
  nombre?: string | null;
  usuario?: string | null;
}) {
  const avatar = useAvatar();

  const iniciales = nombre
    ? nombre
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : (usuario?.slice(0, 2).toUpperCase() ?? 'U');

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-5">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-onPrimary font-medium shadow-sm ring-4 ring-background">
        {avatar ? (
          <span className="text-3xl leading-none">{avatar}</span>
        ) : (
          <span className="text-xl">{iniciales}</span>
        )}
      </div>
      <div className="flex-1">
        <h2 className="text-sm font-semibold text-text mb-0.5">Mi Perfil</h2>
        <p className="text-xs text-muted mb-3">Elige tu avatar animal (visible en tu menú)</p>
        <div className="flex flex-wrap gap-1.5">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              // `setAvatar` ya borra la clave y avisa al resto de la pantalla:
              // duplicar aquí el `removeItem` y el evento sobraba.
              onClick={() => setAvatar(a)}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-all hover:scale-110 ${
                avatar === a
                  ? 'bg-primary/20 ring-2 ring-primary ring-offset-1 ring-offset-surface'
                  : 'bg-background hover:bg-border/50'
              }`}
              title={`Elegir ${a}`}
            >
              {a}
            </button>
          ))}
          {avatar && (
            <button
              type="button"
              onClick={() => setAvatar(null)}
              className="flex h-8 px-3 items-center justify-center rounded-full bg-background hover:bg-danger/10 text-xs font-medium text-danger transition-all ml-1"
            >
              Quitar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
