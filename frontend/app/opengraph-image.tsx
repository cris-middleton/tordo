import { ImageResponse } from 'next/og';

import { COLORES_IMAGEN as C } from '@/lib/coloresImagen';

/*
 * La tarjeta de vista previa al compartir un enlace del sitio (1200×630).
 *
 * Generada en el build en vez de un PNG a mano: el que había (`public/og.png`)
 * seguía con el lema del SaaS, y una imagen que nadie regenera se queda
 * prometiendo lo que el sitio ya no hace. Como archivo de metadatos en la raíz
 * de `app/`, vale para todas las rutas que no traigan la suya.
 */

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

export const alt = `${APP_NAME} — inteligencia de compras públicas en Chile, gratis y sin cuenta`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BANDAS = [0.35, 0.65, 1, 0.65, 0.35];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: C.fondo.hex,
          color: C.texto.hex,
        }}
      >
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: C.acento.hex }}>
          {APP_NAME}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>
            Inteligencia de compras públicas en Chile
          </div>
          <div style={{ display: 'flex', marginTop: 24, fontSize: 34, color: C.tenue.hex }}>
            Compra Ágil · precios pagados por el Estado · compradores
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700 }}>Gratis y sin cuenta</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            {BANDAS.map((alto, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  width: 28,
                  height: 90 * alto,
                  background: C.acento.hex,
                  opacity: 0.4 + alto * 0.6,
                  borderRadius: 4,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
