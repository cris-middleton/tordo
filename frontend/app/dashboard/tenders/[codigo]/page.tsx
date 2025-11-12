'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import {
  ArrowLeft,
  Loader2,
  Calendar,
  DollarSign,
  MapPin,
  Building2,
  Info,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';

interface TenderDetail {
  id: number;
  codigo_externo: string;
  nombre: string;
  descripcion?: string;
  fecha_publicacion?: string;
  fecha_cierre?: string;
  monto_estimado?: number;
  estado?: string;
  region?: string;
  comuna?: string;
  nombre_organismo?: string;
  url_licitacion?: string;
  categoria?: string;
  tipo_licitacion?: string;
  dias_publicacion?: number;
  dias_cierre?: number;
  moneda?: string;
  codigo_organismo?: string;
  informacion_adicional?: Record<string, any>;
}

interface PageParams {
  params: { codigo: string };
}

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const buildLookup = (source?: Record<string, any> | null) => {
  const map = new Map<string, any>();
  if (!source) return map;
  Object.entries(source).forEach(([key, value]) => {
    map.set(normalizeKey(key), value);
  });
  return map;
};

const getFirstValue = (lookups: Map<string, any>[], ...keys: string[]) => {
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

const toNumber = (value: any) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') {
    return Number.isNaN(value) ? undefined : value;
  }

  const parsed = Number(String(value).replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isNaN(parsed) ? undefined : parsed;
};

const normalizeTenderDetail = (data: any): TenderDetail => {
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

export default function TenderDetailPage({ params }: PageParams) {
  const router = useRouter();
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTender = async () => {
      const codigo = decodeURIComponent(params.codigo);
      try {
        const response = await apiClient.getTenderByCode(codigo);
        setTender(response);
      } catch (err) {
        console.error('Error loading tender detail:', err);
        setError('No pudimos cargar la información de la licitación seleccionada.');
      } finally {
        setLoading(false);
      }
    };

    loadTender();
  }, [params.codigo]);

  const formatCurrency = (amount?: number, currency: string = 'CLP') => {
    if (amount === undefined || amount === null || Number.isNaN(amount)) return 'N/A';
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const tenderData = useMemo(() => {
    if (!tender) return null;
    return normalizeTenderDetail(tender);
  }, [tender]);

  const tenderCurrency =
    tenderData?.moneda && typeof tenderData.moneda === 'string' && tenderData.moneda.length
      ? tenderData.moneda
      : 'CLP';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="btn-secondary flex items-center gap-2"
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <h1 className="text-2xl font-semibold text-text sm:text-3xl">Detalle Licitación</h1>
      </div>

      {loading ? (
        <div className="card flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="card border border-destructive/40 bg-destructive/5 p-6 text-destructive">
          {error}
        </div>
      ) : !tenderData ? (
        <div className="card p-6 text-muted">No se encontró la licitación solicitada.</div>
      ) : (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-muted">Código externo</p>
                <h2 className="text-2xl font-semibold text-text">{tenderData.codigo_externo}</h2>
              </div>
              {tenderData.url_licitacion && (
                <Link
                  href={tenderData.url_licitacion}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary flex items-center gap-2 sm:w-auto w-full justify-center"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir en Mercado Público
                </Link>
              )}
            </div>

            <div>
              <p className="text-sm text-muted">Nombre</p>
              <p className="text-lg font-medium text-text">{tenderData.nombre}</p>
            </div>

            {tenderData.descripcion && (
              <div>
                <p className="text-sm text-muted">Descripción</p>
                <p className="text-sm leading-6 text-text">{tenderData.descripcion}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <Calendar className="h-4 w-4 text-primary" />
                Fechas
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Publicación: </span>
                  {tenderData.fecha_publicacion
                    ? format(new Date(tenderData.fecha_publicacion), 'dd MMM yyyy')
                    : 'Sin información'}
                </p>
                <p>
                  <span className="font-medium text-text">Cierre: </span>
                  {tenderData.fecha_cierre
                    ? format(new Date(tenderData.fecha_cierre), 'dd MMM yyyy')
                    : 'Sin información'}
                </p>
                {typeof tenderData.dias_publicacion === 'number' && (
                  <p>
                    <span className="font-medium text-text">Días publicada: </span>
                    {tenderData.dias_publicacion}
                  </p>
                )}
                {typeof tenderData.dias_cierre === 'number' && (
                  <p>
                    <span className="font-medium text-text">Días hasta cierre: </span>
                    {tenderData.dias_cierre}
                  </p>
                )}
              </div>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <DollarSign className="h-4 w-4 text-accent" />
                Monto y clasificación
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Monto estimado: </span>
                  {formatCurrency(tenderData.monto_estimado, tenderCurrency)}
                </p>
                {tenderData.categoria && (
                  <p>
                    <span className="font-medium text-text">Categoría: </span>
                    {tenderData.categoria}
                  </p>
                )}
                {tenderData.tipo_licitacion && (
                  <p>
                    <span className="font-medium text-text">Tipo: </span>
                    {tenderData.tipo_licitacion}
                  </p>
                )}
                {tenderData.moneda && (
                  <p>
                    <span className="font-medium text-text">Moneda: </span>
                    {tenderData.moneda}
                  </p>
                )}
              </div>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <MapPin className="h-4 w-4 text-primaryDark" />
                Ubicación y organismo
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Región: </span>
                  {tenderData.region || 'Sin información'}
                </p>
                <p>
                  <span className="font-medium text-text">Comuna: </span>
                  {tenderData.comuna || 'Sin información'}
                </p>
                {tenderData.nombre_organismo && (
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-1 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted">Organismo público</p>
                      <p className="text-sm text-text">{tenderData.nombre_organismo}</p>
                      {tenderData.codigo_organismo && (
                        <p className="text-xs text-muted">Código: {tenderData.codigo_organismo}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text">
              <Info className="h-4 w-4 text-primary" />
              Información adicional
            </div>
            <div className="grid grid-cols-1 gap-4 text-sm text-muted sm:grid-cols-2">
              <div>
                <p className="font-medium text-text">Estado</p>
                <p>{tenderData.estado || 'Sin información'}</p>
              </div>
              <div>
                <p className="font-medium text-text">ID interno</p>
                <p>{tenderData.id}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


