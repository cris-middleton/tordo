'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  BarChart3,
  CheckCircle2,
  ShieldCheck,
  Bell,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';

/* ─────────────────────────────────────────────
   DATA
   ───────────────────────────────────────────── */

const navItems = [
  { name: 'Beneficios', href: '#beneficios' },
  { name: 'Cómo funciona', href: '#como-funciona' },
  { name: 'Precios', href: '#precios' },
  { name: 'FAQ', href: '#faq' },
];

const faqs = [
  {
    question: 'Nunca he postulado a una licitación. ¿TORDO es para mí?',
    answer:
      'Especialmente para ti. TORDO fue diseñado para dueños de PYME que no tienen un equipo dedicado ni experiencia previa en Mercado Público. El flujo guiado te lleva paso a paso: desde entender si una licitación te conviene hasta saber exactamente qué documentos cargar.',
  },
  {
    question: '¿Qué es el "estado hábil" y por qué importa?',
    answer:
      'Para postular en Mercado Público, tu empresa debe estar "hábil" en el Registro de Proveedores de ChileCompra. Si pierdes la habilitación (por deudas previsionales, tributarias, etc.), quedas fuera automáticamente. TORDO revisa tu estado todos los días y te avisa si algo cambia.',
  },
  {
    question: '¿De dónde vienen los datos de precios?',
    answer:
      'De los archivos masivos de órdenes de compra que publica ChileCompra — datos 100% públicos y verificables. TORDO procesa más de 3 millones de transacciones desde 2018, cada una con 78 campos de información, para calcularte rangos de precio por producto y comprador.',
  },
  {
    question: '¿En qué se diferencia de otras herramientas de licitaciones?',
    answer:
      'La mayoría de las herramientas están diseñadas para equipos grandes con analistas dedicados. TORDO está pensado para el dueño de PYME que toma decisiones solo: te dice si conviene postular (con datos, no con intuición), y luego te asegura que no la pierdas por un error de forma. Más simple, más barato, y enfocado en resultados.',
  },
  {
    question: '¿Necesito cuenta en ChileCompra para usar TORDO?',
    answer:
      'Para usar TORDO, no. Para postular a una licitación, sí necesitas estar inscrito en el Registro de Proveedores de ChileCompra. TORDO te ayuda con todo lo que viene antes y durante la postulación.',
  },
  {
    question: '¿Puedo cancelar cuando quiera?',
    answer:
      'Sí. Sin costos adicionales, sin penalidades, sin preguntas. Tu plan sigue activo hasta el fin del período contratado.',
  },
  {
    question: '¿Cómo protegen mis datos?',
    answer:
      'Infraestructura en la nube con cifrado en tránsito y en reposo, controles de acceso por roles, y monitoreo continuo.',
  },
];

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    daily: '',
    description: 'Para explorar sin compromiso',
    features: [
      'Exploración de licitaciones',
      'Panel básico',
      'Sin tarjeta de crédito',
    ],
    highlight: false,
    cta: 'Comenzar gratis',
    href: '/register',
  },
  {
    name: 'Starter',
    price: '$5.900',
    period: '/mes',
    daily: '~$197/día',
    description: 'Para quien quiere estar al día',
    features: [
      '10 alertas segmentadas por mes',
      'Filtros por región y rubro',
      'Monitor de estado hábil',
      'Soporte por correo',
    ],
    highlight: false,
    cta: 'Elegir Starter',
    href: '/register',
  },
  {
    name: 'Pro',
    price: '$11.900',
    period: '/mes',
    daily: '~$397/día — menos que un café',
    description: 'La ventaja competitiva de las PYMES que ganan',
    features: [
      'Alertas ilimitadas',
      'Inteligencia BI completa',
      'Benchmarks de precio por producto y organismo',
      'Análisis de competidores y score de comprador',
      'Checklist de documentos por tipo de licitación',
      'Matching semántico de oportunidades',
      'Exportaciones y reportes',
    ],
    highlight: true,
    cta: 'Elegir Pro',
    href: '/register',
  },
  {
    name: 'Enterprise',
    price: 'A consultar',
    period: '',
    daily: '',
    description: 'Para equipos y múltiples RUTs',
    features: [
      'Todo lo del plan Pro',
      'Usuarios múltiples con roles',
      'Integraciones API',
      'Soporte prioritario',
    ],
    highlight: false,
    cta: 'Contactar',
    href: '#contacto',
  },
];

