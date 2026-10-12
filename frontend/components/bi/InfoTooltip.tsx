'use client';

import { ReactNode } from 'react';

interface InfoTooltipProps {
  content: ReactNode;
  children?: ReactNode;
  side?: 'top' | 'bottom';
}

/**
 * Tooltip custom con popup visible al hover.
 * Usar en lugar de `title="..."` nativo para garantizar consistencia visual.
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
  const position = side === 'bottom'
    ? 'top-[calc(100%+6px)] left-0'
    : 'bottom-[calc(100%+6px)] left-0';

  return (
    <span className="group relative inline-flex items-center gap-1 cursor-help">
      {children}
      <span className="text-muted/60 font-normal text-xs">ℹ</span>
      <span
        className={`pointer-events-none absolute ${position} w-64 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-[100] font-normal leading-relaxed whitespace-normal`}
      >
        {content}
      </span>
    </span>
  );
}
