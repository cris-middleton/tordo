/**
 * Lo que la crítica de producción encontró en la ficha de una licitación, la del
 * comprador y la del rubro (2026-10-22): una ficha sin salida a postular, códigos
 * ONU sueltos, celdas vacías («Calculado con —»), cifras que no se creían
 * («299,4» ofertas por licitación, un «0 %» de trato directo heredado), un
 * esquema que saltaba de `h1` a `h3` y un gráfico que resaltaba enero bajo
 * «Se compra parejo todo el año».
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BuyerProfilePanel } from '@/components/BuyerProfilePanel';
import { PanoramaRubro } from '@/components/bi/PanoramaRubro';
import BIPanelSection from '@/components/licitacion/BIPanelSection';
import { metadata as metadataCatalogo } from '@/app/(panel)/licitaciones/layout';
import { fraseProveedorPrincipal, ofertasPorLicitacion, textoTratoDirecto } from '@/lib/comprador';
import { urlDeMercadoPublico, urlLicitacionMercadoPublico } from '@/lib/enlacesExternos';
import { porcentaje } from '@/lib/formato';
import { nombresDeCategorias, tipoOracion } from '@/lib/licitacionDetalle';
import type { Panorama } from '@/types/bi';
import type { BIPanel } from '@/types/licitacionDetalle';

describe('la ficha de una licitación', () => {
  it('una licitación sale a su ficha del portal, armada desde el código', () => {
    const url = urlLicitacionMercadoPublico('2450-100-LE26');
    expect(url).toBe(
      'https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=2450-100-LE26',
    );
    // Pasa el mismo filtro que una URL del dato.
    expect(urlDeMercadoPublico(url)).toBe(url);
  });

  it('el título de cada ficha lleva el nombre del sitio: el catálogo pasa la plantilla a sus hijos', () => {
    expect(metadataCatalogo.title).toMatchObject({ template: expect.stringMatching(/^%s \| .+/) });
  });

  it('un texto todo en mayúsculas pasa a tipo oración; uno con minúsculas, como viene', () => {
    expect(tipoOracion('SE REQUIERE LA ADQUISICION DE UNIFORMES.')).toBe('Se requiere la adquisicion de uniformes.');
    expect(tipoOracion('Compra de 3 resmas, según bases')).toBe('Compra de 3 resmas, según bases');
    expect(tipoOracion(undefined)).toBe('');
  });

  it('lee el nombre de cada categoría de los ítems, con las claves del backend', () => {
    const nombres = nombresDeCategorias([
      { CodigoProducto: 53102706, NombreProducto: 'Uniformes' },
      { codigoProductoONU: '53111601', NombreProducto: 'ZAPATOS DE SEGURIDAD' },
      { CodigoProducto: 46181504 },
      'no es un ítem',
    ]);
    expect(nombres.get('53102706')).toBe('Uniformes');
    expect(nombres.get('53111601')).toBe('Zapatos de seguridad');
    expect(nombres.has('46181504')).toBe(false);
    expect(nombresDeCategorias(null).size).toBe(0);
  });
});

describe('el panel de una licitación', () => {
  const panel: BIPanel = {
    codigo_externo: '2450-100-LE26',
    organismo_id: '7248',
    comprador: { disponible: true, buyer_score: 0.96, tasa_adjudicacion: 0.84, transparencia: { pct_trato_directo: 0 } },
    ventana: { disponible: false, motivo: 'sin_datos' },
    competidores: {
      disponible: true,
      top5: [{ NombreProveedor: 'COMERCIAL DE LA FUENTE LTDA', market_share_pct: 6.1, n_oc: 210 }],
    },
    precios: [
      { disponible: true, codigo_producto: '53102706', nivel_usado: 'L2', p25: 18000, p50: 18000, p75: 18000, n: 140 },
      { disponible: true, codigo_producto: '46181504', nivel_usado: 'L3', p25: 3500, p50: 4200, p75: 6100, n: 2210 },
    ],
  };
  const tender = {
    id: 1,
    codigo_externo: '2450-100-LE26',
    nombre: 'x',
    items: [{ CodigoProducto: 53102706, NombreProducto: 'Uniformes' }],
  };

  it('cada categoría dice qué es: su nombre si los ítems lo traen, y «Categoría ONU» con el código', () => {
    render(<BIPanelSection panel={panel} tender={tender} />);
    const tabla = screen.getByRole('table');
    const filas = within(tabla).getAllByRole('row');
    expect(filas[1]).toHaveTextContent('Uniformes');
    expect(filas[1]).toHaveTextContent('Categoría ONU 53102706');
    expect(filas[2]).toHaveTextContent('Categoría ONU 46181504');
    // P25 = P75: un precio, no «$18.000 a $18.000».
    expect(filas[1].textContent).not.toMatch(/18\.000 a/);
    expect(filas[2]).toHaveTextContent('$3.500 a $6.100');
  });

  it('sin plazo no hay sección «El plazo», y los proveedores salen con su nombre escrito', () => {
    render(<BIPanelSection panel={panel} tender={tender} />);
    expect(screen.queryByRole('heading', { name: 'El plazo' })).toBeNull();
    expect(screen.getByText('Comercial de la Fuente Ltda')).toBeInTheDocument();
  });
});

describe('cómo compra un comprador', () => {
  it('sin base no hay «Calculado con —», y la nota enlaza a cómo se calcula', () => {
    const { container } = render(<BuyerProfilePanel comprador={{ disponible: true, buyer_score: 0.96 }} />);
    expect(container.textContent).not.toMatch(/Calculado con/);
    expect(screen.getByRole('link', { name: 'Cómo se calcula' })).toHaveAttribute(
      'href',
      '/guias/como-leer-un-comprador#la-nota-como-comprador',
    );
  });

  it('un trato directo de 0 exacto no sale (el viejo 0 de todos); sobre cero, sí', () => {
    const { container, rerender } = render(
      <BuyerProfilePanel comprador={{ disponible: true, buyer_score: 0.5, transparencia: { pct_trato_directo: 0 } }} />,
    );
    expect(container.textContent).not.toMatch(/Trato directo/);
    rerender(
      <BuyerProfilePanel comprador={{ disponible: true, buyer_score: 0.5, transparencia: { pct_trato_directo: 0.12 } }} />,
    );
    expect(screen.getByText('12 %')).toBeInTheDocument();
    expect(textoTratoDirecto(0.003)).toBe('menos de 1\u00a0%');
    expect(textoTratoDirecto(null)).toBeNull();
  });

  it('un promedio de ofertas que nadie creería no se publica', () => {
    expect(ofertasPorLicitacion(299.4)).toBeNull();
    expect(ofertasPorLicitacion(4.2)).toBe(4.2);
    expect(ofertasPorLicitacion(null)).toBeNull();
  });

  it('el proveedor principal se dice en una frase que se lee al derecho', () => {
    expect(fraseProveedorPrincipal(2.4)).toBe('El proveedor principal se lleva el 2\u00a0% de sus órdenes por Compra Ágil.');
    expect(fraseProveedorPrincipal(0.2)).toBe(
      'El proveedor principal se lleva menos del 1\u00a0% de sus órdenes por Compra Ágil.',
    );
  });
});

describe('el panorama de un rubro', () => {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const panorama = (tieneTemporada: boolean): Panorama => ({
    disponible: true,
    competencia: {
      disponible: true,
      tipo_mercado: 'fragmentado',
      lideres: [{ nombre: 'STARCO S A', share_pct: 4.1, share_oc_pct: 0.04 }],
    },
    estacionalidad: {
      disponible: true,
      meses: meses.map((nombre, i) => ({ mes: i + 1, nombre, pct: i === 0 ? 9.1 : 8.2 })),
      mes_pico: 'Ene',
      pct_top3: 26,
      tiene_temporada: tieneTemporada,
    },
    vigilar: {
      disponible: true,
      n_con_banderas: 41,
      n_compradores_rubro: 890,
      compradores: [{ codigo: '7248', nombre: 'I MUNICIPALIDAD DE CONCEPCION', n_banderas: 1, motivos: ['cancela'] }],
    },
  });

  it('en la ficha pública las conclusiones son h2; en /mercado, h3', () => {
    const { unmount } = render(<PanoramaRubro panorama={panorama(false)} cargando={false} rubro="R" nivel="h2" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Rubro fragmentado' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Se compra parejo todo el año' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
    unmount();
    render(<PanoramaRubro panorama={panorama(false)} cargando={false} rubro="R" />);
    expect(screen.getByRole('heading', { level: 3, name: 'Rubro fragmentado' })).toBeInTheDocument();
  });

  it('«parejo» no resalta ningún mes; con temporada, el mes pico', () => {
    const { container, unmount } = render(<PanoramaRubro panorama={panorama(false)} cargando={false} rubro="R" />);
    expect(container.querySelectorAll('.bg-dato')).toHaveLength(0);
    unmount();
    const otro = render(<PanoramaRubro panorama={panorama(true)} cargando={false} rubro="R" />);
    expect(otro.container.querySelectorAll('.bg-dato')).toHaveLength(1);
  });

  it('una cuota que se redondearía a cero dice «menos de 0,1 %», y cada comprador enlaza a su ficha', () => {
    render(<PanoramaRubro panorama={panorama(false)} cargando={false} rubro="R" />);
    expect(screen.getByText(/menos de 0,1 % de las órdenes/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'I Municipalidad de Concepcion' })).toHaveAttribute(
      'href',
      '/compradores/7248',
    );
    expect(porcentaje(34.5)).toBe('34,5 %');
    expect(porcentaje(0)).toBe('menos de 0,1 %');
  });
});