/* ─────────────────────────────────────────────
   CSS MOCKUP COMPONENTS (Obsidian palette)
   ───────────────────────────────────────────── */

function BrowserChrome({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border border-[#1A1F2C] bg-[#0A0C10] shadow-2xl">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0F1117] border-b border-[#1A1F2C]">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#F85149]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#00C896]/80" />
        </div>
        <div className="ml-2 flex-1 rounded-md bg-[#0A0C10] border border-[#1A1F2C] px-3 py-1 text-[10px] text-[#94A3B8] font-mono truncate">
          {url}
        </div>
      </div>
      {/* Content */}
      <div className="p-4">{children}</div>
    </div>
  );
}

function MockupBIPanel() {
  const rows = [
    { org: 'Hospital X', rubro: 'Aseo', score: 82, label: '8.2', cagr: '+3%', color: '#00C896' },
    { org: 'Municipio Y', rubro: 'Tecn.', score: 65, label: '6.5', cagr: '+7%', color: '#00C896' },
    { org: 'SERVIU', rubro: 'Constr.', score: 41, label: '4.1', cagr: '-2%', color: '#F59E0B' },
  ];
  const kpis = [
    { value: '47', label: 'Oport.', accent: '#00C896' },
    { value: '12', label: 'Alert.', accent: '#4A8FE7' },
    { value: '3', label: 'Pend.', accent: '#F59E0B' },
  ];

  return (
    <BrowserChrome url="tordo.cl/dashboard/bi">
      {/* KPI tiles */}
      <div className="flex gap-2 mb-4">
        {kpis.map((k) => (
          <div key={k.label} className="flex-1 rounded-lg bg-[#0F1117] border border-[#1A1F2C] p-2.5 text-center">
            <p className="text-lg font-bold text-[#E2E8F0]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{k.value}</p>
            <p className="text-[9px] text-[#94A3B8] mt-0.5">{k.label}</p>
            <div className="mt-1.5 h-0.5 rounded-full mx-auto w-8" style={{ background: k.accent }} />
          </div>
        ))}
      </div>
      {/* Table */}
      <div className="rounded-lg bg-[#0F1117] border border-[#1A1F2C] overflow-hidden">
        <div className="grid grid-cols-[1fr_0.7fr_1fr_0.5fr] gap-2 px-3 py-2 text-[9px] font-semibold text-[#94A3B8] uppercase tracking-wider border-b border-[#1A1F2C]">
          <span>Organismo</span>
          <span>Rubro</span>
          <span>Score</span>
          <span>CAGR</span>
        </div>
        {rows.map((r) => (
          <div key={r.org} className="grid grid-cols-[1fr_0.7fr_1fr_0.5fr] gap-2 px-3 py-2 items-center border-b border-[#1A1F2C] last:border-0">
            <span className="text-[11px] text-[#E2E8F0] truncate">{r.org}</span>
            <span className="text-[10px] text-[#94A3B8]">{r.rubro}</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-[#1A1F2C] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${r.score}%`, background: `linear-gradient(90deg, ${r.color}88, ${r.color})` }} />
              </div>
              <span className="text-[10px] font-semibold text-[#E2E8F0] tabular-nums w-6 text-right">{r.label}</span>
            </div>
            <span className={`text-[10px] font-medium ${r.cagr.startsWith('+') ? 'text-[#00C896]' : 'text-[#F85149]'}`}>{r.cagr}</span>
          </div>
        ))}
      </div>
    </BrowserChrome>
  );
}

function MockupDashboard() {
  const kpis = [
    { value: '23', label: 'Licit.', color: '#00C896' },
    { value: '5', label: 'Alert.', color: '#4A8FE7' },
    { value: '8', label: 'Post.', color: '#F59E0B' },
    { value: '2', label: 'Docs', color: '#F85149' },
  ];
  const bars = [85, 92, 78, 65, 88, 45, 72];

  return (
    <BrowserChrome url="tordo.cl/dashboard">
      <p className="text-xs font-semibold text-[#E2E8F0] mb-3" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>Dashboard</p>
      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg bg-[#0F1117] border border-[#1A1F2C] overflow-hidden">
            <div className="h-1" style={{ background: k.color }} />
            <div className="p-2 text-center">
              <p className="text-base font-bold text-[#E2E8F0]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{k.value}</p>
              <p className="text-[9px] text-[#94A3B8]">{k.label}</p>
            </div>
          </div>
        ))}
      </div>
      {/* Estado habil */}
      <div className="flex items-center gap-2 mb-4 rounded-lg bg-[#0F1117] border border-[#1A1F2C] px-3 py-2">
        <span className="text-[10px] text-[#94A3B8]">Estado Hábil:</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#00C896]/15 px-2 py-0.5 text-[10px] font-semibold text-[#00C896]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00C896]" />
          Hábil
        </span>
      </div>
      {/* Chart */}
      <div className="rounded-lg bg-[#0F1117] border border-[#1A1F2C] p-3">
        <div className="flex items-end gap-1.5 h-12">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: 'linear-gradient(180deg, #00C896, #00C89644)' }} />
          ))}
        </div>
      </div>
    </BrowserChrome>
  );
}

