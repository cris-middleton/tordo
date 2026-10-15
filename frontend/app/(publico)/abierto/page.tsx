import type { Metadata } from 'next';
import Link from 'next/link';

import { CajaInstalacion, Codigo } from '@/components/abierto/Bloques';
import { CabeceraFicha, Seccion } from '@/components/publico/Piezas';
import {
  HERRAMIENTAS_MCP,
  LICENCIA_CODIGO,
  LICENCIA_DATOS,
  LIMITE_POR_MINUTO,
  URL_DOCS_API,
  URL_MCP,
  ejemploCurl,
  instalacionesMcp,
} from '@/lib/abierto';
import { FUENTE_DATOS } from '@/lib/atribucion';
import { urlRepositorio } from '@/lib/repositorio';
import { CORREO_CONTACTO } from '@/lib/responsable';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

export const metadata: Metadata = {
  title: 'API, MCP y datos abiertos',
  description: `Cómo usar los datos de ${APP_NAME} fuera del sitio: API sin clave, servidor MCP para Claude y ChatGPT, CSV, RSS, código y licencias.`,
  alternates: { canonical: '/abierto' },
};

/**
 * `/abierto` — lo abierto, demostrado (spec del rediseño §6.5, principio 3):
 * la API, el MCP con una caja por cliente, CSV y RSS, el código y las licencias.
 *
 * Componente de servidor, prerenderizado en el build (lee `REPOSITORIO_URL`
 * ahí). **Ninguna petición a terceros**: ni botones de GitHub ni *badges* de
 * shields.io, que meterían peticiones que la política de privacidad no declara.
 * Los enlaces a otros sitios son enlaces, no recursos.
 */
