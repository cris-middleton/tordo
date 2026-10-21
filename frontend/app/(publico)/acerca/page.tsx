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
  description: `Qué es ${APP_NAME}, de dónde salen sus cifras y quién lo paga. Más las preguntas frecuentes.`,
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
        titulo={`Qué es ${APP_NAME}`}
        subtitulo="Un sitio con lo que el Estado de Chile ya compró, a qué precio y a quién. Con eso decides si postular y a cuánto."
      />

      <Seccion id="que-es" titulo="Qué puedes hacer aquí">
        <div className="space-y-3 text-sm leading-relaxed text-muted">
          <p>
            Escribes lo que vendes y ves a qué precio lo compró el Estado en los últimos {MESES_PRECIOS}{' '}
            meses, y quién lo compra. También están las licitaciones y Compras Ágiles abiertas hoy y,
            en cada rubro, quién más le vende al Estado.
          </p>
          <p>
            No tienes que registrarte: lo que guardas queda en tu navegador. Si quieres usar las mismas
            cifras desde tu código o tu asistente de IA, hay una{' '}
            <Link href="/abierto" className="enlace">
              API, un servidor MCP y descargas en CSV
            </Link>
            .
          </p>
        </div>
      </Seccion>

      <Seccion id="datos" titulo="De dónde salen los datos">
        <div className="space-y-3 text-sm leading-relaxed text-muted">
          <p>
            Todo sale de ChileCompra. Los precios y los mercados, de sus archivos abiertos de órdenes
            de compra: los últimos {MESES_ANALISIS} meses, y {MESES_PRECIOS} para los precios. Las
            licitaciones y Compras Ágiles, de la API de Mercado Público, que consultamos{' '}
            {FRECUENCIA_CATALOGO}.
          </p>
          <p>
            Cualquier cifra la puedes contrastar en Mercado Público. Cómo procesamos los datos, y lo
            que no traen, está en{' '}
            <Link href="/guias/de-donde-salen-los-datos" className="enlace">
              la guía de los datos
            </Link>
            .
          </p>
        </div>
      </Seccion>

      <Seccion id="financiacion" titulo="Quién lo paga">
        <p className="text-sm leading-relaxed text-muted">
          Tenerlo en línea cuesta{' '}
          <Link href="/apoyar#costos" className="enlace">
            alrededor de {COSTO_MENSUAL_APROXIMADO} al mes
          </Link>
          , y se paga con aportes voluntarios de quienes lo usan.
        </p>
      </Seccion>

      {autor && (
        <Seccion id="quien-lo-hace" titulo="Quién lo hace">
          <div className="space-y-3 text-sm leading-relaxed text-muted">
            <p>{rol ? `Lo hace ${autor}, ${rol}, a título personal.` : `Lo hace ${autor}, a título personal.`}</p>
            <p>
              Cuando encontramos un error en los datos, o uno nuestro, lo contamos en las{' '}
              <Link href="/notas" className="enlace">
                notas de datos
              </Link>
              , con cómo lo medimos.
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
        <p className="mt-4 text-sm leading-relaxed text-muted">
          ¿Tu pregunta no está, o viste un dato que no cuadra? Escribe a{' '}
          <a href={`mailto:${CORREO_CONTACTO}`} className="enlace">
            {CORREO_CONTACTO}
          </a>
          .
        </p>
      </Seccion>
    </article>
  );
}
