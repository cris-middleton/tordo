# Quick Start Guide - Data Inspection Tools

## Method 1: Using the Command Line Script

### Prerequisites
Make sure your database is running and accessible. The script uses the same database configuration as your backend.

### Step 1: Navigate to the backend directory
```bash
cd backend
```

### Step 2: Run the script

**View all tables (first 5 records):**
```bash
python scripts/inspect_data.py --limit 5
```

**View only licitaciones:**
```bash
python scripts/inspect_data.py --table licitaciones
```

**View only ordenes_compra:**
```bash
python scripts/inspect_data.py --table ordenes_compra
```

**Export to CSV:**
```bash
python scripts/inspect_data.py --table licitaciones --format csv > licitaciones.csv
```

**Export to JSON:**
```bash
python scripts/inspect_data.py --format json > all_data.json
```

### If using Docker

If your database is in Docker, you can run the script inside the backend container:

```bash
# From project root
docker exec -it licitaciones_backend python scripts/inspect_data.py --limit 5
```

Or run it locally but make sure your DATABASE_URL points to the correct database:

```bash
# Set database URL if needed
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/licitaciones"

# Then run the script
cd backend
python scripts/inspect_data.py --limit 5
```

## Method 2: Using the API Endpoints

### Step 1: Start the backend server

If using Docker:
```bash
cd infra
docker-compose up backend
```

Or locally:
```bash
cd backend
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`

### Step 2: Use the API endpoints

**Using curl:**

```bash
# List all available tables
curl http://localhost:8000/api/data/tables

# Get licitaciones (first 10 records)
curl http://localhost:8000/api/data/licitaciones?limit=10

# Get ordenes de compra
curl http://localhost:8000/api/data/ordenes_compra?limit=10

# Get statistics
curl http://localhost:8000/api/data/licitaciones/stats
curl http://localhost:8000/api/data/ordenes_compra/stats

# Get summary of all data
curl http://localhost:8000/api/data/summary

# Filter licitaciones by estado
curl "http://localhost:8000/api/data/licitaciones?estado=Publicada&limit=5"
```

**Using a web browser:**

Just open these URLs in your browser:
- http://localhost:8000/api/data/tables
- http://localhost:8000/api/data/licitaciones?limit=10
- http://localhost:8000/api/data/ordenes_compra?limit=10
- http://localhost:8000/api/data/summary

**Using Python:**

```python
import requests

BASE_URL = "http://localhost:8000"

# Get summary
response = requests.get(f"{BASE_URL}/api/data/summary")
print(response.json())

# Get licitaciones
response = requests.get(f"{BASE_URL}/api/data/licitaciones", params={"limit": 10})
data = response.json()
print(f"Total records: {data['total_count']}")
for record in data['data']:
    print(f"{record['codigo_externo']}: {record['nombre']}")
```

**Using the interactive API docs:**

FastAPI provides interactive documentation. Open in your browser:
- http://localhost:8000/docs

You can test all endpoints directly from there!

## Common Use Cases

### 1. Quick check if ETL loaded data
```bash
python scripts/inspect_data.py --limit 1
# or
curl http://localhost:8000/api/data/summary
```

### 2. See table structure
```bash
python scripts/inspect_data.py --table licitaciones --no-structure
# or
curl http://localhost:8000/api/data/licitaciones/structure
```

### 3. Export all data for analysis
```bash
python scripts/inspect_data.py --format csv > all_data.csv
# or
python scripts/inspect_data.py --table licitaciones --format json > licitaciones.json
```

### 4. Check data quality and statistics
```bash
curl http://localhost:8000/api/data/licitaciones/stats | python -m json.tool
curl http://localhost:8000/api/data/ordenes_compra/stats | python -m json.tool
```

## Troubleshooting

### Database connection error
Make sure:
1. Database is running
2. DATABASE_URL is correct in your `.env` file or environment
3. Database credentials are correct

### Module not found error
Make sure you're running from the `backend` directory:
```bash
cd backend
python scripts/inspect_data.py
```

### API not accessible
Make sure:
1. Backend server is running
2. Port 8000 is not blocked
3. Check `http://localhost:8000/health/` first

