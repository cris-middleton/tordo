// Sin bloque `env`: lo que se declara ahí se INLINEA en el bundle del navegador.
// La URL del backend pasó a ser configuración de servidor (`API_URL`) cuando el
// tráfico empezó a ir por /api/proxy, así que publicarla no aporta nada.
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Las guías (`/guias/*`) se generan en el build, pero el sitemap se genera al
  // pedirlo y lee `content/explicativos` del disco: sin esto, el contenido no
  // entraría en la traza del servidor y el sitemap saldría sin guías.
  outputFileTracingIncludes: {
    '/sitemap.xml': ['./content/explicativos/**/*'],
  },
  // Cabeceras de seguridad en todas las respuestas. Sin una CSP completa a
  // propósito: el tema, Sentry y Web Analytics meten scripts, y una CSP de
  // scripts mal acertada rompe el sitio en silencio. Lo que sí va es lo que no
  // puede romper nada: no dejarse enmarcar (clickjacking), no adivinar tipos,
  // no filtrar la URL completa a terceros y no pedir permisos que no se usan.
  // HSTS lo pone Vercel en sus dominios.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ]
  },
}

const { withSentryConfig } = require('@sentry/nextjs')

// Se envuelve SIEMPRE, también sin `SENTRY_AUTH_TOKEN`. Condicionarlo haría que
// CI construyera una configuración distinta de la de producción, que es justo
// donde no se quiere descubrir una diferencia.
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Sin token no se suben source maps y el build sigue: es lo que pasa en CI y
  // en local, y no debe fallar por ello.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,

  // Los eventos del navegador se mandan a través de nuestro propio dominio.
  // Los bloqueadores de anuncios cortan las peticiones a `sentry.io` por
  // defecto, y el resultado no es un error visible: es no enterarse de los
  // fallos de justo los navegadores más protegidos.
  tunnelRoute: '/monitoring',

  // Sin `disableLogger`: está obsoleta y, además, no tiene efecto con Turbopack
  // —que es el compilador por defecto desde Next 16—. Dejarla sólo producía un
  // aviso de deprecación en cada build.
})
