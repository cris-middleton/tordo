import Image from 'next/image';
import Link from 'next/link';

const navItems = [
  { name: 'Inicio', href: '#inicio' },
  { name: 'Cómo funciona', href: '#como-funciona' },
  { name: 'Precios', href: '#precios' },
  { name: 'FAQ', href: '#faq' },
  { name: 'Contacto', href: '#contacto' },
];

const stats = [
  {
    label: 'Licitaciones monitoreadas cada día',
    value: '1.876',
  },
  {
    label: 'Empresas chilenas activas en la plataforma',
    value: '128',
  },
];

const benefits = [
  {
    icon: '🔍',
    title: 'Filtros inteligentes',
    description: 'Busca por palabra clave, monto, región o tipo de producto/servicio en segundos.',
  },
  {
    icon: '⚙️',
    title: 'Alertas automáticas',
    description: 'Recibe notificaciones apenas aparezca una nueva oportunidad que se ajuste a tus criterios.',
  },
  {
    icon: '📈',
    title: 'Analítica clara',
    description: 'Detecta tendencias con historiales de licitaciones y visualizaciones simples.',
  },
  {
    icon: '💡',
    title: 'Experiencia simple',
    description: 'Interfaz moderna pensada para equipos comerciales sin experiencia en licitaciones.',
  },
];

const comparison = [
  {
    feature: 'Búsquedas automáticas',
    mercadoPublico: '❌',
    licitUp: '✅',
  },
  {
    feature: 'Filtros avanzados por palabra y región',
    mercadoPublico: '⚠️ Limitados',
    licitUp: '✅',
  },
  {
    feature: 'Alertas personalizadas',
    mercadoPublico: '❌',
    licitUp: '✅',
  },
  {
    feature: 'Historial y análisis',
    mercadoPublico: '❌',
    licitUp: '✅',
  },
];

const comparisonColumns = ['Funcionalidad', 'Mercado Público', 'LicitUp'];

const steps = [
  {
    step: 1,
    title: 'Configura tus intereses',
    description: 'Crea tu cuenta, define rubros, regiones o palabras clave y listo.',
  },
  {
    step: 2,
    title: 'Analizamos por ti',
    description: 'Nos conectamos diariamente a Mercado Público y filtramos las licitaciones pertinentes.',
  },
  {
    step: 3,
    title: 'Recibe y actúa',
    description: 'Obtén alertas al instante y gestiona oportunidades desde un panel intuitivo.',
  },
];

const plans = [
  {
    name: 'Gratis',
    price: '$0',
    description: 'Sin alertas, ideal para revisión manual',
    features: ['Revisión de información sin límites', 'Panel informativo básico', 'Sin tarjeta de crédito'],
  },
  {
    name: 'Basic',
    price: '$5.900',
    description: 'Recibe 10 alertas mensuales',
    features: ['10 alertas segmentadas por mes', 'Filtros básicos por región y rubro', 'Soporte por correo'],
  },
  {
    name: 'Pro',
    price: '$11.900',
    description: 'Alertas ilimitadas para tu equipo',
    features: ['Alertas ilimitadas', 'Filtros avanzados y palabras clave', 'Exportaciones y analítica comparativa'],
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: '$29.990',
    description: 'Soluciones personalizadas y soporte dedicado',
    features: ['Usuarios múltiples y roles', 'Integraciones API y BI', 'Analítica avanzada y consultoría'],
  },
];

