// Sin bloque `env`: lo que se declara ahí se INLINEA en el bundle del navegador.
// La URL del backend pasó a ser configuración de servidor (`API_URL`) cuando el
// tráfico empezó a ir por /api/proxy, así que publicarla no aporta nada.
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
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

  // Quita el logger del SDK del bundle de producción.
  disableLogger: true,
})
