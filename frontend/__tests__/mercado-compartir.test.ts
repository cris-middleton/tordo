/**
 * Lo que se lleva quien comparte o descarga desde `/mercado`: el rubro que está
 * viendo y la consulta que hizo, no lo que diga la URL o el formulario después.
 */
import { describe, expect, it } from 'vitest';

import { enlaceConRubro } from '@/lib/compartir';
import { rutaExportarPrecio } from '@/lib/exportar';

describe('copiar enlace', () => {
  it('lleva el rubro por defecto, que no está en la URL', () => {
    expect(enlaceConRubro('https://sitio.cl/mercado', 'Equipos médicos')).toBe(
      'https://sitio.cl/mercado?rubro=Equipos+m%C3%A9dicos',
    );
  });

  it('respeta el rubro elegido y el resto de la URL', () => {
    const href = 'https://sitio.cl/mercado?rubro=Aseo&focus=7297';
    expect(enlaceConRubro(href, 'Aseo')).toBe(href);
    expect(enlaceConRubro('https://sitio.cl/mercado?focus=7297', 'Aseo')).toBe(
      'https://sitio.cl/mercado?focus=7297&rubro=Aseo',
    );
  });

  it('sin rubro, la URL tal cual', () => {
    expect(enlaceConRubro('https://sitio.cl/mercado', '')).toBe('https://sitio.cl/mercado');
  });
});

describe('descargar el precio', () => {
  it('con el organismo consultado', () => {
    expect(rutaExportarPrecio({ codigo: '41116000', organismo: '7297' })).toBe(
      'bi/exportar/precio/41116000?organismo_id=7297',
    );
  });

  it('sin organismo, el de todo el país', () => {
    expect(rutaExportarPrecio({ codigo: '41116000', organismo: ' ' })).toBe('bi/exportar/precio/41116000');
  });
});
