'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import {
  CheckCircle2,
  ChevronRight,
  Building2,
  Tag,
  CreditCard,
  Loader2,
  X,
  ShieldCheck,
  ShieldX,
  HelpCircle,
  BarChart3,
  Bell,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

// ─── Static data ─────────────────────────────────────────────────────────────

const RUBROS_DISPONIBLES = [
  'Tecnología y sistemas de información',
  'Construcción y obras civiles',
  'Servicios de limpieza',
  'Alimentos preparados y conservados',
  'Medicina y servicios de salud',
  'Servicios de apoyo a la administración de empresas',
  'Maquinarias, suministros y accesorios de oficina',
  'Productos de papel',
  'Suministros de oficina',
  'Servicios de transporte y logística',
  'Educación y formación',
  'Comunicaciones y telecomunicaciones',
  'Seguridad y vigilancia',
  'Consultoría y asesoría profesional',
  'Equipos electrónicos y computacionales',
  'Artículos de ferretería',
  'Mantenimiento y reparaciones',
  'Combustibles líquidos',
  'Textiles y prendas de vestir',
  'Muebles y mobiliario',
];

const PLANES = [
  {
    id: 'basico',
    nombre: 'Básico',
    precio: 'Gratis',
    descripcion: 'Para comenzar a explorar licitaciones públicas.',
    features: ['Búsqueda de licitaciones', 'Alertas básicas', 'Hasta 1 empresa'],
  },
  {
    id: 'pro',
    nombre: 'Pro',
    precio: '$11.900/mes',
    descripcion: 'Para proveedores activos en Mercado Público.',
    features: [
      'Todo lo de Básico',
      'Inteligencia BI (benchmarks de precio)',
      'Documentos ilimitados',
      'Estado hábil automático',
      'Alertas avanzadas',
    ],
    destacado: true,
  },
  {
    id: 'enterprise',
    nombre: 'Enterprise',
    precio: '$29.990/mes',
    descripcion: 'Para equipos y empresas con múltiples RUTs.',
    features: [
      'Todo lo de Pro',
      'Múltiples empresas',
      'API access',
      'Soporte prioritario',
    ],
  },
];

// BI demo mock — always visible regardless of FEATURE_ANALYTICS flag
const BI_DEMO_DATA = [
  {
    rubro: 'Servicios de aseo y limpieza',
    producto: 'Aseo de edificios públicos',
    p25: 890,
    p50: 1_200,
    p75: 1_680,
    unidad: '/hora',
    n: 847,
    recomendacion: 'Ofertar entre $1.100 y $1.250/hora para ser competitivo sin sacrificar margen.',
  },
  {
    rubro: 'Tecnología y sistemas de información',
    producto: 'Soporte técnico equipos',
    p25: 45_000,
    p50: 68_000,
    p75: 95_000,
    unidad: '/equipo',
    n: 412,
    recomendacion: 'El mercado está disperso (CV alto). Diferénciate por tiempo de respuesta.',
  },
  {
    rubro: 'Construcción y obras civiles',
    producto: 'Pintura y revestimientos',
    p25: 12_000,
    p50: 18_500,
    p75: 26_000,
    unidad: '/m²',
    n: 1_203,
    recomendacion: 'Precio predecible. Ofertar cerca del P50 maximiza las probabilidades de adjudicación.',
  },
];

