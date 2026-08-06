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
  BadgeCheck,
} from 'lucide-react';
import { format } from 'date-fns';

interface OrderDetail {
  id: number;
  codigo_oc: string;
  nombre: string;
  descripcion?: string;
  fecha_publicacion?: string;
  fecha_emision?: string;
  fecha_aceptacion?: string;
  fecha_entrega?: string;
  fecha_estimada_entrega?: string;
  monto_total?: number;
  monto_neto?: number;
  monto_iva?: number;
  moneda?: string;
  estado?: string;
  estado_proveedor?: string;
  region?: string;
  comuna?: string;
  nombre_organismo?: string;
  nombre_proveedor?: string;
  codigo_organismo?: string;
  codigo_proveedor?: string;
  url_detalle?: string;
  url_oc?: string;
  categoria?: string;
  rubro?: string;
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

const normalizeOrderDetail = (data: any): OrderDetail => {
  const detail: OrderDetail = { ...data };
  const lookups = [buildLookup(data), buildLookup(data?.informacion_adicional)];

  const fechaPublicacion = getFirstValue(
    lookups,
    'fecha_publicacion',
    'fechapublicacion',
    'fechaoc',
    'fechaorden',
    'fechaemision'
  );
  if (fechaPublicacion) detail.fecha_publicacion = fechaPublicacion;

  const fechaEmision = getFirstValue(
    lookups,
    'fecha_emision',
    'fechaemision',
    'fechaaceptacion',
    'fechacreacion',
    'fechaordencompra'
  );
  if (fechaEmision) detail.fecha_emision = fechaEmision;

  const fechaAceptacion = getFirstValue(lookups, 'fecha_aceptacion', 'fechaaceptacion');
  if (fechaAceptacion) detail.fecha_aceptacion = fechaAceptacion;

  const fechaEntrega = getFirstValue(lookups, 'fecha_entrega', 'fechaentrega');
  if (fechaEntrega) detail.fecha_entrega = fechaEntrega;

  const fechaEstimadaEntrega = getFirstValue(
    lookups,
    'fecha_estimada_entrega',
    'fechaestimadaentrega'
  );
  if (fechaEstimadaEntrega) detail.fecha_estimada_entrega = fechaEstimadaEntrega;

  const montoTotal = toNumber(getFirstValue(lookups, 'monto_total', 'montototal', 'montooriginal'));
  if (montoTotal !== undefined) detail.monto_total = montoTotal;

  const montoNeto = toNumber(getFirstValue(lookups, 'monto_neto', 'montoneto'));
  if (montoNeto !== undefined) detail.monto_neto = montoNeto;

  const montoIva = toNumber(getFirstValue(lookups, 'monto_iva', 'montoiva', 'iva'));
  if (montoIva !== undefined) detail.monto_iva = montoIva;

  const moneda = getFirstValue(lookups, 'moneda', 'divisa', 'tipomoneda');
  if (moneda) detail.moneda = moneda;

  const estado = getFirstValue(lookups, 'estado', 'estadopublicacion', 'estadooc');
  if (estado) detail.estado = estado;

  const estadoProveedor = getFirstValue(lookups, 'estado_proveedor', 'estadoproveedor');
  if (estadoProveedor) detail.estado_proveedor = estadoProveedor;

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

  const nombreProveedor = getFirstValue(
    lookups,
    'nombre_proveedor',
    'nombreproveedor',
    'proveedornombre'
  );
  if (nombreProveedor) detail.nombre_proveedor = nombreProveedor;

  const codigoProveedor = getFirstValue(lookups, 'codigo_proveedor', 'codigoproveedor');
  if (codigoProveedor) detail.codigo_proveedor = codigoProveedor;

  const categoria = getFirstValue(lookups, 'categoria', 'categorianombre', 'categoriaoc');
  if (categoria) detail.categoria = categoria;

  const rubro = getFirstValue(lookups, 'rubro', 'rubros', 'rubropartida');
  if (rubro) detail.rubro = rubro;

  const urlDetalle = getFirstValue(lookups, 'url_detalle', 'urldetalle', 'url_oc', 'urloc', 'link');
  if (urlDetalle) detail.url_detalle = urlDetalle;

  const urlOc = getFirstValue(lookups, 'url_oc', 'urloc', 'link');
  if (urlOc) detail.url_oc = urlOc;

  return detail;
};

export default function OrderDetailPage({ params }: PageParams) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [biPrecio, setBiPrecio] = useState<{
    p10: number; p25: number; p50: number; p75: number; p90: number;
    n_obs: number; confianza: string;
  } | null>(null);
  const [biLoading, setBiLoading] = useState(false);

