import type { Metadata } from 'next';

import { DocumentoLegal } from '@/components/legal/DocumentoLegal';
import { CORREO_CONTACTO, RESPONSABLE } from '@/lib/responsable';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description:
    'Qué datos personales trata el sitio, cómo se reemplaza a las personas naturales por «Persona natural» o un seudónimo y cómo ejercer tus derechos.',
  alternates: { canonical: '/privacidad' },
};

/*
 * Responsable y contacto: `lib/responsable.ts` (sólo nombre y un correo del
 * dominio, a propósito). La fecha de vigencia se pone al publicar (paso 12).
 * Dos frases dependen del lanzamiento y están en su lista: Sentry con «Prevent
 * Storing of IP Addresses» y Vercel Web Analytics activado.
 *
 * Regla de escritura: describir lo que el sistema HACE, no lo que sería bonito
 * que hiciera. Cada afirmación de abajo tiene su respaldo en el código:
 *   - sin cuentas ni cookies propias: el pivote retiró auth (pasos 3 y 4);
 *   - IP en memoria, sin guardar: `backend/app/core/limite_ip.py`;
 *   - IP del visitante reenviada por el servidor de Next: `app/api/proxy`;
 *   - Sentry sin PII: `lib/sentry-comun.ts` y `app/observability/sentry.py`;
 *   - localStorage: `hooks/useDashboardCollections.ts`, `hooks/useBusquedasGuardadas.ts`, el tema (next-themes)
 *     y el aviso descartado de `SectorOverview`;
 *   - personas naturales: `etl/analytics/personas.py`.
 * Si alguno cambia, esta página se corrige en el mismo PR.
 */
const VIGENTE_DESDE = '15 de octubre de 2026';

