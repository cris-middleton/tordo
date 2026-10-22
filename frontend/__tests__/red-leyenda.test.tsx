/**
 * La leyenda de la red nombra a los proveedores por lo que se dibuja: con grupo del
 * centro, «le venden a N compradores o más» y «el resto»; sin él, el aro dice qué
 * es («el resto» no tenía de qué ser el resto).
 */
import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RedProveedores } from '@/components/graficos/RedProveedores';
import { graficoRed } from '@/lib/redPortada';
import type { RedPortada } from '@/types/publico';

const compradores = Array.from({ length: 10 }, (_, i) => ({
  codigo: String(100 + i),
  nombre: `HOSPITAL ${i}`,
  sector: 'Salud',
  monto: (10 - i) * 1e11,
}));

const red = (aTodos: boolean): RedPortada => ({
  compradores,
  proveedores: [
    { codigo: 'a', nombre: 'PROVEEDOR A SPA', monto: 3e9, compradores: aTodos ? 10 : 1 },
    { codigo: 'b', nombre: 'PROVEEDOR B SPA', monto: 1e9, compradores: 1 },
  ],
  enlaces: [
    ...compradores.slice(0, aTodos ? 10 : 1).map((c) => ({ comprador: c.codigo, proveedor: 'a', monto: 1e8 })),
    { comprador: '101', proveedor: 'b', monto: 1e9 },
  ],
  monto_total: 2e12,
  monto_compradores: 1e12,
  proveedores_total: 500,
  a_la_mitad_o_mas: aTodos ? 1 : 0,
  ventana_desde: '2025-04-01',
  ventana_hasta: '2026-03-31',
});

const leyenda = (r: RedPortada) => {
  const { getByRole } = render(<RedProveedores datos={graficoRed(r)!} accesible={[]} />);
  return within(getByRole('list', { name: 'Proveedores' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);
};

describe('la leyenda de los proveedores', () => {
  it('con grupo del centro: ese grupo y el resto', () => {
    expect(leyenda(red(true))).toEqual(['Proveedores:', 'le venden a 5 compradores o más', 'el resto']);
  });

  it('sin grupo del centro, el aro dice qué es', () => {
    expect(leyenda(red(false))).toEqual(['Proveedores:', 'le venden a menos de 5 compradores']);
  });
});
