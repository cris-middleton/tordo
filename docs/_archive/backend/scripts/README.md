# Data Inspection Scripts

This directory contains scripts for inspecting ETL data stored in the database.

## inspect_data.py

A command-line script to inspect all fields and data saved in ETL tables.

### Usage

```bash
# Inspect all tables
python scripts/inspect_data.py

# Inspect a specific table
python scripts/inspect_data.py --table licitaciones
python scripts/inspect_data.py --table ordenes_compra

# Limit number of records
python scripts/inspect_data.py --limit 10

# Output in different formats
python scripts/inspect_data.py --format json
python scripts/inspect_data.py --format csv
python scripts/inspect_data.py --format table  # default

# Combine options
python scripts/inspect_data.py --table licitaciones --limit 5 --format json

# Hide table structure
python scripts/inspect_data.py --no-structure
```

### Options

- `--table`: Specific table to inspect (`licitaciones` or `ordenes_compra`). If not specified, all tables are inspected.
- `--limit`: Limit the number of records to display (default: all records)
- `--format`: Output format - `table` (default), `json`, or `csv`
- `--no-structure`: Don't show table structure information

### Examples

```bash
# Quick overview of all data
python scripts/inspect_data.py --limit 5

# Export all licitaciones to CSV
python scripts/inspect_data.py --table licitaciones --format csv > licitaciones.csv

# Get JSON output for API integration
python scripts/inspect_data.py --table ordenes_compra --format json --limit 100
```

### Output

The script provides:
1. **Table Structure**: Column names, types, nullable status, primary keys, and defaults
2. **Record Count**: Total number of records in the table
3. **Data**: All fields and values for each record
4. **Summary Statistics**: Null/non-null counts for each column

## API Endpoints

The data inspection functionality is also available via REST API endpoints:

### List Tables
```
GET /api/data/tables
```

### Licitaciones

- **Get Structure**: `GET /api/data/licitaciones/structure`
- **Get Data**: `GET /api/data/licitaciones?limit=10&offset=0&estado=Publicada`
- **Get Statistics**: `GET /api/data/licitaciones/stats`

### Órdenes de Compra

- **Get Structure**: `GET /api/data/ordenes_compra/structure`
- **Get Data**: `GET /api/data/ordenes_compra?limit=10&offset=0&codigo_proveedor=123`
- **Get Statistics**: `GET /api/data/ordenes_compra/stats`

### Summary
```
GET /api/data/summary
```

### Query Parameters

- `limit`: Number of records to return (1-1000)
- `offset`: Pagination offset
- `codigo_externo`: Filter licitaciones by external code
- `codigo_oc`: Filter ordenes by OC code
- `estado`: Filter by status
- `codigo_organismo`: Filter by organization code
- `codigo_proveedor`: Filter ordenes by supplier code

### Example API Calls

```bash
# Get first 10 licitaciones
curl http://localhost:8000/api/data/licitaciones?limit=10

# Get licitaciones by estado
curl http://localhost:8000/api/data/licitaciones?estado=Publicada&limit=20

# Get statistics
curl http://localhost:8000/api/data/licitaciones/stats

# Get all tables summary
curl http://localhost:8000/api/data/summary
```

## Environment Setup

Make sure you have the correct database connection configured in your `.env` file or environment variables:

```bash
DATABASE_URL=postgresql://user:password@host:port/database
```

The script uses the same database configuration as the backend application.

