'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import {
  FileText,
  Bell,
  Bookmark,
  Send,
  DollarSign,
  Trash2,
  ClipboardList,
  FolderOpen,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDashboardCollections } from '@/hooks/useDashboardCollections';
import { TopOpportunities } from '@/components/TopOpportunities';
import { MiniTrendChart } from '@/components/MiniTrendChart';
import { MiniActivityBars } from '@/components/MiniActivityBars';
import { DataFreshnessBar } from '@/components/DataFreshnessBar';

interface DashboardStats {
  licitaciones_activas: number;
  ordenes_activas: number;
  alertas_no_leidas: number;
  postulaciones_activas: number;
  documentos_por_vencer: number;
  tiene_empresa: boolean;
}

const kpiConfig = [
  {
    key: 'licitaciones_activas' as const,
    title: 'Licitaciones publicadas',
    icon: FileText,
    href: '/dashboard/tenders',
    accentClass: 'kpi-card-blue',
    iconBg: 'bg-info/10',
    iconColor: 'text-info',
    urgentKey: null,
  },
  {
    key: 'ordenes_activas' as const,
    title: 'Órdenes en proceso',
    icon: DollarSign,
    href: '/dashboard/orders',
    accentClass: 'kpi-card-green',
    iconBg: 'bg-accent/10',
    iconColor: 'text-accent',
    urgentKey: null,
  },
  {
    key: 'alertas_no_leidas' as const,
    title: 'Alertas sin leer',
    icon: Bell,
    href: '/dashboard/alerts',
    accentClass: 'kpi-card-gold',
    iconBg: 'bg-gold/10',
    iconColor: 'text-gold',
    urgentKey: 'alertas_no_leidas' as const,
  },
  {
    key: 'postulaciones_activas' as const,
    title: 'Postulaciones activas',
    icon: ClipboardList,
    href: '/dashboard/postulaciones',
    accentClass: 'kpi-card-blue',
    iconBg: 'bg-info/10',
    iconColor: 'text-info',
    urgentKey: null,
  },
  {
    key: 'documentos_por_vencer' as const,
    title: 'Docs por vencer (30d)',
    icon: FolderOpen,
    href: '/dashboard/documentos',
    accentClass: 'kpi-card-danger',
    iconBg: 'bg-danger/10',
    iconColor: 'text-danger',
    urgentKey: 'documentos_por_vencer' as const,
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    licitaciones_activas: 0,
    ordenes_activas: 0,
    alertas_no_leidas: 0,
    postulaciones_activas: 0,
    documentos_por_vencer: 0,
    tiene_empresa: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topOrganism, setTopOrganism] = useState<string | null>(null);
  const [biLastUpdated, setBiLastUpdated] = useState<string | null>(null);
  const [estadoHabil, setEstadoHabil] = useState<{
    estado_habil: string
    rut_empresa: string
    estado_habil_updated_at: string | null
  } | null>(null);
  const { collections, counts, hydrated, toggleTender, toggleOrder } = useDashboardCollections();

  const normalizeText = (text: string | undefined): string => {
    if (!text) return '';
    return text
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const formatCurrency = (amount?: number, currency: string = 'CLP') => {
    if (typeof amount !== 'number') return '';
    if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
  };

  useEffect(() => {
    apiClient.getDashboardStats()
      .then(setStats)
      .catch(() => {
        setError('No se pudo cargar el dashboard. Por favor recarga la página.');
      })
      .finally(() => setLoading(false));

    apiClient.getEmpresas().then((empresas: any) => {
      const list = Array.isArray(empresas) ? empresas : [];
      if (list.length > 0) {
        apiClient.getEstadoHabil(list[0].id)
          .then((data: any) => setEstadoHabil(data))
          .catch(() => {});
      }
    });

    apiClient.getBIOportunidades({ min_score: 0, limit: 1 })
      .then((res: any) => {
        if (res.disponible !== false && res.oportunidades?.length > 0) {
          const top = res.oportunidades[0];
          setTopOrganism(top.CodigoOrganismoPublico ?? null);
        }
        if (res.last_updated) setBiLastUpdated(res.last_updated);
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="space-y-2">
          <div className="h-8 w-52 bg-border rounded-lg" />
          <div className="h-4 w-40 bg-border/60 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-surface border border-border shadow-card" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-surface border border-border shadow-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <DataFreshnessBar lastUpdated={biLastUpdated} />

      {error && (
        <div className="alert-error">
          <span>{error}</span>
        </div>
      )}

      {/* Page header */}
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted capitalize">
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* Onboarding nudge */}
      {!stats.tiene_empresa && (
        <div className="alert-warning animate-slide-up">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Aún no tienes una empresa registrada.{' '}
            <button
              onClick={() => router.push('/onboarding')}
              className="font-semibold underline underline-offset-2"
            >
              Completa el onboarding
            </button>{' '}
            para activar estado hábil, documentos y postulaciones.
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {kpiConfig.map((cfg, idx) => {
          const Icon = cfg.icon;
          const value = stats[cfg.key];
          const isUrgent = cfg.urgentKey ? stats[cfg.urgentKey] > 0 : false;
          return (
            <button
              key={cfg.key}
              onClick={() => router.push(cfg.href)}
              style={{ animationDelay: `${idx * 60}ms` }}
              className={`kpi-card ${cfg.accentClass} text-left group animate-slide-up w-full`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`rounded-lg p-2.5 ${isUrgent ? 'bg-danger/10' : cfg.iconBg} transition-transform group-hover:scale-110`}>
                  <Icon size={18} className={isUrgent ? 'text-danger' : cfg.iconColor} strokeWidth={2} />
                </div>
                <ArrowRight size={14} className="text-subtle opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">
                {cfg.title}
              </p>
              <p className={`font-display text-2xl font-bold leading-none ${isUrgent ? 'text-danger' : 'text-text'}`}>
                {value.toLocaleString()}
              </p>
            </button>
          );
        })}
      </div>

      {/* Estado Hábil Banner */}
      {estadoHabil && (
        <div className={`rounded-xl border p-4 ${
          estadoHabil.estado_habil === 'habil'
            ? 'bg-accent/8 border-accent/20'
            : estadoHabil.estado_habil === 'inhabil'
            ? 'bg-danger/8 border-danger/20'
            : 'bg-surface border-border'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                estadoHabil.estado_habil === 'habil' ? 'bg-accent/15' : 'bg-danger/15'
              }`}>
                <svg className={`w-4.5 h-4.5 ${
                  estadoHabil.estado_habil === 'habil' ? 'text-accent' : 'text-danger'
                }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {estadoHabil.estado_habil === 'habil' ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  )}
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-text">
                  Estado Hábil:{' '}
                  <span className={estadoHabil.estado_habil === 'habil' ? 'text-accent' : 'text-danger'}>
                    {estadoHabil.estado_habil === 'habil' ? 'Hábil' : estadoHabil.estado_habil === 'inhabil' ? 'Inhábil' : estadoHabil.estado_habil}
                  </span>
                </p>
                <p className="text-xs text-muted">
                  RUT {estadoHabil.rut_empresa}
                  {estadoHabil.estado_habil_updated_at && (
                    <> · Actualizado {new Date(estadoHabil.estado_habil_updated_at).toLocaleDateString('es-CL')}</>
                  )}
                </p>
              </div>
            </div>
            <a href="/dashboard/documentos" className="text-xs text-primary hover:underline">
              Ver documentos →
            </a>
          </div>
        </div>
      )}

      {/* Collections — compact table */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CompactCollection
          title="Licitaciones"
          savedItems={collections.tenders.saved}
          appliedItems={collections.tenders.applied}
          hydrated={hydrated}
          onRemove={(item, type) => toggleTender(type, item)}
          getHref={(item) => item.codigo_externo ? `/dashboard/tenders/${encodeURIComponent(item.codigo_externo)}` : '#'}
          getName={(item) => normalizeText(item.nombre)}
          getDetail={(item) => formatCurrency(item.monto_estimado)}
          getCode={(item) => item.codigo_externo}
        />
        <CompactCollection
          title="Órdenes de Compra"
          savedItems={collections.orders.saved}
          appliedItems={collections.orders.applied}
          hydrated={hydrated}
          onRemove={(item, type) => toggleOrder(type, item)}
          getHref={(item) => `/dashboard/orders/${encodeURIComponent(item.codigo_oc)}`}
          getName={(item) => normalizeText(item.nombre)}
          getDetail={(item) => formatCurrency(item.monto_total, item.moneda || 'CLP')}
          getCode={(item) => item.codigo_oc}
        />
      </div>

      {/* Top BI Opportunities */}
      <TopOpportunities />

      {/* BI Mini Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MiniTrendChart />
        <MiniActivityBars organismoId={topOrganism} />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Compact Collection — tab-based, always visible
────────────────────────────────────────────── */
function CompactCollection({
  title,
  savedItems,
  appliedItems,
  hydrated,
  onRemove,
  getHref,
  getName,
  getDetail,
  getCode,
}: {
  title: string;
  savedItems: any[];
  appliedItems: any[];
  hydrated: boolean;
  onRemove: (item: any, type: 'saved' | 'applied') => void;
  getHref: (item: any) => string;
  getName: (item: any) => string;
  getDetail: (item: any) => string;
  getCode: (item: any) => string;
}) {
  const [tab, setTab] = useState<'saved' | 'applied'>('saved');
  const items = tab === 'saved' ? savedItems : appliedItems;

  return (
    <div className="card p-0 overflow-hidden">
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-0">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
      </div>
      <div className="flex gap-0 px-4 mt-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab('saved')}
          className={`flex items-center gap-1.5 px-3 pb-2.5 text-xs font-medium border-b-2 transition-colors ${
            tab === 'saved'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-text'
          }`}
        >
          <Bookmark size={12} />
          Guardadas
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
            tab === 'saved' ? 'bg-primary/10 text-primary' : 'bg-border text-muted'
          }`}>
            {savedItems.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab('applied')}
          className={`flex items-center gap-1.5 px-3 pb-2.5 text-xs font-medium border-b-2 transition-colors ${
            tab === 'applied'
              ? 'border-accent text-accent'
              : 'border-transparent text-muted hover:text-text'
          }`}
        >
          <Send size={12} />
          Aplicadas
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
            tab === 'applied' ? 'bg-accent/10 text-accent' : 'bg-border text-muted'
          }`}>
            {appliedItems.length}
          </span>
        </button>
      </div>

      {/* Items */}
      <div className="max-h-64 overflow-y-auto scrollbar-thin">
        {!hydrated ? (
          <div className="px-4 py-6 text-center text-xs text-muted">Cargando...</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-muted">
              {tab === 'saved' ? 'Sin items guardados' : 'Sin items aplicados'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item: any, i: number) => (
              <div
                key={item.id || i}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-primary/3 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <Link
                    href={getHref(item)}
                    className="text-sm font-medium text-text truncate block hover:text-primary transition-colors leading-snug"
                  >
                    {getName(item)}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-subtle">{getCode(item)}</span>
                    {getDetail(item) && (
                      <>
                        <span className="text-[11px] text-subtle">·</span>
                        <span className="text-[11px] font-medium text-muted">{getDetail(item)}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item, tab)}
                  className="shrink-0 rounded-md p-1 text-subtle opacity-0 group-hover:opacity-100 hover:bg-danger/10 hover:text-danger transition-all"
                  title="Quitar"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
