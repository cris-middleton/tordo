'use client';

import { useState, useEffect, useCallback } from 'react';
import TordoLogo from '@/components/TordoLogo';
import Link from 'next/link';
import { ArrowRight, ChevronDown, Menu, ShieldCheck, X } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { MockupComprador } from '@/components/landing/MockupComprador';
import { MockupPrecio } from '@/components/landing/MockupPrecio';

/* ─────────────────────────────────────────────
   Las bandas dibujan una distribución: el tono se profundiza hacia el centro y
   el centro es el bloque de datos de ChileCompra. Es el mismo gesto que
   P10·P25·P50·P75·P90 en PriceBandChart, y por eso el orden de las secciones
   NO es libre: band3 → band2 → band1 → band2, y el pie en band4. Si insertas
   una sección, mantén el centro en band1 o el gesto se pierde.

   Desde el pivote a sitio público no hay cuentas: se fueron los planes, el
   trial, el registro y todo lo que prometía algo que sólo existía con cuenta
   —el aviso por correo, el encaje con lo que vendes, el informe del lunes, el
   equipo—. Las llamadas a la acción llevan directo al catálogo y a la
   analítica, que ven todos. El rediseño de la portada es del paso 10.
   ───────────────────────────────────────────── */

// Las etiquetas dicen qué hay detrás, no cómo se llama la sección por dentro.
// «El aviso» y «Antes de decidir» eran títulos editoriales: funcionan sobre la
// sección, y en una barra de navegación —que se escanea en dos segundos— no
// dicen nada. Quien llega quiere saber qué hace y qué cubre.
const navItems = [
  { name: 'Qué revisamos', href: '#mecanismos' },
  { name: 'Qué vas a ver', href: '#producto' },
  { name: 'Preguntas', href: '#faq' },
];

const EXPLORAR = '/dashboard/tenders';
const INTELIGENCIA = '/dashboard/bi';

const MECANISMOS = [
  {
    nombre: 'Licitación pública',
    detalle: 'Los llamados abiertos, de L1 a LR. Los seguimos desde que se publican.',
  },
  {
    nombre: 'Compra Ágil',
    detalle:
      'Compras de hasta 100 UTM, rápidas y frecuentes, y en su primer llamado sólo pueden cotizar empresas de menor tamaño. Ahí es donde muchas PYMES hacen su volumen.',
  },
  {
    nombre: 'Licitación privada',
    detalle: 'Cuando el organismo invita a proveedores específicos. También quedan publicadas.',
  },
  {
    nombre: 'Convenio Marco',
    detalle:
      'Compras por catálogo. ChileCompra no las publica como llamado: sólo se ven por la orden de compra, y es la vía por la que las leemos.',
  },
];

const faqs = [
  {
    question: '¿De dónde salen los precios que me muestran?',
    answer:
      'De los archivos abiertos de órdenes de compra que publica ChileCompra. Son datos oficiales, gratuitos y verificables: cualquier cifra que te mostremos la puedes contrastar en Mercado Público. Procesamos desde 2010, unos 88 millones de líneas de compra, para calcular qué ha pagado cada comprador por cada producto.',
  },
  {
    question: '¿Me van a decir exactamente cuánto cotizar?',
    answer:
      'No, y preferimos decirlo antes que después. Te mostramos el rango en que ese comprador ha adjudicado y cuán confiable es ese rango. En muchos productos el precio se mueve poco y el rango es estrecho; en otros el mismo comprador ha pagado cifras muy distintas por lo mismo — y eso también es información: significa que el precio probablemente no sea lo que decide esa adjudicación.',
  },
  {
    question: '¿Necesito algo de ChileCompra antes de usar TORDO?',
    answer:
      'Sí. Para postular en Mercado Público tu empresa tiene que estar inscrita como proveedor y mantener el estado hábil al día. TORDO no reemplaza ese registro: te ayuda a usar mejor la información una vez que ya eres proveedor.',
  },
  {
    question: '¿En qué se diferencian de los otros portales de licitaciones?',
    answer:
      'Casi todos resuelven el mismo problema: encontrar la licitación. Eso lo hacemos también, y le sumamos Compra Ágil y Convenio Marco, que suelen quedar fuera. La diferencia está en lo que viene después: cuánto ha pagado ese comprador por ese producto, cuántos proveedores le venden habitualmente y qué proporción de sus llamados termina adjudicando. Es la parte que exige procesar dieciséis años de órdenes de compra, y es la que decide si te conviene postular.',
  },
];

