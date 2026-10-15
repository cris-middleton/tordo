'use client';

import { KeyboardEvent, ReactNode, RefObject, useId, useRef } from 'react';

/** Ancho del globo (`w-64`) y margen que se le deja al borde de la pantalla, en px. */
const ANCHO_GLOBO = 256;
const MARGEN = 16;

/** Nombre del disparador cuando es sólo el ícono: «ℹ» está oculto a los lectores. */
const NOMBRE_SOLO_ICONO = 'Más información';

interface InfoTooltipProps {
  content: ReactNode;
  children?: ReactNode;
  side?: 'top' | 'bottom';
}

/**
 * Tooltip custom con popup visible al hover o al foco.
 * Usar en lugar de `title="..."` nativo para garantizar consistencia visual.
 *
 * - **Accesible**: el disparador se alcanza con el teclado (`tabIndex={0}`) y el
 *   globo es su descripción (`aria-describedby` + `role="tooltip"`). Un elemento
 *   con `display: none` al que apunta `aria-describedby` sigue anunciándose, así
 *   que cerrado no ocupa sitio en la página (antes, con `opacity-0`, un globo de
 *   256 px junto al borde derecho ensanchaba `/mercado` a 390 px).
 * - **Sin texto, es un botón con nombre**: con sólo el ícono (`<InfoTooltip
 *   content="…" />`), el disparador es un `<button aria-label="Más información">`.
 *   Un `<span>` enfocable con «ℹ» oculto sería un foco vacío para el lector de
 *   pantalla.
 * - **Escape lo cierra** (WCAG 1.4.13): quita el foco, y el globo se abre con
 *   `group-focus-within`. Con el puntero no hace falta: se va al salir.
 * - **No se sale de la pantalla**: al abrirse se desplaza lo justo para caber
 *   entre los márgenes del viewport (variable CSS `--tooltip-dx`, puesta en el
 *   evento; ni estado ni efecto).
 *
 * Uso:
 *   <InfoTooltip content="Explicación corta">
 *     Texto visible con ℹ
 *   </InfoTooltip>
 *
 * O solo el ícono:
 *   <InfoTooltip content="Explicación" />
 */
export function InfoTooltip({ content, children, side = 'top' }: InfoTooltipProps) {
  const id = useId();
  const raiz = useRef<HTMLElement>(null);
  const soloIcono = !children;
  const position = side === 'bottom'
    ? 'top-[calc(100%+6px)] left-0'
    : 'bottom-[calc(100%+6px)] left-0';

  /** Calcula cuánto hay que correr el globo para que quepa en el viewport. */
  function ajustar() {
    const el = raiz.current;
    if (!el) return;
    const ancho = document.documentElement.clientWidth;
    const globo = Math.min(ANCHO_GLOBO, ancho - 2 * MARGEN);
    const izquierda = el.getBoundingClientRect().left;
    const dx = Math.max(MARGEN - izquierda, Math.min(0, ancho - MARGEN - globo - izquierda));
    el.style.setProperty('--tooltip-dx', `${dx}px`);
  }

  function alTeclear(evento: KeyboardEvent<HTMLElement>) {
    if (evento.key === 'Escape') evento.currentTarget.blur();
  }

  const Disparador = soloIcono ? 'button' : 'span';

  return (
    <Disparador
      ref={raiz as RefObject<HTMLButtonElement & HTMLSpanElement>}
      {...(soloIcono ? { type: 'button' as const, 'aria-label': NOMBRE_SOLO_ICONO } : { tabIndex: 0 })}
      aria-describedby={id}
      onMouseEnter={ajustar}
      onFocus={ajustar}
      onKeyDown={alTeclear}
      className="group relative inline-flex items-center gap-1 cursor-help rounded-sm"
    >
      {children}
      <span className="text-muted/60 font-normal text-xs" aria-hidden="true">ℹ</span>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute ${position} w-64 max-w-[calc(100vw-2rem)] translate-x-[var(--tooltip-dx,0px)] rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text shadow-lg hidden group-hover:block group-focus-within:block z-[100] font-normal leading-relaxed whitespace-normal`}
      >
        {content}
      </span>
    </Disparador>
  );
}