export default function PrivacidadPage() {
  return (
    <DocumentoLegal titulo="Política de privacidad" vigenteDesde={VIGENTE_DESDE}>
      <p>
        Esta política explica qué datos personales trata este sitio, con qué finalidad y qué
        derechos tienes sobre ellos, conforme a la Ley N° 19.628 sobre protección de la vida
        privada, en su texto modificado por la Ley N° 21.719.
      </p>

      <h2>1. Responsable</h2>
      <p>
        <strong>{RESPONSABLE}</strong>, a título personal. Contacto para cualquier materia de
        privacidad: <strong>{CORREO_CONTACTO}</strong>.
      </p>

      <h2>2. Lo más importante, en corto</h2>
      <ul>
        <li>
          <strong>No hay cuentas.</strong> No pedimos ni guardamos nombre, correo, contraseña
          ni ningún perfil de quien visita el sitio.
        </li>
        <li>
          <strong>No usamos cookies para identificarte</strong> ni para publicidad, y no
          vendemos ni cedemos datos.
        </li>
        <li>
          Los datos de compras públicas vienen de ChileCompra, y{' '}
          <strong>reemplazamos el nombre y el RUT de los proveedores que son personas naturales</strong>{' '}
          por «Persona natural» (y, en los análisis, por un seudónimo).
        </li>
      </ul>

      <h2>3. Datos de compras públicas</h2>
      <p>
        El sitio publica información que la Dirección de Compras y Contratación Pública
        (ChileCompra) pone a disposición del público: licitaciones, Compra Ágil, órdenes de
        compra, compradores y proveedores. No es información que obtengamos de ti.
      </p>
      <p>
        Entre los proveedores del Estado hay muchas <strong>personas naturales</strong> que
        venden con su propio RUT. Que su nombre figure en un registro público no significa
        que deba republicarse, indexarse en buscadores y cruzarse con otros datos: la
        finalidad con que ChileCompra lo publica, la transparencia de cada compra, no exige
        que un sitio de análisis lo difunda. Por eso, antes de calcular ningún análisis,{' '}
        <strong>el sitio reemplaza el nombre, el RUT y los códigos que identifican a una
        persona natural</strong> por la etiqueta «Persona natural» y un seudónimo que cambia
        en cada actualización y no permite volver a la persona. Esto se aplica por igual a la
        web, la API, el servidor MCP y los archivos CSV.
      </p>
      <p>
        Se considera persona natural a quien tiene un RUT inferior a 50.000.000, y también a
        quien no tiene un RUT legible en los datos de origen: ante la duda, se trata como persona natural. Las
        empresas individuales (EIRL) y las sociedades de una sola persona son personas
        jurídicas y se muestran, aunque su razón social lleve un nombre propio.
      </p>
      <p>
        Si apareces en el sitio y crees que no deberías (por ejemplo, porque tu empresa lleva
        tu nombre, o porque un dato tuyo quedó visible por error), puedes pedir que se omita
        (sección 7).
      </p>

      <h2>4. Datos técnicos de tu visita</h2>
      <ul>
        <li>
          <strong>Dirección IP.</strong> Se usa para aplicar el límite de peticiones por IP de
          la API y del servidor MCP. Ese contador vive sólo en la memoria del servidor, se
          reinicia cada minuto y <strong>no se guarda</strong>. Cuando navegas por el sitio,
          el servidor web le pasa tu IP a la API con ese único fin.
        </li>
        <li>
          <strong>Registros del servidor.</strong> Como cualquier servicio web, los servidores
          y las plataformas de alojamiento registran las peticiones (dirección IP, fecha, página
          pedida, navegador) para operar el servicio y detectar abusos. Se conservan por{' '}
          <strong>un máximo de 30 días</strong>.
        </li>
        <li>
          <strong>Informes de errores.</strong> Cuando algo falla, se envía un informe técnico
          a Sentry para poder corregirlo. Está configurado para{' '}
          <strong>no enviar datos personales</strong>: sin cookies, sin cabeceras de
          identificación, sin grabación de pantalla y sin guardar la dirección IP.
        </li>
        <li>
          <strong>Estadísticas de uso.</strong> Usamos Vercel Web Analytics para contar visitas
          por página. <strong>No usa cookies</strong> ni identifica a una persona a lo largo
          del tiempo.
        </li>
      </ul>
      <p>
        La finalidad de estos datos es mantener el sitio funcionando, seguro y disponible para
        todos; la base es el interés legítimo en ello.
      </p>

      <h2>5. Lo que queda en tu navegador</h2>
      <p>
        Tu preferencia de tema (claro u oscuro), las licitaciones que marcas como favoritas,
        las búsquedas que guardas y algún aviso que hayas descartado se guardan en el
        almacenamiento local de tu propio navegador. <strong>Nunca se envían al sitio</strong>:
        no los vemos, y se borran al limpiar los datos del navegador. (Al abrir una búsqueda o
        su feed RSS, sus filtros viajan en la dirección de la página, como cualquier búsqueda.)
      </p>

      <h2>6. Con quién se comparten</h2>
      <p>
        Con nadie, salvo los proveedores que hacen funcionar el sitio y sólo en lo necesario:
      </p>
      <ul>
        <li>
          <strong>Vercel</strong>: alojamiento del sitio web y estadísticas de uso sin cookies.
        </li>
        <li>
          <strong>Railway</strong>: alojamiento de la API y de la base de datos.
        </li>
        <li>
          <strong>Sentry</strong>: informes de errores, sin datos personales.
        </li>
        <li>
          <strong>Cloudflare</strong>: almacenamiento de los archivos de datos públicos. No
          recibe datos de quienes visitan el sitio.
        </li>
      </ul>
      <p>
        Estos proveedores tratan los datos fuera de Chile, principalmente en Estados Unidos,
        bajo sus acuerdos de tratamiento de datos, que incluyen cláusulas contractuales tipo
        para las transferencias internacionales.
      </p>

      <h2>7. Tus derechos</h2>
      <p>
        Puedes pedir <strong>acceso</strong>, <strong>rectificación</strong>,{' '}
        <strong>supresión</strong>, <strong>oposición</strong> y <strong>portabilidad</strong>{' '}
        de tus datos personales, y el <strong>bloqueo</strong> de su tratamiento, escribiendo a{' '}
        <strong>{CORREO_CONTACTO}</strong>. Indica qué pides y, si apareces en los datos
        de compras públicas, dónde (la página o el código del proveedor) y un medio para
        comprobar que eres tú. Respondemos dentro de los plazos legales.
      </p>
      <p>
        Ten en cuenta que omitirte aquí no cambia lo que publica ChileCompra: el dato original
        sigue en Mercado Público, y para corregirlo allí hay que dirigirse a ChileCompra.
      </p>
      <p>
        Si no quedas conforme con la respuesta, puedes reclamar ante la Agencia de Protección
        de Datos Personales.
      </p>

      <h2>8. Donaciones</h2>
      <p>
        Si haces un aporte, lo procesa la plataforma que elijas (Mercado Pago, tu banco o
        GitHub Sponsors) bajo su propia política de privacidad. Recibimos de ella lo que nos
        informa —normalmente nombre, monto y fecha— y lo conservamos sólo para la
        contabilidad y las obligaciones tributarias, por el plazo que exige la ley tributaria
        (hasta seis años). No lo publicamos sin tu permiso.
      </p>

      <h2>9. Menores de edad</h2>
      <p>El sitio no está dirigido a menores de edad y no trata sus datos a sabiendas.</p>

      <h2>10. Cambios</h2>
      <p>
        Cualquier cambio se publica en esta página con su nueva fecha de vigencia.
      </p>
    </DocumentoLegal>
  );
}
