#!/bin/bash
# Run database migrations

set -e

echo "🗄️  Running database migrations..."

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Run migrations
alembic upgrade head

echo "✅ Migrations completed successfully!"

