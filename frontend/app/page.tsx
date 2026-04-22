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
      className={`inline text-[#0EAD69] bg-[#0EAD69]/15 px-3 py-0.5 rounded-lg transition-all duration-300 ${
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

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('precio');
  const [userClicked, setUserClicked] = useState(false);
  const [showMobileCta, setShowMobileCta] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

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
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <TordoLogo size={26} />
            <span
              className="font-bold text-[#0F2942] leading-none tracking-tight"
              style={{ fontFamily: 'var(--font-varien, system-ui)', fontSize: '2rem' }}
            >
              TORDO
            </span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-[#64748B] md:flex">
            {navItems.map((item) => (
              <Link key={item.name} href={item.href} className="transition-colors hover:text-[#0F2942]">{item.name}</Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-[#64748B] transition-colors hover:text-[#0F2942]">
              Iniciar sesión
            </Link>
            <Link href="/register" className="hidden sm:inline-flex rounded-lg bg-[#0EAD69] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#09895B] hover:shadow-md">
              Probar Pro 14 días
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
              <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="inline-flex items-center justify-center rounded-lg bg-[#0EAD69] px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-[#09895B]">
                Probar Pro 14 días
              </Link>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-[#0F2942] px-6 py-14 sm:py-20 lg:py-24">
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#0EAD69]/60 to-transparent" />

          <div className="relative mx-auto max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-8 items-center">
              <div className="lg:col-span-3">
                <h1 className="mb-6 text-3xl font-bold leading-[1.15] text-white sm:text-5xl xl:text-[3.5rem]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                  <span className="block">Postula con ventaja</span>
                  <span className="block">en licitaciones de</span>
                  <span className="block" style={{ minHeight: '1.1em' }}>
                    <RotatingRubro />
                  </span>
                </h1>

                <p className="mb-8 max-w-xl text-lg text-white/65 leading-relaxed">
                  Descubre a qué precio cotizar, en qué licitaciones vale la pena participar y cuáles se ajustan a lo que vendes — sin adivinar.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-10 sm:mb-12">
                  <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0EAD69] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#09895B] hover:shadow-xl">
                    Probar Pro 14 días
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href="#producto" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/[0.08] px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/15">
                    Ver el producto
                  </Link>
                </div>

                {/* Trust line */}
                <p className="text-xs text-white/35 mb-6">
                  Sin tarjeta · Cancela cuando quieras
                </p>
              </div>

              <div className="lg:col-span-2 flex flex-col items-center justify-center gap-3">
                <div className="w-full max-w-md animate-float rounded-xl" style={{ boxShadow: '0 20px 60px rgba(14,173,105,0.15)' }}>
                  <MockupPrecio />
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
        <section className="bg-[#F6F7FB] px-6 py-16 sm:py-20" id="beneficios">
          <div className="mx-auto max-w-5xl">
            <div className="mb-14 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">
                QUÉ HACE TORDO
              </p>
              <h2 className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                Inteligencia para decidir. Orden para postular.
              </h2>
              <p className="mt-4 max-w-2xl mx-auto text-[#64748B] leading-relaxed">
                Te mostramos si tu precio es competitivo y qué tan confiable es el comprador — antes de que inviertas tiempo postulando.
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
                    { icon: DollarSign, title: 'Precio de mercado', desc: 'Mediana y rango de adjudicación de los productos que vendes.' },
                    { icon: Target, title: 'Score de oportunidad', desc: 'Las licitaciones que valen tu tiempo, ordenadas por probabilidad de éxito.' },
                    { icon: Sparkles, title: 'Matching semántico', desc: 'Detectamos licitaciones afines aunque usen otras palabras.' },
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
                    { icon: Bell, title: 'Alertas cuando aparece algo que te conviene', desc: 'Te avisamos por correo o WhatsApp cuando aparecen licitaciones u órdenes de compra que calzan con tu perfil, y también 48 y 24 horas antes del cierre.' },
                    { icon: CheckCircle2, title: 'Papeles al día sin adivinar', desc: 'Plantilla de documentos según el tipo de licitación (L1, LE, LP). Así no revisas Bases de 40 páginas para saber qué declaraciones pedir.' },
                    { icon: FileClock, title: 'No pierdas postulaciones por un documento vencido', desc: 'Te avisamos cuando un certificado, garantía o boleta está por vencer. Así renuevas a tiempo y no te descartan por un papel caducado.' },
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
        <section id="producto" className="bg-[#F6F7FB] px-6 py-16 sm:py-20 border-t border-[#E2E6EF]">
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
              {activeTab === 'precio' && <MockupPrecio />}
              {activeTab === 'score' && <MockupScore />}
              {activeTab === 'matching' && <MockupMatching />}
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
        <section id="como-funciona" className="px-6 py-16 sm:py-20">
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
                { step: '01', title: 'Registra tu empresa', desc: 'Ingresa tu RUT y rubros. Verificamos tu estado hábil automáticamente.' },
                { step: '02', title: 'Explora oportunidades', desc: 'Encuentra licitaciones que calzan con tu perfil, cada una con su score de oportunidad.' },
                { step: '03', title: 'Postula informado', desc: 'Revisa precios históricos, competidores y prepara tu documentación con el checklist.' },
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
                  <p className="text-2xl font-bold text-[#0F2942] sm:text-3xl lg:text-4xl" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{item.value}</p>
                  <p className="mt-2 text-sm text-[#64748B]">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="precios" className="bg-[#F6F7FB] px-6 py-16 sm:py-20">
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

            <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
              {/* Free card */}
              <div className="relative flex flex-col rounded-xl border border-[#E2E6EF] bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-[#0F2942]/25">
                <div className="mb-4">
                  <h3 className="text-lg font-bold mb-1 text-[#0D1B2A]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{FREE_PLAN.name}</h3>
                  <p className="text-xs text-[#64748B]">{FREE_PLAN.description}</p>
                </div>
                <div className="mb-1">
                  <span className="font-bold text-3xl text-[#0D1B2A]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>$0</span>
                </div>
                <div className="mb-4 h-4" />
                <ul className="mb-6 flex-1 space-y-2.5">
                  {FREE_PLAN.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 text-xs text-[#0EAD69]">&#10003;</span>
                      <span className="text-[#64748B]">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={FREE_PLAN.href}
                  className="block rounded-lg py-2.5 text-center text-sm font-bold transition-all border border-[#0F2942] text-[#0F2942] hover:bg-[#0F2942] hover:text-white"
                >
                  {FREE_PLAN.cta}
                </Link>
              </div>

              {/* Pro card */}
              <div className="relative flex flex-col rounded-xl border border-[#0F2942] bg-[#0F2942] p-6 text-white shadow-xl">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#0EAD69] px-3 py-1 text-[11px] font-bold text-white whitespace-nowrap">Más elegido</span>
                </div>

                <div className="mb-4">
                  <h3 className="text-lg font-bold mb-1 text-white" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{PRO_PLAN.name}</h3>
                  <p className="text-xs text-white/60">{PRO_PLAN.description}</p>
                </div>

                {/* Monthly / Annual toggle */}
                <div className="mb-4 inline-flex self-start rounded-lg bg-white/10 p-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('monthly')}
                    className={`rounded-md px-3 py-1.5 transition-all ${
                      billingPeriod === 'monthly' ? 'bg-white text-[#0F2942]' : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Mensual
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('annual')}
                    className={`rounded-md px-3 py-1.5 transition-all ${
                      billingPeriod === 'annual' ? 'bg-white text-[#0F2942]' : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Anual <span className="ml-1 text-[10px] text-[#0EAD69]">−17%</span>
                  </button>
                </div>

                <div className="mb-1">
                  <span className="font-bold text-3xl text-white" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                    {PRO_PLAN[billingPeriod].price}
                  </span>
                  <span className="text-sm text-white/60">{PRO_PLAN[billingPeriod].period}</span>
                </div>
                <p className="mb-4 text-xs text-white/50 min-h-[1rem]">
                  {PRO_PLAN[billingPeriod].note}
                </p>

                <ul className="mb-6 flex-1 space-y-2.5">
                  {PRO_PLAN.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 text-xs text-[#0EAD69]">&#10003;</span>
                      <span className="text-white/80">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={PRO_PLAN.href}
                  className="block rounded-lg py-2.5 text-center text-sm font-bold transition-all bg-[#0EAD69] text-white hover:bg-[#09895B]"
                >
                  {PRO_PLAN.cta}
                </Link>
              </div>
            </div>

            <p className="mt-6 text-center text-sm text-[#64748B]">
              ¿Equipos o múltiples RUTs?{' '}
              <Link href="#contacto" className="font-semibold text-[#0F2942] hover:text-[#0EAD69] transition-colors">
                Hablemos →
              </Link>
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="px-6 py-16 sm:py-20">
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
              <TordoLogo size={40} />
            </div>
            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
              Tu próxima licitación, con mejor información
            </h2>
            <p className="mb-8 text-white/65 leading-relaxed">
              Cuenta gratis en 2 minutos. Sin tarjeta.
            </p>
            <Link href="/register" className="inline-flex items-center gap-2 rounded-lg bg-[#0EAD69] px-8 py-4 text-base font-bold text-white shadow-lg transition-all hover:bg-[#09895B] hover:shadow-xl">
              Probar Pro 14 días
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[#E2E6EF] bg-white px-6 py-8 pb-20 lg:pb-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <TordoLogo size={14} />
              <span className="text-sm font-bold text-[#0F2942] tracking-tight" style={{ fontFamily: 'var(--font-varien, system-ui)' }}>TORDO</span>
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
            Probar Pro 14 días
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
