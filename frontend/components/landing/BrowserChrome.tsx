// frontend/components/landing/BrowserChrome.tsx
import type { ReactNode } from 'react';

export function BrowserChrome({ url, children }: { url: string; children: ReactNode }) {
  return (
    /* El lienzo se mantiene en `background` y los paneles interiores en
       `surface`: esa jerarquía es la que hace que se lea como una app.
       Lo que separa la ventana de la página es el borde —`borderLight`, no
       el decorativo— porque en tema claro la sección que la contiene y el
       lienzo quedan a tonos casi idénticos y sin él se disolvía. */
    <div className="rounded-xl overflow-hidden border border-borderLight bg-background shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface border-b border-border">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-gold/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent/80" />
        </div>
        <div className="ml-2 flex-1 rounded-md bg-background border border-border px-3 py-1 text-[10px] text-muted font-mono truncate">
          {url}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
