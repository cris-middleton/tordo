# SaaS Licitaciones Públicas Chile

A SaaS platform for managing and tracking public tenders (licitaciones públicas) in Chile.

## Project Structure

```
saas_licitaciones/
├── backend/          # FastAPI backend application
├── frontend/         # Next.js frontend application
├── etl/              # ETL pipeline for data extraction and processing
├── infra/            # Infrastructure configuration (Docker, etc.)
└── docs/             # Project documentation
```

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Python 3.11+ (for local development)
- Node.js 18+ (for frontend development)

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd saas_licitaciones
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start services with Docker Compose**
   ```bash
   cd infra
   docker-compose up -d
   ```

4. **Run database migrations**
   ```bash
   cd backend
   alembic upgrade head
   ```

5. **Access the services**
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs
   - Frontend: http://localhost:3000
   - PostgreSQL: localhost:5432
   - Redis: localhost:6379

## Development

### Backend Development

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

### ETL Development

```bash
cd etl
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

## Database Migrations

```bash
# Create a new migration
cd backend
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback migration
alembic downgrade -1
```

## Testing

```bash
# Backend tests
cd backend
pytest

# Run with coverage
pytest --cov=app tests/
```

## Environment Variables

See `.env.example` for all available environment variables.

## Services

- **Backend**: FastAPI REST API
- **Frontend**: Next.js web application
- **ETL**: Data extraction and processing pipeline
- **PostgreSQL**: Primary database
- **Redis**: Caching and task queue

## License

[Add your license here]
