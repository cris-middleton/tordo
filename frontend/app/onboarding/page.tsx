'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import {
  CheckCircle2,
  ChevronRight,
  Building2,
  Bell,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react';

// ─── Keyword suggestions by rubro ────────────────────────────────────────────

const RUBRO_KEYWORDS: Record<string, string[]> = {
  'Tecnología': ['soporte técnico', 'equipos computacionales', 'software', 'redes'],
  'Construcción': ['obra civil', 'pintura', 'mantención edificios', 'reparaciones'],
  'Limpieza': ['aseo', 'limpieza de edificios', 'sanitización', 'áreas verdes'],
  'Alimentos': ['alimentación preparada', 'raciones', 'catering', 'colaciones'],
  'Salud': ['insumos médicos', 'equipos clínicos', 'laboratorio', 'ambulancia'],
  'Oficina': ['muebles de oficina', 'útiles de escritorio', 'papelería', 'tóner'],
  'Transporte': ['transporte de carga', 'logística', 'fletes', 'mudanza'],
  'Educación': ['capacitación', 'formación', 'relatores', 'cursos'],
  'Seguridad': ['vigilancia', 'guardias', 'cámaras', 'control de acceso'],
  'Consultoría': ['asesoría', 'estudios', 'consultoría profesional', 'auditoría'],
};

const RUBROS = Object.keys(RUBRO_KEYWORDS);

type Step = 1 | 2 | 3;

