# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### 1. Setup Environment

```bash
cd backend
./scripts/setup_local.sh
```

This will:
- Create virtual environment
- Install dependencies
- Create `.env` file
- Check database connection
- Run migrations

### 2. Configure Environment

Edit `.env` file (created in project root):

```bash
# Minimum required:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/licitaciones
SECRET_KEY=$(openssl rand -hex 32)  # Generate a secure key
REDIS_URL=redis://localhost:6379/0

# Optional (for email):
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
```

### 3. Start Services

**Option A: Using Docker Compose (Recommended)**
```bash
cd infra
docker-compose up -d db redis
cd ../backend
./scripts/run_migrations.sh
uvicorn app.main:app --reload
```

**Option B: Local Services**
```bash
# Start PostgreSQL and Redis locally
# Then:
cd backend
./scripts/run_migrations.sh
uvicorn app.main:app --reload
```

### 4. Start Celery (for alerts)

In a new terminal:
```bash
cd backend
source venv/bin/activate
celery -A app.celery_app worker --loglevel=info
```

### 5. Test the API

1. Open: http://localhost:8000/docs
2. Register a user:
   ```json
   POST /api/auth/register
   {
     "email": "test@example.com",
     "username": "testuser",
     "password": "testpass123",
     "full_name": "Test User"
   }
   ```
3. Login:
   ```json
   POST /api/auth/login
   {
     "username": "testuser",
     "password": "testpass123"
   }
   ```
4. Use the token to access protected endpoints

## 📋 What's Available

### API Endpoints

- **Authentication**: `/api/auth/*`
  - Register, login, get current user

- **Users**: `/api/users/*`
  - List, get, update, delete users

- **Tenders**: `/api/tenders/*`
  - List tenders with filtering
  - Get tender by ID or code

- **Alerts**: `/api/alerts/*`
  - Manage alert preferences
  - View and manage alerts

### Features

✅ User authentication with JWT
✅ Tender listing and filtering
✅ Alert preferences and matching
✅ Email notifications (when configured)
✅ Webhook notifications
✅ In-app notifications
✅ Background processing with Celery

## 🔧 Common Commands

```bash
# Run migrations
./scripts/run_migrations.sh

# Start backend
uvicorn app.main:app --reload

# Start Celery worker
celery -A app.celery_app worker --loglevel=info

# Start Celery beat (scheduler)
celery -A app.celery_app beat --loglevel=info

# Check database connection
python -c "from app.db import engine; engine.connect()"
```

## 📚 Documentation

- `LOCAL_SETUP.md` - Detailed setup guide
- `README_ALERTS.md` - Alert system documentation
- `IMPLEMENTATION_SUMMARY.md` - What was implemented
- API docs at `/docs` when server is running

## 🆘 Need Help?

1. Check `LOCAL_SETUP.md` for troubleshooting
2. Verify all services are running
3. Check `.env` configuration
4. Review application logs

