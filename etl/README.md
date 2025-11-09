# ETL Pipeline for Mercado Público

ETL pipeline to extract, transform, and load data from Mercado Público APIs (Licitaciones and Órdenes de Compra) into PostgreSQL database.

## Overview

This ETL pipeline:
1. **Extracts** data from Mercado Público APIs using the provided ticket
2. **Transforms** the data to match our database schema
3. **Loads** the data into PostgreSQL with upsert logic (updates existing records)

## Configuration

Set the following environment variables (or use `.env` file):

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/licitaciones
MERCADO_PUBLICO_TICKET=F8537A18-6766-4DEF-9E59-426B4FEE2844
MERCADO_PUBLICO_URL=https://api.mercadopublico.cl
ETL_BATCH_SIZE=100
ETL_MAX_RETRIES=3
ETL_RETRY_DELAY=5
LOG_LEVEL=INFO
```

## Usage

### Basic Usage (Extract Today's Data)

```bash
python main.py
```

This will extract both Licitaciones and Órdenes de Compra published today.

### Extract Specific Date Range

```bash
python main.py --fecha-desde 2024-01-01 --fecha-hasta 2024-01-31
```

### Extract Only Licitaciones

```bash
python main.py --skip-ordenes
```

### Extract Only Órdenes de Compra

```bash
python main.py --skip-licitaciones
```

## Architecture

### Extractors

- `MercadoPublicoLicitacionesExtractor`: Extracts Licitaciones from the API
- `MercadoPublicoOrdenesExtractor`: Extracts Órdenes de Compra from the API

Both extractors:
- Handle pagination automatically
- Include retry logic for failed requests
- Validate extracted records

### Transformers

- `LicitacionTransformer`: Normalizes Licitaciones data to database schema
- `OrdenCompraTransformer`: Normalizes Órdenes de Compra data to database schema

Transformers handle:
- Date format parsing (multiple formats)
- Decimal/numeric parsing
- Field mapping from API format to database format
- Data validation

### Loaders

- `DatabaseLoader`: Loads transformed data into PostgreSQL

The loader:
- Uses upsert logic (updates existing records, inserts new ones)
- Handles batch loading
- Manages database connections
- Provides detailed logging

## Database Models

The ETL loads data into two main tables:

1. **licitaciones**: Public tenders (Licitaciones)
2. **ordenes_compra**: Purchase orders (Órdenes de Compra)

See `backend/app/models/` for the complete schema.

## Running with Docker

```bash
# Start database
cd ../infra
docker-compose up -d db

# Run ETL
cd ../etl
docker-compose run --rm etl python main.py
```

## Error Handling

The pipeline includes:
- Retry logic for API requests
- Validation at each step
- Detailed error logging
- Graceful handling of missing data

## Logging

Logs are written to:
- Console (stdout)
- File: `etl.log` (if `LOG_FILE` is set)

Log levels: DEBUG, INFO, WARNING, ERROR

## Next Steps

1. Set up database migrations (run `alembic upgrade head` in backend)
2. Configure your `.env` file with the database URL
3. Run the ETL: `python main.py`
4. Verify data in the database
