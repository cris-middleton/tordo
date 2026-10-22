'use client';

import { createContext, useContext, useState, useRef, useEffect, RefObject } from 'react';
import { Share2, Copy, Download, Link as LinkIcon, Check } from 'lucide-react';

import { enlaceConRubro } from '@/lib/compartir';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

interface ShareMenuProps {
  /** Ref al elemento a capturar como PNG */
  targetRef: RefObject<HTMLElement | null>;
  /** Texto a copiar cuando el user elige "Copiar resumen" (texto plano, sin HTML) */
  summaryText: string;
  /** Tema del PNG, sin marca ni extensión (`tendencia-papel`): la marca la pone el menú. */
  filename: string;
}

/**
 * El rubro que la pantalla muestra, también el elegido por defecto, que no va en
 * su URL. Lo pone `/mercado` y lo lee el menú: así no hay que pasarlo por cada
 * sección que tiene uno.
 */
const ContextoRubro = createContext('');
export const RubroMostrado = ContextoRubro.Provider;

/**
 * Menú «Compartir» con 3 acciones: copiar resumen, descargar PNG y copiar link.
 * Usa html2canvas (dynamic import, solo se carga al descargar).
 *
 * El botón dice lo que hace: era un `⋯` suelto, que no se lee como «compartir» y
 * quedaba flotando a mitad de fila. El PNG sale con el fondo de la página (en
 * tema oscuro, oscuro), no con un blanco escrito a mano.
 */
export function ShareMenu({ targetRef, summaryText, filename }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'text' | 'link' | 'fallo' | null>(null);
  const rubro = useContext(ContextoRubro);
  const rootRef = useRef<HTMLDivElement>(null);

  // Click-outside para cerrar
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [open]);

  // Sin permiso de portapapeles (o fuera de https) se dice: antes no pasaba nada
  // y parecía copiado.
  const copiar = async (texto: string, clave: 'text' | 'link') => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiedKey(clave);
    } catch {
      setCopiedKey('fallo');
    }
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const enlace = () => enlaceConRubro(window.location.href, rubro);
  const copiarResumen = () => copiar(`${summaryText}\n\nVer en ${APP_NAME}: ${enlace()}`, 'text');
  const copiarLink = () => copiar(enlace(), 'link');

  const descargarPNG = async () => {
    if (!targetRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        scale: 2,
        logging: false,
      });
      const link = document.createElement('a');
      // La marca sale de `NEXT_PUBLIC_APP_NAME`: los llamadores pasan sólo el tema.
      link.download = `${APP_NAME.toLowerCase().replace(/\s+/g, '-')}-${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // no-op
    } finally {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-mx-2 inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        Compartir
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-border bg-surface shadow-xl z-20 py-1">
          <button onClick={copiarResumen} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-primary/5 text-left text-text">
            {copiedKey === 'text' ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5 text-muted" />}
            {copiedKey === 'text' ? 'Copiado' : 'Copiar resumen'}
          </button>
          <button onClick={descargarPNG} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-primary/5 text-left text-text">
            <Download className="h-3.5 w-3.5 text-muted" />
            Descargar PNG
          </button>
          <button onClick={copiarLink} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-primary/5 text-left text-text">
            {copiedKey === 'link' ? <Check className="h-3.5 w-3.5 text-accent" /> : <LinkIcon className="h-3.5 w-3.5 text-muted" />}
            {copiedKey === 'link' ? 'Copiado' : 'Copiar enlace'}
          </button>
          {copiedKey === 'fallo' && (
            <p role="status" className="px-3 py-2 text-sm text-danger">
              No se pudo copiar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