const faqs = [
  {
    question: '¿Qué es Mercado Público?',
    answer:
      'Es la plataforma oficial donde el Estado de Chile publica sus licitaciones y compras públicas.',
  },
  {
    question: '¿De dónde provienen los datos?',
    answer:
      'Obtenemos la información desde Mercado Público y el portal de datos abiertos del Estado de Chile.',
  },
  {
    question: '¿Necesito cuenta en ChileCompra?',
    answer: 'No, solo necesitas una cuenta en LicitUp para recibir y gestionar alertas.',
  },
  {
    question: '¿Puedo cancelar cuando quiera?',
    answer:
      'Sí, puedes cancelar en cualquier momento sin costos adicionales. Tu plan continuará activo hasta la fecha de término del período contratado.',
  },
  {
    question: '¿Cómo es el soporte?',
    answer: 'Ofrecemos soporte por correo electrónico y chat dentro de la aplicación.',
  },
  {
    question: '¿Cómo protegemos tus datos y licitaciones?',
    answer:
      'Empleamos infraestructura en la nube con cifrado extremo a extremo, monitoreo continuo y controles de acceso basados en roles para resguardar la confidencialidad de tus oportunidades.',
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="#inicio" className="flex items-center gap-3">
            <Image
              src="/licituplogo.svg"
              alt="LicitUp"
              width={40}
              height={40}
              className="h-10 w-10"
              priority
            />
            <span className="text-xl font-semibold tracking-tight text-slate-900">LicitUp</span>
          </Link>

          <input
            type="checkbox"
            id="mobile-nav-toggle"
            className="peer/mobile hidden"
            aria-hidden="true"
          />

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="transition-colors duration-200 hover:text-slate-900"
              >
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <label
              htmlFor="mobile-nav-toggle"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-colors duration-200 hover:border-slate-300 hover:text-slate-900 md:hidden"
              aria-label="Abrir navegación"
            >
              <span className="text-lg font-semibold">☰</span>
            </label>
            <Link
              href="/login"
              className="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors duration-200 hover:border-slate-300 hover:text-slate-900 md:block"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform duration-200 hover:translate-y-0.5 hover:bg-blue-700"
            >
              Comenzar gratis
            </Link>
          </div>

          <nav className="absolute right-6 top-16 hidden w-64 flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-5 text-sm font-medium text-slate-600 shadow-xl shadow-slate-900/10 peer-checked/mobile:flex md:hidden">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="rounded-full px-4 py-2 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900"
              >
                {item.name}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-3">
              <Link
                href="/login"
                className="rounded-full border border-slate-200 px-4 py-2 text-center text-sm font-semibold text-slate-600 transition-colors duration-200 hover:border-slate-300 hover:text-slate-900"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm transition-transform duration-200 hover:translate-y-0.5 hover:bg-blue-700"
              >
                Comenzar gratis
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section id="inicio" className="relative overflow-hidden bg-slate-50">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:py-24">
            <div className="space-y-7">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
                Plataforma SaaS chilena
              </span>
              <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Encuentra licitaciones relevantes sin perder tiempo.
              </h1>
              <p className="max-w-xl text-lg text-slate-600">
                LicitUp monitoriza Mercado Público a diario, filtra por rubros, regiones o palabras
                clave y te notifica en el momento exacto en que surge una oportunidad para tu
                negocio.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/register"
                  className="rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-transform duration-200 hover:translate-y-0.5 hover:bg-blue-700"
                >
                  Crear cuenta gratis
                </Link>
                <Link
                  href="/login"
                  className="rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:border-slate-300 hover:text-slate-900"
                >
                  Ya tengo cuenta
                </Link>
              </div>
              <p className="text-sm text-slate-500">
                No requiere tarjeta de crédito · Cancela cuando quieras
              </p>
              <div className="flex flex-wrap gap-6 text-sm text-slate-500">
                {stats.map((stat) => (
                  <div key={stat.label} className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-slate-900">{stat.value}</span>
                    <span>{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute -left-6 top-6 hidden h-24 w-24 rounded-full bg-blue-100 blur-3xl md:block" />
              <div className="absolute -right-10 bottom-10 hidden h-32 w-32 rounded-full bg-blue-200 blur-3xl md:block" />
              <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
                <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-400" />
                    <span className="h-3 w-3 rounded-full bg-yellow-400" />
                    <span className="h-3 w-3 rounded-full bg-green-400" />
                  </div>
                </div>
                <div className="relative aspect-[4/3] max-h-[460px]">
      <Image
                    src="/LicitApp_logo.png"
                    alt="Captura del dashboard LicitUp"
                    fill
                    className="object-cover"
        priority
      />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:gap-14 lg:py-20">
            <div className="space-y-6">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Miles de licitaciones cada día. Tú solo ves las que importan.
              </h2>
              <p className="text-lg leading-relaxed text-slate-600">
                Revisar licitaciones manualmente consume horas valiosas. LicitUp automatiza la
                búsqueda, filtra por los criterios que definas y prioriza las oportunidades según tu
                potencial comercial.
              </p>
              <p className="text-base leading-relaxed text-slate-500">
                Recibe alertas por correo o dentro de la app, colabora con tu equipo en un panel
                compartido y toma decisiones informadas con analítica real.
              </p>
            </div>
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm shadow-slate-900/5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Comparativo</h3>
              <table className="mt-6 w-full table-auto overflow-hidden rounded-2xl text-sm text-slate-600">
                <thead>
                  <tr className="bg-white text-xs uppercase tracking-wide text-slate-500">
                    {comparisonColumns.map((column) => (
                      <th key={column} className="px-4 py-3 text-left font-semibold">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {comparison.map((row) => (
                    <tr key={row.feature} className="border-t border-slate-100">
                      <td className="px-4 py-4 font-medium text-slate-900">{row.feature}</td>
                      <td className="px-4 py-4">{row.mercadoPublico}</td>
                      <td className="px-4 py-4 font-semibold text-blue-600">{row.licitUp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="bg-slate-50">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:py-24">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Diseñado para equipos que necesitan resultados rápidos
            </h2>
            <p className="mx-auto mt-4 max-w-3xl text-center text-lg text-slate-600">
              LicitUp reúne todas las herramientas para descubrir, priorizar y actuar sobre
              licitaciones relevantes en un solo lugar.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {benefits.map((benefit) => (
                <div
                  key={benefit.title}
                  className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 transition-all duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-600/10"
                >
                  <div className="absolute inset-y-5 left-3 w-1 rounded-full bg-blue-500/20 transition-all duration-200 group-hover:bg-blue-500/60" />
                  <div className="ml-5 flex items-start gap-4">
                    <span className="text-3xl leading-none">{benefit.icon}</span>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{benefit.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        {benefit.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="como-funciona"
          className="border-t border-slate-200 bg-white"
          aria-labelledby="como-funciona-title"
        >
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <h2
                id="como-funciona-title"
                className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl"
              >
                Cómo funciona
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                En tres pasos configuras tus alertas, recibes notificaciones y gestionas todas tus
                licitaciones en un mismo panel.
              </p>
            </div>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {steps.map((step) => (
                <div
                  key={step.step}
                  className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/60 p-6 shadow-sm shadow-slate-900/5 transition-transform duration-200 hover:-translate-y-1"
                >
                  <div className="absolute inset-y-6 left-0 w-1 bg-blue-500/40" />
                  <div className="ml-5 flex items-start gap-4">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-700">
                      {step.step}
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="precios"
          className="bg-slate-50"
          aria-labelledby="precios-title"
        >
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <h2 id="precios-title" className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Planes y precios transparentes
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                Elige el plan que mejor se adapte a tus metas comerciales. Comienza gratis y escala cuando lo necesites.
              </p>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-4">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 transition-all duration-200 ${
                    plan.highlight
                      ? 'border-blue-200 bg-blue-50/80 ring-2 ring-blue-300 hover:ring-blue-400'
                      : 'hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-600/10'
                  }`}
                >
                  <div className="flex-1 space-y-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                        {plan.highlight && (
                          <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                            Más popular
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-slate-500">{plan.description}</p>
                    </div>
                    <p className="text-3xl font-semibold text-slate-900">{plan.price}</p>
                    <ul className="space-y-2 text-sm text-slate-600">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Link
                    href="/register"
                    className={`mt-6 inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 ${
                      plan.highlight
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'border border-slate-200 text-slate-700 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    Comenzar
                  </Link>
                </div>
              ))}
            </div>
            <div className="mt-12 rounded-3xl bg-blue-600 px-8 py-12 text-center text-white shadow-lg shadow-blue-600/20">
              <h3 className="text-3xl font-semibold leading-tight sm:text-3xl">
                Recibe licitaciones que sí te interesan
              </h3>
              <p className="mt-4 text-base text-blue-100 sm:text-lg">
                Alertas alineadas con tu rubro sin revisar Mercado Público todos los días.
              </p>
              <Link
                href="/register"
                className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-white px-8 py-3 text-base font-semibold text-blue-700 transition-transform duration-200 hover:translate-y-0.5 sm:w-auto"
              >
                Crear cuenta gratis
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-14 lg:py-20">
            <div className="space-y-6">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Somos especialistas en datos y compras públicas
              </h2>
              <p className="text-lg text-slate-600">
                Nuestro equipo combina experiencia en tecnología, analítica de datos y licitaciones
                del Estado de Chile. Creamos LicitUp para que las PYMES compitan en igualdad de
                condiciones y no pierdan oportunidades relevantes.
              </p>
              <p className="text-sm text-slate-500">
                Creemos que revisar miles de licitaciones no debería requerir un equipo dedicado. Por
                eso construimos una herramienta simple y accesible para todo tipo de empresas.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 shadow-sm shadow-slate-900/5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                Nuestro propósito
              </h3>
              <div className="mt-4 space-y-6 text-sm text-slate-600">
                <p>
                  Democratizar el acceso a oportunidades del Estado mediante tecnología aplicada y
                  analítica predictiva. Conectamos datos complejos con modelos que priorizan las mejores
                  licitaciones, entregando insights accionables para que las empresas chilenas diseñen
                  estrategias comerciales sustentadas en evidencia.
                </p>
                <div className="grid gap-4 rounded-2xl bg-white/70 p-4 text-slate-700 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Dashboards en tiempo real</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">+25</p>
                    <p className="text-xs text-slate-500">Indicadores accionables por rubro y región</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Modelos predictivos</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">92%</p>
                    <p className="text-xs text-slate-500">Precisión promedio en matching de licitaciones relevantes</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="faq"
          className="bg-slate-50"
          aria-labelledby="faq-title"
        >
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <h2 id="faq-title" className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Preguntas frecuentes
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                Resolvemos las dudas más comunes sobre cómo funciona la plataforma LicitUp.
              </p>
            </div>
            <div className="mt-10 space-y-4">
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="group overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-sm shadow-slate-900/5 transition-all duration-200 open:border-blue-200 open:shadow-lg open:shadow-blue-600/10"
                >
                  <summary className="cursor-pointer list-none px-6 py-5 text-lg font-semibold text-slate-900 transition-colors duration-200 group-open:text-blue-700">
                    {faq.question}
                  </summary>
                  <div className="border-t border-slate-100 px-6 py-4 text-sm leading-relaxed text-slate-600">
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-white" aria-labelledby="video-title">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
              <div className="space-y-6">
                <h2 id="video-title" className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                  Mira cómo funciona en 60 segundos
                </h2>
                <p className="text-lg text-slate-600">
                  En este video corto te mostramos cómo crear tu cuenta, configurar alertas y revisar
                  oportunidades desde el dashboard.
                </p>
                <p className="text-sm text-slate-500">
                  Comparte el enlace con tu equipo comercial para que todos vean lo fácil que es
                  mantener el radar de licitaciones activo.
                </p>
              </div>
              <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-lg shadow-slate-900/10">
                <div className="absolute inset-0 flex items-center justify-center">
                  <button className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition-transform duration-200 hover:scale-105">
                    ▶
                  </button>
                </div>
                <div className="aspect-video bg-slate-200" />
              </div>
            </div>
          </div>
        </section>

        <section
          id="contacto"
          className="bg-slate-50"
          aria-labelledby="contacto-title"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-14 lg:py-20">
            <div className="space-y-6">
              <h2 id="contacto-title" className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                ¿Quieres hablar con el equipo?
              </h2>
              <p className="text-lg text-slate-600">
                Escríbenos y conversemos sobre cómo LicitUp puede potenciar tu proceso de ventas al
                Estado de Chile.
              </p>
              <div className="space-y-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Contacto directo</p>
                <a
                  href="mailto:contacto@oportunidadespublicas.cl"
                  className="text-blue-600 transition-colors duration-200 hover:text-blue-700"
                >
                  contacto@oportunidadespublicas.cl
                </a>
                <div className="flex gap-4">
                  <Link
                    href="https://www.linkedin.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 transition-colors duration-200 hover:text-blue-700"
                  >
                    LinkedIn
                  </Link>
                  <Link
                    href="https://twitter.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 transition-colors duration-200 hover:text-blue-700"
                  >
                    Twitter
                  </Link>
                </div>
              </div>
            </div>
            <form className="space-y-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm shadow-slate-900/5">
              <div>
                <label htmlFor="nombre" className="text-sm font-semibold text-slate-700">
                  Nombre
                </label>
                <input
                  id="nombre"
                  name="nombre"
                  type="text"
                  placeholder="Ingresa tu nombre"
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors duration-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>
              <div>
                <label htmlFor="correo" className="text-sm font-semibold text-slate-700">
                  Correo
                </label>
                <input
                  id="correo"
                  name="correo"
                  type="email"
                  placeholder="nombre@empresa.cl"
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors duration-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>
              <div>
                <label htmlFor="mensaje" className="text-sm font-semibold text-slate-700">
                  Mensaje
                </label>
                <textarea
                  id="mensaje"
                  name="mensaje"
                  rows={4}
                  placeholder="Cuéntanos qué necesitas…"
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors duration-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:translate-y-0.5 hover:bg-blue-700"
              >
                Enviar mensaje
              </button>
              <p className="text-xs text-slate-400">
                Al enviar este formulario aceptas que nos comuniquemos contigo para resolver tu
                consulta.
              </p>
            </form>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="max-w-sm space-y-4">
              <Link href="#inicio" className="flex items-center gap-3">
                <Image
                  src="/licituplogo.svg"
                  alt="LicitUp"
                  width={40}
                  height={40}
                  className="h-10 w-10"
                />
                <span className="text-lg font-semibold text-slate-900">LicitUp</span>
              </Link>
              <p className="text-sm text-slate-500">
                Oportunidades del Estado, al alcance de tu empresa. La forma más simple de descubrir
                licitaciones relevantes y actuar antes que tu competencia.
              </p>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3">
              <div className="space-y-3 text-sm text-slate-500">
                <p className="font-semibold text-slate-900">Navegación</p>
                {navItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="block transition-colors duration-200 hover:text-slate-900"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
              <div className="space-y-3 text-sm text-slate-500">
                <p className="font-semibold text-slate-900">Legal</p>
                <Link href="/privacy" className="block transition-colors duration-200 hover:text-slate-900">
                  Política de privacidad
                </Link>
                <Link href="/terms" className="block transition-colors duration-200 hover:text-slate-900">
                  Términos de uso
                </Link>
              </div>
              <div className="space-y-3 text-sm text-slate-500">
                <p className="font-semibold text-slate-900">Acceso</p>
                <Link
                  href="/login"
                  className="block transition-colors duration-200 hover:text-slate-900"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/register"
                  className="block transition-colors duration-200 hover:text-slate-900"
                >
                  Crear cuenta
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-6 text-xs text-slate-400 md:flex-row">
            <p>© {new Date().getFullYear()} Oportunidades Públicas. Todos los derechos reservados.</p>
            <p>Hecho con cariño en Chile.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

