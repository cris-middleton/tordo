import { describe, expect, it } from 'vitest';

import { mismaUnidad, montoDeclarado } from '@/lib/compraAgil';
import { variadas } from '@/lib/portada';
import { textoDiferencia } from '@/lib/predictibilidad';
import type { CompraAgilDestacada } from '@/types/compraAgil';

/** Lo que salió de la crítica del 21-10: lo mismo dicho igual en todas partes, y una cifra donde había un adjetivo. */

describe('textoDiferencia', () => {
  it('la cifra entre los extremos de la mitad de las compras', () => {
    expect(textoDiferencia(167_227, 320_900)).toBe('El más alto es 1,9 veces el más bajo');
    expect(textoDiferencia(100, 200)).toBe('El más alto es el doble del más bajo');
    expect(textoDiferencia(100, 105)).toBe('Casi el mismo precio');
  });
  it('sin rango, nada', () => {
    expect(textoDiferencia(100, 100)).toBeNull();
    expect(textoDiferencia(null, 100)).toBeNull();
    expect(textoDiferencia(0, 100)).toBeNull();
  });
});

describe('montoDeclarado', () => {
  it('un monto simbólico ($1) se trata como sin monto', () => {
    expect(montoDeclarado({ monto_estimado: 1 })).toBeNull();
    expect(montoDeclarado({ monto_estimado: 999 })).toBeNull();
    expect(montoDeclarado({ monto_estimado: null })).toBeNull();
    expect(montoDeclarado({ monto_estimado: 45_000 })).toBe(45_000);
  });
});

const ca = (organismo: string, ordenes = 2322): CompraAgilDestacada =>
  ({
    codigo_externo: `${organismo}-${Math.random()}`,
    nombre: 'x',
    nombre_organismo: organismo,
    comprador: { ordenes, monto_mediana: 500_000 },
  }) as unknown as CompraAgilDestacada;

describe('mismaUnidad', () => {
  it('mismo organismo y misma historia: la misma unidad', () => {
    expect(mismaUnidad(ca('MOP DCYF'), ca('mop dcyf '))).toBe(true);
  });
  it('otra historia u otro organismo, no; y la primera fila nunca', () => {
    expect(mismaUnidad(ca('MOP DCYF', 10), ca('MOP DCYF'))).toBe(false);
    expect(mismaUnidad(ca('Hospital'), ca('MOP DCYF'))).toBe(false);
    expect(mismaUnidad(undefined, ca('MOP DCYF'))).toBe(false);
  });
});

describe('variadas', () => {
  const lista = ['A', 'A', 'A', 'A', 'B', 'C', 'A', 'D'].map((o, i) => ({ nombre_organismo: o, i }));
  it('las primeras cinco en su orden, con como mucho dos del mismo comprador', () => {
    expect(variadas(lista, 5, 2).map((x) => x.i)).toEqual([0, 1, 4, 5, 7]);
  });
  it('si no alcanzan, completa con las que quedaron fuera, en su orden', () => {
    const solo = ['A', 'A', 'A', 'A'].map((o, i) => ({ nombre_organismo: o, i }));
    expect(variadas(solo, 3, 2).map((x) => x.i)).toEqual([0, 1, 2]);
  });
});
