import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, Heart } from 'lucide-react';

import { TablaCostos } from '@/components/apoyar/TablaCostos';
import { VerTransferencia } from '@/components/apoyar/VerTransferencia';
import { CabeceraFicha, Seccion } from '@/components/publico/Piezas';
import { COSTO_MENSUAL_APROXIMADO } from '@/lib/costos';
import { mediosDeDonacion } from '@/lib/donaciones';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

export const metadata: Metadata = {
  title: 'Apoyar el sitio',
  description: `Cuánto cuesta tener ${APP_NAME} en línea, concepto por concepto, y cómo aportar si te sirve.`,
  alternates: { canonical: '/apoyar' },
};

/**
 * `/apoyar` — donaciones (spec del pivote §4).
 *
 * Tres enlaces y ninguna integración. Cada medio sale de una variable de
 * servidor (`lib/donaciones.ts`); el que no la tiene no se muestra, y sin
 * ninguno la página lo dice en vez de enseñar botones muertos.
 *
 * **Los medios van primero y el costo después**: con la tabla delante, el botón
 * quedaba a tres pantallas y media en un teléfono. El total se dice dos veces,
 * en la entrada de «Cuánto cuesta» y en la fila «Total»; el desglose de por qué
 * se paga el uso y no el plan vive en las filas (`lib/costos.ts`).
 *
 * **Sin publicidad** (spec §4.1): se decidió cuando el sitio estaba en Vercel
 * Hobby, donde un anuncio lo convertía en comercial. Desde el 2026-10-20 está en
 * Pro y ese motivo ya no aplica; la decisión sigue.
 *
 * **El texto corrido va a 16 px y en `text`** (`PROSA`). La letra chica bajo los
 * botones es una frase afirmativa y el enlace a los términos, que dicen el resto:
 * eran cuatro líneas de negaciones encadenadas. La tabla del costo ocupa la
 * columna entera (`TablaCostos`).
 */
const PROSA = 'text-base leading-relaxed text-text';

export default function PaginaApoyar() {
  const { enlaces, transferencia } = mediosDeDonacion();
  const hayAlguno = enlaces.length > 0 || transferencia;
  const [principal, ...otros] = enlaces;

  return (
    <article className="lectura max-w-3xl">
      <CabeceraFicha
        titulo={`${APP_NAME} es gratis. Mantenerlo, casi.`}
        subtitulo="Si te sirve, un aporte ayuda a pagar los servidores. Abajo está lo que cuestan, dólar por dólar."
      />

      <Seccion id="aportar" titulo="Cómo aportar">
        {hayAlguno ? (
          <div className="space-y-6">
            {enlaces.length > 0 && (
              <ul className="flex flex-wrap gap-3">
                {principal && (
                  <li>
                    <a
                      href={principal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-accent"
                    >
                      <Heart className="h-4 w-4" aria-hidden="true" />
                      Aportar con {principal.nombre}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </li>
                )}
                {otros.map((m) => (
                  <li key={m.id}>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                      {m.nombre}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {transferencia && (
              <div>
                <p className={`mb-2 ${PROSA}`}>
                  O por transferencia bancaria, sin comisión para nadie.
                </p>
                <VerTransferencia />
              </div>
            )}
          </div>
        ) : (
          <p className={PROSA}>
            Todavía no hay medios de aporte habilitados. Mientras, la mejor ayuda es que se lo
            cuentes a alguien que licite.
          </p>
        )}
        <p className="mt-6 text-sm leading-relaxed text-muted">
          Un aporte es una donación: quien aporta ve el mismo sitio que cualquiera. Las condiciones están en los{' '}
          <Link href="/terminos" className="enlace">
            términos de uso
          </Link>
          .
        </p>
      </Seccion>

      <Seccion id="costos" titulo="Cuánto cuesta">
        <p className={PROSA}>
          Tenerlo en línea cuesta{' '}
          <strong className="text-text">alrededor de {COSTO_MENSUAL_APROXIMADO} al mes</strong>. La
          plata se va en Vercel, que sirve las páginas, y en Railway, donde viven la API, la base de
          datos y las tareas que traen los datos de ChileCompra.
        </p>
        <div className="mt-4">
          <TablaCostos />
        </div>
      </Seccion>

      <Seccion titulo="Qué hacemos con tus datos si aportas">
        <p className={PROSA}>
          Si aportas, la plataforma que elijas nos informa normalmente tu nombre, el monto y la
          fecha. Lo guardamos sólo para la contabilidad y no lo publicamos sin tu permiso. El
          detalle está en la{' '}
          <Link href="/privacidad" className="enlace">
            política de privacidad
          </Link>
          .
        </p>
      </Seccion>
    </article>
  );
}