const productTabs = [
  { id: 'precio', label: 'Precio de mercado' },
  { id: 'comprador', label: 'El comprador' },
] as const;

type TabId = (typeof productTabs)[number]['id'];

/* ─────────────────────────────────────────────
   PIEZAS
   ───────────────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-accent">{children}</p>
  );
}

function Titulo({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={`text-3xl font-bold leading-tight text-text sm:text-4xl ${className}`}
      style={{ fontFamily: 'var(--font-display, system-ui)' }}
    >
      {children}
    </h2>
  );
}

/* ─────────────────────────────────────────────
   PÁGINA
   ───────────────────────────────────────────── */

export default function LandingClient() {
  const [activeTab, setActiveTab] = useState<TabId>('precio');
  const [userClicked, setUserClicked] = useState(false);
  const [showMobileCta, setShowMobileCta] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (userClicked || reducedMotion) return;
    const interval = setInterval(() => {
      setActiveTab((prev) => {
        const idx = productTabs.findIndex((t) => t.id === prev);
        return productTabs[(idx + 1) % productTabs.length].id;
      });
    }, 6000);
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
    <div
      className="flex min-h-screen flex-col bg-surface"
      style={{ fontFamily: 'var(--font-dm-sans, system-ui)' }}
    >
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <TordoLogo size={30} />
            <span
              className="font-bold leading-none tracking-tight text-primary"
              style={{ fontFamily: 'var(--font-varien, system-ui)', fontSize: '1.875rem' }}
            >
              TORDO
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-muted lg:flex">
            {navItems.map((item) => (
              <Link key={item.name} href={item.href} className="transition-colors hover:text-primary">
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={EXPLORAR}
              className="hidden rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onAccent transition-all hover:bg-accentDark hover:shadow-md sm:inline-flex"
            >
              Explorar licitaciones
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg p-2 text-muted hover:text-primary lg:hidden"
              aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={mobileMenuOpen}
              aria-controls="menu-movil"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div id="menu-movil" className="border-t border-border bg-surface px-6 py-4 lg:hidden">
            <nav className="flex flex-col gap-3">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm font-medium text-muted hover:text-primary"
                >
                  {item.name}
                </Link>
              ))}
              <Link
                href={EXPLORAR}
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-onAccent transition-all hover:bg-accentDark"
              >
                Explorar licitaciones
              </Link>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────────
            El titular es la pregunta que el usuario ya se hace, no una promesa
            sobre nosotros. Y el mockup que va al lado la responde: abrir con la
            pregunta y contestarla en el mismo golpe de vista es toda la tesis
            del producto. */}
        <section className="dark relative overflow-hidden bg-brand-navy px-6 py-16 sm:py-20 lg:py-24">
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

          <div className="relative mx-auto max-w-6xl">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-5 lg:gap-10">
              <div className="lg:col-span-3">
                <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  Datos públicos de ChileCompra · 2010–2026
                </p>

                <h1
                  className="mb-6 text-4xl font-bold leading-[1.08] text-white sm:text-5xl xl:text-[3.75rem]"
                  style={{ fontFamily: 'var(--font-display, system-ui)' }}
                >
                  ¿A cuánto se
                  <br />
                  adjudica esto?
                </h1>

                <p className="mb-8 max-w-xl text-lg leading-relaxed text-white/70">
                  Antes de armar una oferta necesitas saber cuánto ha pagado ese comprador por
                  esto. Te lo mostramos con sus órdenes de compra, sin registrarte.
                </p>

                <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                  <Link
                    href={EXPLORAR}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3.5 text-sm font-bold text-onAccent shadow-lg transition-all hover:bg-accentDark hover:shadow-xl"
                  >
                    Explorar licitaciones
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href={INTELIGENCIA}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/[0.08] px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/15"
                  >
                    Ver inteligencia de mercado
                  </Link>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-3 lg:col-span-2">
                <div
                  className="w-full max-w-md animate-float rounded-xl"
                  style={{ boxShadow: '0 20px 60px rgba(61,185,187,0.15)' }}
                >
                  <MockupPrecio />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Qué revisamos · band3 ── */}
        <section id="mecanismos" className="bg-band3 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 max-w-2xl">
              <Eyebrow>Qué revisamos</Eyebrow>
              <Titulo>Licitaciones, sí. Y también Compra Ágil y Convenio Marco.</Titulo>
              <p className="mt-4 leading-relaxed text-muted">
                Cerca de la mitad de lo que compra el Estado no es una licitación grande. Si tu
                negocio son montos chicos y frecuentes, es justo ahí donde está tu mercado — y es
                lo que casi nadie te muestra.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {MECANISMOS.map((m) => (
                <div
                  key={m.nombre}
                  className="rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-md"
                >
                  <h3
                    className="text-base font-bold text-text"
                    style={{ fontFamily: 'var(--font-display, system-ui)' }}
                  >
                    {m.nombre}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{m.detalle}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Antes de decidir · band2 ── */}
        <section id="producto" className="bg-band2 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 text-center">
              <Eyebrow>Antes de decidir</Eyebrow>
              <Titulo>Dos cosas que cambian tu oferta</Titulo>
            </div>

            <div
              className="mb-10 flex flex-wrap justify-center gap-2.5"
              role="tablist"
              aria-label="Lo que muestra el producto"
            >
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
                  className={`rounded-full px-4 py-2.5 text-sm font-semibold transition-all sm:px-5 ${
                    activeTab === tab.id
                      ? 'bg-primary text-onPrimary shadow-md'
                      : 'border border-border bg-surface text-muted hover:border-primary/30'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mx-auto max-w-2xl">
              {productTabs.map((tab) => (
                <div
                  key={tab.id}
                  id={`panel-${tab.id}`}
                  role="tabpanel"
                  aria-labelledby={`tab-${tab.id}`}
                  hidden={activeTab !== tab.id}
                >
                  {tab.id === 'precio' && <MockupPrecio />}
                  {tab.id === 'comprador' && <MockupComprador />}
                </div>
              ))}
            </div>

            <div className="mt-10 text-center">
              <Link
                href={INTELIGENCIA}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3.5 text-sm font-bold text-onAccent shadow-lg transition-all hover:bg-accentDark hover:shadow-xl"
              >
                Ver inteligencia de mercado
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── El dato · band1 ───────────────────────────────────────────────
            El centro de la distribución. La marca de la mediana cae justo aquí
            a propósito: este bloque es la prueba del diferenciador. */}
        <section className="relative bg-band1 px-6 py-20 sm:py-24">
          <div aria-hidden="true" className="absolute left-0 right-0 top-0">
            <div className="h-px bg-gradient-to-r from-transparent via-accent/45 to-transparent" />
            <div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
          </div>
          <div className="mx-auto max-w-5xl">
            <p className="mb-10 text-center text-xs font-bold uppercase tracking-[0.18em] text-accent">
              Construido sobre datos públicos de ChileCompra
            </p>
            <div className="grid grid-cols-2 gap-8 sm:gap-6 lg:grid-cols-4">
              {[
                { value: '88M', label: 'líneas de compra procesadas' },
                { value: '16 años', label: 'de historial, desde 2010' },
                { value: '722K', label: 'bandas de precio calculadas' },
                { value: '97K', label: 'proveedores perfilados' },
              ].map((item) => (
                <div key={item.value} className="text-center">
                  <p className="cifra text-3xl font-bold text-primary sm:text-4xl lg:text-5xl">
                    {item.value}
                  </p>
                  <p className="mt-2 text-sm leading-snug text-muted">{item.label}</p>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-10 max-w-xl text-center text-sm leading-relaxed text-muted">
              Son los archivos abiertos que publica ChileCompra. Cualquier cifra que te mostremos
              la puedes contrastar tú mismo en Mercado Público.
            </p>
          </div>
        </section>

        {/* ── FAQ · band2 ── */}
        <section id="faq" className="bg-band2 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl">
            <div className="mb-10 text-center">
              <Titulo>Preguntas frecuentes</Titulo>
            </div>
            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <div
                  key={faq.question}
                  className={`rounded-xl border border-border bg-surface transition-shadow ${
                    openFaq === i ? 'shadow-md' : ''
                  }`}
                >
                  <button
                    type="button"
                    id={`faq-boton-${i}`}
                    aria-expanded={openFaq === i}
                    aria-controls={`faq-panel-${i}`}
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-text hover:text-primary"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 text-subtle transition-transform duration-200 ${
                        openFaq === i ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  <div
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`faq-boton-${i}`}
                    hidden={openFaq !== i}
                    className="border-t border-border px-5 py-4"
                  >
                    <p className="text-sm leading-relaxed text-muted">{faq.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA final ── */}
        <section className="dark relative overflow-hidden bg-brand-navy px-6 py-20">
          <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />

          <div className="relative mx-auto max-w-2xl text-center">
            <div className="mb-6 flex justify-center">
              <TordoLogo size={40} variant="blanco" />
            </div>
            <h2
              className="mb-4 text-3xl font-bold text-white sm:text-4xl"
              style={{ fontFamily: 'var(--font-display, system-ui)' }}
            >
              La próxima que postules, ya sabrás a cuánto
            </h2>
            <p className="mb-8 leading-relaxed text-white/70">
              Sin registrarte: busca la licitación o el rubro y mira lo que dicen las órdenes de
              compra.
            </p>
            <Link
              href={EXPLORAR}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-8 py-4 text-base font-bold text-onAccent shadow-lg transition-all hover:bg-accentDark hover:shadow-xl"
            >
              Explorar licitaciones
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
              <span
                className="text-sm font-bold tracking-tight text-primary"
                style={{ fontFamily: 'var(--font-varien, system-ui)' }}
              >
                TORDO
              </span>
            </div>
            {/* Aquí había un enlace a /terminos y otro a /privacidad. Ninguna
                de las dos páginas existe —no aparecen en la salida del build— así
                que eran dos 404 en el pie de una página que pide RUT y cobra en
                CLP: justo donde alguien va a mirar antes de escribir sus datos.
                Un enlace roto ahí resta más confianza que la ausencia del
                enlace. Vuelven cuando existan las páginas. */}
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-subtle">
              <a href="mailto:hola@tordo.cl" className="transition-colors hover:text-primary">
                Contacto
              </a>
            </div>
          </div>
          <div className="mt-5 flex flex-col items-center gap-2 border-t border-border pt-5">
            <p className="flex items-center gap-1.5 text-[11px] text-subtle">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Datos de licitaciones y órdenes de compra de fuentes públicas de ChileCompra
            </p>
            <p className="text-center text-[10px] text-subtle/70">
              © 2026 TORDO · Inteligencia para Mercado Público · Chile · No estamos afiliados al
              gobierno de Chile
            </p>
          </div>
        </div>
      </footer>

      {/* ── CTA fija en móvil ── */}
      {showMobileCta && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface px-4 py-3 lg:hidden">
          <Link
            href={EXPLORAR}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-bold text-onAccent transition-all hover:bg-accentDark"
          >
            Explorar licitaciones
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
