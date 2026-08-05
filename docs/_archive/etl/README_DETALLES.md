# ETL - Extracción de Información Detallada

## Descripción

Este documento describe la funcionalidad de extracción de información detallada para licitaciones y órdenes de compra usando los endpoints específicos de la API de Mercado Público.

## Funcionalidades Implementadas

### 1. Extracción de Detalles de Órdenes de Compra

#### Endpoint API
```
http://api.mercadopublico.cl/servicios/v1/publico/OrdenCompra.json?codigo=[Codigo]&ticket=[Ticket]
```

#### Métodos Agregados

**`MercadoPublicoOrdenesExtractor.extract_detalle_orden_compra(codigo_oc: str)`**
- Extrae información detallada de una orden de compra específica
- Parámetros:
  - `codigo_oc`: Código de la orden de compra (campo `codigo_oc` de la BD)
- Retorna: Diccionario con la información detallada o `None` si no se encuentra

**`MercadoPublicoOrdenesExtractor.extract_detalles_ordenes_from_db(limit=None, skip_existing_details=True)`**
- Extrae información detallada de múltiples órdenes de compra desde la base de datos
- Parámetros:
  - `limit`: Número máximo de registros a procesar (None para todos)
  - `skip_existing_details`: Omitir registros que ya tienen información detallada (default: True)
- Retorna: Lista de registros detallados con sus IDs de base de datos

### 2. Extracción de Detalles de Licitaciones

#### Endpoint API
```
http://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?codigo=[Numero]&ticket=[Ticket]
```

#### Métodos Agregados

**`MercadoPublicoLicitacionesExtractor.extract_detalle_licitacion(codigo_externo: str)`**
- Extrae información detallada de una licitación específica
- Parámetros:
  - `codigo_externo`: Código externo de la licitación (campo `codigo_externo` de la BD)
- Retorna: Diccionario con la información detallada o `None` si no se encuentra

**`MercadoPublicoLicitacionesExtractor.extract_detalles_licitaciones_from_db(limit=None, skip_existing_details=True)`**
- Extrae información detallada de múltiples licitaciones desde la base de datos
- Parámetros:
  - `limit`: Número máximo de registros a procesar (None para todos)
  - `skip_existing_details`: Omitir registros que ya tienen información detallada (default: True)
- Retorna: Lista de registros detallados con sus IDs de base de datos

### 3. Carga de Detalles en Base de Datos

#### Métodos Agregados al DatabaseLoader

**`DatabaseLoader.update_licitacion_detalles(detailed_records: List[Dict])`**
- Actualiza licitaciones con información detallada
- La información se guarda en el campo `informacion_adicional` (tipo JSON)
- Retorna: Número de registros actualizados exitosamente

**`DatabaseLoader.update_orden_compra_detalles(detailed_records: List[Dict])`**
- Actualiza órdenes de compra con información detallada
- La información se guarda en el campo `informacion_adicional` (tipo JSON)
- Retorna: Número de registros actualizados exitosamente

### 4. Pipelines ETL Completos

#### Funciones en main.py

**`run_etl_detalles_licitaciones(limit=None, skip_existing=True)`**
- Pipeline completo para extraer y actualizar información detallada de licitaciones
- Se ejecuta automáticamente después de la carga diaria (si está habilitado)

**`run_etl_detalles_ordenes_compra(limit=None, skip_existing=True)`**
- Pipeline completo para extraer y actualizar información detallada de órdenes de compra
- Se ejecuta automáticamente después de la carga diaria (si está habilitado)

**`run_etl_pipeline()`** - Actualizado con nuevos parámetros:
- `extract_detalles`: Habilitar/deshabilitar extracción de detalles (default: True)
- `detalles_limit`: Límite de registros para procesar detalles (default: None = todos)

## Uso

### 1. Ejecución Automática (Pipeline Completo)

Por defecto, el pipeline completo ahora incluye la extracción de detalles:

```bash
# Ejecuta todo: extracción diaria + extracción de detalles
python -m etl.main

# Con fechas específicas
python -m etl.main --fecha-desde 2024-01-01 --fecha-hasta 2024-01-31

# Procesar solo los primeros 100 registros sin detalles
python -m etl.main --detalles-limit 100
```

### 2. Saltar Extracción de Detalles

Si solo quieres la extracción diaria sin detalles:

```bash
# Solo extracción diaria, sin detalles
python -m etl.main --skip-detalles
```

### 3. Solo Extracción de Detalles

