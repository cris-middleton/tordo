# Local Development Setup Guide

This guide will help you set up the backend for local development.

## Prerequisites

- Python 3.11 or higher
- PostgreSQL 15+ (or Docker)
- Redis (or Docker)
- Git

## Quick Setup

### Option 1: Using Setup Script (Recommended)

```bash
cd backend
./scripts/setup_local.sh
```

This script will:
- Create a virtual environment
- Install dependencies
- Create `.env` file from `.env.example`
- Check database connection
- Run migrations

### Option 2: Manual Setup

1. **Create virtual environment**
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

3. **Configure environment**
   ```bash
   # Copy example env file
   cp ../.env.example ../.env
   
   # Edit .env with your settings
   # At minimum, update:
   # - DATABASE_URL (if not using Docker)
   # - SECRET_KEY (generate a strong random key)
   ```

4. **Start PostgreSQL and Redis**
   
   Using Docker Compose:
   ```bash
   cd ../infra
   docker-compose up -d db redis
   ```
   
   Or install locally and start services.

5. **Run database migrations**
   ```bash
   cd ../backend
   alembic upgrade head
   ```

6. **Start the backend**
   ```bash
   uvicorn app.main:app --reload
   ```

## Environment Variables

Key environment variables to configure in `.env`:

### Required
- `DATABASE_URL`: PostgreSQL connection string
- `SECRET_KEY`: JWT secret key (generate a strong random key)
- `REDIS_URL`: Redis connection string

### Optional (for email notifications)
- `SMTP_HOST`: SMTP server hostname
- `SMTP_PORT`: SMTP server port (default: 587)
- `SMTP_USER`: SMTP username
- `SMTP_PASSWORD`: SMTP password
- `SMTP_FROM_EMAIL`: Sender email address

### Optional (for frontend links)
- `FRONTEND_URL`: Frontend URL for alert links (default: http://localhost:3000)

## Generate Secret Key

Generate a secure secret key for JWT:

```python
import secrets
print(secrets.token_urlsafe(32))
```

Or using OpenSSL:
```bash
openssl rand -hex 32
```

## Database Setup

### Using Docker (Recommended)

```bash
cd infra
docker-compose up -d db redis
```

### Using Local PostgreSQL

1. Install PostgreSQL
2. Create database:
   ```sql
   CREATE DATABASE licitaciones;
   CREATE USER postgres WITH PASSWORD 'postgres';
   GRANT ALL PRIVILEGES ON DATABASE licitaciones TO postgres;
   ```
3. Update `DATABASE_URL` in `.env`

## Running Migrations

```bash
cd backend

# Apply all migrations
alembic upgrade head

# Create a new migration
alembic revision --autogenerate -m "description"

# Rollback last migration
alembic downgrade -1
```

## Starting Services

### Backend API
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Celery Worker (for alerts)
```bash
cd backend
source venv/bin/activate
celery -A app.celery_app worker --loglevel=info
```

### Celery Beat (scheduler)
```bash
cd backend
source venv/bin/activate
celery -A app.celery_app beat --loglevel=info
```

## Testing the API

1. Start the backend server
2. Open browser to: http://localhost:8000/docs
3. Try the endpoints:
   - `POST /api/auth/register` - Register a new user
   - `POST /api/auth/login` - Login and get token
   - `GET /api/tenders/` - List tenders (requires auth)
   - `GET /api/alerts/` - List alerts (requires auth)

## Troubleshooting

### Database Connection Error
- Check PostgreSQL is running: `pg_isready` or `docker ps`
- Verify `DATABASE_URL` in `.env`
- Check database credentials

### Migration Errors
- Ensure database exists
- Check database user has proper permissions
- Try: `alembic downgrade base` then `alembic upgrade head`

### Celery Not Working
- Check Redis is running: `redis-cli ping`
- Verify `REDIS_URL` in `.env`
- Check Celery worker logs

### Email Not Sending
- Verify SMTP settings in `.env`
- Check SMTP credentials
- For Gmail, use App Password (not regular password)
- Check application logs

## Next Steps

1. Create your first user via `/api/auth/register`
2. Create alert preferences via `/api/alerts/preferences`
3. Load some data via ETL to trigger alerts
4. Check alerts via `/api/alerts/`

For more information, see:
- `README_ALERTS.md` - Alert system documentation
- API documentation at `/docs` when server is running

