'use client';

import { useState, useEffect, useCallback } from 'react';
import TordoLogo from '@/components/TordoLogo';
import Link from 'next/link';
import {
  CheckCircle2,
  Bell,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  Target,
  DollarSign,
  Sparkles,
  FileClock,
} from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { MockupPrecio } from '@/components/landing/MockupPrecio';
import { MockupScore } from '@/components/landing/MockupScore';
import { MockupMatching } from '@/components/landing/MockupMatching';

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
    question: '¿Necesito algo de ChileCompra antes de usar TORDO?',
    answer:
      'Sí. Para postular en Mercado Público tu empresa debe estar inscrita como proveedor en ChileCompra y mantener el "estado hábil" al día. TORDO no reemplaza ese registro — te ayuda a usar mejor la información una vez que ya eres proveedor, y revisa tu estado hábil diariamente para avisarte si algo cambia.',
  },
  {
    question: '¿Necesito experiencia en licitaciones?',
    answer:
      'No. TORDO está diseñado para que cualquier empresa pueda entender una licitación y evaluar si le conviene postular, sin conocimiento previo del proceso.',
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
];

const FREE_PLAN = {
  name: 'Free',
  description: 'Para explorar sin compromiso',
  features: [
    'Exploración de licitaciones',
    '3 alertas al mes',
    'Monitor de estado hábil',
    'Sin tarjeta de crédito',
  ],
  cta: 'Crear cuenta gratis',
  href: '/register',
};

const PRO_PLAN = {
  name: 'Pro',
  description: 'Inteligencia completa para ganar más',
  monthly: { price: '$11.900', period: '/mes', note: '' },
  annual: { price: '$9.900', period: '/mes', note: 'Facturado anual · ahorras 2 meses' },
  features: [
    'Alertas ilimitadas',
    'Benchmarks de precio por producto',
    'Análisis de competidores',
    'Score de oportunidad',
    'Matching semántico',
    'Checklist por tipo de licitación',
    'Alertas de vencimiento de documentos',
  ],
  cta: 'Probar 14 días gratis',
  href: '/register',
};

/* ─────────────────────────────────────────────
   ROTATING TEXT COMPONENT
   ───────────────────────────────────────────── */

