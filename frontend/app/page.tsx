import Image from 'next/image';
import Link from 'next/link';

const navItems = [
  { name: 'Cómo funciona', href: '#como-funciona' },
  { name: 'Precios', href: '#precios' },
  { name: 'FAQ', href: '#faq' },
];

const stats = [
  { value: 'USD 17.6B', label: 'en compras públicas Chile 2024' },
  { value: '110K+', label: 'proveedores activos en Mercado Público' },
  { value: '0.3%', label: 'penetración actual — el mercado está por capturar' },
];

const benefits = [
  {
    icon: '📊',
    title: 'BI pre-postulación',
    description: 'Precios adjudicados históricos, competidores por rubro y tasas de éxito por organismo — 78 campos por OC.',
    badge: 'Pro',
  },
  {
    icon: '✅',
    title: 'Checklist de documentos',
    description: 'Flujo guiado por tipo de licitación (L1/LE/LP). Sin curva de aprendizaje. En menos de 10 minutos.',
    badge: null,
  },
  {
    icon: '🔔',
    title: 'Alertas inteligentes',
    description: 'Filtradas por CPV, rubro y matching semántico en títulos históricos. Sin ruido, sin oportunidades perdidas.',
    badge: null,
  },
  {
    icon: '🦺',
    title: 'Monitor estado hábil',
    description: 'Verificación automática vía CSV ChileCompra. Alerta al instante si tu RUT pierde la habilitación.',
    badge: null,
  },
];

const steps = [
  {
    step: '01',
    title: 'Registra tu empresa',
    description: 'Crea tu cuenta, ingresa tu RUT, selecciona tus rubros y región. Listo en 5 minutos.',
  },
  {
    step: '02',
    title: 'TORDO vigila el mercado',
    description: 'Conexión diaria con Mercado Público. Matching semántico sobre historial de órdenes de compra.',
  },
  {
    step: '03',
    title: 'Decide con datos reales',
    description: 'Benchmarks de precios, análisis de competidores, checklist de documentos — todo antes de postular.',
  },
];

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    description: 'Para empezar a explorar',
    features: [
      'Exploración de licitaciones',
      'Panel básico sin alertas',
      'Sin tarjeta de crédito',
    ],
    highlight: false,
    cta: 'Comenzar gratis',
  },
  {
    name: 'Starter',
    price: '$5.900',
    period: '/mes',
    description: '10 alertas mensuales',
    features: [
      '10 alertas segmentadas por mes',
      'Filtros por región y rubro',
      'Monitor de estado hábil',
      'Soporte por correo',
    ],
    highlight: false,
    cta: 'Elegir Starter',
  },
  {
    name: 'Pro',
    price: '$11.900',
    period: '/mes',
    description: 'La elección de las PYMES que ganan',
    features: [
      'Alertas ilimitadas',
      'Inteligencia BI completa (78 campos)',
      'Checklist de documentos por licitación',
      'Matching semántico TF-IDF',
      'Exportaciones y analítica',
    ],
    highlight: true,
    cta: 'Elegir Pro',
  },
  {
    name: 'Enterprise',
    price: 'A consultar',
    period: '',
    description: 'Para equipos y empresas medianas',
    features: [
      'Todo lo del plan Pro',
      'Usuarios múltiples con roles',
      'Integraciones API y BI',
      'Consultoría de implementación',
    ],
    highlight: false,
    cta: 'Contactar',
  },
];

