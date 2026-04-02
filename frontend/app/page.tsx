'use client';

import { useState, useEffect, useCallback } from 'react';
import TordoLogo from '@/components/TordoLogo';
import Link from 'next/link';
import {
  BarChart3,
  CheckCircle2,
  ShieldCheck,
  Bell,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  Target,
  Users,
  DollarSign,
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

const rotatingRubros = [
  'servicios de aseo',
  'suministros médicos',
  'tecnología',
  'construcción',
  'transporte',
  'alimentación',
  'mantención',
  'seguridad',
  'consultoría',
  'equipamiento',
];

const faqs = [
  {
    question: '¿Necesito estar registrado en ChileCompra?',
    answer:
      'Sí. Para postular a licitaciones en Mercado Público necesitas estar inscrito como proveedor en el Registro de Proveedores de ChileCompra. TORDO no reemplaza ese registro — te ayuda a usar mejor la información disponible una vez que ya eres proveedor.',
  },
  {
    question: '¿Necesito experiencia en licitaciones?',
    answer:
      'No. TORDO está diseñado para que cualquier empresa pueda entender una licitación y evaluar si le conviene postular, sin conocimiento previo del proceso.',
  },
  {
    question: '¿Qué es el "estado hábil"?',
    answer:
      'Para postular en Mercado Público tu empresa debe estar "hábil" en ChileCompra. Si pierdes la habilitación, quedas fuera. TORDO revisa tu estado diariamente y te avisa si algo cambia.',
  },
  {
    question: '¿De dónde vienen los datos?',
    answer:
      'De los archivos públicos de órdenes de compra que publica ChileCompra. Son datos oficiales, gratuitos y verificables. Procesamos millones de transacciones para calcular rangos de precio por producto y comprador.',
  },
  {
    question: '¿En qué se diferencia de otras herramientas?',
    answer:
      'La mayoría de las herramientas están diseñadas para equipos grandes con analistas dedicados. TORDO está pensado para el dueño de PYME que toma decisiones solo: simplifica la información para que entiendas rápido si conviene postular.',
  },
  {
    question: '¿Puedo cancelar cuando quiera?',
    answer:
      'Sí. Sin penalidades, sin preguntas. Tu plan sigue activo hasta el fin del período.',
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
    daily: '~$397/día',
    description: 'Inteligencia completa para ganar más',
    features: [
      'Alertas ilimitadas',
      'Inteligencia BI completa',
      'Benchmarks de precio por producto',
      'Análisis de competidores',
      'Checklist por tipo de licitación',
      'Matching semántico',
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
   ROTATING TEXT COMPONENT
   ───────────────────────────────────────────── */

function RotatingRubro() {
  const [index, setIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % rotatingRubros.length);
        setIsVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className={`inline-block text-[#0EAD69] bg-[#0EAD69]/15 px-3 py-0.5 rounded-lg transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      {rotatingRubros[index]}
    </span>
  );
}

/* ─────────────────────────────────────────────
   CSS MOCKUP COMPONENTS
   ───────────────────────────────────────────── */

function BrowserChrome({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border border-[#1A1F2C] bg-[#0A0C10] shadow-2xl">
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
      <div className="flex gap-2 mb-4">
        {kpis.map((k) => (
          <div key={k.label} className="flex-1 rounded-lg bg-[#0F1117] border border-[#1A1F2C] p-2.5 text-center">
            <p className="text-lg font-bold text-[#E2E8F0]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{k.value}</p>
            <p className="text-[9px] text-[#94A3B8] mt-0.5">{k.label}</p>
            <div className="mt-1.5 h-0.5 rounded-full mx-auto w-8" style={{ background: k.accent }} />
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-[#0F1117] border border-[#1A1F2C] overflow-hidden">
        <div className="grid grid-cols-[1fr_0.7fr_1fr_0.5fr] gap-2 px-3 py-2 text-[9px] font-semibold text-[#94A3B8] uppercase tracking-wider border-b border-[#1A1F2C]">
          <span>Organismo</span><span>Rubro</span><span>Score</span><span>CAGR</span>
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
      <div className="flex items-center gap-2 mb-4 rounded-lg bg-[#0F1117] border border-[#1A1F2C] px-3 py-2">
        <span className="text-[10px] text-[#94A3B8]">Estado Hábil:</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#00C896]/15 px-2 py-0.5 text-[10px] font-semibold text-[#00C896]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00C896]" /> Hábil
        </span>
      </div>
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
    { label: 'Garantía de seriedad', checked: true },
    { label: 'Certificado tributario', checked: true },
    { label: 'Póliza de seguro', checked: false },
    { label: 'Propuesta técnica', checked: false },
  ];

  return (
    <BrowserChrome url="tordo.cl/dashboard/postulaciones">
      <div className="mb-3">
        <p className="text-[11px] font-semibold text-[#E2E8F0]">Licitación: Servicio de aseo Hospital X</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[9px] text-[#94A3B8]">Estado:</span>
          <span className="inline-flex items-center rounded-full bg-[#F59E0B]/15 px-2 py-0.5 text-[9px] font-semibold text-[#F59E0B]">En preparación</span>
        </div>
      </div>
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-[#94A3B8]">Progreso</span>
          <span className="text-[10px] font-semibold text-[#00C896]">50%</span>
        </div>
        <div className="h-2 rounded-full bg-[#1A1F2C] overflow-hidden">
          <div className="h-full rounded-full bg-[#00C896]" style={{ width: '50%' }} />
        </div>
      </div>
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
            <span className="text-[8px] font-medium text-[#F85149]/70 uppercase tracking-wider">Oblig.</span>
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
   MAIN PAGE
   ───────────────────────────────────────────── */

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('bi');
  const [userClicked, setUserClicked] = useState(false);
  const [showMobileCta, setShowMobileCta] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  useEffect(() => {
    const onScroll = () => setShowMobileCta(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-white" style={{ fontFamily: 'var(--font-dm-sans, system-ui)' }}>

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-[#E2E6EF] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <TordoLogo size={52} />
            <span
              className="font-bold text-[#0F2942] leading-none self-center"
              style={{ fontFamily: 'var(--font-varien, system-ui)', letterSpacing: '0.15em', fontSize: '2.6rem' }}
            >
              TORDO
            </span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-[#64748B] md:flex">
            {navItems.map((item) => (
              <Link key={item.name} href={item.href} className="transition-colors hover:text-[#0F2942]">{item.name}</Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden rounded-lg px-4 py-2 text-sm font-semibold text-[#64748B] transition-colors hover:text-[#0F2942] md:block">
              Iniciar sesión
            </Link>
            <Link href="/register" className="rounded-lg bg-[#0EAD69] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#09895B] hover:shadow-md">
              Prueba gratis
            </Link>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="rounded-lg p-2 text-[#64748B] hover:text-[#0F2942] md:hidden">
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-[#E2E6EF] bg-white px-6 py-4 md:hidden">
            <nav className="flex flex-col gap-3">
              {navItems.map((item) => (
                <Link key={item.name} href={item.href} onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-[#64748B] hover:text-[#0F2942]">{item.name}</Link>
              ))}
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="text-sm font-semibold text-[#64748B] hover:text-[#0F2942]">Iniciar sesión</Link>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-[#0F2942] px-6 py-12 sm:py-16">
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#0EAD69]/60 to-transparent" />

          <div className="relative mx-auto max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-8 items-center">
              <div className="lg:col-span-3">
                <h1 className="mb-6 text-4xl font-bold leading-[1.15] text-white sm:text-5xl xl:text-[3.5rem]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                  <span className="block">Postula con ventaja</span>
                  <span className="block">en licitaciones de</span>
                  <span className="block" style={{ minHeight: '1.1em' }}>
                    <RotatingRubro />
                  </span>
                </h1>

                <p className="mb-8 max-w-xl text-lg text-white/65 leading-relaxed">
                  Precios históricos, mapa de competidores y checklist de documentos — todo lo que necesitas para decidir si conviene postular, antes de invertir tiempo.
                </p>

                {/* Inclusive message */}
                <p className="mb-8 max-w-lg text-sm text-white/45 leading-relaxed">
                  No importa el tamaño de tu empresa ni tu experiencia en licitaciones. TORDO te ayuda a entender cada oportunidad y mejorar tus probabilidades.
                </p>

                <div className="flex flex-wrap gap-4 mb-12">
                  <Link href="/register" className="inline-flex items-center gap-2 rounded-lg bg-[#0EAD69] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#09895B] hover:shadow-xl">
                    Prueba gratis — sin tarjeta
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href="#producto" className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/[0.08] px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/15">
                    Ver el producto
                  </Link>
                </div>

                {/* Stats */}
                <div className="flex flex-wrap gap-8 sm:gap-12">
                  {[
                    { value: '$17.6B USD', label: 'en compras públicas (2024)' },
                    { value: '110.000+', label: 'proveedores en el mercado' },
                    { value: '+3.2M', label: 'transacciones analizadas' },
                  ].map((item) => (
                    <div key={item.value}>
                      <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{item.value}</p>
                      <p className="mt-0.5 text-sm text-white/45">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 flex flex-col items-center justify-center gap-3">
                <div className="w-full max-w-md animate-float rounded-xl" style={{ boxShadow: '0 20px 60px rgba(14,173,105,0.15)' }}>
                  <MockupBIPanel />
                </div>
                <p className="flex items-center gap-1.5 text-xs text-white/35 self-end pr-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#0EAD69]" />
                  Fuente oficial: datos públicos de ChileCompra
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Benefits ── */}
        <section className="bg-[#F6F7FB] px-6 py-20" id="beneficios">
          <div className="mx-auto max-w-5xl">
            <div className="mb-14 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">
                QUÉ HACE TORDO
              </p>
              <h2 className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                Inteligencia para decidir. Orden para postular.
              </h2>
              <p className="mt-4 max-w-2xl mx-auto text-[#64748B] leading-relaxed">
                Antes de invertir tiempo en una licitación, TORDO te muestra si tu precio es competitivo y qué tan confiable es el organismo comprador. Cuando postulas, te asegura que no te descarten sin siquiera ser evaluado.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-0">
              <div className="lg:pr-10 lg:border-r lg:border-[#E2E6EF]">
                <div className="mb-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0EAD69] mb-1">ANTES DE POSTULAR</p>
                  <h3 className="text-xl font-bold text-[#0D1B2A]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                    Entiende si conviene
                  </h3>
                </div>
                <div className="space-y-5">
                  {[
                    { icon: DollarSign, title: 'Rangos de precio reales', desc: '¿A cuánto se ha adjudicado este tipo de producto? Dato concreto para calibrar tu oferta.' },
                    { icon: Users, title: 'Mapa de competidores', desc: 'Cuántos proveedores compiten en tu rubro y quiénes ganan más seguido.' },
                    { icon: Target, title: 'Score de oportunidad', desc: 'Un puntaje que resume si la licitación calza con tu perfil y vale la pena el esfuerzo.' },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex gap-4 group">
                        <div className="mt-0.5 flex-shrink-0 h-9 w-9 rounded-lg bg-[#0F2942]/[0.07] flex items-center justify-center group-hover:bg-[#0EAD69]/10 transition-colors">
                          <Icon className="h-4 w-4 text-[#0F2942] group-hover:text-[#0EAD69] transition-colors" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-[#0D1B2A]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{item.title}</h4>
                          <p className="text-sm text-[#64748B] leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:pl-10">
                <div className="mb-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0EAD69] mb-1">AL POSTULAR</p>
                  <h3 className="text-xl font-bold text-[#0D1B2A]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                    No pierdas por forma
                  </h3>
                </div>
                <div className="space-y-5">
                  {[
                    { icon: CheckCircle2, title: 'Checklist de documentos', desc: 'Qué documentos necesitas según el tipo de licitación. Sin adivinar.' },
                    { icon: ShieldCheck, title: 'Monitor de estado hábil', desc: 'Revisión diaria automática. Si tu habilitación cambia, te avisa de inmediato.' },
                    { icon: Bell, title: 'Alertas de plazo', desc: 'Notificaciones 48h y 24h antes del cierre. Filtradas por rubro y región.' },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex gap-4 group">
                        <div className="mt-0.5 flex-shrink-0 h-9 w-9 rounded-lg bg-[#0F2942]/[0.07] flex items-center justify-center group-hover:bg-[#0EAD69]/10 transition-colors">
                          <Icon className="h-4 w-4 text-[#0F2942] group-hover:text-[#0EAD69] transition-colors" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-[#0D1B2A]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{item.title}</h4>
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
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">EL PRODUCTO</p>
              <h2 className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                Así se ve tomar mejores decisiones
              </h2>
            </div>

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

            <div className="max-w-2xl mx-auto">
              {activeTab === 'bi' && <MockupBIPanel />}
              {activeTab === 'dashboard' && <MockupDashboard />}
              {activeTab === 'postulaciones' && <MockupPostulaciones />}
            </div>

            <div className="mt-10 text-center">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-lg bg-[#0EAD69] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#09895B] hover:shadow-xl">
                Quiero ver esto con mis datos
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section id="como-funciona" className="px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">CÓMO EMPEZAR</p>
              <h2 className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                Tu primera licitación analizada en minutos
              </h2>
            </div>

            <div className="grid gap-8 md:grid-cols-3 relative">
              <div className="hidden md:block absolute top-6 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-px bg-gradient-to-r from-[#0F2942]/20 via-[#0EAD69]/30 to-[#0F2942]/20" />
              {[
                { step: '01', title: 'Registra tu empresa', desc: 'Ingresa tu RUT y rubros. TORDO verifica tu estado hábil automáticamente. (Necesitas estar registrado como proveedor en ChileCompra.)' },
                { step: '02', title: 'Explora oportunidades', desc: 'Recibes licitaciones que calzan con tu perfil, cada una con un score de oportunidad.' },
                { step: '03', title: 'Postula informado', desc: 'Revisa precios históricos, competidores, y prepara tu documentación con el checklist.' },
              ].map((s) => (
                <div key={s.step} className="relative">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#0F2942] text-white font-bold text-lg relative z-10" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                    {s.step}
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-[#0D1B2A]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{s.title}</h3>
                  <p className="text-sm text-[#64748B] leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Data Trust ── */}
        <section className="bg-white px-6 py-16 border-t border-[#EEF1F7]">
          <div className="mx-auto max-w-5xl">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-[#94A3B8] mb-8">
              Construido sobre datos públicos de ChileCompra
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { value: '+3.2M', label: 'transacciones analizadas' },
                { value: '8 años', label: 'de historial de compras' },
                { value: '722K', label: 'bandas de precio calculadas' },
                { value: '97K', label: 'proveedores perfilados' },
              ].map((item) => (
                <div key={item.value} className="text-center">
                  <p className="text-3xl font-bold text-[#0F2942] sm:text-4xl" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{item.value}</p>
                  <p className="mt-2 text-sm text-[#64748B]">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="precios" className="bg-[#F6F7FB] px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">PLANES</p>
              <h2 className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                Empieza gratis. Crece cuando quieras.
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
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#0EAD69] px-3 py-1 text-[11px] font-bold text-white whitespace-nowrap">Más popular</span>
                    </div>
                  )}
                  <div className="mb-4">
                    <h3 className={`text-lg font-bold mb-1 ${plan.highlight ? 'text-white' : 'text-[#0D1B2A]'}`} style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{plan.name}</h3>
                    <p className={`text-xs ${plan.highlight ? 'text-white/60' : 'text-[#64748B]'}`}>{plan.description}</p>
                  </div>
                  <div className="mb-1">
                    <span className={`font-bold text-3xl ${plan.highlight ? 'text-white' : 'text-[#0D1B2A]'}`} style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{plan.price}</span>
                    {plan.period && <span className={`text-sm ${plan.highlight ? 'text-white/60' : 'text-[#64748B]'}`}>{plan.period}</span>}
                  </div>
                  {plan.daily ? (
                    <p className={`text-xs mb-4 ${plan.highlight ? 'text-white/50' : 'text-[#94A3B8]'}`}>{plan.daily}</p>
                  ) : (
                    <div className="mb-4" />
                  )}
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
            <p className="mt-8 text-center text-sm text-[#94A3B8]">
              El plan Free no tiene límite de tiempo. Explora todo lo que necesites.
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="px-6 py-20">
          <div className="mx-auto max-w-2xl">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                Preguntas frecuentes
              </h2>
            </div>
            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <div key={i} className={`rounded-xl border border-[#E2E6EF] bg-white transition-shadow ${openFaq === i ? 'shadow-md' : ''}`}>
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-[#0D1B2A] hover:text-[#0F2942]"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-[#94A3B8] transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} />
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
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#0EAD69]/60 to-transparent" />
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />

          <div className="relative mx-auto max-w-2xl text-center">
            <div className="mb-6 flex justify-center" style={{ filter: 'brightness(0) invert(1)' }}>
              <TordoLogo size={64} />
            </div>
            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
              Tu próxima licitación, con mejor información
            </h2>
            <p className="mb-8 text-white/65 leading-relaxed">
              Cuenta gratis en 2 minutos. Sin tarjeta. Sin experiencia previa necesaria.
            </p>
            <Link href="/register" className="inline-flex items-center gap-2 rounded-lg bg-[#0EAD69] px-8 py-4 text-base font-bold text-white shadow-lg transition-all hover:bg-[#09895B] hover:shadow-xl">
              Crear cuenta gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[#E2E6EF] bg-white px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <TordoLogo size={24} />
              <span className="text-sm font-bold text-[#0F2942]" style={{ fontFamily: 'var(--font-varien, system-ui)' }}>TORDO</span>
            </div>
            <p className="text-xs text-[#94A3B8]">© 2026 TORDO · Inteligencia para Mercado Público · Chile</p>
            <div className="flex gap-5 text-xs text-[#94A3B8]">
              <Link href="/login" className="hover:text-[#0F2942] transition-colors">Iniciar sesión</Link>
              <Link href="/register" className="hover:text-[#0F2942] transition-colors">Registrarse</Link>
            </div>
          </div>
          <p className="mt-4 text-center text-[10px] text-[#94A3B8]/70">
            Datos de licitaciones y órdenes de compra de fuentes públicas de ChileCompra. TORDO no está afiliado al gobierno de Chile.
          </p>
        </div>
      </footer>

      {/* ── Sticky Mobile CTA ── */}
      {showMobileCta && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E2E6EF] bg-white px-4 py-3 lg:hidden">
          <Link href="/register" className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0EAD69] px-6 py-3 text-sm font-bold text-white transition-all hover:bg-[#09895B]">
            Prueba gratis
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
