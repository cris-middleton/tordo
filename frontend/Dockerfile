FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm install

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1

# Todo lo `NEXT_PUBLIC_*` se INLINEA aquí, en el build: ponerlo en el
# `environment` del contenedor no llega al navegador. Por eso son ARG y no
# variables de ejecución. (`NEXT_PUBLIC_API_URL` desapareció al pasar el tráfico
# por /api/proxy: la URL del backend la resuelve el servidor de Next.)
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_ENVIRONMENT
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_SITE_URL

# Sólo para subir los source maps. Sin ellas el build funciona igual, pero las
# trazas del navegador llegan minificadas e ilegibles.
#
# Son ARG y NO ENV: Docker ya expone los ARG al `RUN` de la misma etapa, y un
# `ENV` con el token lo dejaría escrito en los metadatos de la imagen.
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
