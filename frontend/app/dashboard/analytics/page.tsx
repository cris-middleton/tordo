'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import {
  TrendingUp,
  MapPin,
  DollarSign,
  BarChart3,
  PieChart,
  Activity,
  Star,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  LineChart,
  Line,
} from 'recharts';

// Mock data for demonstration - will be replaced with real data later
const generateMockData = () => {
  const regions = [
    'Región Metropolitana',
    'Valparaíso',
    'Bío Bío',
    'Araucanía',
    'Los Lagos',
    'Tarapacá',
    'Antofagasta',
    'Atacama',
  ];

  return regions.map((region) => ({
    region,
    tenders: Math.floor(Math.random() * 100) + 10,
    orders: Math.floor(Math.random() * 150) + 20,
    totalAmount: Math.floor(Math.random() * 5000000000) + 100000000,
  }));
};

const generateBubbleData = () => {
  const categories = [
    'Tecnología',
    'Construcción',
    'Servicios',
    'Suministros',
    'Equipamiento',
  ];
  return categories.map((category, index) => ({
    category,
    amount: Math.floor(Math.random() * 1000000000) + 10000000,
    count: Math.floor(Math.random() * 50) + 5,
    x: index * 20 + Math.random() * 10,
    y: Math.random() * 100,
    z: Math.floor(Math.random() * 1000000000) + 10000000,
  }));
};

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const ANALYTICS_ENABLED = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== 'false';

export default function AnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    tenders: { total: 0, byRegion: [] },
    orders: { total: 0, byRegion: [] },
  });

  const regionData = useMemo(() => generateMockData(), []);
  const bubbleData = useMemo(() => generateBubbleData(), []);

  useEffect(() => {
    if (!ANALYTICS_ENABLED) {
      router.replace('/dashboard/bi');
      return;
    }
    loadAnalytics();
  }, [router]);

  const loadAnalytics = async () => {
    try {
      // TODO: Replace with actual API calls when backend supports analytics
      // const [tendersRes, ordersRes] = await Promise.all([
      //   apiClient.getTenders({ limit: 1000 }),
      //   apiClient.getOrders({ limit: 1000 }),
      // ]);
      setLoading(false);
    } catch (error) {
      console.error('Error loading analytics:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="animate-pulse text-muted">Cargando analítica...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-text sm:text-3xl">
            Analítica Avanzada
          </h1>
          <p className="text-sm text-muted">
            Visualizaciones y análisis de licitaciones y órdenes de compra
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <Star className="h-4 w-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700">Funcionalidad Pro</span>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Total Licitaciones</p>
              <p className="text-2xl font-semibold text-text">1,234</p>
            </div>
            <div className="rounded-lg bg-primary/10 p-3">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Total Órdenes</p>
              <p className="text-2xl font-semibold text-text">5,678</p>
            </div>
            <div className="rounded-lg bg-emerald-100 p-3">
              <PieChart className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Monto Total</p>
              <p className="text-2xl font-semibold text-text">$12.5B</p>
            </div>
            <div className="rounded-lg bg-amber-100 p-3">
              <DollarSign className="h-6 w-6 text-amber-600" />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Regiones Activas</p>
              <p className="text-2xl font-semibold text-text">8</p>
            </div>
            <div className="rounded-lg bg-purple-100 p-3">
              <MapPin className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Geographic Distribution */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Distribución Geográfica</h2>
          <MapPin className="h-5 w-5 text-muted" />
        </div>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={regionData}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis
                dataKey="region"
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'totalAmount') {
                    return [
                      new Intl.NumberFormat('es-CL', {
                        style: 'currency',
                        currency: 'CLP',
                        minimumFractionDigits: 0,
                      }).format(value),
                      'Monto Total',
                    ];
                  }
                  return [value, name === 'tenders' ? 'Licitaciones' : 'Órdenes'];
                }}
                cursor={{ fill: 'rgba(99, 102, 241, 0.12)' }}
              />
              <Legend />
              <Bar dataKey="tenders" fill="#6366f1" name="Licitaciones" radius={[6, 6, 0, 0]} />
              <Bar dataKey="orders" fill="#10b981" name="Órdenes" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pie Chart - Distribution by Type */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">Distribución por Tipo</h2>
            <PieChart className="h-5 w-5 text-muted" />
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={[
                    { name: 'Licitaciones', value: 1234 },
                    { name: 'Órdenes', value: 5678 },
                  ]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {[
                    { name: 'Licitaciones', value: 1234 },
                    { name: 'Órdenes', value: 5678 },
                  ].map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bubble Chart - Amount vs Count by Category */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">Análisis por Categoría</h2>
            <Activity className="h-5 w-5 text-muted" />
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Índice"
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Valor"
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                />
                <ZAxis
                  type="number"
                  dataKey="z"
                  range={[50, 400]}
                  name="Monto"
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  formatter={(value: number, name: string, props: any) => {
                    if (name === 'z') {
                      return [
                        new Intl.NumberFormat('es-CL', {
                          style: 'currency',
                          currency: 'CLP',
                          minimumFractionDigits: 0,
                        }).format(value),
                        'Monto',
                      ];
                    }
                    return [value, name];
                  }}
                  labelFormatter={(label) => `Categoría: ${bubbleData[Math.floor(label as number)]?.category || ''}`}
                />
                <Scatter name="Categorías" data={bubbleData} fill="#6366f1">
                  {bubbleData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Heat Map - Monthly Trends */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Tendencias Mensuales</h2>
          <TrendingUp className="h-5 w-5 text-muted" />
        </div>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={[
                { month: 'Ene', tenders: 120, orders: 450 },
                { month: 'Feb', tenders: 135, orders: 480 },
                { month: 'Mar', tenders: 150, orders: 520 },
                { month: 'Abr', tenders: 140, orders: 510 },
                { month: 'May', tenders: 165, orders: 550 },
                { month: 'Jun', tenders: 180, orders: 600 },
              ]}
            >
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  value,
                  name === 'tenders' ? 'Licitaciones' : 'Órdenes',
                ]}
                cursor={{ stroke: '#6366f1', strokeWidth: 2 }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="tenders"
                stroke="#6366f1"
                strokeWidth={2}
                name="Licitaciones"
                dot={{ fill: '#6366f1', r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="orders"
                stroke="#10b981"
                strokeWidth={2}
                name="Órdenes"
                dot={{ fill: '#10b981', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Amount Distribution */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Distribución de Montos</h2>
          <DollarSign className="h-5 w-5 text-muted" />
        </div>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={regionData.map((r) => ({
                region: r.region,
                monto: r.totalAmount,
              }))}
            >
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis
                dataKey="region"
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickFormatter={(value) => {
                  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
                  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
                  return `$${value}`;
                }}
              />
              <Tooltip
                formatter={(value: number) => [
                  new Intl.NumberFormat('es-CL', {
                    style: 'currency',
                    currency: 'CLP',
                    minimumFractionDigits: 0,
                  }).format(value),
                  'Monto Total',
                ]}
                cursor={{ fill: 'rgba(99, 102, 241, 0.12)' }}
              />
              <Bar dataKey="monto" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