function RotatingRubro() {
  const [index, setIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % rotatingRubros.length);
        setIsVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, [reducedMotion]);

  return (
    <span
      className={`inline text-accent bg-accent/15 px-3 py-0.5 rounded-lg transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      style={{ WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone' }}
    >
      {rotatingRubros[index]}
    </span>
  );
}

/* ─────────────────────────────────────────────
   PRODUCT DEMO TABS
   ───────────────────────────────────────────── */

const productTabs = [
  { id: 'precio', label: 'Precio de mercado' },
  { id: 'score', label: 'Score de oportunidad' },
  { id: 'matching', label: 'Matching semántico' },
] as const;

type TabId = (typeof productTabs)[number]['id'];

/* ─────────────────────────────────────────────
   MAIN PAGE
   ───────────────────────────────────────────── */

export default function LandingClient() {
  const [activeTab, setActiveTab] = useState<TabId>('precio');
  const [userClicked, setUserClicked] = useState(false);
  const [showMobileCta, setShowMobileCta] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (userClicked || reducedMotion) return;
    const interval = setInterval(() => {
      setActiveTab((prev) => {
        const idx = productTabs.findIndex((t) => t.id === prev);
        return productTabs[(idx + 1) % productTabs.length].id;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [userClicked, reducedMotion]);

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
    <div className="flex min-h-screen flex-col bg-surface" style={{ fontFamily: 'var(--font-dm-sans, system-ui)' }}>

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <TordoLogo size={30} />
            <span
              className="font-bold text-primary leading-none tracking-tight"
              style={{ fontFamily: 'var(--font-varien, system-ui)', fontSize: '1.875rem' }}
            >
              TORDO
            </span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-muted md:flex">
            {navItems.map((item) => (
              <Link key={item.name} href={item.href} className="transition-colors hover:text-primary">{item.name}</Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:text-primary">
              Iniciar sesión
            </Link>
            <Link href="/register" className="hidden sm:inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-accentDark hover:shadow-md">
              Probar Pro 14 días
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg p-2 text-muted hover:text-primary md:hidden"
              aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={mobileMenuOpen}
              aria-controls="menu-movil"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div id="menu-movil" className="border-t border-border bg-surface px-6 py-4 md:hidden">
            <nav className="flex flex-col gap-3">
              {navItems.map((item) => (
                <Link key={item.name} href={item.href} onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-muted hover:text-primary">{item.name}</Link>
              ))}
              <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-accentDark">
                Probar Pro 14 días
              </Link>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="dark relative overflow-hidden bg-brand-navy px-6 py-14 sm:py-20 lg:py-24">
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

          <div className="relative mx-auto max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-8 items-center">
              <div className="lg:col-span-3">
                <h1 className="mb-6 text-3xl font-bold leading-[1.15] text-white sm:text-5xl xl:text-[3.5rem]" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                  <span className="block">Postula con ventaja</span>
                  <span className="block">en licitaciones de</span>
                  <span className="block" style={{ minHeight: '1.1em' }}>
                    {/* El rubro rota cada 3 s. Sin esto, el encabezado principal
                        que ven crawlers y lectores de pantalla era una frase
                        incompleta con un rubro al azar de diez. El texto estable
                        va al árbol de accesibilidad; la rotación es decorativa. */}
                    <span className="sr-only">Mercado Público</span>
                    <span aria-hidden="true">
                      <RotatingRubro />
                    </span>
                  </span>
                </h1>

                <p className="mb-8 max-w-xl text-lg text-white/65 leading-relaxed">
                  Descubre a qué precio cotizar, en qué licitaciones vale la pena participar y cuáles se ajustan a lo que vendes — sin adivinar.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-10 sm:mb-12">
                  <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3.5 text-sm font-bold text-onAccent shadow-lg transition-all hover:bg-accentDark hover:shadow-xl">
                    Probar Pro 14 días
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href="#producto" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/[0.08] px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/15">
                    Ver el producto
                  </Link>
                </div>

                {/* Trust line */}
                <p className="text-xs text-white/60 mb-6">
                  Sin tarjeta · Cancela cuando quieras
                </p>
              </div>

              <div className="lg:col-span-2 flex flex-col items-center justify-center gap-3">
                <div className="w-full max-w-md animate-float rounded-xl" style={{ boxShadow: '0 20px 60px rgba(61,185,187,0.15)' }}>
                  <MockupPrecio />
                </div>
                <p className="flex items-center gap-1.5 text-xs text-white/60 self-end pr-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                  Fuente oficial: datos públicos de ChileCompra
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Benefits ── */}
        <section className="bg-band4 px-6 py-16 sm:py-20" id="beneficios">
          <div className="mx-auto max-w-5xl">
            <div className="mb-14 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-accent">
                QUÉ HACE TORDO
              </p>
              <h2 className="text-3xl font-bold text-text sm:text-4xl" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                Inteligencia para decidir. Orden para postular.
              </h2>
              <p className="mt-4 max-w-2xl mx-auto text-muted leading-relaxed">
                Te mostramos si tu precio es competitivo y qué tan confiable es el comprador — antes de que inviertas tiempo postulando.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-0">
              <div className="lg:pr-10 lg:border-r lg:border-border">
                <div className="mb-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent mb-1">ANTES DE POSTULAR</p>
                  <h3 className="text-xl font-bold text-text" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                    Entiende si conviene
                  </h3>
                </div>
                <div className="space-y-5">
                  {[
                    { icon: DollarSign, title: 'Precio de mercado', desc: 'Mediana y rango de adjudicación de los productos que vendes.' },
                    { icon: Target, title: 'Score de oportunidad', desc: 'Las licitaciones que valen tu tiempo, ordenadas por probabilidad de éxito.' },
                    { icon: Sparkles, title: 'Matching semántico', desc: 'Detectamos licitaciones afines aunque usen otras palabras.' },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex gap-4 group">
                        <div className="mt-0.5 flex-shrink-0 h-9 w-9 rounded-lg bg-primary/[0.07] flex items-center justify-center group-hover:bg-accent/10 transition-colors">
                          <Icon className="h-4 w-4 text-primary group-hover:text-accent transition-colors" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-text" style={{ fontFamily: 'var(--font-display, system-ui)' }}>{item.title}</h4>
                          <p className="text-sm text-muted leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:pl-10">
                <div className="mb-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent mb-1">AL POSTULAR</p>
                  <h3 className="text-xl font-bold text-text" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                    No pierdas por forma
                  </h3>
                </div>
                <div className="space-y-5">
                  {[
                    { icon: Bell, title: 'Alertas cuando aparece algo que te conviene', desc: 'Por correo o WhatsApp cuando calzan con tu perfil, y 48 y 24 h antes del cierre.' },
                    { icon: CheckCircle2, title: 'Papeles al día sin adivinar', desc: 'Plantilla de documentos según el tipo de licitación (L1, LE, LP).' },
                    { icon: FileClock, title: 'No pierdas por un documento vencido', desc: 'Te avisamos antes de que caduque un certificado, garantía o boleta.' },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex gap-4 group">
                        <div className="mt-0.5 flex-shrink-0 h-9 w-9 rounded-lg bg-primary/[0.07] flex items-center justify-center group-hover:bg-accent/10 transition-colors">
                          <Icon className="h-4 w-4 text-primary group-hover:text-accent transition-colors" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-text" style={{ fontFamily: 'var(--font-display, system-ui)' }}>{item.title}</h4>
                          <p className="text-sm text-muted leading-relaxed">{item.desc}</p>
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
        <section id="producto" className="bg-band3 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-accent">EL PRODUCTO</p>
              <h2 className="text-3xl font-bold text-text sm:text-4xl" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                Así se ve tomar mejores decisiones
              </h2>
            </div>

            <div className="flex flex-wrap justify-center gap-3 mb-10" role="tablist" aria-label="Funcionalidades del producto">
              {productTabs.map((tab) => (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  role="tab"
                  type="button"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onClick={() => handleTabClick(tab.id)}
                  className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-primary text-white shadow-md'
                      : 'border border-border text-muted hover:border-primary/30 bg-surface'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="max-w-2xl mx-auto">
              {productTabs.map((tab) => (
                <div
                  key={tab.id}
                  id={`panel-${tab.id}`}
                  role="tabpanel"
                  aria-labelledby={`tab-${tab.id}`}
                  hidden={activeTab !== tab.id}
                >
                  {tab.id === 'precio' && <MockupPrecio />}
                  {tab.id === 'score' && <MockupScore />}
                  {tab.id === 'matching' && <MockupMatching />}
                </div>
              ))}
            </div>

            <div className="mt-10 text-center">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-accentDark hover:shadow-xl">
                Quiero ver esto con mis datos
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section id="como-funciona" className="bg-band2 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-accent">CÓMO EMPEZAR</p>
              <h2 className="text-3xl font-bold text-text sm:text-4xl" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                Tu primera licitación analizada en minutos
              </h2>
            </div>

            <div className="grid gap-8 md:grid-cols-3 relative">
              <div className="hidden md:block absolute top-6 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-px bg-gradient-to-r from-primary/20 via-accent/30 to-primary/20" />
              {[
                { step: '01', title: 'Registra tu empresa', desc: 'Ingresa tu RUT y rubros. Verificamos tu estado hábil automáticamente.' },
                { step: '02', title: 'Explora oportunidades', desc: 'Encuentra licitaciones que calzan con tu perfil, cada una con su score de oportunidad.' },
                { step: '03', title: 'Postula informado', desc: 'Revisa precios históricos, competidores y prepara tu documentación con el checklist.' },
              ].map((s) => (
                <div key={s.step} className="relative">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white font-bold text-lg relative z-10" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                    {s.step}
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-text" style={{ fontFamily: 'var(--font-display, system-ui)' }}>{s.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Data Trust ── */}
        <section className="relative bg-band1 px-6 py-20 sm:py-24">
          {/* La marca de la mediana. Un degradado de 1px se pierde sobre fondo
              claro, así que se usa el lenguaje del propio PriceBandChart: la
              línea del rango y el punto que marca el P50 encima. Cae justo
              aquí a propósito — este bloque es la prueba del diferenciador. */}
          <div aria-hidden="true" className="absolute top-0 left-0 right-0">
            <div className="h-px bg-gradient-to-r from-transparent via-accent/45 to-transparent" />
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-accent" />
          </div>
          <div className="mx-auto max-w-5xl">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-accent mb-10">
              Construido sobre datos públicos de ChileCompra
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-6">
              {[
                { value: '+3.2M', label: 'transacciones analizadas' },
                { value: '8 años', label: 'de historial de compras' },
                { value: '722K', label: 'bandas de precio calculadas' },
                { value: '97K', label: 'proveedores perfilados' },
              ].map((item) => (
                <div key={item.value} className="text-center">
                  <p className="cifra text-3xl font-bold text-primary sm:text-4xl lg:text-5xl">{item.value}</p>
                  <p className="mt-2 text-sm text-muted leading-snug">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="precios" className="bg-band2 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-accent">PLANES</p>
              <h2 className="text-3xl font-bold text-text sm:text-4xl" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                Empieza gratis. Crece cuando quieras.
              </h2>
              <p className="mt-4 text-muted">
                Precios en CLP. Sin contratos. Cancela cuando quieras.
              </p>
            </div>

            <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
              {/* Free card */}
              <div className="relative flex flex-col rounded-xl border border-border bg-surface p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/25">
                <div className="mb-4">
                  <h3 className="text-lg font-bold mb-1 text-text" style={{ fontFamily: 'var(--font-display, system-ui)' }}>{FREE_PLAN.name}</h3>
                  <p className="text-xs text-muted">{FREE_PLAN.description}</p>
                </div>
                <div className="mb-1">
                  <span className="font-bold text-3xl text-text" style={{ fontFamily: 'var(--font-display, system-ui)' }}>$0</span>
                </div>
                <div className="mb-4 h-4" />
                <ul className="mb-6 flex-1 space-y-2.5">
                  {FREE_PLAN.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 text-xs text-accent">&#10003;</span>
                      <span className="text-muted">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={FREE_PLAN.href}
                  className="block rounded-lg py-2.5 text-center text-sm font-bold transition-all border border-primary text-primary hover:bg-primary hover:text-white"
                >
                  {FREE_PLAN.cta}
                </Link>
              </div>

              {/* Pro card */}
              <div className="dark relative flex flex-col rounded-xl border border-brand-navy bg-brand-navy p-6 text-white shadow-xl">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-onAccent whitespace-nowrap">Más elegido</span>
                </div>

                <div className="mb-4">
                  <h3 className="text-lg font-bold mb-1 text-white" style={{ fontFamily: 'var(--font-display, system-ui)' }}>{PRO_PLAN.name}</h3>
                  <p className="text-xs text-white/60">{PRO_PLAN.description}</p>
                </div>

                {/* Monthly / Annual toggle */}
                <div className="mb-4 inline-flex self-start rounded-lg bg-white/10 p-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('monthly')}
                    className={`rounded-md px-3 py-1.5 transition-all ${
                      billingPeriod === 'monthly' ? 'bg-white text-brand-navy' : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Mensual
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('annual')}
                    className={`rounded-md px-3 py-1.5 transition-all ${
                      billingPeriod === 'annual' ? 'bg-white text-brand-navy' : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Anual <span className="ml-1 text-[10px] text-accent">−17%</span>
                  </button>
                </div>

                <div className="mb-1">
                  <span className="font-bold text-3xl text-white" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                    {PRO_PLAN[billingPeriod].price}
                  </span>
                  <span className="text-sm text-white/60">{PRO_PLAN[billingPeriod].period}</span>
                </div>
                <p className="mb-4 text-xs text-white/60 min-h-[1rem]">
                  {PRO_PLAN[billingPeriod].note}
                </p>

                <ul className="mb-6 flex-1 space-y-2.5">
                  {PRO_PLAN.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 text-xs text-accent">&#10003;</span>
                      <span className="text-white/80">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={PRO_PLAN.href}
                  className="block rounded-lg py-2.5 text-center text-sm font-bold transition-all bg-accent text-onAccent hover:bg-accentDark"
                >
                  {PRO_PLAN.cta}
                </Link>
              </div>
            </div>

            <p className="mt-6 text-center text-sm text-muted">
              ¿Equipos o múltiples RUTs?{' '}
              <Link href="#contacto" className="font-semibold text-primary hover:text-accent transition-colors">
                Hablemos →
              </Link>
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="bg-band3 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-text sm:text-4xl" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                Preguntas frecuentes
              </h2>
            </div>
            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <div key={i} className={`rounded-xl border border-border bg-surface transition-shadow ${openFaq === i ? 'shadow-md' : ''}`}>
                  <button
                    type="button"
                    id={`faq-boton-${i}`}
                    aria-expanded={openFaq === i}
                    aria-controls={`faq-panel-${i}`}
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-text hover:text-primary"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-subtle transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} />
                  </button>
                  <div
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`faq-boton-${i}`}
                    hidden={openFaq !== i}
                    className="border-t border-border px-5 py-4"
                  >
                    <p className="text-sm text-muted leading-relaxed">{faq.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section id="contacto" className="dark relative bg-brand-navy px-6 py-20 overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />

          <div className="relative mx-auto max-w-2xl text-center">
            <div className="mb-6 flex justify-center">
              <TordoLogo size={40} variant="blanco" />
            </div>
            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
              Tu próxima licitación, con mejor información
            </h2>
            <p className="mb-8 text-white/65 leading-relaxed">
              Cuenta gratis en 2 minutos. Sin tarjeta.
            </p>
            <Link href="/register" className="inline-flex items-center gap-2 rounded-lg bg-accent px-8 py-4 text-base font-bold text-onAccent shadow-lg transition-all hover:bg-accentDark hover:shadow-xl">
              Probar Pro 14 días
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-band4 px-6 py-8 pb-20 lg:pb-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <TordoLogo size={20} />
              <span className="text-sm font-bold text-primary tracking-tight" style={{ fontFamily: 'var(--font-varien, system-ui)' }}>TORDO</span>
            </div>
            <p className="text-xs text-subtle">© 2026 TORDO · Inteligencia para Mercado Público · Chile</p>
            <div className="flex gap-5 text-xs text-subtle">
              <Link href="/login" className="hover:text-primary transition-colors">Iniciar sesión</Link>
              <Link href="/register" className="hover:text-primary transition-colors">Registrarse</Link>
            </div>
          </div>
          <p className="mt-4 text-center text-[10px] text-subtle/70">
            Datos de licitaciones y órdenes de compra de fuentes públicas de ChileCompra. TORDO no está afiliado al gobierno de Chile.
          </p>
        </div>
      </footer>

      {/* ── Sticky Mobile CTA ── */}
      {showMobileCta && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface px-4 py-3 lg:hidden">
          <Link href="/register" className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-bold text-white transition-all hover:bg-accentDark">
            Probar Pro 14 días
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
