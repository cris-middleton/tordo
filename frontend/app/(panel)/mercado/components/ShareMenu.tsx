'use client';

import { useState, useRef, useEffect, RefObject } from 'react';
import { MoreHorizontal, Copy, Download, Link as LinkIcon, Check } from 'lucide-react';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

interface ShareMenuProps {
  /** Ref al elemento a capturar como PNG */
  targetRef: RefObject<HTMLElement | null>;
  /** Texto a copiar cuando el user elige "Copiar resumen" (texto plano, sin HTML) */
  summaryText: string;
  /** Nombre del archivo PNG sin extensión */
  filename: string;
}

/**
 * Menú `⋯` con 3 acciones: copiar resumen, descargar PNG y copiar link.
 * Usa html2canvas (dynamic import, solo se carga al descargar).
 */
export function ShareMenu({ targetRef, summaryText, filename }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'text' | 'link' | null>(null);
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

  const copiarResumen = async () => {
    try {
      await navigator.clipboard.writeText(`${summaryText}\n\nVer en ${APP_NAME} → ${window.location.href}`);
      setCopiedKey('text');
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // no-op
    }
  };

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedKey('link');
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // no-op
    }
  };

  const descargarPNG = async () => {
    if (!targetRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `${filename}.png`;
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
        onClick={() => setOpen((o) => !o)}
        aria-label="Compartir"
        className="p-1.5 text-muted hover:text-text rounded-lg hover:bg-surface transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
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
        </div>
      )}
    </div>
  );
}