// ─── Main component ──────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshUser, loading: authLoading, isAuthenticated } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1 — Empresa
  const [rut, setRut] = useState('');
  const [nombreEmpresa, setNombreEmpresa] = useState('');
  const [empresaId, setEmpresaId] = useState('');

  // Step 2 — Alerta
  const [alertKeywords, setAlertKeywords] = useState('');
  const [selectedRubros, setSelectedRubros] = useState<string[]>([]);
  const [alertCreated, setAlertCreated] = useState(false);
  const [loadingAlert, setLoadingAlert] = useState(false);

  // Auth guards — after all hooks
  if (!authLoading && !isAuthenticated) {
    router.push('/login');
    return null;
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted animate-pulse">Cargando...</p>
      </div>
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const formatRut = (value: string) => {
    const clean = value.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length <= 1) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
  };

  const toggleRubro = (rubro: string) => {
    setSelectedRubros((prev) => {
      const next = prev.includes(rubro) ? prev.filter((r) => r !== rubro) : [...prev, rubro];
      // Auto-suggest keywords based on selected rubros
      const suggestions = next.flatMap((r) => RUBRO_KEYWORDS[r] || []);
      if (suggestions.length > 0 && !alertKeywords.trim()) {
        setAlertKeywords(suggestions.slice(0, 4).join(', '));
      }
      return next;
    });
  };

  // ─── Step handlers ───────────────────────────────────────────────────────

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
      // Kick off estado hábil check in background (non-blocking)
      apiClient.checkEstadoHabilNow(empresa.id).catch(() => {});
      setStep(2);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === 'string' && detail.includes('ya está registrada')) {
        setError('Esta empresa ya está registrada.');
      } else if (typeof detail === 'string' && detail.includes('RUT inválido')) {
        setError('El RUT ingresado no es válido.');
      } else {
        setError(detail || 'Error al registrar la empresa.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAlert = async () => {
    if (!alertKeywords.trim()) return;
    setLoadingAlert(true);
    try {
      const keywords = alertKeywords
        .split(/[,\n]/)
        .map((k) => k.trim())
        .filter(Boolean);

      // Save rubros if selected
      if (empresaId && selectedRubros.length > 0) {
        await apiClient.updateEmpresa(empresaId, { rubros_cpv: selectedRubros }).catch(() => {});
      }

      await apiClient.createAlertPreference({
        name: `Mi alerta — ${keywords[0]}`,
        keywords,
        is_active: true,
      });
      setAlertCreated(true);
    } catch {
      setAlertCreated(true); // Don't block onboarding
    } finally {
      setLoadingAlert(false);
    }
  };

  const handleFinish = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await apiClient.updateUser(user.id, {
        plan_tier: 'basico',
        onboarding_completed: true,
        onboarding_step: 3,
      });
      await refreshUser();
      router.push('/dashboard');
    } catch {
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  // ─── Progress bar ──────────────────────────────────────────────────────

  const STEP_LABELS = ['Tu empresa', 'Tu alerta', 'Listo'];

  const ProgressBar = () => (
    <div className="flex items-center gap-2 mb-8 w-full">
      {STEP_LABELS.map((label, i) => {
        const s = i + 1;
        const isActive = step === s;
        const isDone = step > s;
        return (
          <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="w-full h-1.5 rounded-full overflow-hidden bg-border">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isDone ? 'bg-accent w-full' : isActive ? 'bg-primary w-1/2' : 'w-0'
                }`}
              />
            </div>
            <span className={`text-[11px] font-medium transition-colors ${
              isActive ? 'text-primary' : isDone ? 'text-accent' : 'text-muted'
            }`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );

  // ─── Keyword preview ──────────────────────────────────────────────────

  const keywordList = alertKeywords
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-text">
            {step === 1 && 'Configura tu cuenta'}
            {step === 2 && 'Recibe oportunidades'}
            {step === 3 && '!Todo listo!'}
          </h1>
          <p className="mt-1 text-muted text-sm">
            {step === 1 && 'Registra tu empresa para empezar.'}
            {step === 2 && 'Crea una alerta y encuentra licitaciones para ti.'}
            {step === 3 && 'Tu cuenta está lista para usar.'}
          </p>
        </div>

        <ProgressBar />

        <div className="card space-y-5">
          {error && (
            <div className="alert-error">
              <X className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ── Step 1: Empresa ───────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm text-muted">
                  Con tu RUT verificamos tu estado hábil en ChileCompra automáticamente.
                </p>
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
                <button onClick={() => router.push('/dashboard')} className="text-primary hover:underline">
                  Ir al dashboard
                </button>
              </p>
            </div>
          )}

          {/* ── Step 2: Alerta (core value step) ─────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              {!alertCreated ? (
                <>
                  {/* Rubro chips — optional, suggest keywords */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text">
                      Selecciona tus rubros <span className="text-muted font-normal">(opcional)</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {RUBROS.map((rubro) => {
                        const selected = selectedRubros.includes(rubro);
                        return (
                          <button
                            key={rubro}
                            type="button"
                            onClick={() => toggleRubro(rubro)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
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
                  </div>

                  {/* Keywords input */}
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-text flex items-center gap-1.5">
                      <Bell className="h-3.5 w-3.5 text-primary" />
                      Palabras clave para tu alerta
                    </label>
                    <textarea
                      className="input-field resize-none"
                      rows={2}
                      placeholder="ej: aseo, limpieza de edificios, mantención"
                      value={alertKeywords}
                      onChange={(e) => setAlertKeywords(e.target.value)}
                    />
                    <p className="text-xs text-muted">Separa con comas. Recibirás alertas cuando aparezcan licitaciones con estas palabras.</p>
                  </div>

                  {/* Live preview */}
                  {keywordList.length > 0 && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                      <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5" />
                        Vista previa de tu alerta
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {keywordList.map((kw, i) => (
                          <span key={i} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                            {kw}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted">
                        Te notificaremos por email cuando aparezcan licitaciones con {keywordList.length === 1 ? 'esta palabra' : 'estas palabras'}.
                      </p>
                    </div>
                  )}

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
                        Crear alerta
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-3">
                    <button onClick={() => setStep(1)} className="btn-secondary flex-1">
                      Atrás
                    </button>
                    <button
                      onClick={() => { setAlertCreated(true); }}
                      className="flex-1 text-center text-xs text-muted hover:text-primary transition-colors py-2"
                    >
                      Omitir por ahora
                    </button>
                  </div>
                </>
              ) : (
                /* Alert created confirmation */
                <div className="space-y-5">
                  <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accentLight p-4">
                    <CheckCircle2 className="h-8 w-8 text-accent shrink-0" />
                    <div>
                      <p className="font-semibold text-text">Alerta creada</p>
                      <p className="text-sm text-muted">
                        Recibirás notificaciones cuando aparezcan licitaciones relevantes para ti.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleFinish}
                    disabled={loading}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Ir al dashboard <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Done ─────────────────────────────────────────── */}
          {step === 3 && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-accent/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-accent" />
              </div>
              <h2 className="text-lg font-semibold text-text mb-1">
                Bienvenido{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
              </h2>
              <p className="text-muted text-sm mb-6">Tu cuenta está configurada.</p>

              <div className="grid grid-cols-1 gap-2.5 text-left mb-6">
                {[
                  { title: 'Busca licitaciones', desc: 'Filtra por región, monto y estado', href: '/dashboard/tenders' },
                  { title: 'Analiza precios', desc: 'Benchmarks históricos y competidores', href: '/dashboard/bi' },
                  { title: 'Gestiona postulaciones', desc: 'Checklist automático por licitación', href: '/dashboard/postulaciones' },
                ].map(({ title, desc, href }) => (
                  <a
                    key={href}
                    href={href}
                    className="flex items-center gap-3 border border-border rounded-xl p-3.5 hover:border-primary/30 hover:bg-primary/5 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="font-medium text-sm text-text">{title}</p>
                      <p className="text-xs text-muted">{desc}</p>
                    </div>
                  </a>
                ))}
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                className="btn-primary w-full py-3"
              >
                Ir al Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
