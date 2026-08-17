'use client';

import { useState, useEffect, useCallback } from 'react';
import TordoLogo from '@/components/TordoLogo';
import Link from 'next/link';
import {
  ArrowRight,
  Bell,
  CalendarClock,
  ChevronDown,
  FileText,
  Menu,
  Plug,
  ShieldCheck,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { MockupAviso } from '@/components/landing/MockupAviso';
import { MockupComprador } from '@/components/landing/MockupComprador';
import { MockupMatching } from '@/components/landing/MockupMatching';
import { MockupPrecio } from '@/components/landing/MockupPrecio';
import { MockupScore } from '@/components/landing/MockupScore';

/* ─────────────────────────────────────────────
   Las bandas dibujan una distribución: el tono se profundiza hacia el centro y
   el centro es el bloque de datos de ChileCompra. Es el mismo gesto que
   P10·P25·P50·P75·P90 en PriceBandChart, y por eso el orden de las secciones
   NO es libre: band4 → band3 → band2 → band1 → band2 → band3 → band4.
   Si insertas una sección, mantén la simetría o el gesto se pierde.
   ───────────────────────────────────────────── */

// Las etiquetas dicen qué hay detrás, no cómo se llama la sección por dentro.
// «El aviso» y «Antes de decidir» eran títulos editoriales: funcionan sobre la
// sección, y en una barra de navegación —que se escanea en dos segundos— no
// dicen nada. Quien llega quiere saber qué hace, qué cubre y cuánto cuesta.
const navItems = [
  { name: 'Cómo te avisamos', href: '#aviso' },
  { name: 'Qué revisamos', href: '#mecanismos' },
  { name: 'Qué vas a ver', href: '#producto' },
  { name: 'Precios', href: '#precios' },
];

const MECANISMOS = [
  {
    nombre: 'Licitación pública',
    detalle: 'Los llamados abiertos, de L1 a LR. Los seguimos desde que se publican.',
  },
  {
    nombre: 'Compra Ágil',
    detalle:
      'Compras bajo 30 UTM, rápidas y frecuentes. Tienen su propia API y ahí es donde muchas PYMES hacen su volumen.',
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

const CADENCIA = [
  {
    cuando: 'Cada hora',
    icon: Bell,
    que: 'Revisamos lo que se publicó y te avisamos si calza con lo que vendes.',
  },
  {
    cuando: '48 y 24 h antes',
    icon: CalendarClock,
    que: 'Un recordatorio por cada cierre que estás siguiendo, para que no se te pase ninguno.',
  },
  {
    cuando: 'Cada lunes, 9:00',
    icon: FileText,
    que: 'Tu semana en un correo, con el mismo informe en PDF adjunto para archivar o reenviar.',
  },
  {
    cuando: 'Cuando cambia',
    icon: TrendingUp,
    que: 'Si sube el precio de algo que vendes.',
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
    question: '¿Necesito experiencia en licitaciones?',
    answer:
      'No. Al crear la cuenta marcas tu rubro y describes con tus palabras lo que vendes — «aseo industrial», «mantención de clima», lo que dirías por teléfono. Eso es lo que usamos para buscarte, y pesa más que las etiquetas que marques. No hay que aprenderse los códigos ONU ni la diferencia entre una L1 y una LR.',
  },
  {
    question: '¿Cada cuánto me van a escribir?',
    answer:
      'Depende de tu rubro, pero agrupamos: un correo por revisión con todo lo que apareció, no uno por licitación. Lo urgente —un cierre en 24 horas, un documento que vence, un cambio en tu estado hábil— sí sale al momento. Y puedes ajustar qué te llega desde Configuración.',
  },
  {
    question: '¿Qué pasa cuando se acaban los 14 días?',
    answer:
      'Nada automático. No pedimos tarjeta al registrarte, así que no hay nada que cobrar: la cuenta baja sola al plan Free y sigue funcionando con 3 consultas de precio al día y 5 alertas. Si quieres seguir con Pro, lo activas tú desde Facturación. Y si después te arrepientes, cancelas ahí mismo y conservas Pro hasta que termine el mes que pagaste.',
  },
  {
    question: '¿En qué se diferencian de los otros portales de licitaciones?',
    answer:
      'Casi todos resuelven el mismo problema: encontrar la licitación. Eso lo hacemos también, y le sumamos Compra Ágil y Convenio Marco, que suelen quedar fuera. La diferencia está en lo que viene después: cuánto ha pagado ese comprador por ese producto, cuántos proveedores le venden habitualmente y qué proporción de sus llamados termina adjudicando. Es la parte que exige procesar dieciséis años de órdenes de compra, y es la que decide si te conviene postular.',
  },
  {
    question: '¿Qué hacen con los datos de mi empresa?',
    answer:
      'Guardamos lo que necesitamos para que el producto funcione: tu RUT para consultar el estado hábil, tus documentos si decides subirlos y lo que describes de tu negocio para buscar por ti. No vendemos ni compartimos nada de eso, y no se lo mostramos a otras empresas de la plataforma. Lo que sí es público —tus adjudicaciones en Mercado Público— ya lo era antes de que llegaras aquí.',
  },
];

/* Las dos tarjetas mandan al MISMO sitio y con el mismo botón, a propósito.
   Antes decían «Crear cuenta gratis» y «Probar 14 días gratis», más un tercer
   texto en la barra de arriba: tres promesas distintas para una sola acción, y
   ninguna de las tres explicaba que el trial es automático. Quien lee tiene que
   poder contestarse «¿qué pasa si aprieto?» sin haber leído la letra chica. */

const FREE_PLAN = {
  name: 'Free',
  description: 'Para ver si esto te sirve',
  features: [
    'Licitaciones, Compra Ágil y Convenio Marco',
    '3 consultas de precio al día',
    '5 alertas activas',
    '1 usuario',
  ],
  cta: 'Crear cuenta gratis',
  href: '/register',
};

const PRO_PLAN = {
  name: 'Pro',
  description: 'Para cuando postular es parte del negocio',
  /* «IVA incluido» va pegado al precio y no en la letra chica del pie, que es
     donde nadie lo busca: es parte de la cifra, no una nota al margen. Sin
     decirlo, un comprador chileno acostumbrado a que en B2B se cotice «+ IVA»
     tiene que asumir cuál de las dos es — y si asume mal, se entera al pagar.

     La línea `note` estaba vacía en el plan mensual, así que el hueco ya estaba
     reservado (`min-h`) y esto no mueve nada de la maqueta. */
  monthly: { price: '$11.900', period: '/mes', note: 'IVA incluido' },
  annual: {
    price: '$9.900',
    period: '/mes',
    note: 'IVA incluido · facturado anual, ahorras 2 meses',
  },
  features: [
    'Consultas de precio sin límite',
    'Cómo es ese comprador y quién le vende',
    'Qué tan buena es la oportunidad, en un número',
    'Te buscamos lo que calza con lo que vendes',
    'Informe de tu semana, en correo y PDF',
    'Aviso si cambia el precio de tus productos',
    'Checklist por tipo y hasta 200 documentos',
    'Hasta 5 personas del equipo',
  ],
  cta: 'Crear cuenta gratis',
  href: '/register',
};

const productTabs = [
  { id: 'precio', label: 'Precio de mercado' },
  { id: 'comprador', label: 'El comprador' },
  { id: 'score', label: 'Score de oportunidad' },
  { id: 'matching', label: 'Encaje con lo que vendes' },
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
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

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
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:text-primary"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="hidden rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onAccent transition-all hover:bg-accentDark hover:shadow-md sm:inline-flex"
            >
              Crear cuenta gratis
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
                href="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-onAccent transition-all hover:bg-accentDark"
              >
                Probar Pro 14 días
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
                  esto. Te lo mostramos con sus órdenes de compra, y te escribimos cuando aparece
                  algo que vendes.
                </p>

                <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3.5 text-sm font-bold text-onAccent shadow-lg transition-all hover:bg-accentDark hover:shadow-xl"
                  >
                    Crear cuenta gratis
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href="#aviso"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/[0.08] px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/15"
                  >
                    Ver un aviso
                  </Link>
                </div>

                <p className="text-xs text-white/60">
                  Los primeros 14 días vienen con Pro completo. No pedimos tarjeta: cuando se
                  acaban, la cuenta baja sola al plan gratis.
                </p>
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

        {/* ── El aviso · band4 ─────────────────────────────────────────────
            Es el elemento firma. El producto se juega en el correo: es lo único
            que el usuario ve los días que no entra. */}
        <section id="aviso" className="bg-band4 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 max-w-2xl">
              <Eyebrow>El aviso</Eyebrow>
              <Titulo>No tienes que entrar a mirar.</Titulo>
              <p className="mt-4 leading-relaxed text-muted">
                Revisamos Mercado Público cada hora. Cuando aparece algo que calza con lo que
                vendes, te llega un correo — y el precio, la competencia y los plazos vienen
                dentro del mismo aviso.
              </p>
            </div>

            <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-10">
              <div className="lg:col-span-7">
                <MockupAviso />
              </div>

              <div className="space-y-6 lg:col-span-5">
                {[
                  {
                    titulo: 'El rango, no una corazonada',
                    texto:
                      'Lo que ese comprador ha pagado por ese producto, con los datos de las órdenes de compra reales.',
                  },
                  {
                    titulo: 'Contra quién compites',
                    texto:
                      'Cuántos proveedores le venden habitualmente a ese organismo, y quiénes se repiten.',
                  },
                  /* Aquí decía «A cuántos días paga», y ChileCompra no publica
                     ninguna fecha de pago: el dato que lo alimentaba mide lo
                     que tarda el PROVEEDOR en aceptar la orden, mediana real
                     1,4 días. El correo ya dejó de mandar esa línea
                     (`correo_render.lineas_de_bi`) y el panel del comprador ya
                     la cambió por trato directo; la landing seguía
                     prometiéndola. Lo que sí sale del dato y decide algo es
                     cuánto de lo que llama termina adjudicando. */
                  {
                    titulo: 'Si adjudica o te deja botado',
                    texto:
                      'Hay organismos que declaran desierto uno de cada tres llamados. Saberlo antes es lo que decide si vale la pena meterle dos días a la oferta.',
                  },
                ].map((item) => (
                  <div key={item.titulo} className="border-l-2 border-accent/40 pl-4">
                    <h3 className="text-sm font-bold text-text">{item.titulo}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{item.texto}</p>
                  </div>
                ))}

                <div className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-sm leading-relaxed text-muted">
                    <span className="font-semibold text-text">Si no lo sabemos, no lo decimos.</span>{' '}
                    Cuando no hay suficientes compras de ese producto para dar un rango confiable,
                    esa línea no aparece. Preferimos escribir menos que inventar un número.
                  </p>
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
              <Titulo>Cuatro cosas que cambian tu oferta</Titulo>
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
                  {tab.id === 'score' && <MockupScore />}
                  {tab.id === 'matching' && <MockupMatching />}
                </div>
              ))}
            </div>

            <div className="mt-10 text-center">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3.5 text-sm font-bold text-onAccent shadow-lg transition-all hover:bg-accentDark hover:shadow-xl"
              >
                Quiero ver esto con mis datos
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

        {/* ── Mientras trabajas en otra cosa · band2 ────────────────────────
            El dispositivo estructural es la CADENCIA, no un 01/02/03: cada
            tarjeta dice cuándo pasa algo, y ese «cuándo» es información real
            sobre el producto (ETL horario, recordatorios, informe del lunes). */}
        <section className="bg-band2 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 max-w-2xl">
              <Eyebrow>Mientras trabajas en otra cosa</Eyebrow>
              <Titulo>El lunes ya sabes cómo viene tu semana</Titulo>
              <p className="mt-4 leading-relaxed text-muted">
                No hace falta que entres todos los días. TORDO trabaja con un calendario propio y
                te busca a ti cuando hay algo que decidir.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {CADENCIA.map((c) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.cuando}
                    className="flex gap-4 rounded-xl border border-border bg-surface p-5"
                  >
                    <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/[0.07]">
                      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="cifra text-sm font-bold text-text">{c.cuando}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{c.que}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Equipo e integración: dos capacidades construidas que no
                aparecían en ninguna parte de la página. */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="flex gap-4 rounded-xl border border-border bg-surface p-5">
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <Users className="h-4 w-4 text-accent" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-bold text-text">Tu equipo, con permisos</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    Invita a quien prepara las ofertas y a quien las firma, cada uno con lo que le
                    toca ver. Si manejas varias empresas, cambias entre ellas sin cerrar sesión.
                  </p>
                </div>
              </div>
              <div className="flex gap-4 rounded-xl border border-border bg-surface p-5">
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <Plug className="h-4 w-4 text-accent" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-bold text-text">Conéctalo a lo que ya usas</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    API documentada con claves propias, y un servidor MCP para consultar los
                    precios desde tu asistente de IA sin copiar y pegar nada.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Precios · band3 ── */}
        <section id="precios" className="bg-band3 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <Eyebrow>Planes</Eyebrow>
              <Titulo>Empieza gratis. Sube cuando te convenga.</Titulo>
              {/* «Precios en CLP» se cae: el signo peso en una página que sólo se
                  vende en Chile ya lo dice, y una línea que no aporta le resta
                  peso a las dos que sí. Lo que sí hacía falta decir —si el IVA
                  está dentro— ahora va pegado a la cifra. */}
              <p className="mt-4 text-muted">
                Da igual cuál elijas hoy: los primeros 14 días son Pro completo y no pedimos
                tarjeta. Después decides tú, sin contrato.
              </p>
            </div>

            <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
              {/* Free */}
              <div className="relative flex flex-col rounded-xl border border-border bg-surface p-6 shadow-sm transition-all hover:border-primary/25 hover:shadow-md">
                <div className="mb-4">
                  <h3
                    className="mb-1 text-lg font-bold text-text"
                    style={{ fontFamily: 'var(--font-display, system-ui)' }}
                  >
                    {FREE_PLAN.name}
                  </h3>
                  <p className="text-xs text-muted">{FREE_PLAN.description}</p>
                </div>
                <div className="mb-1">
                  <span
                    className="text-3xl font-bold text-text"
                    style={{ fontFamily: 'var(--font-display, system-ui)' }}
                  >
                    $0
                  </span>
                </div>
                <div className="mb-4 h-4" />
                <ul className="mb-6 flex-1 space-y-2.5">
                  {FREE_PLAN.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 text-xs text-accent" aria-hidden="true">
                        &#10003;
                      </span>
                      <span className="text-muted">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={FREE_PLAN.href}
                  className="block rounded-lg border border-primary py-2.5 text-center text-sm font-bold text-primary transition-all hover:bg-primary hover:text-onPrimary"
                >
                  {FREE_PLAN.cta}
                </Link>
              </div>

              {/* Pro */}
              <div className="dark relative flex flex-col rounded-xl border border-brand-navy bg-brand-navy p-6 text-white shadow-xl">
                {/* Decía «Más elegido». Todavía no hay a quién contar: es
                    prueba social inventada, y en un mercado donde los dueños de
                    PYME se conocen entre ellos es de las cosas que se pagan
                    caro. Lo que sí es verdad y además vende mejor es que el
                    trial ya lo incluye. */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-onAccent">
                    Tus primeros 14 días
                  </span>
                </div>

                <div className="mb-4">
                  <h3
                    className="mb-1 text-lg font-bold text-white"
                    style={{ fontFamily: 'var(--font-display, system-ui)' }}
                  >
                    {PRO_PLAN.name}
                  </h3>
                  <p className="text-xs text-white/60">{PRO_PLAN.description}</p>
                </div>

                <div className="mb-4 inline-flex self-start rounded-lg bg-white/10 p-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('monthly')}
                    className={`rounded-md px-3 py-1.5 transition-all ${
                      billingPeriod === 'monthly'
                        ? 'bg-white text-brand-navy'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Mensual
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('annual')}
                    className={`rounded-md px-3 py-1.5 transition-all ${
                      billingPeriod === 'annual'
                        ? 'bg-white text-brand-navy'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Anual <span className="ml-1 text-[10px] text-accent">−17%</span>
                  </button>
                </div>

                <div className="mb-1">
                  <span
                    className="cifra text-3xl font-bold text-white"
                    style={{ fontFamily: 'var(--font-display, system-ui)' }}
                  >
                    {PRO_PLAN[billingPeriod].price}
                  </span>
                  <span className="text-sm text-white/60">{PRO_PLAN[billingPeriod].period}</span>
                </div>
                <p className="mb-4 min-h-[1rem] text-xs text-white/60">
                  {PRO_PLAN[billingPeriod].note}
                </p>

                <ul className="mb-6 flex-1 space-y-2.5">
                  {PRO_PLAN.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 text-xs text-accent" aria-hidden="true">
                        &#10003;
                      </span>
                      <span className="text-white/80">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={PRO_PLAN.href}
                  className="block rounded-lg bg-accent py-2.5 text-center text-sm font-bold text-onAccent transition-all hover:bg-accentDark"
                >
                  {PRO_PLAN.cta}
                </Link>
              </div>
            </div>

            <p className="mt-6 text-center text-sm text-muted">
              ¿Varias empresas o un equipo más grande? Escríbenos a{' '}
              <a
                href="mailto:hola@tordo.cl"
                className="font-semibold text-primary transition-colors hover:text-accent"
              >
                hola@tordo.cl
              </a>
            </p>
          </div>
        </section>

        {/* ── FAQ · band4 ── */}
        <section id="faq" className="bg-band4 px-6 py-16 sm:py-20">
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
              Te tomas dos minutos: el RUT de tu empresa y cuatro palabras sobre lo que vendes.
              De ahí en adelante te buscamos nosotros.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-8 py-4 text-base font-bold text-onAccent shadow-lg transition-all hover:bg-accentDark hover:shadow-xl"
            >
              Crear cuenta gratis
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
              <Link href="/login" className="transition-colors hover:text-primary">
                Iniciar sesión
              </Link>
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
            href="/register"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-bold text-onAccent transition-all hover:bg-accentDark"
          >
            Crear cuenta gratis
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
