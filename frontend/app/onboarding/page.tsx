'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { useEmpresas } from '@/lib/queries';
import { setEmpresaActiva } from '@/lib/empresaActive';
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

type Step = 1 | 2;

// ─── Main component ──────────────────────────────────────────────────────────


// ─── Progress bar ──────────────────────────────────────────────────────

// Dos tramos, no tres. El tercero («Listo») correspondía a un paso inalcanzable
// y quedaba siempre vacío: una barra de progreso que nunca se llena le dice al
// usuario que dejó algo a medias justo cuando terminó.
const STEP_LABELS = ['Tu empresa', 'Qué vendes'];

// Definido FUERA del componente a propósito. Estaba dentro, así que cada render
// creaba un tipo de componente nuevo: React lo desmontaba y lo volvía a montar,
// perdiendo su estado y reiniciando la animación de la barra. Lo detectó la regla
// `react-hooks/static-components` al subir a Next 16.
function ProgressBar({ step }: { step: number }) {
return (
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
}

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, refreshUser, loading: authLoading, isAuthenticated } = useAuth();

  const [pasoElegido, setPasoElegido] = useState<Step | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1 — Empresa
  const [rut, setRut] = useState('');
  const [nombreEmpresa, setNombreEmpresa] = useState('');
  const [empresaCreada, setEmpresaCreada] = useState('');

  // La empresa que el usuario YA tiene. Quien cerró la pestaña a medias vuelve
  // aquí con su empresa creada, y el paso 1 era entonces una puerta cerrada:
  // crear la misma empresa responde 409 «Ya tienes acceso a esta empresa», el
  // panel rebotaba al onboarding y «Lo hago después» también. **No había salida
  // ninguna.** Si ya existe, ese paso está hecho y se empieza en el siguiente.
  const consultaEmpresas = useEmpresas();
  const empresaExistente = (consultaEmpresas.data as { id: string }[] | undefined)?.[0];
  const empresaId = empresaCreada || empresaExistente?.id || '';

  // Se DERIVA en vez de guardarse desde un efecto, como el rubro en la pantalla
  // de BI: el dato llega después del primer render y un `useEffect` + `setState`
  // deja una pasada pintando el paso equivocado.
  const step: Step = pasoElegido ?? (empresaId ? 2 : 1);
  const setStep = setPasoElegido;

  // Step 2 — Alerta
  const [alertKeywords, setAlertKeywords] = useState('');
  const [selectedRubros, setSelectedRubros] = useState<string[]>([]);
  const [alertCreated, setAlertCreated] = useState(false);
  const [loadingAlert, setLoadingAlert] = useState(false);

  // Auth guard — must be in useEffect to avoid calling navigation during render
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted animate-pulse">Cargando…</p>
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

  /**
   * Deja constancia de que este usuario ya pasó por aquí.
   *
   * Vivía SÓLO dentro de «Ir a mi panel», el botón de la última pantalla. Todo
   * el trabajo —empresa, rubros, perfil semántico, primera alerta— ya estaba
   * hecho una pantalla antes, así que quien cerraba la pestaña al leer «Listo,
   * ya estamos buscando» se quedaba con `onboarding_completed = false`… y la
   * guarda de `app/dashboard/layout.tsx` lo devolvía aquí para siempre.
   *
   * Es idempotente y silencioso a propósito: es contabilidad interna, no una
   * acción del usuario. Que falle no puede impedirle seguir.
   */
  const marcarOnboardingHecho = async (paso: number) => {
    if (!user || user.onboarding_completed) return;
    await apiClient
      .updateUser(user.id, {
        onboarding_completed: true,
        onboarding_step: paso,
      })
      .then(() => refreshUser())
      .catch(() => {});
  };


  const handleStep1 = async () => {
    if (!rut.trim() || !nombreEmpresa.trim()) {
      setError('Nos faltan el RUT y el nombre de tu empresa.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const empresa = await apiClient.createEmpresa({
        rut_empresa: rut.replace(/\./g, ''),
        nombre_empresa: nombreEmpresa.trim(),
      });
      setEmpresaCreada(empresa.id);
      // La recién creada es la activa: si no, el panel resolvía «la primera» de
      // una lista que la caché todavía tenía vacía.
      setEmpresaActiva(empresa.id);
      // Kick off estado hábil check in background (non-blocking)
      apiClient.checkEstadoHabilNow(empresa.id).catch(() => {});
      setStep(2);
    } catch (err: unknown) {
      // `mensajeDeError` normaliza las tres formas del `detail` de FastAPI. El
      // RUT inválido llega como 422 —lo levanta el validador de `EmpresaCreate`,
      // no un `HTTPException`—, así que estas comprobaciones miraban antes un
      // `typeof detail === 'string'` que NUNCA se cumplía: la rama amable era
      // código muerto y lo que llegaba al JSX era la lista de errores de
      // Pydantic, que es con lo que React se cae.
      const detalle = mensajeDeError(
        err,
        'No pudimos guardar la empresa. Inténtalo de nuevo en un momento.',
      );
      if (detalle.includes('ya está registrada')) {
        // Cualquiera puede registrar un RUT, y quien llega después sólo tenía
        // «pide que te inviten» — inútil si nadie de su empresa lo registró.
        // Sin verificación de titularidad (decisión de producto pendiente), al
        // menos hay a quién recurrir.
        setError(
          'Esa empresa ya tiene cuenta. Si alguien de tu equipo la creó, pídele que te invite desde Mi empresa. Si nadie de tu empresa la registró, escríbenos a hola@tordo.cl con el RUT y lo resolvemos.',
        );
      } else if (detalle.includes('RUT inválido')) {
        setError('Ese RUT no cuadra. Revisa el dígito verificador.');
      } else {
        setError(detalle);
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

      // **El mismo texto alimenta las dos cosas, y esto faltaba.** Antes esta
      // pantalla sólo creaba la alerta: el perfil semántico —que es lo que
      // decide el encaje— se quedaba vacío hasta que alguien encontrara
      // «Perfil de búsqueda» dentro de Mi empresa. Casi nadie llega ahí, así
      // que «Oportunidades para ti» nacía vacío justo el día en que el usuario
      // decide si esto le sirve.
      //
      // Va en el mismo gesto en vez de en un campo aparte porque el onboarding
      // se abandona por cada campo que se añade. El backend le da a la
      // descripción el DOBLE de peso que a los rubros al construir el vector
      // (`app/api/bi.py::update_tfidf_perfil`), así que el texto que la persona
      // escribe manda sobre las etiquetas que marcó.
      //
      // Best-effort a propósito: el endpoint exige la feature flag de TF-IDF y
      // devuelve 503 si está apagada. Que el perfil no se guarde no puede
      // impedir terminar el registro.
      if (empresaId) {
        await apiClient
          .updateTFIDFPerfil(empresaId, {
            descripcion: alertKeywords.trim(),
            rubros_usados: selectedRubros,
          })
          .catch(() => {});
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
      // Aquí es donde el onboarding está de verdad terminado: lo que viene
      // después es una pantalla de confirmación, no un paso más.
      await marcarOnboardingHecho(2);
      setLoadingAlert(false);
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      await marcarOnboardingHecho(3);
    } finally {
      setLoading(false);
      await irAlPanel();
    }
  };

  // **El onboarding cambia la cuenta entera** —empresa, plan, perfil, alerta—
  // y lo hace por `apiClient`, fuera de TanStack Query. Con `staleTime` de un
  // minuto, el panel reusaba lo que había pedido ANTES del onboarding (el login
  // pasa por /dashboard y rebota aquí): recién creada la empresa, decía
  // «Registra tu empresa», pedía el perfil y no mostraba plan. Lo encontró el
  // E2E del recorrido de cliente. Se invalida todo: es un cambio de cuenta.
  const irAlPanel = async () => {
    await queryClient.invalidateQueries();
    router.push('/dashboard');
  };

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
        {/* `!Todo listo!` llevaba el signo de apertura al revés: es el error de
            ortografía que más se nota en español, y salía en la pantalla que
            cierra el registro. */}
        <div className="text-center mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-text">
            {step === 1 && 'Empecemos por tu empresa'}
            {step === 2 && '¿Qué vendes?'}
          </h1>
          <p className="mt-1 text-muted text-sm">
            {step === 1 && 'Con el RUT confirmamos tu inscripción en Mercado Público y activamos tus 14 días de Pro.'}
            {step === 2 && 'Con esto sabemos qué buscarte. Lo puedes cambiar cuando quieras.'}
          </p>
        </div>

        <ProgressBar step={step} />

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
                  Con tu RUT y rubros, buscamos las licitaciones que más te calzan.
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

              {/* La salida decía sólo «Ir al dashboard», sin decir qué se
                  pierde el que la toma. Sin empresa cargada no hay estado
                  hábil, no hay alertas y no arranca el trial: el panel se ve
                  vacío y parece que el producto no funciona. */}
              <p className="text-center text-xs text-muted">
                {/* Marcaba nada y empujaba al panel, que con
                    `onboarding_completed = false` devuelve aquí: el enlace no
                    llevaba a ninguna parte. Saltarse esto es una decisión
                    legítima —el panel ya avisa de lo que falta—, así que se
                    registra como tal. */}
                <button
                  onClick={async () => {
                    await marcarOnboardingHecho(1);
                    await irAlPanel();
                  }}
                  className="text-primary hover:underline"
                >
                  Lo hago después
                </button>{' '}
                — hasta entonces el panel se va a ver vacío
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
                      ¿En qué andas? <span className="text-muted font-normal">(opcional)</span>
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
                                ? 'bg-primary text-onPrimary border-primary'
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
                      Descríbelo con tus palabras
                    </label>
                    {/* Tres filas, no dos: el alto de la caja es lo que le dice
                        a la persona cuánto se espera que escriba, y este texto
                        hace dos trabajos — arma la alerta y es el perfil con el
                        que calculamos el encaje. Cuanto más escriba, mejor
                        buscamos. */}
                    <textarea
                      className="input-field resize-none"
                      rows={3}
                      maxLength={2000}
                      placeholder="aseo industrial, limpieza de edificios, sanitización de recintos de salud"
                      value={alertKeywords}
                      onChange={(e) => setAlertKeywords(e.target.value)}
                    />
                    <p className="text-xs text-muted">
                      Como se lo dirías a alguien por teléfono, separado por comas. Mientras más
                      nos cuentes, mejor te buscamos — y no hace falta que uses los términos del
                      portal.
                    </p>
                  </div>

                  {/* Live preview */}
                  {keywordList.length > 0 && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                      <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5" />
                        Vamos a buscarte esto
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {keywordList.map((kw, i) => (
                          <span key={i} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                            {kw}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted">
                        Te escribimos apenas salga algo con {keywordList.length === 1 ? 'esta palabra' : 'estas palabras'}. Revisamos cada hora.
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
                        Empezar a buscar
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
                      Lo hago después
                    </button>
                  </div>
                </>
              ) : (
                /* Alert created confirmation */
                <div className="space-y-5">
                  <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accentLight p-4">
                    <CheckCircle2 className="h-8 w-8 text-accent shrink-0" />
                    <div>
                      <p className="font-semibold text-text">Listo, ya estamos buscando</p>
                      <p className="text-sm text-muted">
                        El primer correo te llega en cuanto aparezca algo que calce. Puedes
                        afinar las palabras después, en Alertas.
                      </p>
                    </div>
                  </div>

                  {/* Estas tres tarjetas estaban en un tercer paso al que NO
                      se podía llegar: `setStep(3)` no se llamaba desde ningún
                      sitio, así que el usuario veía siempre una barra de
                      progreso de tres tramos con el último vacío.

                      Y el paso muerto escondía un bug: su botón hacía
                      `router.push('/dashboard')` sin marcar
                      `onboarding_completed`, y el layout del panel devuelve a
                      /onboarding a quien lo tenga en `false`. De haberse podido
                      llegar, habría dejado al usuario dando vueltas. Se
                      recuperan aquí, que es donde el usuario sí llega. */}
                  <div className="grid grid-cols-1 gap-2.5 text-left">
                    {[
                      { title: 'Mira qué hay abierto', desc: 'Filtra por región, monto y mecanismo', href: '/dashboard/tenders' },
                      { title: 'Consulta un precio', desc: 'Cuánto ha pagado ese comprador por lo que vendes', href: '/dashboard/bi' },
                      { title: 'Arma tu primera postulación', desc: 'Con el checklist de documentos que te van a pedir', href: '/dashboard/postulaciones' },
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
                    onClick={handleFinish}
                    disabled={loading}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Ir a mi panel <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
