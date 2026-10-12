#!/bin/bash
# Setup script for Docker Compose infrastructure

set -e

echo "🐳 Setting up Docker Compose infrastructure..."
echo ""

# Check if .env exists
if [ ! -f "../.env" ]; then
    echo "📝 Creating .env file from .env.example..."
    cp ../.env.example ../.env
    echo "✅ Created .env file. Please edit it with your configuration."
    echo ""
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

echo "🚀 Starting services with Docker Compose..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service health
echo ""
echo "🔍 Checking service health..."
docker-compose ps

echo ""
echo "✨ Services started!"
echo ""
echo "Services available at:"
echo "  - Backend API: http://localhost:8000"
echo "  - API Docs: http://localhost:8000/docs"
echo "  - Frontend: http://localhost:3000"
echo "  - PostgreSQL: localhost:5432"
echo ""
echo "Next steps:"
echo "1. Run database migrations: cd ../backend && ./scripts/run_migrations.sh"
echo "2. Check logs: docker-compose logs -f"
echo "3. Stop services: docker-compose down"
echo ""