function MockupPostulaciones() {
  const items = [
    { label: 'Garantía de seriedad', checked: true, obligatorio: true },
    { label: 'Certificado tributario', checked: true, obligatorio: true },
    { label: 'Póliza de seguro', checked: false, obligatorio: true },
    { label: 'Propuesta técnica', checked: false, obligatorio: true },
  ];
  const progress = 50;

  return (
    <BrowserChrome url="tordo.cl/dashboard/postulaciones">
      <div className="mb-3">
        <p className="text-[11px] font-semibold text-[#E2E8F0]">Licitación: Servicio de aseo Hospital X</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[9px] text-[#94A3B8]">Estado:</span>
          <span className="inline-flex items-center rounded-full bg-[#F59E0B]/15 px-2 py-0.5 text-[9px] font-semibold text-[#F59E0B]">
            En preparación
          </span>
        </div>
      </div>
      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-[#94A3B8]">Progreso</span>
          <span className="text-[10px] font-semibold text-[#00C896]">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-[#1A1F2C] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[#00C896] to-[#00C896]" style={{ width: `${progress}%` }} />
        </div>
      </div>
      {/* Checklist */}
      <div className="rounded-lg bg-[#0F1117] border border-[#1A1F2C] overflow-hidden">
        {items.map((item, i) => (
          <div key={i} className={`flex items-center justify-between px-3 py-2 ${i < items.length - 1 ? 'border-b border-[#1A1F2C]' : ''}`}>
            <div className="flex items-center gap-2">
              {item.checked ? (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#00C896]/20 text-[#00C896] text-[10px]">&#10003;</span>
              ) : (
                <span className="h-4 w-4 rounded-full border border-[#1A1F2C]" />
              )}
              <span className={`text-[11px] ${item.checked ? 'text-[#E2E8F0]' : 'text-[#94A3B8]'}`}>{item.label}</span>
            </div>
            {item.obligatorio && (
              <span className="text-[8px] font-medium text-[#F85149]/70 uppercase tracking-wider">Oblig.</span>
            )}
          </div>
        ))}
      </div>
    </BrowserChrome>
  );
}

/* ─────────────────────────────────────────────
   PRODUCT DEMO TABS
   ───────────────────────────────────────────── */

const productTabs = [
  { id: 'bi', label: 'Inteligencia BI' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'postulaciones', label: 'Postulaciones' },
] as const;

type TabId = (typeof productTabs)[number]['id'];

/* ─────────────────────────────────────────────
   MAIN PAGE COMPONENT
   ───────────────────────────────────────────── */

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('bi');
  const [userClicked, setUserClicked] = useState(false);
  const [showMobileCta, setShowMobileCta] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Auto-advance product demo tabs
  useEffect(() => {
    if (userClicked) return;
    const interval = setInterval(() => {
      setActiveTab((prev) => {
        const idx = productTabs.findIndex((t) => t.id === prev);
        return productTabs[(idx + 1) % productTabs.length].id;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [userClicked]);

  const handleTabClick = useCallback((id: TabId) => {
    setActiveTab(id);
    setUserClicked(true);
  }, []);

  // Sticky mobile CTA on scroll
  useEffect(() => {
    const onScroll = () => {
      setShowMobileCta(window.scrollY > 600);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-white" style={{ fontFamily: 'var(--font-dm-sans, system-ui)' }}>
      {/* Float animation keyframes */}
      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: perspective(1200px) rotateY(-5deg) rotateX(2deg) translateY(0);
          }
          50% {
            transform: perspective(1200px) rotateY(-5deg) rotateX(2deg) translateY(-8px);
          }
        }
        @keyframes pulse-green {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-[#E2E6EF] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="#" className="flex items-center gap-3 group">
            <div className="relative h-9 w-9">
              <Image
                src="/images/TORDO_logo.png"
                alt="TORDO"
                fill
                sizes="36px"
                className="object-contain absolute transition-opacity duration-300 group-hover:opacity-0"
                priority
              />
              <Image
                src="/images/TORDO_logo_openwings.png"
                alt="TORDO"
                fill
                sizes="36px"
                className="object-contain absolute opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                priority
              />
            </div>
            <div>
              <span
                className="text-xl font-bold tracking-tight text-[#0F2942]"
                style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                TORDO
              </span>
              <span className="ml-2 hidden sm:inline text-xs font-medium tracking-widest uppercase text-[#94A3B8]">
                Mercado Público
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-[#64748B] md:flex">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="transition-colors hover:text-[#0F2942]"
              >
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden rounded-lg px-4 py-2 text-sm font-semibold text-[#64748B] transition-colors hover:text-[#0F2942] md:block"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-[#0EAD69] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#09895B] hover:shadow-md"
            >
              Prueba gratis
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-[#0F2942] px-6 py-20 sm:py-28">
          {/* Dot grid */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />
          {/* Accent gradient line */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#0EAD69]/60 to-transparent" />

          <div className="relative mx-auto max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-8 items-center">
              {/* Left — Text (60%) */}
              <div className="lg:col-span-3">
                {/* Badge pill */}
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.08] px-4 py-2 text-sm font-medium text-white/80 backdrop-blur-sm">
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-[#0EAD69]"
                    style={{ animation: 'pulse-green 2s ease-in-out infinite' }}
                  />
                  Datos oficiales de ChileCompra · Actualizado diariamente
                </div>

                <h1
                  className="mb-6 max-w-2xl text-4xl font-bold leading-[1.1] text-white sm:text-5xl xl:text-[3.5rem]"
                  style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
                >
                  El único que te dice si tu oferta{' '}
                  <span className="text-[#0EAD69]">va a ganar</span>{' '}
                  antes de enviarla.
                </h1>

                <p className="mb-10 max-w-xl text-lg text-white/65 leading-relaxed">
                  TORDO analiza precios históricos, competidores y plazos de Mercado Público para que decidas con datos reales — no con intuición. Diseñado para PYMES proveedoras que no tienen un equipo dedicado a licitaciones.
                </p>

                <div className="flex flex-wrap gap-4 mb-12">
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#0EAD69] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#09895B] hover:shadow-xl"
                  >
                    Crear cuenta gratis — sin tarjeta
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="#producto"
                    className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/[0.08] px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/15"
                  >
                    Ver el producto en acción
                  </Link>
                </div>

                {/* Stats strip */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-sm">
                    <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                      $17.6B USD
                    </p>
                    <p className="mt-1 text-sm text-white/55">adjudicados en 2024 en Mercado Público</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-sm">
                    <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                      110.000+
                    </p>
                    <p className="mt-1 text-sm text-white/55">proveedores registrados — menos del 1% usa inteligencia de datos</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-sm">
                    <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                      46,6%
                    </p>
                    <p className="mt-1 text-sm text-white/55">del mercado con precios predecibles — TORDO te muestra cuáles</p>
                  </div>
                </div>
              </div>

              {/* Right — CSS Mockup (40%) */}
              <div className="lg:col-span-2 flex items-center justify-center">
                <div
                  style={{
                    animation: 'float 6s ease-in-out infinite',
                    boxShadow: '0 20px 60px rgba(14,173,105,0.15)',
                    borderRadius: '12px',
                  }}
                  className="w-full max-w-md"
                >
                  <MockupBIPanel />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Trust Strip ── */}
        <div className="bg-white border-b border-[#EEF1F7]">
          <div className="mx-auto max-w-6xl px-6 py-3 text-center">
            <p className="text-xs text-[#94A3B8]">
              Fuente: datos públicos de ChileCompra · Órdenes de compra 2018–2026 · 78 campos por transacción
            </p>
          </div>
        </div>

        {/* ── Benefits — Two Problems ── */}
        <section className="bg-[#F6F7FB] px-6 py-20" id="beneficios">
          <div className="mx-auto max-w-5xl">
            <div className="mb-14 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">
                POR QUÉ TORDO
              </p>
              <h2
                className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl"
                style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                Dos problemas que toda PYME proveedora conoce.
                <br className="hidden sm:block" /> Una sola solución.
              </h2>
              <p className="mt-4 max-w-2xl mx-auto text-[#64748B] leading-relaxed">
                Si alguna vez perdiste horas investigando una licitación que no te convenía, o te rechazaron por un documento faltante — TORDO existe por eso.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-0">
              {/* Left Column */}
              <div className="lg:pr-10 lg:border-r lg:border-[#E2E6EF]">
                <div className="mb-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0EAD69] mb-1">ANTES DE POSTULAR</p>
                  <h3 className="text-xl font-bold text-[#0D1B2A]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                    Decide con datos, no con intuición
                  </h3>
                </div>
                <div className="space-y-6">
                  {[
                    {
                      title: 'Benchmarks de precio reales',
                      desc: 'Mirá a cuánto se adjudicó este producto en este hospital, los últimos 3 años. Dato concreto, no estimación.',
                    },
                    {
                      title: 'Análisis de competidores',
                      desc: 'Cuántos proveedores compiten, quién gana más, y si hay espacio para ti.',
                    },
                    {
                      title: 'Score de oportunidad',
                      desc: 'Un puntaje de 1 a 10 que resume si vale la pena postular.',
                    },
                  ].map((item) => (
                    <div key={item.title} className="flex gap-4 group">
                      <div className="mt-1 flex-shrink-0 h-10 w-10 rounded-lg bg-[#0F2942]/[0.07] flex items-center justify-center group-hover:bg-[#0EAD69]/10 transition-colors">
                        <BarChart3 className="h-5 w-5 text-[#0F2942] group-hover:text-[#0EAD69] transition-colors" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-[#0D1B2A] mb-1" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{item.title}</h4>
                        <p className="text-sm text-[#64748B] leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column */}
              <div className="lg:pl-10">
                <div className="mb-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0EAD69] mb-1">AL MOMENTO DE POSTULAR</p>
                  <h3 className="text-xl font-bold text-[#0D1B2A]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                    Sin errores, sin plazos perdidos
                  </h3>
                </div>
                <div className="space-y-6">
                  {[
                    {
                      icon: CheckCircle2,
                      title: 'Checklist de documentos',
                      desc: 'Te dice exactamente qué documentos cargar según el tipo de licitación (L1, LE, LP). Sin adivinar.',
                    },
                    {
                      icon: ShieldCheck,
                      title: 'Monitor de estado hábil',
                      desc: 'Revisa tu estado en ChileCompra todos los días. Si algo cambia, te avisa al tiro.',
                    },
                    {
                      icon: Bell,
                      title: 'Alertas y calendario',
                      desc: 'Alertas por rubro y región. Recordatorio 48h y 24h antes del cierre.',
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex gap-4 group">
                        <div className="mt-1 flex-shrink-0 h-10 w-10 rounded-lg bg-[#0F2942]/[0.07] flex items-center justify-center group-hover:bg-[#0EAD69]/10 transition-colors">
                          <Icon className="h-5 w-5 text-[#0F2942] group-hover:text-[#0EAD69] transition-colors" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-[#0D1B2A] mb-1" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{item.title}</h4>
                          <p className="text-sm text-[#64748B] leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Product Demo ── */}
        <section id="producto" className="bg-[#F6F7FB] px-6 py-20 border-t border-[#E2E6EF]">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">
                EL PRODUCTO
              </p>
              <h2
                className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl"
                style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                Así se ve tener ventaja
              </h2>
              <p className="mt-4 max-w-xl mx-auto text-[#64748B] leading-relaxed">
                Un panel de control diseñado para que tomes decisiones en minutos, no en horas.
              </p>
            </div>

            {/* Tab pills */}
            <div className="flex flex-wrap justify-center gap-3 mb-10">
              {productTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-[#0F2942] text-white shadow-md'
                      : 'border border-[#E2E6EF] text-[#64748B] hover:border-[#0F2942]/30 bg-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="max-w-2xl mx-auto">
              {activeTab === 'bi' && <MockupBIPanel />}
              {activeTab === 'dashboard' && <MockupDashboard />}
              {activeTab === 'postulaciones' && <MockupPostulaciones />}
            </div>

            {/* CTA */}
            <div className="mt-10 text-center">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-[#0EAD69] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#09895B] hover:shadow-xl"
              >
                Quiero ver esto con mis datos
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Mid-page CTA ── */}
        <section className="bg-white px-6 py-14">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-6 text-lg text-[#0D1B2A] font-medium leading-relaxed">
              Ya viste lo que TORDO puede hacer. Ahora probalo con tus datos.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-[#0EAD69] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#09895B] hover:shadow-xl"
            >
              Crear cuenta gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section id="como-funciona" className="px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">
                EL PROCESO
              </p>
              <h2
                className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl"
                style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                De cero a tu primera postulación en 10 minutos
              </h2>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              {[
                {
                  step: '01',
                  title: 'Registra tu empresa',
                  desc: 'Crea tu cuenta gratis, ingresa el RUT de tu empresa y selecciona los rubros en que trabajas. TORDO verifica tu estado hábil automáticamente.',
                },
                {
                  step: '02',
                  title: 'TORDO encuentra oportunidades',
                  desc: 'Matching semántico sobre el historial de compras públicas. Te muestra las licitaciones que calzan con tu perfil, con un score de oportunidad. Sin buscar manualmente.',
                },
                {
                  step: '03',
                  title: 'Postula con confianza',
                  desc: 'Checklist de documentos por tipo de licitación. Calendario con alertas de plazo. Y antes de enviar, sabes si tu precio está en rango ganador.',
                },
              ].map((s) => (
                <div key={s.step} className="relative">
                  <div
                    className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#0F2942] text-white font-bold text-lg"
                    style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
                  >
                    {s.step}
                  </div>
                  <h3
                    className="mb-2 text-xl font-bold text-[#0D1B2A]"
                    style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
                  >
                    {s.title}
                  </h3>
                  <p className="text-sm text-[#64748B] leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Social Proof / Data Trust ── */}
        <section className="bg-white px-6 py-20 border-t border-[#EEF1F7]">
          <div className="mx-auto max-w-5xl">
            <div className="mb-14 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">
                DATOS QUE RESPALDAN
              </p>
              <h2
                className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl"
                style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                Construido sobre la base de datos pública más grande de Chile
              </h2>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-14">
              {[
                { value: '+3.2M', label: 'órdenes de compra procesadas desde 2018' },
                { value: '78 campos', label: 'por cada transacción analizada' },
                { value: '722.000', label: 'bandas de precio calculadas' },
                { value: '97.000', label: 'proveedores con perfil semántico' },
              ].map((item) => (
                <div key={item.value} className="text-center">
                  <p
                    className="text-3xl font-bold text-[#0F2942] sm:text-4xl"
                    style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
                  >
                    {item.value}
                  </p>
                  <p className="mt-2 text-sm text-[#64748B]">{item.label}</p>
                </div>
              ))}
            </div>

            {/* Testimonial */}
            <div className="mx-auto max-w-2xl rounded-xl border border-[#E2E6EF] bg-white p-6 shadow-sm relative">
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-[#0EAD69]" />
              <p className="text-[#0D1B2A] leading-relaxed italic pl-4">
                &ldquo;Antes investigaba cada licitación a mano. Ahora abro TORDO, miro el score, y si es menor a 6 ni pierdo el tiempo.&rdquo;
              </p>
              <p className="mt-4 text-sm text-[#64748B] pl-4">
                — Proveedor de servicios, Región Metropolitana
              </p>
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="precios" className="bg-[#F6F7FB] px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">
                PLANES
              </p>
              <h2
                className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl"
                style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                Menos que un café al día. Más que un equipo de analistas.
              </h2>
              <p className="mt-4 text-[#64748B]">
                Precios en CLP. Sin contratos. Cancela cuando quieras.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative flex flex-col rounded-xl border p-6 transition-all ${
                    plan.highlight
                      ? 'border-[#0F2942] bg-[#0F2942] text-white shadow-xl'
                      : 'border-[#E2E6EF] bg-white shadow-sm hover:shadow-md hover:border-[#0F2942]/25'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#0EAD69] px-3 py-1 text-[11px] font-bold text-white whitespace-nowrap">
                        Más popular
                      </span>
                    </div>
                  )}
                  <div className="mb-4">
                    <h3
                      className={`text-lg font-bold mb-1 ${plan.highlight ? 'text-white' : 'text-[#0D1B2A]'}`}
                      style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
                    >
                      {plan.name}
                    </h3>
                    <p className={`text-xs ${plan.highlight ? 'text-white/60' : 'text-[#64748B]'}`}>
                      {plan.description}
                    </p>
                  </div>

                  <div className="mb-1">
                    <span
                      className={`font-bold text-3xl ${plan.highlight ? 'text-white' : 'text-[#0D1B2A]'}`}
                      style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
                    >
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className={`text-sm ${plan.highlight ? 'text-white/60' : 'text-[#64748B]'}`}>
                        {plan.period}
                      </span>
                    )}
                  </div>
                  {plan.daily && (
                    <p className={`text-xs mb-4 ${plan.highlight ? 'text-white/50' : 'text-[#94A3B8]'}`}>
                      {plan.daily}
                    </p>
                  )}
                  {!plan.daily && <div className="mb-4" />}

                  <ul className="mb-6 flex-1 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 text-xs text-[#0EAD69]">&#10003;</span>
                        <span className={plan.highlight ? 'text-white/80' : 'text-[#64748B]'}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.href}
                    className={`block rounded-lg py-2.5 text-center text-sm font-bold transition-all ${
                      plan.highlight
                        ? 'bg-[#0EAD69] text-white hover:bg-[#09895B]'
                        : 'border border-[#0F2942] text-[#0F2942] hover:bg-[#0F2942] hover:text-white'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>

            {/* Below pricing text */}
            <div className="mt-10 text-center space-y-2">
              <p className="text-sm text-[#94A3B8]">
                Herramientas similares parten en $50.000+/mes
              </p>
              <p className="text-sm text-[#64748B]">
                ¿Tienes dudas? El plan Free no tiene límite de tiempo. Prueba todo el que necesites.
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="px-6 py-20">
          <div className="mx-auto max-w-2xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">
                PREGUNTAS FRECUENTES
              </p>
              <h2
                className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl"
                style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                Respuestas directas
              </h2>
            </div>

            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  className={`rounded-xl border border-[#E2E6EF] bg-white transition-shadow ${openFaq === i ? 'shadow-md' : ''}`}
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-[#0D1B2A] hover:text-[#0F2942]"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[#94A3B8] transition-transform duration-200 ${
                        openFaq === i ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openFaq === i && (
                    <div className="border-t border-[#EEF1F7] px-5 py-4">
                      <p className="text-sm text-[#64748B] leading-relaxed">{faq.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section id="contacto" className="relative bg-[#0F2942] px-6 py-20 overflow-hidden">
          {/* Accent line at top */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#0EAD69]/60 to-transparent" />
          {/* Dot grid */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />

          <div className="relative mx-auto max-w-2xl text-center">
            <div className="mb-6 flex justify-center">
              <div className="relative h-16 w-16">
                <Image
                  src="/images/TORDO_logo_openwings.png"
                  alt="TORDO"
                  fill
                  sizes="64px"
                  className="object-contain brightness-0 invert"
                />
              </div>
            </div>
            <h2
              className="mb-4 text-3xl font-bold text-white sm:text-4xl"
              style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
            >
              Tu próxima licitación puede ser la que ganes
            </h2>
            <p className="mb-8 text-white/65 leading-relaxed">
              Crea tu cuenta en 2 minutos. Registra tu empresa. Y antes de que termine el día, vas a saber exactamente qué oportunidades te convienen.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-[#0EAD69] px-8 py-4 text-base font-bold text-white shadow-lg transition-all hover:bg-[#09895B] hover:shadow-xl"
            >
              Crear cuenta gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-4 text-xs text-white/35">
              Sin tarjeta de crédito · Cancela cuando quieras
            </p>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[#E2E6EF] bg-white px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="relative h-6 w-6">
                <Image src="/images/TORDO_logo.png" alt="TORDO" fill sizes="24px" className="object-contain" />
              </div>
              <span
                className="text-sm font-bold text-[#0F2942]"
                style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                TORDO
              </span>
            </div>
            <p className="text-xs text-[#94A3B8]">
              © 2026 TORDO · Inteligencia para Mercado Público · Chile
            </p>
            <div className="flex gap-5 text-xs text-[#94A3B8]">
              <Link href="/login" className="hover:text-[#0F2942] transition-colors">
                Iniciar sesión
              </Link>
              <Link href="/register" className="hover:text-[#0F2942] transition-colors">
                Registrarse
              </Link>
            </div>
          </div>
          <p className="mt-4 text-center text-[10px] text-[#94A3B8]/70">
            Los datos de licitaciones y órdenes de compra provienen de fuentes públicas de ChileCompra. TORDO no está afiliado al gobierno de Chile.
          </p>
        </div>
      </footer>

      {/* ── Sticky Mobile CTA ── */}
      {showMobileCta && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E2E6EF] bg-white px-4 py-3 lg:hidden">
          <Link
            href="/register"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0EAD69] px-6 py-3 text-sm font-bold text-white transition-all hover:bg-[#09895B]"
          >
            Prueba gratis
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
