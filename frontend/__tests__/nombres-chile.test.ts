import { describe, expect, it } from 'vitest';

import { normalizeText, shortRegion } from '@/lib/nombresChile';

/**
 * Los nombres de Mercado Público llegan en MAYÚSCULAS. En español las
 * preposiciones, los artículos y las conjunciones van en minúscula dentro de un
 * nombre («Policía de Investigaciones de Chile»): la auditoría de textos del
 * 16-10 (M11) encontró «Policia De Investigaciones De Chile» en todas las listas.
 */
describe('normalizeText', () => {
  it('deja en minúscula de, del, la, las, los, y, e, o, en, a, al, por, para y con', () => {
    expect(normalizeText('POLICIA DE INVESTIGACIONES DE CHILE')).toBe('Policia de Investigaciones de Chile');
    expect(normalizeText('SERVICIO DE SALUD DEL MAULE')).toBe('Servicio de Salud del Maule');
    expect(normalizeText('MINISTERIO DE VIVIENDA Y URBANISMO')).toBe('Ministerio de Vivienda y Urbanismo');
    expect(normalizeText('MINISTERIO DE LAS CULTURAS, LAS ARTES')).toBe('Ministerio de las Culturas, las Artes');
    expect(normalizeText('SUBSECRETARIA DE LA NIÑEZ')).toBe('Subsecretaria de la Niñez');
    expect(normalizeText('ARRIENDO DE EQUIPOS PARA LA UNIDAD DE APOYO A LA GESTION CON CHOFER POR MES EN TEMUCO')).toBe(
      'Arriendo de Equipos para la Unidad de Apoyo a la Gestion con Chofer por Mes en Temuco',
    );
    expect(normalizeText('ENTREGA AL HOSPITAL')).toBe('Entrega al Hospital');
    expect(normalizeText('ADQUISICION E INSTALACION DE INTERNET')).toBe('Adquisicion e Instalacion de Internet');
    expect(normalizeText('LAPICES O BOLIGRAFOS')).toBe('Lapices o Boligrafos');
  });

  it('la primera palabra va con mayúscula aunque sea una preposición', () => {
    expect(normalizeText('DE LA FUENTE CONSTRUCCIONES')).toBe('De la Fuente Construcciones');
    expect(normalizeText('LA CONSTRUCCION DEL PUENTE')).toBe('La Construccion del Puente');
  });

  it('conserva el artículo de una comuna o región que lo lleva', () => {
    expect(normalizeText('ILUSTRE MUNICIPALIDAD DE LAS CONDES')).toBe('Ilustre Municipalidad de Las Condes');
    expect(normalizeText('MUNICIPALIDAD DE LA FLORIDA')).toBe('Municipalidad de La Florida');
    expect(normalizeText('HOSPITAL DE LOS ANGELES')).toBe('Hospital de Los Angeles');
    expect(normalizeText('SERVICIO DE SALUD DE LOS RÍOS')).toBe('Servicio de Salud de Los Ríos');
    expect(normalizeText('REGIÓN DE LA ARAUCANÍA')).toBe('Región de La Araucanía');
    expect(normalizeText('I MUNICIPALIDAD DE PADRE LAS CASAS')).toBe('I Municipalidad de Padre Las Casas');
  });

  it('no inventa tildes ni toca lo que no es palabra', () => {
    expect(normalizeText('DIRECCION GENERAL DE OBRAS PUBLICAS')).toBe('Direccion General de Obras Publicas');
    expect(normalizeText('HOSPITAL (SERVIU)  DE PRUEBA')).toBe('Hospital (Serviu)  de Prueba');
  });

  it('siglas, romanos y abreviaturas en mayúscula', () => {
    expect(normalizeText('MINISTERIO DE OBRAS PUBLICAS DIREC CION GRAL DE OO PP DCYF')).toBe(
      'Ministerio de Obras Publicas Direccion Gral de OO PP DCYF',
    );
    expect(normalizeText('SERVICIO DE VIVIENDA Y URBANIZACION II REGION')).toBe(
      'Servicio de Vivienda y Urbanizacion II Region',
    );
    expect(normalizeText('METRO S.A.')).toBe('Metro S.A.');
    expect(normalizeText('Subsecretaría de R.R.E.E.')).toBe('Subsecretaría de R.R.E.E.');
    expect(normalizeText('I.MUNICIPALIDAD DE MACUL')).toBe('I.Municipalidad de Macul');
    expect(normalizeText('COMPLEJO ASISTENCIAL DR.VICTOR RIOS RUIZ')).toBe('Complejo Asistencial Dr.Victor Rios Ruiz');
    expect(normalizeText('CENTRO REFERENCIAL DE SALUD DR SALVADOR ALLENDE GOSSENS')).toBe(
      'Centro Referencial de Salud Dr Salvador Allende Gossens',
    );
    expect(normalizeText('COMANDO DE APOYO DE LAS FF.AA.')).toBe('Comando de Apoyo de las FF.AA.');
    expect(normalizeText('LIBERTADOR BERNARDO O\'HIGGINS')).toBe("Libertador Bernardo O'Higgins");
    expect(normalizeText('CONSTRUCTORA EJEMPLO SPA')).toBe('Constructora Ejemplo SpA');
    expect(normalizeText('TUBO PVC 110 MM')).toBe('Tubo PVC 110 MM');
  });

  it('las palabras con vocal siguen con mayúscula inicial, aunque sean cortas', () => {
    expect(normalizeText('SAMU BIO BIO')).toBe('Samu Bio Bio');
    expect(normalizeText('CORP MUNICIPAL DE LA SERENA')).toBe('Corp Municipal de La Serena');
    expect(normalizeText('VIVI MIX')).toBe('Vivi Mix');
  });

  it('vacío o ausente, cadena vacía', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('shortRegion', () => {
  it('quita «Región de» y deja el nombre con mayúscula inicial', () => {
    expect(shortRegion('REGIÓN DE VALPARAÍSO')).toBe('Valparaíso');
    expect(shortRegion('Región de Los Lagos')).toBe('Los Lagos');
    expect(shortRegion('REGIÓN DE LOS RÍOS')).toBe('Los Ríos');
    expect(shortRegion('REGIÓN DE LA ARAUCANÍA')).toBe('La Araucanía');
    expect(shortRegion('REGIÓN DE MAGALLANES Y DE LA ANTÁRTICA CHILENA')).toBe('Magallanes y de la Antártica Chilena');
    expect(shortRegion('REGIÓN DE ARICA Y PARINACOTA')).toBe('Arica y Parinacota');
  });

  it('las tres que se abrevian', () => {
    expect(shortRegion('REGIÓN METROPOLITANA DE SANTIAGO')).toBe('RM');
    expect(shortRegion("REGIÓN DEL LIBERTADOR GENERAL BERNARDO O'HIGGINS")).toBe("O'Higgins");
    expect(shortRegion('REGIÓN AYSÉN DEL GENERAL CARLOS IBÁÑEZ DEL CAMPO')).toBe('Aysén');
  });
});
