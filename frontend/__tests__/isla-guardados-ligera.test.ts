/**
 * El contador de guardados está en la cabecera de TODAS las páginas, así que
 * lo que importe viaja en cada una. Una vez arrastró `date-fns` (unos 8 KB
 * gzip) sólo por contar: `useBusquedasGuardadas` → `filtrosCatalogo` →
 * `licitacionEstado`. Este test recorre los imports y falla si vuelve.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = resolve(__dirname, '..');
const PESADOS = ['date-fns', 'recharts', 'axios', '@tanstack/react-query'];

function resolverLocal(desde: string, destino: string): string | null {
  const base = destino.startsWith('@/') ? join(RAIZ, destino.slice(2)) : join(dirname(desde), destino);
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

/** Todo paquete externo al que llega un módulo, siguiendo sus imports locales. */
function paquetesAlcanzados(entrada: string): Set<string> {
  const vistos = new Set<string>();
  const paquetes = new Set<string>();
  const pila = [entrada];
  while (pila.length) {
    const fichero = pila.pop()!;
    if (vistos.has(fichero)) continue;
    vistos.add(fichero);
    const fuente = readFileSync(fichero, 'utf8');
    for (const m of fuente.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
      const destino = m[1];
      if (destino.startsWith('@/') || destino.startsWith('.')) {
        const local = resolverLocal(fichero, destino);
        if (local) pila.push(local);
      } else {
        paquetes.add(destino);
      }
    }
  }
  return paquetes;
}

describe('la isla de guardados es ligera', () => {
  const alcanzados = paquetesAlcanzados(join(RAIZ, 'components/cascara/EnlaceGuardados.tsx'));

  it('la guarda ve algo (no comprueba el vacío)', () => {
    expect(alcanzados.has('react')).toBe(true);
    expect(alcanzados.has('lucide-react')).toBe(true);
  });

  it.each(PESADOS)('no arrastra %s', (paquete) => {
    expect([...alcanzados].filter((p) => p === paquete || p.startsWith(`${paquete}/`))).toEqual([]);
  });
});
