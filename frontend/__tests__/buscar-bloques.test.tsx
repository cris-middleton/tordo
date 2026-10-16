/**
 * Los bloques de `/buscar` y su formulario, con datos ya pedidos.
 *
 * Se fija, bloque a bloque, los tres estados —con resultados, vacío y
 * fallido— y que cada «ver todos» sale del ayudante de rutas que le toca.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BloqueAbiertas, BloqueCompradores, BloquePrecios, EjemplosBusqueda, SinResultados } from '@/components/buscar/Bloques';
import { FormularioBuscar } from '@/components/buscar/FormularioBuscar';
import { EJEMPLOS_BUSQUEDA, rutaBuscar } from '@/lib/buscar';
import { TITULO_DESTACADAS } from '@/lib/compraAgil';
import { urlCatalogoAbiertas } from '@/lib/filtrosCatalogo';
import type { Bloque, LicitacionesEncontradas } from '@/types/buscar';
import type { CompraAgilDestacadasResponse } from '@/types/compraAgil';
import type { ProductoEncontrado, ProductoPublico } from '@/types/publico';

import { DESTACADAS, LICITACIONES, PRODUCTO, PRODUCTOS, fallo, ok } from './ayudas/buscarDePrueba';

const TERMINO = 'guante nitrilo';
const TERMINOS = ['guante', 'nitrilo'];

describe('FormularioBuscar', () => {
  it('es un GET a /buscar con el término puesto y las cotas del backend', () => {
    render(<FormularioBuscar termino="resma" />);
    const form = screen.getByRole('search');
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/buscar');
    const campo = within(form).getByRole('searchbox', { name: /qué le vendes al estado/i });
    expect(campo).toHaveAttribute('name', 'q');
    expect(campo).toHaveValue('resma');
    expect(campo).toHaveAttribute('minlength', '3');
    expect(campo).toHaveAttribute('maxlength', '100');
    expect(campo).toBeRequired();
    expect(within(form).getByRole('button', { name: 'Buscar' })).toHaveAttribute('type', 'submit');
  });

  it('con otro término el campo se rehace: un <Link> entre búsquedas no deja el término viejo', () => {
    const { rerender } = render(<FormularioBuscar termino="resma" />);
    rerender(<FormularioBuscar termino="tóner" />);
    expect(screen.getByRole('searchbox')).toHaveValue('tóner');
  });
});

describe('BloquePrecios', () => {
  it('el primer producto con su banda, los otros como enlaces y «ver todos»', () => {
    render(<BloquePrecios termino={TERMINO} productos={ok(PRODUCTOS)} ficha={ok(PRODUCTO)} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Cuánto ha pagado el Estado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Guante latex nitrilo' })).toHaveAttribute('href', '/productos/guante-latex-nitrilo');
    // La banda de la unidad más comprada: unidades[0] (Caja, n=120).
    expect(screen.getByRole('heading', { level: 3, name: 'Por caja' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Por unidad' })).toBeNull();
    const otros = screen.getByRole('list', { name: /otros productos/i });
    expect(within(otros).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/productos/guante-nitrilo-talla',
      '/productos/guante-nitrilo-azul',
    ]);
    expect(within(otros).getByText(/orientativo/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver todos los productos/i })).toHaveAttribute('href', '/productos?q=guante+nitrilo');
  });

  it('titula con la descripción del comprador y la banda dice de cuántos organismos y de cuándo', () => {
    const productos = [{ ...PRODUCTOS[0], descripcion: 'GUANTE DE LÁTEX Y NITRILO' }, ...PRODUCTOS.slice(1)];
    const ficha = {
      ...PRODUCTO,
      periodo: { ventana_desde: '2025-04-01', ventana_hasta: '2026-03-31' },
      unidades: [{ ...PRODUCTO.unidades[0], compradores: 31, cuota_mayor: 0.1, de_mercado: true }],
    };
    render(<BloquePrecios termino={TERMINO} productos={ok(productos)} ficha={ok(ficha)} />);
    expect(screen.getByRole('link', { name: 'Guante de látex y nitrilo' })).toHaveAttribute(
      'href',
      '/productos/guante-latex-nitrilo',
    );
    expect(screen.getByText('120 compras de 31 organismos, abr 2025 – mar 2026 (12 meses).')).toBeInTheDocument();
  });

  it('si la ficha falla, la lista sigue y la banda se cambia por una línea', () => {
    render(<BloquePrecios termino={TERMINO} productos={ok(PRODUCTOS)} ficha={fallo<ProductoPublico>()} />);
    expect(screen.getByRole('link', { name: 'Guante latex nitrilo' })).toBeInTheDocument();
    expect(screen.getByText(/no pudimos consultar la banda de precio de este producto/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
  });

  it('vacío: lo dice, con la regla de las palabras cortas', () => {
    render(<BloquePrecios termino="xqz" productos={ok([])} ficha={null} />);
    expect(screen.getByText('Ningún producto coincide con «xqz».')).toBeInTheDocument();
    expect(screen.getByText(/menos de tres letras y los números no cuentan/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('fallido: una línea y nada más', () => {
    render(<BloquePrecios termino={TERMINO} productos={fallo<ProductoEncontrado[]>('limite')} ficha={null} />);
    expect(screen.getByText(/espera un momento/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('el término se pinta como texto, nunca como HTML', () => {
    const { container } = render(<BloquePrecios termino="<b>hola</b>" productos={ok([])} ficha={null} />);
    expect(screen.getByText('Ningún producto coincide con «<b>hola</b>».')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });
});

describe('BloqueAbiertas', () => {
  const abiertas = (
    licitaciones: Bloque<LicitacionesEncontradas> = ok(LICITACIONES),
    comprasAgiles: Bloque<CompraAgilDestacadasResponse> = ok(DESTACADAS),
  ) =>
    render(<BloqueAbiertas termino={TERMINO} terminos={TERMINOS} licitaciones={licitaciones} comprasAgiles={comprasAgiles} />);

  it('licitaciones: las de la página, el total y el enlace con el mismo filtro', () => {
    abiertas();
    expect(screen.getByRole('heading', { level: 2, name: 'Qué está abierto ahora' })).toBeInTheDocument();
    const lista = screen.getByRole('list', { name: /licitaciones abiertas/i });
    expect(within(lista).getByRole('link', { name: 'Adquisicion De Guantes De Nitrilo 1' })).toHaveAttribute(
      'href',
      '/licitaciones/1234-1-LE26',
    );
    expect(within(lista).getByText('1234-1-LE26')).toHaveClass('font-mono');
    expect(within(lista).getAllByText('$3 millones')).toHaveLength(2);
    expect(screen.getByText(/abiertas coinciden/)).toHaveTextContent('12 abiertas coinciden con «guante nitrilo».');
    expect(screen.getByRole('link', { name: 'Ver las 12 en el catálogo' })).toHaveAttribute(
      'href',
      urlCatalogoAbiertas('licitaciones', TERMINOS),
    );
  });

  it('Compra Ágil: tarjetas sin puesto y «ver todas» a /compra-agil?search=', () => {
    abiertas();
    const lista = screen.getByRole('list', { name: /compras ágiles abiertas/i });
    expect(within(lista).getAllByRole('article')).toHaveLength(3);
    expect(within(lista).queryByLabelText(/^Puesto/)).toBeNull();
    expect(screen.getByRole('link', { name: `Ver todas en «${TITULO_DESTACADAS}»` })).toHaveAttribute(
      'href',
      '/compra-agil?search=guante+nitrilo',
    );
  });

  it('cada mitad falla por su cuenta', () => {
    abiertas(fallo<LicitacionesEncontradas>('limite'), ok(DESTACADAS));
    expect(screen.getByText(/espera un momento y vuelve a cargar la página para ver las licitaciones abiertas/)).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('vacías: lo dicen, sin enlaces', () => {
    abiertas(ok({ items: [], total: 0 }), ok({ ...DESTACADAS, items: [] }));
    expect(screen.getByText('Ninguna licitación abierta coincide con «guante nitrilo».')).toBeInTheDocument();
    expect(
      screen.getByText('Ninguna Compra Ágil abierta que cierre en más de dos horas coincide con «guante nitrilo».'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('una sola licitación se dice en singular', () => {
    abiertas(ok({ items: [LICITACIONES.items[0]], total: 1 }), ok(DESTACADAS));
    expect(screen.getByText(/abierta coincide/)).toHaveTextContent('1 abierta coincide con «guante nitrilo».');
    expect(screen.getByRole('link', { name: 'Verla en el catálogo' })).toBeInTheDocument();
  });
});

describe('BloqueCompradores', () => {
  it('distintos por código, hasta cinco, todos enlazados, y la ficha', () => {
    const ficha: ProductoPublico = {
      ...PRODUCTO,
      compradores: [
        { codigo: '7297', nombre: 'Hospital de Prueba', unidad: 'Caja', n: 40, p50: 4800 },
        { codigo: '7297', nombre: 'Hospital de Prueba', unidad: 'Unidad', n: 30, p50: 50 },
        ...['1', '2', '3', '4', '5'].map((k) => ({ codigo: k, nombre: `Municipalidad ${k}`, unidad: 'Caja', n: 5, p50: 4000 })),
      ],
    };
    render(<BloqueCompradores ficha={ok(ficha)} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Quién lo compra' })).toBeInTheDocument();
    const lista = screen.getByRole('list', { name: /compradores/i });
    expect(within(lista).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/compradores/7297',
      '/compradores/1',
      '/compradores/2',
      '/compradores/3',
      '/compradores/4',
    ]);
    expect(screen.getByRole('link', { name: 'Ver la ficha del producto' })).toHaveAttribute('href', '/productos/guante-latex-nitrilo');
  });

  it('sin compradores lo dice; con la ficha caída, una línea', () => {
    const { unmount } = render(<BloqueCompradores ficha={ok({ ...PRODUCTO, compradores: [] })} />);
    expect(screen.getByText('Todavía no hay compradores con datos de este producto.')).toBeInTheDocument();
    unmount();
    render(<BloqueCompradores ficha={fallo<ProductoPublico>()} />);
    expect(screen.getByText(/no pudimos consultar quién compra este producto/i)).toBeInTheDocument();
  });
});

describe('sin resultados y ejemplos', () => {
  it('lo dice y ofrece los ejemplos, cada uno a /buscar', () => {
    render(<SinResultados termino="xqz" />);
    expect(screen.getByText(/no encontramos nada para «xqz»/i)).toBeInTheDocument();
    const ejemplos = screen.getByRole('list', { name: /ejemplos/i });
    expect(within(ejemplos).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(
      EJEMPLOS_BUSQUEDA.map(rutaBuscar),
    );
  });

  it('los ejemplos son enlaces de contenido (subrayados)', () => {
    render(<EjemplosBusqueda />);
    for (const a of screen.getAllByRole('link')) expect(a).toHaveClass('enlace');
  });
});
