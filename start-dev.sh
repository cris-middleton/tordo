#!/bin/bash

# Script para iniciar el entorno de desarrollo
# Backend en Docker, Frontend localmente

echo "🚀 Iniciando entorno de desarrollo..."

# Ir al directorio de infra
cd "$(dirname "$0")/infra" || exit

# Iniciar servicios de Docker (sin frontend)
echo "📦 Iniciando servicios Docker (DB, Redis, Backend)..."
docker-compose up -d db redis backend

# Esperar a que el backend esté listo
echo "⏳ Esperando a que el backend esté listo..."
sleep 5

# Verificar que el backend esté funcionando
if curl -s http://localhost:8000/health/ > /dev/null; then
    echo "✅ Backend está funcionando en http://localhost:8000"
else
    echo "⚠️  Backend no responde, pero continuando..."
fi

# Ir al directorio del frontend
cd ../frontend || exit

# Verificar que existe .env.local
if [ ! -f .env.local ]; then
    echo "📝 Creando .env.local..."
    echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
fi

echo "🎨 Iniciando frontend en modo desarrollo..."
echo "   Frontend: http://localhost:3000"
echo "   Backend API: http://localhost:8000"
echo ""
echo "Presiona Ctrl+C para detener todo"

# Iniciar el frontend
npm run dev

