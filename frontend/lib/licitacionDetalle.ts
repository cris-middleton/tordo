/**
 * Normalización y formato del detalle de una licitación.
 *
 * `normalizeTenderDetail` existe porque la misma información llega con nombres
 * distintos según de dónde venga el registro (`informacion_adicional` es un
 * saco heterogéneo): se buscan varias claves posibles y se toma la primera con
 * valor.
 */

import type { TenderDetail } from '@/types/licitacionDetalle';
import { decimal } from '@/lib/formato';

export const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

export const buildLookup = (source?: Record<string, any> | null) => {
  const map = new Map<string, any>();
  if (!source) return map;
  Object.entries(source).forEach(([key, value]) => {
    map.set(normalizeKey(key), value);
  });
  return map;
};

export const getFirstValue = (lookups: Map<string, any>[], ...keys: string[]) => {
  for (const key of keys) {
    const normalized = normalizeKey(key);
    for (const lookup of lookups) {
      if (lookup.has(normalized)) {
        const value = lookup.get(normalized);
        if (value !== undefined && value !== null && value !== '') {
          return value;
        }
      }
    }
  }
  return undefined;
};

export const toNumber = (value: any) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') {
    return Number.isNaN(value) ? undefined : value;
  }
  const parsed = Number(String(value).replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const normalizeTenderDetail = (data: any): TenderDetail => {
  const detail: TenderDetail = { ...data };
  const lookups = [buildLookup(data), buildLookup(data?.informacion_adicional)];

  const fechaPublicacion = getFirstValue(
    lookups,
    'fecha_publicacion',
    'fechapublicacion',
    'fechapublicacionlicitacion',
    'fechapublicacionutc',
    'publicacion'
  );
  if (fechaPublicacion) detail.fecha_publicacion = fechaPublicacion;

  const fechaCierre = getFirstValue(
    lookups,
    'fecha_cierre',
    'fechacierre',
    'fechacierrepropuestas',
    'fechacierrelicitacion'
  );
  if (fechaCierre) detail.fecha_cierre = fechaCierre;

  const montoEstimado = toNumber(
    getFirstValue(lookups, 'monto_estimado', 'montorestimado', 'montoreferencial', 'montototal')
  );
  if (montoEstimado !== undefined) detail.monto_estimado = montoEstimado;

  const moneda = getFirstValue(lookups, 'moneda', 'tipomoneda', 'monedaoferta');
  if (moneda) detail.moneda = moneda;

  const categoria = getFirstValue(
    lookups,
    'categoria',
    'categorianombre',
    'categoriaobjetocontratacion',
    'rubros',
    'rubrosprincipal'
  );
  if (categoria) detail.categoria = categoria;

  const tipoLicitacion = getFirstValue(
    lookups,
    'tipo_licitacion',
    'tipolicitacion',
    'modalidad',
    'tipo'
  );
  if (tipoLicitacion) detail.tipo_licitacion = tipoLicitacion;

  const region = getFirstValue(lookups, 'region', 'regiongeografica');
  if (region) detail.region = region;

  const comuna = getFirstValue(lookups, 'comuna', 'comunageografica');
  if (comuna) detail.comuna = comuna;

  const nombreOrganismo = getFirstValue(
    lookups,
    'nombre_organismo',
    'nombreorganismo',
    'organismonombre'
  );
  if (nombreOrganismo) detail.nombre_organismo = nombreOrganismo;

  const codigoOrganismo = getFirstValue(lookups, 'codigo_organismo', 'codigoorganismo');
  if (codigoOrganismo) detail.codigo_organismo = codigoOrganismo;

  const urlLicitacion = getFirstValue(
    lookups,
    'url_licitacion',
    'urllicitacion',
    'urldetalle',
    'url'
  );
  if (urlLicitacion) detail.url_licitacion = urlLicitacion;

  return detail;
};

export const fmtCLP = (n?: number) => {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(n);
};

export const fmtPct = (n?: number) =>
  n == null ? '—' : `${decimal(n * 100, 1)}%`;

export const fmtDays = (n?: number) =>
  n == null ? '—' : `${n} días`;