Si solo quieres actualizar los detalles sin hacer extracción diaria:

```bash
# Solo detalles (para todos los registros sin detalles)
python -m etl.main --only-detalles

# Solo detalles, limitado a 50 registros
python -m etl.main --only-detalles --detalles-limit 50

# Solo detalles de licitaciones (no órdenes)
python -m etl.main --only-detalles --skip-ordenes

# Solo detalles de órdenes (no licitaciones)
python -m etl.main --only-detalles --skip-licitaciones
```

### 4. Combinaciones Útiles

```bash
# Extracción diaria solo de licitaciones + sus detalles
python -m etl.main --skip-ordenes

# Extracción diaria solo de órdenes + sus detalles
python -m etl.main --skip-licitaciones

# Todo con límite de detalles
python -m etl.main --detalles-limit 200
```

## Argumentos de Línea de Comando

| Argumento | Tipo | Descripción |
|-----------|------|-------------|
| `--fecha-desde` | str | Fecha de inicio en formato YYYY-MM-DD (default: hoy) |
| `--fecha-hasta` | str | Fecha de fin en formato YYYY-MM-DD (default: hoy) |
| `--skip-licitaciones` | flag | Omitir extracción de licitaciones |
| `--skip-ordenes` | flag | Omitir extracción de órdenes de compra |
| `--skip-detalles` | flag | Omitir extracción de información detallada |
| `--detalles-limit` | int | Límite de registros para procesar detalles |
| `--only-detalles` | flag | Solo extraer información detallada (sin extracción diaria) |

## Configuración

La configuración se maneja a través de variables de entorno o el archivo `config.py`:

- `MERCADO_PUBLICO_URL`: URL base de la API (default: https://api.mercadopublico.cl)
- `MERCADO_PUBLICO_TICKET`: Ticket de acceso a la API
- `DATABASE_URL`: URL de conexión a PostgreSQL
- `MAX_RETRIES`: Número máximo de reintentos (default: 3)
- `RETRY_DELAY`: Delay entre reintentos en segundos (default: 5)

## Almacenamiento de Datos

La información detallada se almacena en el campo `informacion_adicional` (tipo JSON) de las tablas:
- `licitaciones`: Campo `informacion_adicional`
- `ordenes_compra`: Campo `informacion_adicional`

Este campo contiene la respuesta completa de la API con toda la información detallada disponible.

## Rate Limiting

Para evitar sobrecargar la API, se implementa un delay de 0.5 segundos entre cada petición de detalle individual.

## Logs

Los logs incluyen información detallada sobre:
- Número de registros encontrados para procesar
- Éxitos y errores en las extracciones
- Número de registros actualizados en la base de datos
- Errores específicos por registro

Ejemplo de salida:
```
2024-01-15 10:00:00 - INFO - Starting ETL pipeline for Licitaciones detailed information
2024-01-15 10:00:01 - INFO - Connecting to database to fetch licitaciones códigos...
2024-01-15 10:00:01 - INFO - Found 150 licitaciones to process
2024-01-15 10:00:02 - INFO - Extracting detailed info for licitación: 1234-56-LE20
2024-01-15 10:00:03 - INFO - Successfully extracted detailed info for licitación: 1234-56-LE20
...
2024-01-15 10:15:00 - INFO - Extracted detailed info: 148 successful, 2 errors
2024-01-15 10:15:01 - INFO - Updating database with 148 detailed records...
2024-01-15 10:15:05 - INFO - Licitacion details updated: 148 successful, 0 errors
```

## Manejo de Errores

El sistema maneja varios tipos de errores:
- **404 de API**: Se registra como warning y se omite el registro
- **Errores de conexión**: Se reintenta según `MAX_RETRIES`
- **Errores de base de datos**: Se hace rollback y se continúa con el siguiente registro
- **Registros sin ID**: Se registra warning y se omite

## Desarrollo Futuro

Posibles mejoras:
1. Procesamiento en paralelo para acelerar la extracción
2. Sistema de colas (Celery) para procesamiento asíncrono
3. Extracción selectiva de campos específicos del JSON
4. Normalización de algunos campos del JSON a columnas de la BD
5. Sistema de priorización (procesar primero registros más recientes)

## Notas Técnicas

- La extracción de detalles **no sobreescribe** datos existentes si `skip_existing_details=True`
- Los registros se procesan secuencialmente para respetar rate limits
- La información detallada se guarda como JSON sin transformación
- Se puede re-ejecutar el proceso sin riesgo de duplicados

