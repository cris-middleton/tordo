# Usage Examples for Data Inspection

## Command Line Script Examples

### Basic Usage

```bash
# From the backend directory
cd backend

# View all tables with first 5 records
python scripts/inspect_data.py --limit 5

# View only licitaciones table
python scripts/inspect_data.py --table licitaciones

# View only ordenes_compra table
python scripts/inspect_data.py --table ordenes_compra
```

### Export Data

```bash
# Export to CSV
python scripts/inspect_data.py --table licitaciones --format csv > licitaciones_export.csv

# Export to JSON
python scripts/inspect_data.py --table ordenes_compra --format json > ordenes_export.json

# Export all tables to JSON
python scripts/inspect_data.py --format json > all_data.json
```

### Filtering and Limiting

```bash
# View first 10 records
python scripts/inspect_data.py --limit 10

# View structure only (no data)
python scripts/inspect_data.py --no-structure

# View specific table with limit
python scripts/inspect_data.py --table licitaciones --limit 20
```

## API Examples

### Using curl

```bash
# Get list of available tables
curl http://localhost:8000/api/data/tables

# Get licitaciones structure
curl http://localhost:8000/api/data/licitaciones/structure

# Get first 10 licitaciones
curl http://localhost:8000/api/data/licitaciones?limit=10

# Get licitaciones with filters
curl "http://localhost:8000/api/data/licitaciones?estado=Publicada&limit=20"

# Get statistics
curl http://localhost:8000/api/data/licitaciones/stats

# Get ordenes de compra
curl http://localhost:8000/api/data/ordenes_compra?limit=10

# Get summary of all data
curl http://localhost:8000/api/data/summary
```

### Using Python requests

```python
import requests

BASE_URL = "http://localhost:8000"

# Get all tables
response = requests.get(f"{BASE_URL}/api/data/tables")
print(response.json())

# Get licitaciones
response = requests.get(f"{BASE_URL}/api/data/licitaciones", params={"limit": 10})
data = response.json()
print(f"Total: {data['total_count']}")
print(f"Returned: {data['returned_count']}")
for record in data['data']:
    print(f"{record['codigo_externo']}: {record['nombre']}")

# Get statistics
response = requests.get(f"{BASE_URL}/api/data/licitaciones/stats")
stats = response.json()
print(f"Total licitaciones: {stats['total_count']}")
print(f"Estado distribution: {stats['estado_distribution']}")

# Filter by estado
response = requests.get(
    f"{BASE_URL}/api/data/licitaciones",
    params={"estado": "Publicada", "limit": 5}
)
```

### Using JavaScript/Fetch

```javascript
// Get licitaciones
fetch('http://localhost:8000/api/data/licitaciones?limit=10')
  .then(response => response.json())
  .then(data => {
    console.log(`Total: ${data.total_count}`);
    console.log(`Returned: ${data.returned_count}`);
    data.data.forEach(record => {
      console.log(`${record.codigo_externo}: ${record.nombre}`);
    });
  });

// Get statistics
fetch('http://localhost:8000/api/data/licitaciones/stats')
  .then(response => response.json())
  .then(stats => {
    console.log(`Total: ${stats.total_count}`);
    console.log(`Estado distribution:`, stats.estado_distribution);
  });
```

## Common Use Cases

### 1. Check if ETL loaded data correctly

```bash
# Quick check - see if there's any data
python scripts/inspect_data.py --limit 1

# Check record counts
curl http://localhost:8000/api/data/summary
```

### 2. Verify table structure

```bash
# View table structure
python scripts/inspect_data.py --table licitaciones --no-structure

# Or via API
curl http://localhost:8000/api/data/licitaciones/structure
```

### 3. Export data for analysis

```bash
# Export to CSV for Excel
python scripts/inspect_data.py --table licitaciones --format csv > licitaciones.csv

# Export to JSON for further processing
python scripts/inspect_data.py --table ordenes_compra --format json > ordenes.json
```

### 4. Check data quality

```bash
# View summary statistics
curl http://localhost:8000/api/data/licitaciones/stats
curl http://localhost:8000/api/data/ordenes_compra/stats
```

### 5. Find specific records

```bash
# Via API - filter by codigo_externo
curl "http://localhost:8000/api/data/licitaciones?codigo_externo=ABC123"

# Via API - filter by estado
curl "http://localhost:8000/api/data/licitaciones?estado=Publicada"
```

