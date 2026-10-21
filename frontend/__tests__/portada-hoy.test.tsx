/**
 * «Lo mejor de hoy» en la portada, compacto (spec del rediseño §6.3): una fila
 * por Compra Ágil —nombre, comprador, monto, cierre—, sin puntaje ni cocientes,
 * y sin la historia de la unidad, que vive en /compra-agil.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BloqueHoy } from '@/components/portada/BloqueHoy';
import {
  CON_PUESTO,
  MOSTRAR_COTIZACIONES,
  TITULO_DESTACADAS,
  descripcionDestacadas,
  textoTiempo,
} from '@/lib/compraAgil';
import { formatCurrency, normalizeText } from '@/lib/licitacionEstado';
import type { CompraAgilDestacada, CompraAgilDestacadasResponse } from '@/types/compraAgil';

function item(n: number, cambios: Partial<CompraAgilDestacada> = {}): CompraAgilDestacada {
  return {
    codigo_externo: `1234-${n}-COT26`,
    nombre: `Compra de prueba ${n}`,
    nombre_organismo: 'Hospital de Prueba',
    region: 'Región Metropolitana de Santiago',
    monto_estimado: 500000,
    fecha_publicacion: '2026-10-12T10:00:00Z',
    fecha_cierre: '2026-10-14T10:00:00Z',
    horas_restantes: 30,
    ofertas_recibidas: 1,
    ofertas_al: null,
    comprador: { ordenes: 524, monto_mediana: 400000, monto_p25: 200000, monto_p75: 900000 } as CompraAgilDestacada['comprador'],
    puntaje: 0.8,
    factores: { competencia: 1, comprador: 0.8, tiempo: 1, monto: 1 },
    ...cambios,
  };
}

const DATOS: CompraAgilDestacadasResponse = {
  actualizado_en: '2026-10-12T16:05:00Z',
  historia_disponible: true,
  ventana_desde: '2026-04-12',
  ventana_hasta: '2026-10-12',
  items: [1, 2, 3, 4, 5].map((n) => item(n)),
};

/** La hora ya leída, como la pasa la portada (no la vuelve a leer el bloque). */
const HORA = 'mar, 13 oct, 09:30';

const lista = () => screen.getByRole('list', { name: /compras ágiles destacadas de hoy/i });

describe('BloqueHoy, compacto', () => {
  it('cinco filas: nombre al detalle, comprador, monto y cierre', () => {
    render(<BloqueHoy datos={DATOS} actualizado={HORA} />);
    expect(lista().children).toHaveLength(5);
    const filas = within(lista()).getAllByRole('article');
    expect(filas).toHaveLength(5);
    const primera = filas[0];
    expect(within(primera).getByRole('link', { name: normalizeText('Compra de prueba 1') })).toHaveAttribute(
      'href',
      '/licitaciones/1234-1-COT26',
    );
    expect(within(primera).getByText(normalizeText('Hospital de Prueba'))).toBeInTheDocument();
    expect(within(primera).getByText(formatCurrency(500000)!)).toBeInTheDocument();
    // La hora de cierre en Santiago, no la cuenta atrás: la portada se sirve
    // desde caché y «Cierra en 30 h» envejecía (10:00 UTC son las 07:00 en octubre).
    expect(within(primera).getByText('Cierra el 14 oct a las 07:00')).toBeInTheDocument();
    expect(within(primera).queryByText(textoTiempo(30))).not.toBeInTheDocument();
  });

  it('sin fecha de cierre legible no inventa una cuenta atrás', () => {
    render(<BloqueHoy datos={{ ...DATOS, items: [item(1, { fecha_cierre: null })] }} actualizado={HORA} />);
    expect(lista().textContent).not.toMatch(/cierra/i);
  });

  it('sin puntaje, sin cocientes y sin la historia de la unidad', () => {
    const { container } = render(<BloqueHoy datos={DATOS} actualizado={HORA} />);
    expect(container.textContent).not.toMatch(/puntaje|\/100|adjudica \d|unidad de compra|órdenes|la mitad de sus/i);
    if (!MOSTRAR_COTIZACIONES) expect(container.textContent).not.toMatch(/cotiz/i);
  });

  it('el título de un solo sitio, el puesto sólo si CON_PUESTO y «Ver todas» a /compra-agil', () => {
    render(<BloqueHoy datos={DATOS} actualizado={HORA} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(TITULO_DESTACADAS);
    expect(lista().tagName).toBe(CON_PUESTO ? 'OL' : 'UL');
    expect(screen.queryAllByText(/^Puesto/)).toHaveLength(CON_PUESTO ? 5 : 0);
    expect(screen.getByRole('link', { name: /^ver todas/i })).toHaveAttribute('href', '/compra-agil');
  });

  it('dice la hora que le pasa la portada, con el día, sin leerla otra vez', () => {
    render(<BloqueHoy datos={DATOS} actualizado={HORA} />);
    expect(screen.getByText(/actualizado el/i)).toHaveTextContent(`Actualizado el ${HORA}.`);
  });

  it('describe el orden según haya o no historia por unidad', () => {
    const { unmount } = render(<BloqueHoy datos={DATOS} actualizado={HORA} />);
    expect(screen.getByText(/actualizado el/i)).toHaveTextContent(descripcionDestacadas(true));
    unmount();
    render(<BloqueHoy datos={{ ...DATOS, historia_disponible: false }} actualizado={HORA} />);
    const texto = screen.getByText(/actualizado el/i);
    expect(texto).toHaveTextContent(descripcionDestacadas(false));
    expect(texto.textContent).not.toMatch(/compran seguido/);
  });

  it('el tope de Compra Ágil se dice como tope, sin repetir el monto', () => {
    render(
      <BloqueHoy
        datos={{ ...DATOS, items: [item(1, { monto_estimado: 7_215_100, monto_es_tope: true })] }}
        actualizado={HORA}
      />,
    );
    const fila = within(lista()).getByRole('article');
    expect(within(fila).getByText('Hasta $7,2 millones')).toBeInTheDocument();
    expect(within(fila).getByText('El máximo que permite Compra Ágil')).toBeInTheDocument();
    expect(fila.textContent!.match(/\$7,2 millones/g)).toHaveLength(1);
  });

  it('sin monto lo dice, en vez de un $0', () => {
    render(<BloqueHoy datos={{ ...DATOS, items: [item(1, { monto_estimado: null })] }} actualizado={HORA} />);
    expect(screen.getByText('Sin monto')).toBeInTheDocument();
  });

  it('un nombre larguísimo no ensancha la fila (móvil a 390 px)', () => {
    const largo = 'ADQUISICIÓN-DE-INSUMOS-CLÍNICOS-PARA-EL-SERVICIO-DE-URGENCIA-'.repeat(6);
    render(<BloqueHoy datos={{ ...DATOS, items: [item(1, { nombre: largo })] }} actualizado={HORA} />);
    const enlace = within(lista()).getAllByRole('link')[0];
    expect(enlace.className).toMatch(/\bline-clamp-1\b/);
    expect(enlace.className).toMatch(/\bbreak-words\b/);
    expect(enlace.parentElement!.className).toMatch(/\bmin-w-0\b/);
  });

  it('sin Compras Ágiles abiertas lo dice, en vez de dejar un hueco', () => {
    render(<BloqueHoy datos={{ ...DATOS, items: [] }} actualizado={HORA} />);
    expect(screen.getByText(/no hay compras ágiles abiertas/i)).toBeInTheDocument();
  });
});
