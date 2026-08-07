// Sin bloque `env`: lo que se declara ahí se INLINEA en el bundle del navegador.
// La URL del backend pasó a ser configuración de servidor (`API_URL`) cuando el
// tráfico empezó a ir por /api/proxy, así que publicarla no aporta nada.
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
}

module.exports = nextConfig
