#!/bin/bash
# Setup script for local development

set -e

echo "🚀 Setting up SaaS Licitaciones Backend for local development..."
echo ""

# Check if .env exists
if [ ! -f "../.env" ]; then
    echo "📝 Creating .env file from .env.example..."
    cp ../.env.example ../.env
    echo "✅ Created .env file. Please edit it with your configuration."
    echo ""
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "🐍 Creating Python virtual environment..."
    python3 -m venv venv
    echo "✅ Virtual environment created."
    echo ""
fi

# Activate virtual environment
echo "📦 Activating virtual environment and installing dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
echo "✅ Dependencies installed."
echo ""

# Check if database is running
echo "🔍 Checking database connection..."
if python -c "from app.config import settings; from sqlalchemy import create_engine; engine = create_engine(settings.database_url); engine.connect()" 2>/dev/null; then
    echo "✅ Database connection successful."
    echo ""
    
    # Run migrations
    echo "🗄️  Running database migrations..."
    alembic upgrade head
    echo "✅ Migrations completed."
    echo ""
else
    echo "⚠️  Database connection failed. Make sure PostgreSQL is running."
    echo "   You can start it with: docker-compose -f ../infra/docker-compose.yml up -d db"
    echo ""
fi

echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit ../.env with your configuration"
echo "2. Start the backend: uvicorn app.main:app --reload"
echo "3. Access API docs at: http://localhost:8000/docs"
echo ""

