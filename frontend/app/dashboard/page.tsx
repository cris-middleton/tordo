'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import {
  FileText,
  Bell,
  Bookmark,
  Send,
  Calendar,
  DollarSign,
  MapPin,
  Building2,
  Trash2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FolderOpen,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Star,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDashboardCollections } from '@/hooks/useDashboardCollections';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
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
  const [topScore, setTopScore] = useState<number | null>(null);
  const [topOrganism, setTopOrganism] = useState<string | null>(null);
  const [biLastUpdated, setBiLastUpdated] = useState<string | null>(null);
  const [estadoHabil, setEstadoHabil] = useState<{
    estado_habil: string
    rut_empresa: string
    estado_habil_updated_at: string | null
  } | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    tenders: { saved: false, applied: false },
    orders: { saved: false, applied: false },
  });
  const { collections, counts, hydrated, toggleTender, toggleOrder } = useDashboardCollections();

  const savedChartData = useMemo(
    () => [
      { name: 'Licitaciones', value: counts.tenders.saved },
      { name: 'Órdenes', value: counts.orders.saved },
    ],
    [counts],
  );

  const appliedChartData = useMemo(
    () => [
      { name: 'Licitaciones', value: counts.tenders.applied },
      { name: 'Órdenes', value: counts.orders.applied },
    ],
    [counts],
  );

  const normalizeText = (text: string | undefined): string => {
    if (!text) return '';
    return text
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const formatStoredDate = (iso: string) => {
    try {
      return format(new Date(iso), 'dd MMM yyyy HH:mm', { locale: es });
    } catch {
      return '';
    }
  };

  const formatCurrency = (amount?: number, currency: string = 'CLP') => {
    if (typeof amount !== 'number') return 'N/A';
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
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

    // TODO: migrar a React Query
    apiClient.getBIOportunidades({ min_score: 0, limit: 1 })
      .then((res: any) => {
        if (res.disponible !== false && res.oportunidades?.length > 0) {
          const top = res.oportunidades[0];
          setTopScore(top.opportunity_score ?? null);
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-surface border border-border shadow-card" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-surface border border-border shadow-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* ── Data freshness warning ── */}
      <DataFreshnessBar lastUpdated={biLastUpdated} />

      {error && (
        <div className="alert-error">
          <span>{error}</span>
        </div>
      )}

      {/* Page header */}
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="mt-1 text-sm text-muted capitalize">
          {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
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

      {/* ── KPI Cards ── */}
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
                  <Icon
                    size={18}
                    className={isUrgent ? 'text-danger' : cfg.iconColor}
                    strokeWidth={2}
                  />
                </div>
                <ArrowRight size={14} className="text-subtle opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">
                {cfg.title}
              </p>
              <p className={`font-display text-3xl font-bold leading-none ${isUrgent ? 'text-danger' : 'text-text'}`}>
                {value}
              </p>
            </button>
          );
        })}

      </div>

      {/* ── Estado Hábil Banner ── */}
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

      {/* ── Collections ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Órdenes de Compra */}
        <CollectionCard
          title="Órdenes de Compra"
          savedCount={counts.orders.saved}
          appliedCount={counts.orders.applied}
          savedItems={collections.orders.saved}
          appliedItems={collections.orders.applied}
          hydrated={hydrated}
          expandedSaved={expandedSections.orders.saved}
          expandedApplied={expandedSections.orders.applied}
          onToggleSaved={() =>
            setExpandedSections((prev) => ({
              ...prev,
              orders: { ...prev.orders, saved: !prev.orders.saved },
            }))
          }
          onToggleApplied={() =>
            setExpandedSections((prev) => ({
              ...prev,
              orders: { ...prev.orders, applied: !prev.orders.applied },
            }))
          }
          onRemoveSaved={(item) => toggleOrder('saved', item)}
          onRemoveApplied={(item) => toggleOrder('applied', item)}
          renderItem={(item, type) => (
            <div className="rounded-lg border border-border bg-background p-3 transition-all hover:border-primary/25 hover:shadow-card-md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/dashboard/orders/${encodeURIComponent(item.codigo_oc)}`}
                    className={`text-sm font-semibold hover:underline underline-offset-2 transition-colors ${type === 'applied' ? 'text-accent' : 'text-primary'}`}
                  >
                    {normalizeText(item.nombre)}
                  </Link>
                  <p className="text-xs text-subtle mt-0.5">Código OC: {item.codigo_oc}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1.5 text-subtle hover:bg-danger/10 hover:text-danger transition-colors"
                  onClick={() => type === 'saved' ? toggleOrder('saved', item) : toggleOrder('applied', item)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted">
                {item.region && (
                  <span className="flex items-center gap-1">
                    <MapPin size={11} />{normalizeText(item.region)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <DollarSign size={11} />{formatCurrency(item.monto_total, item.moneda || 'CLP')}
                </span>
                {item.nombre_proveedor && (
                  <span className="flex items-center gap-1">
                    <Building2 size={11} />{normalizeText(item.nombre_proveedor)}
                  </span>
                )}
                <span className="flex items-center gap-1 text-subtle">
                  <Calendar size={11} />{formatStoredDate(item.storedAt)}
                </span>
              </div>
            </div>
          )}
        />

        {/* Licitaciones */}
        <CollectionCard
          title="Licitaciones"
          savedCount={counts.tenders.saved}
          appliedCount={counts.tenders.applied}
          savedItems={collections.tenders.saved}
          appliedItems={collections.tenders.applied}
          hydrated={hydrated}
          expandedSaved={expandedSections.tenders.saved}
          expandedApplied={expandedSections.tenders.applied}
          onToggleSaved={() =>
            setExpandedSections((prev) => ({
              ...prev,
              tenders: { ...prev.tenders, saved: !prev.tenders.saved },
            }))
          }
          onToggleApplied={() =>
            setExpandedSections((prev) => ({
              ...prev,
              tenders: { ...prev.tenders, applied: !prev.tenders.applied },
            }))
          }
          onRemoveSaved={(item) => toggleTender('saved', item)}
          onRemoveApplied={(item) => toggleTender('applied', item)}
          renderItem={(item, type) => (
            <div className="rounded-lg border border-border bg-background p-3 transition-all hover:border-primary/25 hover:shadow-card-md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Link
                    href={item.codigo_externo ? `/dashboard/tenders/${encodeURIComponent(item.codigo_externo)}` : '#'}
                    className={`text-sm font-semibold hover:underline underline-offset-2 transition-colors ${type === 'applied' ? 'text-accent' : 'text-primary'}`}
                  >
                    {normalizeText(item.nombre)}
                  </Link>
                  <p className="text-xs text-subtle mt-0.5">Código: {item.codigo_externo}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1.5 text-subtle hover:bg-danger/10 hover:text-danger transition-colors"
                  onClick={() => type === 'saved' ? toggleTender('saved', item) : toggleTender('applied', item)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted">
                {item.region && (
                  <span className="flex items-center gap-1">
                    <MapPin size={11} />{normalizeText(item.region)}
                  </span>
                )}
                {typeof item.monto_estimado === 'number' && (
                  <span className="flex items-center gap-1">
                    <DollarSign size={11} />{formatCurrency(item.monto_estimado)}
                  </span>
                )}
                <span className="flex items-center gap-1 text-subtle">
                  <Calendar size={11} />{formatStoredDate(item.storedAt)}
                </span>
              </div>
            </div>
          )}
        />
      </div>

      {/* ── Top BI Opportunities ── */}
      <TopOpportunities />

      {/* ── BI Mini Charts ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MiniTrendChart />
        <MiniActivityBars organismoId={topOrganism} />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="section-title">Guardados</h2>
              <p className="text-xs text-muted mt-0.5">Total de items guardados por tipo</p>
            </div>
            <div className="rounded-lg bg-primary/10 p-2">
              <Bookmark size={16} className="text-primary" />
            </div>
          </div>
          <div className="h-48">
            {!hydrated ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Cargando datos…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={savedChartData} barSize={40}>
                  <CartesianGrid stroke="#1A1F2C" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="transparent"
                    tick={{ fill: '#94A3B8', fontSize: 12, fontFamily: 'var(--font-dm-sans)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke="transparent"
                    tick={{ fill: '#94A3B8', fontSize: 12, fontFamily: 'var(--font-dm-sans)' }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}`, 'Total']}
                    cursor={{ fill: 'rgba(0, 200, 150, 0.05)', radius: 6 }}
                    contentStyle={{
                      borderRadius: '10px',
                      border: '1px solid #1A1F2C',
                      background: '#0F1117',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '13px',
                      color: '#E2E8F0',
                    }}
                  />
                  <Bar dataKey="value" fill="#00C896" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="section-title">Aplicados</h2>
              <p className="text-xs text-muted mt-0.5">Total de items con postulación enviada</p>
            </div>
            <div className="rounded-lg bg-accent/10 p-2">
              <TrendingUp size={16} className="text-accent" />
            </div>
          </div>
          <div className="h-48">
            {!hydrated ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Cargando datos…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={appliedChartData} barSize={40}>
                  <CartesianGrid stroke="#1A1F2C" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="transparent"
                    tick={{ fill: '#94A3B8', fontSize: 12, fontFamily: 'var(--font-dm-sans)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke="transparent"
                    tick={{ fill: '#94A3B8', fontSize: 12, fontFamily: 'var(--font-dm-sans)' }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}`, 'Total']}
                    cursor={{ fill: 'rgba(0, 200, 150, 0.05)', radius: 6 }}
                    contentStyle={{
                      borderRadius: '10px',
                      border: '1px solid #1A1F2C',
                      background: '#0F1117',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '13px',
                      color: '#E2E8F0',
                    }}
                  />
                  <Bar dataKey="value" fill="#00C896" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Collection Card component
────────────────────────────────────────────── */
interface CollectionCardProps {
  title: string;
  savedCount: number;
  appliedCount: number;
  savedItems: any[];
  appliedItems: any[];
  hydrated: boolean;
  expandedSaved: boolean;
  expandedApplied: boolean;
  onToggleSaved: () => void;
  onToggleApplied: () => void;
  onRemoveSaved: (item: any) => void;
  onRemoveApplied: (item: any) => void;
  renderItem: (item: any, type: 'saved' | 'applied') => React.ReactNode;
}

function CollectionCard({
  title,
  savedCount,
  appliedCount,
  savedItems,
  appliedItems,
  hydrated,
  expandedSaved,
  expandedApplied,
  onToggleSaved,
  onToggleApplied,
  renderItem,
}: CollectionCardProps) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between pb-3 border-b border-borderLight">
        <h3 className="section-title">{title}</h3>
        <div className="flex gap-2">
          <span className="badge-primary text-[11px]">
            <Bookmark size={10} />
            {savedCount}
          </span>
          <span className="badge-accent text-[11px]">
            <Send size={10} />
            {appliedCount}
          </span>
        </div>
      </div>

      {/* Saved */}
      <CollectionSection
        label="Guardadas"
        count={savedItems.length}
        icon={<Bookmark size={14} className="text-primary" />}
        expanded={expandedSaved}
        onToggle={onToggleSaved}
        hydrated={hydrated}
        items={savedItems}
        emptyMessage="No hay items guardados aún."
        renderItem={(item) => renderItem(item, 'saved')}
        accentColor="primary"
      />

      {/* Applied */}
      <CollectionSection
        label="Aplicadas"
        count={appliedItems.length}
        icon={<Send size={14} className="text-accent" />}
        expanded={expandedApplied}
        onToggle={onToggleApplied}
        hydrated={hydrated}
        items={appliedItems}
        emptyMessage="No hay items aplicados aún."
        renderItem={(item) => renderItem(item, 'applied')}
        accentColor="accent"
      />
    </div>
  );
}

function CollectionSection({
  label,
  count,
  icon,
  expanded,
  onToggle,
  hydrated,
  items,
  emptyMessage,
  renderItem,
  accentColor,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  hydrated: boolean;
  items: any[];
  emptyMessage: string;
  renderItem: (item: any) => React.ReactNode;
  accentColor: 'primary' | 'accent';
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 transition-all ${
          expanded
            ? `border-${accentColor}/30 bg-${accentColor}/5`
            : 'border-border bg-background hover:border-primary/20'
        }`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-text">
            {label} ({count})
          </span>
        </div>
        {expanded ? (
          <ChevronUp size={15} className="text-muted" />
        ) : (
          <ChevronDown size={15} className="text-muted" />
        )}
      </button>

      {expanded && (
        <div className="max-h-80 space-y-2 overflow-y-auto pl-1 pr-1 scrollbar-thin animate-slide-up">
          {!hydrated ? (
            <p className="text-sm text-muted px-2">Cargando datos locales…</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-background p-6 text-center">
              <div className="opacity-30">{icon}</div>
              <p className="text-sm text-muted">{emptyMessage}</p>
            </div>
          ) : (
            items.map((item, i) => (
              <div key={item.id || i}>{renderItem(item)}</div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
