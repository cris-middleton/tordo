import type { Metadata } from 'next';
import Link from 'next/link';

import { DocumentoLegal } from '@/components/legal/DocumentoLegal';
import { DESCARGO_CHILECOMPRA, FUENTE_DATOS } from '@/lib/atribucion';
import { CORREO_CONTACTO, RESPONSABLE } from '@/lib/responsable';

export const metadata: Metadata = {
  title: 'Términos de uso',
  description:
    'Condiciones de uso del sitio: de dónde salen los datos, qué no son y cómo se puede usar la API.',
  alternates: { canonical: '/terminos' },
};

/*
 * Responsable y contacto: `lib/responsable.ts`. La fecha de vigencia se pone al
 * publicar (paso 12).
 *
 * Reescrito para el sitio público y gratuito (docs/PIVOTE_PUBLICO_2026-10.md):
 * el borrador anterior (PR #80) era el contrato de un SaaS con cuentas, planes y
 * cobro, y casi nada de él sobrevive — aquí no hay registro, ni suscripción, ni
 * nada que cancelar.
 */
const VIGENTE_DESDE = '13 de octubre de 2026';

export default function TerminosPage() {
  return (
    <DocumentoLegal titulo="Términos de uso" vigenteDesde={VIGENTE_DESDE}>
      <p>
        Este sitio es un proyecto personal, público y gratuito, mantenido por{' '}
        <strong>{RESPONSABLE}</strong> (en adelante, «el responsable»). Usar el sitio, su API o su servidor MCP supone aceptar
        estas condiciones. No hace falta registrarse: el sitio no tiene cuentas.
      </p>

      <h2>1. Qué es</h2>
      <p>
        Un sitio que reúne y analiza datos públicos de compras del Estado de Chile: licitaciones,
        Compra Ágil, órdenes de compra, rangos de precio históricos, compradores y competencia
        por rubro. Se ofrece en la web, como API de lectura y como servidor MCP.
      </p>

      <h2>2. De dónde salen los datos</h2>
      <p>
        Los datos provienen de la API pública de Mercado Público y de los archivos de datos
        abiertos que publica la Dirección de Compras y Contratación Pública. {FUENTE_DATOS}.
      </p>
      <p>
        <strong>El sitio no está afiliado a ChileCompra ni a ningún organismo del Estado</strong>{' '}
        y no actúa en su representación. {DESCARGO_CHILECOMPRA}
      </p>
      <p>
        Los datos no se modifican en su contenido. Sí se normalizan en forma (fechas, tipos,
        mayúsculas, unidades) y se calculan agregados sobre ellos. Además, los nombres e
        identificadores de los proveedores que son <strong>personas naturales</strong> se
        omiten y se muestran como «Persona natural»: el motivo está en la{' '}
        <Link href="/privacidad">política de privacidad</Link>.
      </p>

      <h2>3. Qué no es</h2>
      <p>
        Los rangos de precio, puntajes, indicadores y demás análisis son{' '}
        <strong>estimaciones estadísticas sobre datos históricos</strong>. No son asesoría legal,
        financiera ni comercial, no son una recomendación de cuánto ofertar y no garantizan
        ningún resultado en un proceso de compra. Las decisiones que se tomen con ellos son de
        quien las toma.
      </p>
      <p>
        La exactitud, integridad y oportunidad de la información dependen de la fuente. El
        responsable no controla lo que publica ChileCompra, y no responde por errores,
        omisiones o retrasos originados en ella ni en su procesamiento. Ante cualquier duda, el
        dato oficial es el que figura en{' '}
        <a href="https://www.mercadopublico.cl" rel="noopener noreferrer">
          mercadopublico.cl
        </a>
        .
      </p>

      <h2>4. Uso aceptable</h2>
      <ul>
        <li>
          Puedes consultar, citar y reutilizar los datos y análisis, también con fines
          comerciales, <strong>citando la fuente oficial</strong> tal como aparece arriba.
          Los archivos CSV que descargas ya la traen en su primera línea.
        </li>
        <li>
          La API y el servidor MCP son de libre acceso y tienen un{' '}
          <strong>límite de peticiones por dirección IP</strong>, que se informa en las
          cabeceras <code>X-RateLimit-*</code> de cada respuesta. No está permitido eludirlo
          (por ejemplo, rotando direcciones IP) ni extraer masivamente el contenido del sitio
          por encima de ese límite.
        </li>
        <li>
          No está permitido usar el sitio para fines ilícitos, para intentar acceder a partes
          no públicas del sistema ni de forma que degrade el servicio para los demás.
        </li>
        <li>
          No está permitido presentar el contenido como si proviniera de ChileCompra o de un
          organismo público, ni como si el responsable respaldara un uso concreto.
        </li>
      </ul>
      <p>
        El responsable puede bloquear el acceso de una dirección IP que incumpla estas reglas.
      </p>

      <h2>5. Donaciones</h2>
      <p>
        El sitio se financia con aportes voluntarios a través de enlaces de terceros (Mercado
        Pago, transferencia bancaria y GitHub Sponsors). Un aporte es una donación: <strong>no compra ningún servicio</strong>,
        no da acceso a nada que no tenga cualquier visitante y no obliga al responsable a
        mantener el sitio, ni ninguna función, durante un plazo determinado. El pago lo
        procesa cada plataforma bajo sus propias condiciones.
      </p>

      <h2>6. Disponibilidad y cambios</h2>
      <p>
        El sitio se ofrece «tal como está» y «según disponibilidad». Puede interrumpirse,
        cambiar o dejar de existir sin aviso previo. En la medida que la ley lo permita, el
        responsable no responde por los daños que puedan derivarse de su uso o de su falta de
        disponibilidad.
      </p>
      <p>
        Estos términos pueden cambiar. La versión vigente es siempre la publicada en esta
        página, con su fecha arriba.
      </p>

      <h2>7. Propiedad</h2>
      <p>
        El contenido de los datos es información pública de ChileCompra. El software, los
        algoritmos y la presentación del sitio pertenecen al responsable.
      </p>

      <h2>8. Ley aplicable</h2>
      <p>
        Estos términos se rigen por la ley chilena. Cualquier controversia se someterá a los
        tribunales ordinarios de justicia de Chile.
      </p>

      <h2>9. Contacto</h2>
      <p>
        Escribe a <strong>{CORREO_CONTACTO}</strong>.
      </p>
    </DocumentoLegal>
  );
}
