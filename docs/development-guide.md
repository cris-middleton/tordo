# Development Guide

## Project Architecture

### Backend (FastAPI)
- **Location**: `backend/app/`
- **Structure**:
  - `api/`: API route handlers
  - `models/`: SQLAlchemy database models
  - `schemas/`: Pydantic schemas for request/response validation
  - `services/`: Business logic layer
  - `db/`: Database configuration and session management
  - `config.py`: Application configuration

### ETL Pipeline
- **Location**: `etl/`
- **Structure**:
  - `extractors/`: Data extraction from external sources
  - `transformers/`: Data transformation and normalization
  - `loaders/`: Data loading into database
  - `config.py`: ETL configuration
  - `main.py`: ETL pipeline orchestration

### Frontend (Next.js)
- **Location**: `frontend/`
- Framework: Next.js with React

## Development Workflow

### Starting Development

1. **Start infrastructure services**:
   ```bash
   cd infra
   docker-compose up -d db redis
   ```

2. **Set up backend**:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   alembic upgrade head
   uvicorn app.main:app --reload
   ```

3. **Set up ETL** (in a separate terminal):
   ```bash
   cd etl
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   python main.py
   ```

### Database Migrations

When creating new models:

1. Create the model in `backend/app/models/`
2. Import it in `backend/app/models/__init__.py`
3. Generate migration:
   ```bash
   cd backend
   alembic revision --autogenerate -m "Add new model"
   ```
4. Review the generated migration file
5. Apply migration:
   ```bash
   alembic upgrade head
   ```

### Adding New API Endpoints

1. Create schema in `backend/app/schemas/`
2. Create service in `backend/app/services/` (if needed)
3. Create route in `backend/app/api/`
4. Register route in `backend/app/main.py`

### ETL Development

1. **Extractor**: Create a new class in `etl/extractors/` extending `BaseExtractor`
2. **Transformer**: Create a new class in `etl/transformers/` extending `BaseTransformer`
3. **Loader**: Create a new class in `etl/loaders/` extending `BaseLoader`
4. Wire them together in `etl/main.py`

## Testing

### Backend Tests

```bash
cd backend
pytest
pytest tests/test_specific.py -v
pytest --cov=app tests/
```

### ETL Tests

Create test files in `etl/tests/` (to be created)

## Code Style

- **Python**: Follow PEP 8
- **Type hints**: Use type hints for all function signatures
- **Docstrings**: Use Google-style docstrings
- **Formatting**: Use `black` for code formatting (optional)

## Environment Variables

All environment variables are documented in `.env.example`. Never commit `.env` files to version control.

## Next Steps for ETL Development

1. Identify data sources (ChileCompra, Mercado Público, etc.)
2. Implement extractors for each source
3. Design database schema for tenders
4. Implement transformers to normalize data
5. Implement loaders to persist data
6. Add error handling and retry logic
7. Add scheduling for periodic updates

