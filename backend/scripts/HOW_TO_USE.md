# How to Use the Data Inspection Tools

## Prerequisites

### 1. Install Dependencies

Make sure you have the backend dependencies installed:

```bash
cd backend
pip install -r requirements.txt
```

Or if using Docker, the dependencies are already installed in the container.

### 2. Database Connection

Make sure your database is running and accessible. The script uses the `DATABASE_URL` from your `.env` file or environment variables.

Default connection: `postgresql://postgres:postgres@localhost:5432/licitaciones`

---

## 🚀 Quick Start

### Option A: Using the Command Line Script

**1. Navigate to backend directory:**
```bash
cd backend
```

**2. Run the script:**

```bash
# View all tables (first 5 records)
python scripts/inspect_data.py --limit 5

# View only licitaciones table
python scripts/inspect_data.py --table licitaciones

# View only ordenes_compra table  
python scripts/inspect_data.py --table ordenes_compra

# Export to CSV
python scripts/inspect_data.py --table licitaciones --format csv > licitaciones.csv

# Export to JSON
python scripts/inspect_data.py --format json > all_data.json
```

**3. If using Docker:**

Run the script inside the backend container:
```bash
# From project root
docker exec -it licitaciones_backend python scripts/inspect_data.py --limit 5
```

Or run locally with the correct DATABASE_URL:
```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/licitaciones"
cd backend
python scripts/inspect_data.py --limit 5
```

---

### Option B: Using the API Endpoints

**1. Start the backend server:**

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

**2. Access the API:**

**In your browser:**
- http://localhost:8000/api/data/tables - List all tables
- http://localhost:8000/api/data/licitaciones?limit=10 - Get licitaciones
- http://localhost:8000/api/data/ordenes_compra?limit=10 - Get ordenes de compra
- http://localhost:8000/api/data/summary - Get summary
- http://localhost:8000/docs - Interactive API documentation

**Using curl:**
```bash
# Get summary
curl http://localhost:8000/api/data/summary

# Get first 10 licitaciones
curl http://localhost:8000/api/data/licitaciones?limit=10

# Get statistics
curl http://localhost:8000/api/data/licitaciones/stats

# Filter by estado
curl "http://localhost:8000/api/data/licitaciones?estado=Publicada&limit=5"
```

**Using Python:**
```python
import requests

BASE = "http://localhost:8000"

# Get summary
r = requests.get(f"{BASE}/api/data/summary")
print(r.json())

# Get licitaciones
r = requests.get(f"{BASE}/api/data/licitaciones", params={"limit": 10})
data = r.json()
print(f"Total: {data['total_count']}")
for record in data['data']:
    print(f"{record['codigo_externo']}: {record['nombre']}")
```

---

## 📋 Available Commands

### Script Options

```bash
python scripts/inspect_data.py [OPTIONS]

Options:
  --table {licitaciones,ordenes_compra}  # Specific table (default: all)
  --limit N                              # Limit records (default: all)
  --format {table,json,csv}              # Output format (default: table)
  --no-structure                         # Hide table structure
  --help                                 # Show help
```

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/data/tables` | List all available tables |
| `GET /api/data/licitaciones` | Get licitaciones data |
| `GET /api/data/licitaciones/structure` | Get table structure |
| `GET /api/data/licitaciones/stats` | Get statistics |
| `GET /api/data/ordenes_compra` | Get ordenes de compra data |
| `GET /api/data/ordenes_compra/structure` | Get table structure |
| `GET /api/data/ordenes_compra/stats` | Get statistics |
| `GET /api/data/summary` | Get summary of all data |

### API Query Parameters

- `limit` (1-1000): Number of records to return
- `offset` (≥0): Pagination offset
- `codigo_externo`: Filter licitaciones by external code
- `codigo_oc`: Filter ordenes by OC code
- `estado`: Filter by status
- `codigo_organismo`: Filter by organization code
- `codigo_proveedor`: Filter ordenes by supplier code

---

## 💡 Common Examples

### Check if ETL loaded data
```bash
python scripts/inspect_data.py --limit 1
# or
curl http://localhost:8000/api/data/summary
```

### View table structure
```bash
python scripts/inspect_data.py --table licitaciones --no-structure
# or
curl http://localhost:8000/api/data/licitaciones/structure
```

### Export all data
```bash
python scripts/inspect_data.py --format csv > all_data.csv
python scripts/inspect_data.py --table licitaciones --format json > licitaciones.json
```

### Get statistics
```bash
curl http://localhost:8000/api/data/licitaciones/stats | python -m json.tool
```

### Find specific record
```bash
curl "http://localhost:8000/api/data/licitaciones?codigo_externo=ABC123"
```

---

## 🔧 Troubleshooting

**"Module not found" error:**
```bash
pip install -r requirements.txt
```

**"Database connection error":**
- Check database is running
- Verify DATABASE_URL in .env file
- For Docker: use `db` as hostname, for local: use `localhost`

**"API not accessible":**
- Check backend is running: `curl http://localhost:8000/health/`
- Check port 8000 is not blocked

**Script path issues:**
- Always run from `backend` directory: `cd backend && python scripts/inspect_data.py`

