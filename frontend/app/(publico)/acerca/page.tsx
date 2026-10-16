import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

import { CabeceraFicha, Seccion } from '@/components/publico/Piezas';
import { PREGUNTAS } from '@/lib/acerca';
import { COSTO_MENSUAL_APROXIMADO } from '@/lib/costos';
import { nombreAutor } from '@/lib/autor';
import { CORREO_CONTACTO } from '@/lib/responsable';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

export const metadata: Metadata = {
  title: 'Acerca',
  description: `Qué es ${APP_NAME}, de dónde salen sus datos, cómo se financia y las preguntas frecuentes.`,
  alternates: { canonical: '/acerca' },
};

/**
 * `/acerca` (spec del rediseño §6.3 y §6.7): lo que la portada explicaba antes
 * de ser un buscador —qué es, de dónde salen los datos, cómo se financia— y las
 * preguntas frecuentes (`lib/acerca.ts`). Mínima a propósito.
 *
 * Componente de servidor, sin JavaScript propio: el acordeón es `<details>`.
 * **«Lo hace X» sólo con `AUTOR_NOMBRE`** (`nombreAutor()`, spec PORTADA_V7 V5): sin
 * ella no se firma, ni con un hueco ni con un nombre inventado. La autoría no es el
 * responsable legal: `/terminos` y `/privacidad` siguen con `RESPONSABLE_LEGAL`.
 */
export default function PaginaAcerca() {
  const autor = nombreAutor();

  return (
    <article className="max-w-3xl">
      <CabeceraFicha
        titulo={`Acerca de ${APP_NAME}`}
        subtitulo="Qué es, de dónde salen los datos, cómo se financia y las preguntas de siempre."
      />

      <Seccion id="que-es" titulo="Qué es">
        <div className="space-y-3 text-sm leading-relaxed text-muted">
          <p>
            Un sitio para quien le vende al Estado de Chile: qué se está comprando hoy, cuánto se ha
            pagado por lo que vendes y contra quién compites. Responde una pregunta —¿me conviene
            postular, y a qué precio?— con los datos públicos de Mercado Público.
          </p>
          <p>
            Es gratis y no pide registro: lo que guardas se queda en tu navegador. También se puede
            usar fuera del sitio: hay una{' '}
            <Link href="/abierto" className="enlace">
              API, un servidor MCP y descargas en CSV
            </Link>
            .
          </p>
        </div>
      </Seccion>

      <Seccion id="datos" titulo="De dónde salen los datos">
        <p className="text-sm leading-relaxed text-muted">
          De los archivos abiertos de órdenes de compra de ChileCompra de los últimos tres años (los
          precios, del último) y de la API de Mercado Público, que se consulta varias veces al día. Son
          datos oficiales: cualquier cifra se puede contrastar en Mercado Público, y la cita de la
          fuente va al pie de cada página.{' '}
          <Link href="/guias/de-donde-salen-los-datos" className="enlace">
            Cómo se procesan
          </Link>
          .
        </p>
      </Seccion>

      <Seccion id="financiacion" titulo="Cómo se financia">
        <div className="space-y-3 text-sm leading-relaxed text-muted">
          <p>
            Mantenerlo en línea cuesta{' '}
            <Link href="/apoyar#costos" className="enlace">
              alrededor de {COSTO_MENSUAL_APROXIMADO} al mes
            </Link>
            , y lo sostienen los aportes voluntarios de quienes lo usan.
          </p>
          {autor && <p>Lo hace {autor}, data scientist, a título personal.</p>}
          <p>
            ¿Un dato que no cuadra, una idea o una pregunta? Escribe a{' '}
            <a href={`mailto:${CORREO_CONTACTO}`} className="enlace">
              {CORREO_CONTACTO}
            </a>
            .
          </p>
        </div>
      </Seccion>

      <Seccion id="preguntas" titulo="Preguntas frecuentes">
        <div className="space-y-3">
          {PREGUNTAS.map((p) => (
            <details key={p.pregunta} className="group rounded-xl border border-border bg-surface open:shadow-card-md">
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
      </Seccion>
    </article>
  );
}
