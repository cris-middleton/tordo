import Link from 'next/link';
import { ArrowRight, ChevronDown, Heart, Search, Zap } from 'lucide-react';

import { PieAtribucion } from '@/components/legal/PieAtribucion';
import { CabeceraPublica } from '@/components/publico/CabeceraPublica';
import { TITULO_DESTACADAS } from '@/lib/compraAgil';
import { COSTO_MENSUAL_APROXIMADO } from '@/lib/costos';
import { ACCESOS, PREGUNTAS } from '@/lib/portada';
import { CORREO_CONTACTO } from '@/lib/responsable';
import type { CompraAgilDestacadasResponse } from '@/types/compraAgil';

import { BloqueHoy } from './BloqueHoy';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

/**
 * La portada. **Componente de servidor entero, sin JavaScript propio**: el
 * acordeón de preguntas es `<details>` y la cabecera no tiene menú
 * desplegable. La anterior era un componente cliente de 540 líneas para un
 * carrusel de maquetas y un menú.
 *
 * Responde en la primera pantalla qué es, para quién y qué hacer ahora; debajo,
 * lo vivo (`BloqueHoy`) y los accesos. `destacadas = null` es que el backend
 * falló: el bloque no se pinta y lo demás sigue en pie.
 *
 * Las secciones alternan las bandas de la paleta (`band-*`): la mediana
 * (`band-1`) es el bloque de los datos, como en `PriceBandChart`.
 */
export function Portada({ destacadas }: { destacadas: CompraAgilDestacadasResponse | null }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <CabeceraPublica ancho="max-w-6xl" />

      <main className="flex-1">
        {/* El hero se ve oscuro en los dos temas: `dark` invierte los tokens dentro. */}
        <section className="dark bg-brand-navy px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-4xl">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              Datos públicos de ChileCompra · últimos tres años
            </p>
            <h1 className="text-4xl font-bold leading-tight text-text sm:text-5xl">
              Inteligencia de compras públicas, gratis y sin cuenta
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
              Para quien le vende al Estado de Chile: qué se está comprando hoy, cuánto se ha pagado
              por lo que vendes y contra quién compites. Sin registrarte.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/compra-agil" className="btn-accent px-6 py-3">
                <Zap className="h-4 w-4" aria-hidden="true" />
                {TITULO_DESTACADAS}
              </Link>
              <Link href="/productos" className="btn-secondary px-6 py-3">
                <Search className="h-4 w-4" aria-hidden="true" />
                Buscar precios
              </Link>
            </div>
          </div>
        </section>

        {destacadas && <BloqueHoy datos={destacadas} />}

        <section aria-labelledby="accesos-titulo" className="bg-band3 px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <h2 id="accesos-titulo" className="text-2xl font-bold text-text">
              Qué hay en el sitio
            </h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {ACCESOS.map((a) => (
                <li key={a.href}>
                  <Link
                    href={a.href}
                    className="group flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-md"
                  >
                    <span className="flex items-center justify-between text-base font-bold text-text group-hover:text-primary">
                      {a.titulo}
                      <ArrowRight className="h-4 w-4 text-subtle group-hover:text-primary" aria-hidden="true" />
                    </span>
                    <span className="mt-1.5 text-sm leading-relaxed text-muted">{a.texto}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="datos-titulo" className="bg-band1 px-4 py-14 sm:px-6">
          <div className="mx-auto grid max-w-4xl gap-10 md:grid-cols-2">
            <div>
              <h2 id="datos-titulo" className="text-xl font-bold text-text">
                De dónde salen los datos
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                De los archivos abiertos de órdenes de compra de los últimos tres años (los
                precios, del último) y de la API de Mercado Público, que se consulta varias veces
                al día. Datos oficiales: cualquier cifra se
                puede contrastar en Mercado Público. La cita de la fuente va al pie de cada
                página.
              </p>
              <Link
                href="/guias/de-donde-salen-los-datos"
                className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
              >
                Cómo se procesan
              </Link>
            </div>
            <div>
              <h2 className="text-xl font-bold text-text">Cómo se financia</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Sin publicidad y sin planes de pago: mantenerlo cuesta unos{' '}
                {COSTO_MENSUAL_APROXIMADO} al mes y lo sostienen aportes voluntarios.
              </p>
              <Link
                href="/apoyar"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <Heart className="h-4 w-4" aria-hidden="true" />
                Apoyar el sitio
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-titulo" className="bg-band2 px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <h2 id="faq-titulo" className="text-center text-2xl font-bold text-text">
              Preguntas frecuentes
            </h2>
            <div className="mt-8 space-y-3">
              {PREGUNTAS.map((p) => (
                <details
                  key={p.pregunta}
                  className="group rounded-xl border border-border bg-surface open:shadow-md"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 text-sm font-semibold text-text hover:text-primary [&::-webkit-details-marker]:hidden">
                    {p.pregunta}
                    <ChevronDown
                      className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="border-t border-border px-5 py-4 text-sm leading-relaxed text-muted">
                    <p>{p.respuesta}</p>
                    {p.enlace && (
                      <Link href={p.enlace.href} className="enlace mt-2 inline-block">
                        {p.enlace.texto}
                      </Link>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-band4 px-4 py-8 sm:px-6">
        <PieAtribucion />
        <p className="mt-4 text-center text-[11px] text-subtle">
          {APP_NAME} · Chile · No estamos afiliados al gobierno de Chile ·{' '}
          <a href={`mailto:${CORREO_CONTACTO}`} className="hover:text-primary">
            Contacto
          </a>
        </p>
      </footer>
    </div>
  );
}