  useEffect(() => {
    const loadOrder = async () => {
      const codigo = decodeURIComponent(params.codigo);
      try {
        const response = await apiClient.getOrders({
          codigo_oc: codigo,
          limit: 1,
        });
        const item = Array.isArray(response.data) ? response.data[0] : null;
        if (!item) {
          throw new Error('Orden no encontrada');
        }
        setOrder(item);
      } catch (err) {
        console.error('Error loading order detail:', err);
        setError('No pudimos cargar la información de la orden seleccionada.');
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [params.codigo]);

  useEffect(() => {
    if (!order) return;
    const rubro = order.rubro || order.categoria;
    if (!rubro) return;
    let active = true;
    setBiLoading(true);
    apiClient.getBIPrecio(rubro)
      .then((data: any) => { if (active) setBiPrecio(data); })
      .catch(() => { if (active) setBiPrecio(null); })
      .finally(() => { if (active) setBiLoading(false); });
    return () => { active = false; };
  }, [order]);

  const formatCurrency = (amount?: number, currency: string = 'CLP') => {
    if (amount === undefined || amount === null || Number.isNaN(amount)) {
      return 'N/A';
    }

    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const orderData = useMemo(() => {
    if (!order) return null;
    return normalizeOrderDetail(order);
  }, [order]);

  const orderCurrency =
    orderData?.moneda && typeof orderData.moneda === 'string' && orderData.moneda.length
      ? orderData.moneda
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
        <h1 className="page-title">
          Detalle Orden de Compra
        </h1>
      </div>

      {loading ? (
        <div className="card flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="card border border-destructive/40 bg-destructive/5 p-6 text-destructive">
          {error}
        </div>
      ) : !orderData ? (
        <div className="card p-6 text-muted">No se encontró la orden solicitada.</div>
      ) : (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-muted">Código orden de compra</p>
                <h2 className="text-2xl font-semibold text-text">{orderData.codigo_oc}</h2>
              </div>
              {(() => {
                const detailUrl = orderData.url_detalle || orderData.url_oc;
                if (!detailUrl) return null;
                return (
                  <Link
                    href={detailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary flex items-center gap-2 sm:w-auto w-full justify-center"
                  >
                    <BadgeCheck className="h-4 w-4" />
                    Ver en Mercado Público
                  </Link>
                );
              })()}
            </div>

            <div>
              <p className="text-sm text-muted">Nombre</p>
              <p className="text-lg font-medium text-text">{orderData.nombre}</p>
            </div>

            {orderData.descripcion && (
              <div>
                <p className="text-sm text-muted">Descripción</p>
                <p className="text-sm leading-6 text-text">{orderData.descripcion}</p>
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
                  {orderData.fecha_publicacion
                    ? format(new Date(orderData.fecha_publicacion), 'dd MMM yyyy')
                    : 'Sin información'}
                </p>
                {orderData.fecha_emision && (
                  <p>
                    <span className="font-medium text-text">Emisión: </span>
                    {format(new Date(orderData.fecha_emision), 'dd MMM yyyy')}
                  </p>
                )}
                {orderData.fecha_aceptacion && (
                  <p>
                    <span className="font-medium text-text">Aceptación: </span>
                    {format(new Date(orderData.fecha_aceptacion), 'dd MMM yyyy')}
                  </p>
                )}
                {orderData.fecha_entrega && (
                  <p>
                    <span className="font-medium text-text">Entrega: </span>
                    {format(new Date(orderData.fecha_entrega), 'dd MMM yyyy')}
                  </p>
                )}
                {orderData.fecha_estimada_entrega && (
                  <p>
                    <span className="font-medium text-text">Entrega estimada: </span>
                    {format(new Date(orderData.fecha_estimada_entrega), 'dd MMM yyyy')}
                  </p>
                )}
              </div>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <DollarSign className="h-4 w-4 text-primary" />
                Financiero
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Monto total: </span>
                  {formatCurrency(orderData.monto_total, orderCurrency)}
                </p>
                {orderData.monto_neto !== undefined && (
                  <p>
                    <span className="font-medium text-text">Monto neto: </span>
                    {formatCurrency(orderData.monto_neto, orderCurrency)}
                  </p>
                )}
                {orderData.monto_iva !== undefined && (
                  <p>
                    <span className="font-medium text-text">IVA: </span>
                    {formatCurrency(orderData.monto_iva, orderCurrency)}
                  </p>
                )}
                {orderData.categoria && (
                  <p>
                    <span className="font-medium text-text">Categoría: </span>
                    {orderData.categoria}
                  </p>
                )}
                {orderData.rubro && (
                  <p>
                    <span className="font-medium text-text">Rubro: </span>
                    {orderData.rubro}
                  </p>
                )}
                <p>
                  <span className="font-medium text-text">Estado: </span>
                  {orderData.estado || 'Sin información'}
                </p>
                {orderData.estado_proveedor && (
                  <p>
                    <span className="font-medium text-text">Estado proveedor: </span>
                    {orderData.estado_proveedor}
                  </p>
                )}
              </div>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <MapPin className="h-4 w-4 text-primaryDark" />
                Ubicación y actores
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Región: </span>
                  {orderData.region || 'Sin información'}
                </p>
                <p>
                  <span className="font-medium text-text">Comuna: </span>
                  {orderData.comuna || 'Sin información'}
                </p>
                {orderData.nombre_organismo && (
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-1 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted">Organismo público</p>
                      <p className="text-sm text-text">{orderData.nombre_organismo}</p>
                      {orderData.codigo_organismo && (
                        <p className="text-xs text-muted">Código: {orderData.codigo_organismo}</p>
                      )}
                    </div>
                  </div>
                )}
                {orderData.nombre_proveedor && (
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-1 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted">Proveedor</p>
                      <p className="text-sm text-text">{orderData.nombre_proveedor}</p>
                      {orderData.codigo_proveedor && (
                        <p className="text-xs text-muted">Código: {orderData.codigo_proveedor}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BI: Price Benchmark */}
          <div className="mt-6">
            <h2 className="text-base font-semibold text-text mb-3">Análisis de Mercado</h2>
            {biLoading && (
              <div className="animate-pulse bg-border rounded-xl h-32" />
            )}
            {!biLoading && biPrecio && (
              <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
                <h3 className="text-sm font-semibold text-text mb-3">Benchmarking de Precios</h3>
                <div className="grid grid-cols-5 gap-2 text-center mb-3">
                  {[
                    { label: 'P10', value: biPrecio.p10 },
                    { label: 'P25', value: biPrecio.p25 },
                    { label: 'P50', value: biPrecio.p50 },
                    { label: 'P75', value: biPrecio.p75 },
                    { label: 'P90', value: biPrecio.p90 },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-background rounded-lg py-2 px-1">
                      <p className="text-xs text-muted">{label}</p>
                      <p className="text-sm font-bold text-text">
                        {new Intl.NumberFormat('es-CL', {
                          style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
                        }).format(value)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>{biPrecio.n_obs} transacciones comparables</span>
                  <span className={`font-medium ${
                    biPrecio.confianza === 'alta' ? 'text-accent'
                      : biPrecio.confianza === 'media' ? 'text-gold'
                      : 'text-muted'
                  }`}>
                    Confianza: {biPrecio.confianza}
                  </span>
                </div>
                {orderData?.monto_total && biPrecio.p50 > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted">
                      Este monto ({new Intl.NumberFormat('es-CL', {
                        style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
                      }).format(orderData.monto_total)}) está{' '}
                      <span className={`font-semibold ${
                        orderData.monto_total <= biPrecio.p50 ? 'text-accent' : orderData.monto_total <= biPrecio.p75 ? 'text-gold' : 'text-danger'
                      }`}>
                        {orderData.monto_total <= biPrecio.p25
                          ? 'por debajo del P25 — precio muy competitivo'
                          : orderData.monto_total <= biPrecio.p50
                          ? 'bajo la mediana — buen precio'
                          : orderData.monto_total <= biPrecio.p75
                          ? 'sobre la mediana — precio moderado'
                          : 'sobre el P75 — precio alto'}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )}
            {!biLoading && !biPrecio && (
              <p className="text-sm text-muted italic bg-background rounded-xl px-4 py-3">
                Benchmark de precios no disponible para esta orden.
              </p>
            )}
          </div>

          <div className="card space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text">
              <Info className="h-4 w-4 text-primary" />
              Información adicional
            </div>
            <div className="grid grid-cols-1 gap-4 text-sm text-muted sm:grid-cols-2">
              <div>
                <p className="font-medium text-text">Estado</p>
                <p>{orderData.estado || 'Sin información'}</p>
              </div>
              <div>
                <p className="font-medium text-text">ID interno</p>
                <p>{orderData.id}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
