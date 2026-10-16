import Link from 'next/link';

import { SE_ACTUALIZA } from '@/lib/portada';

/**
 * La ficha bajo las cifras (spec IDENTIDAD_Y_PORTADA §3.1, D14): tres datos
 * concretos en vez de una lista de ✓, que es el patrón de una página de precios
 * de SaaS. «Se actualiza» sale del horario del cron (`SE_ACTUALIZA`), no se
 * escribe. API, MCP y CSV están en texto corrido: llevan `enlace`.
 */
export function FichaPortada() {
  return (
    <dl className="mt-7 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-border pt-4 text-sm">
      <dt className="text-muted">Fuente</dt>
      <dd className="font-semibold text-text">ChileCompra</dd>
      <dt className="text-muted">Se actualiza</dt>
      <dd className="font-semibold text-text">{SE_ACTUALIZA}</dd>
      <dt className="text-muted">Se usa</dt>
      <dd className="font-semibold text-text">
        Aquí, por{' '}
        <Link href="/abierto#api" className="enlace">API</Link>, por{' '}
        <Link href="/abierto#mcp" className="enlace">MCP</Link> o en{' '}
        <Link href="/abierto#datos" className="enlace">CSV</Link>. Sin registro.
      </dd>
    </dl>
  );
}