type Step = 1 | 2 | 3 | 4 | 5 | 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatClp(n: number) {
  return '$' + n.toLocaleString('es-CL');
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 4 — BI oportunidades (real API)
  const [biOportunidades, setBiOportunidades] = useState<Array<{
    nombre_organismo: string
    score: number
    n_transacciones: number
    monto_promedio: number
  }>>([])
  const [biLoading, setBiLoading] = useState(false)

  // Step 1 — Empresa
  const [rut, setRut] = useState('');
  const [nombreEmpresa, setNombreEmpresa] = useState('');
  const [empresaId, setEmpresaId] = useState('');

  // Step 2 — Estado hábil
  const [estadoHabil, setEstadoHabil] = useState<string | null>(null);
  const [estadoChecked, setEstadoChecked] = useState(false);

  // Step 3 — Rubros
  const [rubrosSeleccionados, setRubrosSeleccionados] = useState<string[]>([]);

  // Step 4 — BI demo: pick the demo row that best matches selected rubros
  const getBiDemo = () => {
    if (rubrosSeleccionados.length === 0) return BI_DEMO_DATA[0];
    const match = BI_DEMO_DATA.find((d) =>
      rubrosSeleccionados.some((r) =>
        d.rubro.toLowerCase().includes(r.split(' ')[0].toLowerCase()),
      ),
    );
    return match ?? BI_DEMO_DATA[0];
  };

  // Step 5 — Alert + Plan
  const [alertKeywords, setAlertKeywords] = useState('');
  const [alertCreated, setAlertCreated] = useState(false);
  const [loadingAlert, setLoadingAlert] = useState(false);
  const [planSeleccionado, setPlanSeleccionado] = useState('basico');

  // ─── Formatting ────────────────────────────────────────────────────────────
  const formatRut = (value: string) => {
    const clean = value.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length <= 1) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
  };

  const toggleRubro = (rubro: string) => {
    setRubrosSeleccionados((prev) =>
      prev.includes(rubro) ? prev.filter((r) => r !== rubro) : [...prev, rubro],
    );
  };

  // ─── Step handlers ──────────────────────────────────────────────────────────

  const handleStep1 = async () => {
    if (!rut.trim() || !nombreEmpresa.trim()) {
      setError('RUT y nombre de empresa son obligatorios.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const empresa = await apiClient.createEmpresa({
        rut_empresa: rut.replace(/\./g, ''),
        nombre_empresa: nombreEmpresa.trim(),
      });
      setEmpresaId(empresa.id);
      setStep(2);
      // Kick off estado hábil check immediately (non-blocking)
      apiClient
        .checkEstadoHabilNow(empresa.id)
        .then((res: any) => {
          setEstadoHabil(res.estado_habil ?? 'desconocido');
          setEstadoChecked(res.checked ?? false);
        })
        .catch(() => {
          setEstadoHabil('desconocido');
          setEstadoChecked(false);
        });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === 'string' && detail.includes('ya está registrada')) {
        setError('Esta empresa ya está registrada. Contacta al soporte si crees que es un error.');
      } else if (typeof detail === 'string' && detail.includes('RUT inválido')) {
        setError('El RUT ingresado no es válido. Verifica el dígito verificador.');
      } else {
        setError(detail || 'Error al registrar la empresa. Intenta nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStep3 = async () => {
    setLoading(true);
    try {
      if (empresaId && rubrosSeleccionados.length > 0) {
        await apiClient.updateEmpresa(empresaId, { rubros_cpv: rubrosSeleccionados });
      }
      setStep(4);
    } catch {
      setStep(4); // non-blocking
    } finally {
      setLoading(false);
    }
    // Fetch real BI oportunidades for step 4
    setBiLoading(true)
    apiClient
      .getBIOportunidades({ limit: 3 })
      .then((data) => setBiOportunidades((data as any)?.oportunidades ?? []))
      .catch(() => setBiOportunidades([]))
      .finally(() => setBiLoading(false))
  };

  const handleCreateAlert = async () => {
    if (!alertKeywords.trim()) return;
    setLoadingAlert(true);
    try {
      const keywords = alertKeywords
        .split(/[,\n]/)
        .map((k) => k.trim())
        .filter(Boolean);
      await Promise.all([
        apiClient.createAlertPreference({
          name: `Mi alerta — ${keywords[0]}`,
          keywords,
          is_active: true,
        }),
        apiClient.sendTestAlert(),
      ]);
      setAlertCreated(true);
    } catch {
      // Still mark as created to not block onboarding
      setAlertCreated(true);
    } finally {
      setLoadingAlert(false);
    }
  };

  const handleStep5 = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await apiClient.updateUser(user.id, {
        plan_tier: planSeleccionado,
        onboarding_completed: true,
        onboarding_step: 5,
      });
      await refreshUser();
      setStep(6);
    } catch {
      setError('Error al guardar el plan. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Step indicator ─────────────────────────────────────────────────────────

  const STEP_LABELS = ['Empresa', 'Estado hábil', 'Rubros', 'BI demo', 'Alerta', 'Listo'];
  const TOTAL_STEPS = 6;

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-1.5 mb-8 flex-wrap">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
        <div key={s} className="flex items-center gap-1.5">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              step > s
                ? 'bg-green-500 text-white'
                : step === s
                  ? 'bg-primary text-white'
                  : 'border-2 border-border bg-surface text-muted'
            }`}
          >
            {step > s ? <CheckCircle2 className="h-3.5 w-3.5" /> : s}
          </div>
          {s < TOTAL_STEPS && (
            <div className={`h-0.5 w-8 ${step > s ? 'bg-green-500' : 'bg-border'}`} />
          )}
        </div>
      ))}
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-text">Bienvenido a TORDO</h1>
          <p className="mt-1 text-muted text-sm">
            Paso {step} de {TOTAL_STEPS} — {STEP_LABELS[step - 1]}
          </p>
        </div>

        <StepIndicator />

        <div className="card space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <X className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ── Step 1: Empresa ──────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text">Registra tu empresa</h2>
                  <p className="text-sm text-muted">
                    Necesitamos tu RUT para verificar el estado hábil en ChileCompra.
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-text" htmlFor="rut">
                  RUT de la empresa
                </label>
                <input
                  id="rut"
                  className="input-field"
                  placeholder="12.345.678-9"
                  value={rut}
                  onChange={(e) => setRut(formatRut(e.target.value))}
                  maxLength={12}
                />
                <p className="text-xs text-muted">Con o sin puntos y guión.</p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-text" htmlFor="nombre">
                  Nombre o razón social
                </label>
                <input
                  id="nombre"
                  className="input-field"
                  placeholder="Empresa Ejemplo SpA"
                  value={nombreEmpresa}
                  onChange={(e) => setNombreEmpresa(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStep1()}
                />
              </div>

              <button
                onClick={handleStep1}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Continuar <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-muted">
                ¿Ya tienes cuenta?{' '}
                <button onClick={() => router.push('/dashboard')} className="text-primary hover:underline">
                  Ir al dashboard
                </button>
              </p>
            </div>
          )}

          {/* ── Step 2: Estado hábil ─────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text">Estado hábil en ChileCompra</h2>
                  <p className="text-sm text-muted">
                    Solo las empresas hábiles pueden ser adjudicadas. Verificamos tu RUT al instante.
                  </p>
                </div>
              </div>

              {/* Result badge */}
              {estadoHabil === null ? (
                <div className="flex items-center justify-center gap-3 rounded-xl border border-border bg-surface p-6">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-sm text-muted">
                    Consultando Registro de Proveedores ChileCompra…
                  </span>
                </div>
              ) : estadoHabil === 'habil' ? (
                <div className="flex items-center gap-4 rounded-xl border border-green-200 bg-green-50 p-5">
                  <ShieldCheck className="h-10 w-10 text-green-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-green-800 text-lg">Empresa Hábil ✓</p>
                    <p className="text-sm text-green-700 mt-0.5">
                      Tu empresa está habilitada para ofertar en Mercado Público. ¡Todo en orden!
                    </p>
                  </div>
                </div>
              ) : estadoHabil === 'inhabil' ? (
                <div className="flex items-center gap-4 rounded-xl border border-red-200 bg-red-50 p-5">
                  <ShieldX className="h-10 w-10 text-red-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-red-800 text-lg">Empresa Inhábil</p>
                    <p className="text-sm text-red-700 mt-0.5">
                      Tu empresa figura como inhábil en el registro de ChileCompra.
                      TORDO monitoreará el cambio y te avisará cuando se regularice.
                    </p>
                  </div>
                </div>
              ) : estadoHabil === 'no_encontrado' ? (
                <div className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
                  <HelpCircle className="h-10 w-10 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-800 text-lg">No encontrado en el registro</p>
                    <p className="text-sm text-amber-700 mt-0.5">
                      El RUT <strong>{rut}</strong> no aparece en el CSV actual de ChileCompra.
                      Verifica que esté inscrito como proveedor en Mercado Público.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-5">
                  <HelpCircle className="h-10 w-10 text-muted shrink-0" />
                  <div>
                    <p className="font-semibold text-text">Verificación en segundo plano</p>
                    <p className="text-sm text-muted mt-0.5">
                      No pudimos consultar el registro ahora. TORDO lo verificará automáticamente
                      en las próximas horas y te notificará el resultado.
                    </p>
                  </div>
                </div>
              )}

              {/* Info callout */}
              <div className="rounded-lg bg-surface border border-border p-3 text-xs text-muted space-y-1">
                <p className="font-medium text-text">¿Qué es el estado hábil?</p>
                <p>
                  ChileCompra mantiene un registro de proveedores habilitados para ofertar. Las empresas
                  inhábiles no pueden ser adjudicadas aunque ganen la licitación. TORDO monitorea
                  este estado cada 6 horas y te alerta ante cualquier cambio.
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="btn-secondary flex-1">
                  Atrás
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  Continuar <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Rubros ───────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Tag className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text">¿En qué rubros compites?</h2>
                  <p className="text-sm text-muted">
                    Usaremos esto para personalizar tus alertas y el análisis de precios.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto">
                {RUBROS_DISPONIBLES.map((rubro) => {
                  const selected = rubrosSeleccionados.includes(rubro);
                  return (
                    <button
                      key={rubro}
                      type="button"
                      onClick={() => toggleRubro(rubro)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors border ${
                        selected
                          ? 'bg-primary text-white border-primary'
                          : 'border-border text-muted hover:border-primary/40 hover:text-primary'
                      }`}
                    >
                      {rubro}
                    </button>
                  );
                })}
              </div>

              {rubrosSeleccionados.length > 0 && (
                <p className="text-xs text-primary font-medium">
                  {rubrosSeleccionados.length} rubro{rubrosSeleccionados.length > 1 ? 's' : ''} seleccionado{rubrosSeleccionados.length > 1 ? 's' : ''}
                </p>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="btn-secondary flex-1">
                  Atrás
                </button>
                <button
                  onClick={handleStep3}
                  disabled={loading}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {rubrosSeleccionados.length === 0 ? 'Omitir' : 'Continuar'}
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: BI oportunidades ─────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Tu ventaja competitiva</h2>
                <p className="text-gray-500 text-sm mb-6">
                  TORDO analiza el historial de compras públicas para darte inteligencia antes de postular.
                </p>

                {biLoading && (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-20" />
                    ))}
                  </div>
                )}

                {!biLoading && biOportunidades.length > 0 && (
                  <div className="space-y-3">
                    {biOportunidades.map((op, i) => (
                      <div key={i} className="border border-gray-200 rounded-xl p-4 bg-white">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm text-gray-800 truncate max-w-[200px]">
                            {op.nombre_organismo}
                          </span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            op.score >= 7
                              ? 'bg-green-100 text-green-700'
                              : op.score >= 4
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {op.score.toFixed(1)}/10
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {op.n_transacciones} transacciones ·{' '}
                          {new Intl.NumberFormat('es-CL', {
                            style: 'currency',
                            currency: 'CLP',
                            maximumFractionDigits: 0,
                          }).format(op.monto_promedio)}{' '}
                          prom.
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {!biLoading && biOportunidades.length === 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-center">
                    <p className="text-blue-700 font-medium text-sm">Panel BI disponible en tu dashboard</p>
                    <p className="text-blue-500 text-xs mt-1">
                      Configura el perfil de tu empresa para ver precios históricos y competidores reales.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(3)} className="btn-secondary flex-1">
                  Atrás
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  Continuar <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 5: Alerta + Plan ────────────────────────────────────── */}
          {step === 5 && (
            <div className="space-y-6">
              {/* Alert setup */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Bell className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text">Configura tu primera alerta</h2>
                    <p className="text-sm text-muted">
                      Recibe notificaciones cuando aparezcan licitaciones relevantes.
                    </p>
                  </div>
                </div>

                {!alertCreated ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-text">
                        ¿Qué productos o servicios ofreces?
                      </label>
                      <textarea
                        className="input-field resize-none"
                        rows={2}
                        placeholder="ej: aseo, limpieza de edificios, mantenimiento de áreas verdes"
                        value={alertKeywords}
                        onChange={(e) => setAlertKeywords(e.target.value)}
                      />
                      <p className="text-xs text-muted">Separa con comas. Usaremos esto para buscar licitaciones.</p>
                    </div>
                    <button
                      onClick={handleCreateAlert}
                      disabled={loadingAlert || !alertKeywords.trim()}
                      className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                      {loadingAlert ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Bell className="h-4 w-4" />
                          Crear alerta y enviar prueba
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setAlertCreated(true)}
                      className="w-full text-center text-xs text-muted hover:text-primary transition-colors"
                    >
                      Omitir por ahora
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
                    <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-green-800">¡Alerta creada!</p>
                      <p className="text-sm text-green-700">
                        Ya tienes una notificación de prueba en tu bandeja de alertas. A partir de ahora
                        recibirás avisos cuando aparezcan licitaciones relevantes.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-muted">Elige tu plan</span>
                </div>
              </div>

              {/* Plan selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm text-muted">Puedes cambiar en cualquier momento desde Configuración.</p>
                </div>

                {PLANES.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setPlanSeleccionado(plan.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-all ${
                      planSeleccionado === plan.id
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-primary/40'
                    } ${plan.destacado ? 'ring-2 ring-primary/30' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text">{plan.nombre}</span>
                          {plan.destacado && (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                              Popular
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted mt-0.5">{plan.descripcion}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="font-bold text-primary">{plan.precio}</p>
                        {planSeleccionado === plan.id && (
                          <CheckCircle2 className="ml-auto mt-1 h-4 w-4 text-primary" />
                        )}
                      </div>
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-1.5 text-xs text-muted">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(4)} className="btn-secondary flex-1">
                  Atrás
                </button>
                <button
                  onClick={handleStep5}
                  disabled={loading}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Comenzar <CheckCircle2 className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
          {/* ── Step 6: Completion ───────────────────────────────────────── */}
          {step === 6 && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                ¡Todo listo, {user?.full_name?.split(' ')[0] || 'bienvenido'}!
              </h2>
              <p className="text-gray-500 text-sm mb-8">Tu cuenta está configurada. Aquí tienes tu punto de partida:</p>

              <div className="grid grid-cols-1 gap-3 text-left mb-8">
                {[
                  {
                    icon: '🔍',
                    title: 'Busca licitaciones',
                    desc: 'Filtra por región, monto y estado',
                    href: '/dashboard/tenders',
                  },
                  {
                    icon: '📊',
                    title: 'Analiza oportunidades',
                    desc: 'Precios históricos y competidores reales',
                    href: '/dashboard/bi',
                  },
                  {
                    icon: '📋',
                    title: 'Gestiona postulaciones',
                    desc: 'Checklist automático por tipo de licitación',
                    href: '/dashboard/postulaciones',
                  },
                ].map(({ icon, title, desc, href }) => (
                  <a
                    key={href}
                    href={href}
                    className="flex items-center gap-4 border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-2xl">{icon}</span>
                    <div>
                      <p className="font-medium text-sm text-gray-900">{title}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                  </a>
                ))}
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                Ir al Dashboard →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
