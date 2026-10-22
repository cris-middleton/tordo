'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Cuánto se queda «Copiado» a la vista antes de volver a «Copiar». */
const MS_AVISO = 2000;

type Estado = 'listo' | 'copiado' | 'fallo';

const TEXTO: Record<Estado, string> = {
  listo: 'Copiar',
  copiado: 'Copiado',
  fallo: 'Cópialo a mano',
};

/**
 * El botón «Copiar» de un fragmento de `/abierto` (`Codigo`): la única isla de la
 * página, y lo único que lleva. Copia con `navigator.clipboard`; sin permiso (o
 * en http) lo dice y el bloque sigue seleccionándose entero con un clic
 * (`select-all`).
 *
 * El cambio a «Copiado» se anuncia (`aria-live`), porque el foco no se mueve y
 * un lector de pantalla no lo vería. Se alcanza con el teclado: es un `<button>`.
 */
export function BotonCopiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [estado, setEstado] = useState<Estado>('listo');
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  const copiar = async () => {
    let resultado: Estado = 'copiado';
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      resultado = 'fallo';
    }
    setEstado(resultado);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setEstado('listo'), MS_AVISO);
  };

  const Icono = estado === 'copiado' ? Check : Copy;
  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={estado === 'listo' ? `Copiar: ${etiqueta}` : undefined}
      className="absolute right-2 top-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 font-sans text-xs font-semibold text-text transition-colors hover:border-primary/30 hover:text-primary"
    >
      <Icono className="h-3.5 w-3.5" aria-hidden="true" />
      <span aria-live="polite">{TEXTO[estado]}</span>
    </button>
  );
}
