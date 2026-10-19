import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

import { CabeceraFicha, Seccion } from '@/components/publico/Piezas';
import { PREGUNTAS } from '@/lib/acerca';
import { COSTO_MENSUAL_APROXIMADO } from '@/lib/costos';
import { nombreAutor, rolAutor } from '@/lib/autor';
import { urlRepositorio } from '@/lib/repositorio';
import { MESES_ANALISIS, MESES_PRECIOS } from '@/lib/periodo';
import { FRECUENCIA_CATALOGO } from '@/lib/portada';
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
 * Componente de servidor, sin JavaScript propio: el acordeón es `<details>`, sin
 * caja, separado por filetes y con el `<summary>` de 44 px como mínimo (un blanco
 * táctil cómodo).
 * **«Quién lo hace» sólo con `AUTOR_NOMBRE`** (`nombreAutor()`, spec PORTADA_V7 V5): sin
 * ella la sección no sale, ni con un hueco ni con un nombre inventado. Enlaza a las
 * notas de datos y, con `REPOSITORIO_URL`, al código. La autoría no es el
 * responsable legal: `/terminos` y `/privacidad` siguen con `RESPONSABLE_LEGAL`.
 * El rol sale de `AUTOR_ROL` (`rolAutor()`); sin él, el nombre solo.
 */
export default function PaginaAcerca() {
  const autor = nombreAutor();
  const rol = rolAutor();
  const repositorio = urlRepositorio();

  return (
    <article className="lectura max-w-3xl">
      <CabeceraFicha
        titulo={`Acerca de ${APP_NAME}`}
        subtitulo="Lo que hay detrás del sitio."
      />

      <Seccion id="que-es" titulo="Qué es">
        <div className="space-y-3 text-sm leading-relaxed text-muted">
          <p>
            Es para quien le vende al Estado de Chile. Te dice qué se compra hoy, a qué precio se ha
            comprado lo que vendes y quién más le vende. Con eso decides si postular y a qué precio.
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
          De los archivos abiertos de órdenes de compra de ChileCompra de los últimos {MESES_ANALISIS}{' '}
          meses ({MESES_PRECIOS} para los precios) y de la API de Mercado Público, que se consulta{' '}
          {FRECUENCIA_CATALOGO}. Son datos oficiales: cualquier cifra se puede contrastar en Mercado
          Público, y la cita de la fuente va al pie de cada página.{' '}
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
          <p>
            ¿Un dato que no cuadra, una idea o una pregunta? Escribe a{' '}
            <a href={`mailto:${CORREO_CONTACTO}`} className="enlace">
              {CORREO_CONTACTO}
            </a>
            .
          </p>
        </div>
      </Seccion>

      {autor && (
        <Seccion id="quien-lo-hace" titulo="Quién lo hace">
          <div className="space-y-3 text-sm leading-relaxed text-muted">
            <p>{rol ? `Lo hace ${autor}, ${rol}, a título personal.` : `Lo hace ${autor}, a título personal.`}</p>
            <p>
              Cada hallazgo sobre los datos, con cómo se midió, queda en las{' '}
              <Link href="/notas" className="enlace">
                notas de datos
              </Link>
              .
              {repositorio && (
                <>
                  {' '}El{' '}
                  <a href={repositorio} rel="noopener noreferrer" className="enlace">
                    código del sitio
                  </a>{' '}
                  es público.
                </>
              )}
            </p>
          </div>
        </Seccion>
      )}

      <Seccion id="preguntas" titulo="Preguntas frecuentes">
        <div className="divide-y divide-border border-y border-border">
          {PREGUNTAS.map((p) => (
            <details key={p.pregunta} className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-semibold text-text hover:text-primary [&::-webkit-details-marker]:hidden">
                {p.pregunta}
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <div className="pb-4 pr-8 text-sm leading-relaxed text-muted">
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