export default function PaginaAbierto() {
  const repositorio = urlRepositorio();

  return (
    <article className="max-w-3xl">
      <CabeceraFicha
        tipo="Abierto"
        titulo="Úsalo como quieras"
        subtitulo={`Todo lo que muestra ${APP_NAME} se puede leer sin cuenta y sin clave: desde otro programa, desde un asistente de IA o en una planilla.`}
      >
        <nav aria-label="En esta página" className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a href="#api" className="enlace">API</a>
          <a href="#mcp" className="enlace">MCP</a>
          <a href="#datos" className="enlace">CSV y RSS</a>
          <a href="#codigo" className="enlace">Código</a>
          <a href="#licencias" className="enlace">Licencias</a>
        </nav>
      </CabeceraFicha>

      <Seccion id="api" titulo="API">
        <div className="space-y-3 text-sm leading-relaxed text-muted">
          <p>
            Una API de sólo lectura, en JSON y{' '}
            <strong className="text-text">sin cuentas ni claves</strong>: el catálogo de licitaciones
            y Compras Ágiles, las bandas de precio, la competencia y los compradores. La referencia
            de cada ruta, con su guía de uso, está en{' '}
            <a href={URL_DOCS_API} className="enlace">{URL_DOCS_API}</a>.
          </p>
          <p>
            El límite es de{' '}
            <strong className="text-text">{LIMITE_POR_MINUTO} peticiones por minuto por IP</strong>.
            Cada respuesta dice cuántas te quedan en las cabeceras{' '}
            <code className="font-mono text-text">X-RateLimit-*</code>; si te pasas, recibes un 429 con{' '}
            <code className="font-mono text-text">Retry-After</code>.
          </p>
          <Codigo etiqueta="Ejemplo con curl">{ejemploCurl()}</Codigo>
        </div>
      </Seccion>

      <Seccion
        id="mcp"
        titulo="Pregúntale a Claude por el mercado público"
        descripcion={`Un servidor MCP anónimo: tu asistente consulta precios, compradores y licitaciones de ${APP_NAME} mientras conversas. Sin clave, sin cuenta y sin cuota diaria; cuenta en el mismo límite por IP que la API (${LIMITE_POR_MINUTO} peticiones por minuto).`}
      >
        <p className="text-sm text-muted">La dirección del servidor, siempre con la barra final:</p>
        <Codigo etiqueta="URL del servidor MCP">{URL_MCP}</Codigo>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {instalacionesMcp(APP_NAME).map((instalacion) => (
            <CajaInstalacion key={instalacion.id} instalacion={instalacion} />
          ))}
        </div>
        <h3 className="mt-8 text-sm font-semibold text-text">Sus cuatro herramientas</h3>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
          {HERRAMIENTAS_MCP.map((h) => (
            <li key={h.nombre}>
              <code className="font-mono text-text">{h.nombre}</code> — {h.descripcion}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-subtle">
          Son cuatro y no veinte a propósito: cada una responde de una vez lo que en la API son
          varias llamadas.
        </p>
      </Seccion>

      <Seccion id="datos" titulo="CSV y RSS">
        <ul className="space-y-3 text-sm leading-relaxed text-muted">
          <li>
            <strong className="text-text">CSV.</strong> La banda de precio de un producto se
            descarga desde la herramienta de precio de{' '}
            <Link href="/mercado" className="enlace">/mercado</Link>, con el mismo cálculo que ves en
            pantalla. Va con BOM y separada por <code className="font-mono text-text">;</code> para
            que Excel en Chile la abra bien, y su primera línea cita la fuente. Por la API también
            la de competidores de un comprador:{' '}
            <code className="font-mono text-text">/api/v1/bi/exportar/precio/…</code> y{' '}
            <code className="font-mono text-text">/api/v1/bi/exportar/competidores/…</code>.
          </li>
          <li>
            <strong className="text-text">RSS.</strong> Cada búsqueda guardada del{' '}
            <Link href="/licitaciones" className="enlace">catálogo</Link> tiene su feed, y «Lo mejor
            de hoy» en Compra Ágil también (<a href="/rss/compra-agil" className="enlace">/rss/compra-agil</a>).
            Cómo se sigue una:{' '}
            <Link href="/guias/seguir-una-busqueda-por-rss" className="enlace">la guía del RSS</Link>.
          </li>
          <li>
            <strong className="text-text">De dónde salen.</strong> De la API y los datos abiertos de
            ChileCompra:{' '}
            <Link href="/guias/de-donde-salen-los-datos" className="enlace">qué se usa y sus límites</Link>.
          </li>
        </ul>
      </Seccion>

      <Seccion id="codigo" titulo="Código">
        <div className="space-y-3 text-sm leading-relaxed text-muted">
          {repositorio ? (
            <p>
              El código del sitio, de la API y del procesamiento de datos está en{' '}
              <a href={repositorio} rel="noopener noreferrer" className="enlace">{repositorio}</a>,
              bajo licencia {LICENCIA_CODIGO.nombre}.
            </p>
          ) : (
            <p>
              El código todavía no está publicado. Cuando lo esté, será bajo licencia{' '}
              {LICENCIA_CODIGO.nombre} y el enlace aparecerá aquí.
            </p>
          )}
          <p>
            ¿Un error, un dato raro o un problema de seguridad? Escribe a{' '}
            <a href={`mailto:${CORREO_CONTACTO}`} className="enlace">{CORREO_CONTACTO}</a>. Si viene
            de la API, incluye la cabecera <code className="font-mono text-text">X-Request-ID</code>{' '}
            de la respuesta: lleva directo al registro del servidor.
          </p>
        </div>
      </Seccion>

      <Seccion id="licencias" titulo="Licencias">
        <dl className="space-y-4 text-sm leading-relaxed text-muted">
          <div>
            <dt className="font-semibold text-text">
              Lo que calcula {APP_NAME}: {LICENCIA_DATOS.nombre}
            </dt>
            <dd className="mt-1">
              Las bandas de precio, los puntajes, los indicadores de competencia y de compradores,
              los CSV de análisis y esas mismas cifras en la API y el MCP se publican bajo{' '}
              <a href={LICENCIA_DATOS.url} rel="license noopener noreferrer" className="enlace">
                Creative Commons Atribución 4.0
              </a>
              . Puedes usarlos para lo que quieras, también con fines comerciales, citando a{' '}
              {APP_NAME}, conservando la cita de la fuente («{FUENTE_DATOS}») e indicando si hiciste
              cambios.
            </dd>
            <dd className="mt-1">
              Los proveedores que son{' '}
              <strong className="text-text">personas naturales</strong> no aparecen con su nombre ni
              su RUT: se reemplazan por la etiqueta «Persona natural» y, en los análisis, por un
              seudónimo que cambia en cada actualización y no permite volver a la persona. El
              motivo está en la{' '}
              <Link href="/privacidad" className="enlace">política de privacidad</Link>.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text">El catálogo: de ChileCompra</dt>
            <dd className="mt-1">
              Los nombres, descripciones y demás campos de las licitaciones y Compras Ágiles, tal
              como los publica ChileCompra, no los licencia este sitio: siguen bajo las condiciones
              de ChileCompra, que pide citar la fuente. Ver también los{' '}
              <Link href="/terminos" className="enlace">términos de uso</Link>.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text">El código: {LICENCIA_CODIGO.nombre}</dt>
            <dd className="mt-1">
              {repositorio
                ? 'Libre para usar, estudiar y modificar. Si sirves una versión modificada como sitio web, tienes que publicar tus cambios bajo la misma licencia.'
                : 'Cuando se publique, será libre para usar, estudiar y modificar; y si sirves una versión modificada como sitio web, tendrás que publicar tus cambios bajo la misma licencia.'}{' '}
              <a href={LICENCIA_CODIGO.url} rel="license noopener noreferrer" className="enlace">
                Texto de la licencia {LICENCIA_CODIGO.nombre}
              </a>
              .
            </dd>
          </div>
        </dl>
      </Seccion>
    </article>
  );
}