const faqs = [
  {
    question: '¿Qué es Mercado Público?',
    answer: 'Es la plataforma oficial donde el Estado de Chile publica sus licitaciones y compras. Con más de USD 17.6B adjudicados en 2024, es el mayor mercado B2G del país.',
  },
  {
    question: '¿De dónde vienen los datos de precios históricos?',
    answer: 'Procesamos los archivos ZIP masivos de órdenes de compra de ChileCompra — disponibles públicamente. Cada OC tiene 78 campos de contexto que TORDO analiza para darte benchmarks accionables.',
  },
  {
    question: '¿Necesito cuenta en ChileCompra para usar TORDO?',
    answer: 'No. TORDO funciona de forma independiente. Si quieres postular, eso sí necesitas estar inscrito en el Registro de Proveedores de ChileCompra.',
  },
  {
    question: '¿Qué diferencia a TORDO de LicitaLab?',
    answer: 'LicitaLab está orientado a equipos con analistas. TORDO está diseñado para el dueño de PYME sin área dedicada: flujo guiado, decisión pre-postulación accionable, y compliance operativo integrado.',
  },
  {
    question: '¿Puedo cancelar cuando quiera?',
    answer: 'Sí. Sin costos adicionales. Tu plan sigue activo hasta el fin del período contratado.',
  },
  {
    question: '¿Cómo protegen mis datos?',
    answer: 'Infraestructura en la nube con cifrado en tránsito y en reposo, controles de acceso por roles, y monitoreo continuo.',
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white" style={{ fontFamily: 'var(--font-dm-sans, system-ui)' }}>

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
              <span className="text-xl font-bold tracking-tight text-[#0F2942]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
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
              className="rounded-lg bg-[#0F2942] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#081A2E] hover:shadow-md"
            >
              Comenzar gratis
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ── */}
        <section id="inicio" className="relative overflow-hidden bg-[#0F2942] px-6 py-24 sm:py-32">
          {/* Dot grid */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
              backgroundSize: '28px 28px',
            }}
          />
          {/* Accent gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#0EAD69]/60 to-transparent" />

          <div className="relative mx-auto max-w-5xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/8 px-4 py-2 text-sm font-medium text-white/80 backdrop-blur-sm">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#0EAD69]" />
              Inteligencia para proveedores del Estado · Chile
            </div>

            <h1
              className="mb-6 max-w-3xl text-4xl font-bold leading-[1.1] text-white sm:text-5xl xl:text-6xl"
              style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
            >
              El único que te dice si tu oferta{' '}
              <span className="text-[#0EAD69]">va a ganar</span>{' '}
              antes de enviarla.
            </h1>

            <p className="mb-10 max-w-xl text-lg text-white/65 leading-relaxed">
              TORDO combina inteligencia pre-postulación con compliance operativo. Para PYMES proveedoras del Estado que quieren ganar más licitaciones sin perder tiempo en burocracia.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-[#0EAD69] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#09895B] hover:shadow-xl"
              >
                Comenzar gratis — sin tarjeta
                <span>→</span>
              </Link>
              <Link
                href="#como-funciona"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/8 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/15"
              >
                Ver cómo funciona
              </Link>
            </div>

            {/* Stats */}
            <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {stats.map((s) => (
                <div key={s.value} className="rounded-xl border border-white/10 bg-white/6 px-5 py-4 backdrop-blur-sm">
                  <p className="font-display text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                    {s.value}
                  </p>
                  <p className="mt-1 text-sm text-white/55">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Benefits ── */}
        <section className="bg-[#F6F7FB] px-6 py-20" id="beneficios">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">
                Por qué TORDO
              </p>
              <h2
                className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl"
                style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                Todo lo que necesitas para postular mejor
              </h2>
              <p className="mt-4 max-w-xl mx-auto text-[#64748B]">
                Dos problemas, un solo producto: decide si vale la pena postular, y asegúrate de hacerlo correctamente.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {benefits.map((b) => (
                <div
                  key={b.title}
                  className="group rounded-xl border border-[#E2E6EF] bg-white p-6 shadow-sm transition-all hover:border-[#0F2942]/20 hover:shadow-md"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <span className="text-3xl">{b.icon}</span>
                    {b.badge && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#D97706] px-2.5 py-0.5 text-[10px] font-bold text-white">
                        ⭐ {b.badge}
                      </span>
                    )}
                  </div>
                  <h3
                    className="mb-2 text-lg font-bold text-[#0D1B2A]"
                    style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
                  >
                    {b.title}
                  </h3>
                  <p className="text-sm text-[#64748B] leading-relaxed">{b.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="como-funciona" className="px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">
                El proceso
              </p>
              <h2
                className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl"
                style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                De la oportunidad a la oferta ganadora
              </h2>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              {steps.map((s) => (
                <div key={s.step} className="relative">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#0F2942] text-white font-bold font-display text-lg"
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
                  <p className="text-sm text-[#64748B] leading-relaxed">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="precios" className="bg-[#F6F7FB] px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">
                Planes
              </p>
              <h2
                className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl"
                style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                Precio simple. Valor claro.
              </h2>
              <p className="mt-4 text-[#64748B]">
                Cancela cuando quieras. Sin letra chica.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative flex flex-col rounded-xl border p-6 transition-all ${
                    plan.highlight
                      ? 'border-[#0F2942] bg-[#0F2942] text-white shadow-card-lg'
                      : 'border-[#E2E6EF] bg-white shadow-sm hover:shadow-card-md hover:border-[#0F2942]/25'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#0EAD69] px-3 py-1 text-[11px] font-bold text-white">
                        ⭐ Más popular
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

                  <div className="mb-6">
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

                  <ul className="mb-6 flex-1 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <span className={`mt-0.5 text-xs ${plan.highlight ? 'text-[#0EAD69]' : 'text-[#0EAD69]'}`}>✓</span>
                        <span className={plan.highlight ? 'text-white/80' : 'text-[#64748B]'}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.name === 'Enterprise' ? '#contacto' : '/register'}
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
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="px-6 py-20">
          <div className="mx-auto max-w-2xl">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#0EAD69]">
                Preguntas frecuentes
              </p>
              <h2
                className="text-3xl font-bold text-[#0D1B2A] sm:text-4xl"
                style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                Todo lo que necesitas saber
              </h2>
            </div>

            <div className="space-y-3">
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="group rounded-xl border border-[#E2E6EF] bg-white open:shadow-card"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-[#0D1B2A] hover:text-[#0F2942] list-none">
                    <span>{faq.question}</span>
                    <span className="shrink-0 text-[#94A3B8] transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="border-t border-[#EEF1F7] px-5 py-4">
                    <p className="text-sm text-[#64748B] leading-relaxed">{faq.answer}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section id="contacto" className="bg-[#0F2942] px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
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
              Empieza a postular con ventaja
            </h2>
            <p className="mb-8 text-white/65 leading-relaxed">
              Únete a las PYMES proveedoras que ya usan datos reales para decidir qué licitaciones vale la pena ganar.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-[#0EAD69] px-8 py-4 text-base font-bold text-white shadow-lg transition-all hover:bg-[#09895B] hover:shadow-xl"
            >
              Crear cuenta gratis
              <span>→</span>
            </Link>
            <p className="mt-4 text-xs text-white/35">
              Sin tarjeta de crédito · Cancela cuando quieras
            </p>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[#E2E6EF] bg-white px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="relative h-6 w-6">
              <Image src="/images/TORDO_logo.png" alt="TORDO" fill sizes="24px" className="object-contain" />
            </div>
            <span className="text-sm font-bold text-[#0F2942]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
              TORDO
            </span>
          </div>
          <p className="text-xs text-[#94A3B8]">
            © {new Date().getFullYear()} TORDO · Inteligencia para Mercado Público · Chile
          </p>
          <div className="flex gap-5 text-xs text-[#94A3B8]">
            <Link href="/login" className="hover:text-[#0F2942] transition-colors">Iniciar sesión</Link>
            <Link href="/register" className="hover:text-[#0F2942] transition-colors">Registrarse</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
