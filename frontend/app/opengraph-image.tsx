import { ImageResponse } from 'next/og';

import { COLORES_IMAGEN as C } from '@/lib/coloresImagen';
import { fuentesImagen } from '@/lib/fuentesImagen';
import { OJO_PAJARO, TRAZOS_PAJARO, VIEWBOX_PAJARO } from '@/lib/pajaroImagen';
import { origenDelSitio } from '@/lib/publico';

/*
 * La tarjeta de vista previa al compartir un enlace del sitio (1200×630).
 *
 * Generada en el build en vez de un PNG a mano: el que había (`public/og.png`)
 * seguía con el lema del SaaS, y una imagen que nadie regenera se queda
 * prometiendo lo que el sitio ya no hace. Como archivo de metadatos en la raíz
 * de `app/`, vale para todas las rutas que no traigan la suya.
 *
 * Se lee sobre todo en pequeño (WhatsApp, LinkedIn, X), así que lleva tres cosas
 * y ninguna más: el pájaro con la marca, la pregunta de la portada y una píldora.
 * Sin subtítulo: a 260 px de ancho no se leía.
 */

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';
const DOMINIO = origenDelSitio().replace(/^https?:\/\//, '');

export const alt = `${APP_NAME}: cuánto paga el Estado por lo que vendes. Precios pagados, licitaciones abiertas y Compra Ágil, con datos públicos de ChileCompra`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        <div
          style={{
            width: 430,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: C.panel.hex,
            color: C.marca.hex,
          }}
        >
          <svg width={300} height={258} viewBox={VIEWBOX_PAJARO}>
            {TRAZOS_PAJARO.map((t, i) => (
              <path key={i} d={t.d} fill={t.parte === 'ala' ? C.ala.hex : C.marca.hex} />
            ))}
            <ellipse {...OJO_PAJARO} fill={C.panel.hex} />
          </svg>
          <div style={{ display: 'flex', marginTop: 22, fontFamily: 'Varien', fontSize: 58, letterSpacing: 2 }}>
            {APP_NAME.toUpperCase()}
          </div>
          <div style={{ display: 'flex', marginTop: 16, fontFamily: 'Libre Franklin', fontSize: 34, color: C.dominio.hex }}>
            {DOMINIO}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 64px',
            background: C.lienzo.hex,
            color: C.titular.hex,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'Libre Franklin ExtraBold',
              fontSize: 84,
              lineHeight: 1,
              letterSpacing: -2,
            }}
          >
            Cuánto paga el Estado por lo que vendes
          </div>
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              marginTop: 40,
              padding: '12px 28px',
              borderRadius: 99,
              fontFamily: 'Libre Franklin',
              fontSize: 37,
              whiteSpace: 'nowrap',
              background: C.pildora.hex,
              color: C.textoPildora.hex,
            }}
          >
            Datos públicos de ChileCompra
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await fuentesImagen() },
  );
}
