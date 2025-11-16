# Changelog - Extracción de Información Detallada

## Fecha: 2024-11-15

### Nuevas Funcionalidades

#### 1. Extractores - Extracción Individual

**`mercado_publico_ordenes.py`**
- ✅ Agregado método `extract_detalle_orden_compra(codigo_oc: str)`
  - Extrae información detallada de una orden de compra específica
  - Usa endpoint: `/servicios/v1/publico/OrdenCompra.json?codigo=[codigo]&ticket=[ticket]`
  - Retorna diccionario con información completa o None

**`mercado_publico_licitaciones.py`**
- ✅ Agregado método `extract_detalle_licitacion(codigo_externo: str)`
  - Extrae información detallada de una licitación específica
  - Usa endpoint: `/servicios/v1/publico/licitaciones.json?codigo=[codigo]&ticket=[ticket]`
  - Retorna diccionario con información completa o None

#### 2. Extractores - Extracción por Lotes desde BD

**`mercado_publico_ordenes.py`**
- ✅ Agregado método `extract_detalles_ordenes_from_db(limit=None, skip_existing_details=True)`
  - Consulta la base de datos por códigos de órdenes
  - Filtra registros que ya tienen detalles (opcional)
  - Extrae detalles para cada código encontrado
  - Incluye rate limiting (0.5s entre peticiones)
  - Retorna lista con ID de base de datos incluido

**`mercado_publico_licitaciones.py`**
- ✅ Agregado método `extract_detalles_licitaciones_from_db(limit=None, skip_existing_details=True)`
  - Consulta la base de datos por códigos de licitaciones
  - Filtra registros que ya tienen detalles (opcional)
  - Extrae detalles para cada código encontrado
  - Incluye rate limiting (0.5s entre peticiones)
  - Retorna lista con ID de base de datos incluido

#### 3. Loader - Actualización de Detalles

**`database_loader.py`**
- ✅ Agregado método `update_licitacion_detalles(detailed_records: List[Dict])`
  - Actualiza campo `informacion_adicional` con datos detallados
  - Maneja errores individuales sin afectar el lote completo
  - Logging detallado de éxitos y errores

- ✅ Agregado método `update_orden_compra_detalles(detailed_records: List[Dict])`
  - Actualiza campo `informacion_adicional` con datos detallados
  - Maneja errores individuales sin afectar el lote completo
  - Logging detallado de éxitos y errores

#### 4. Pipeline Principal

**`main.py`**
- ✅ Agregada función `run_etl_detalles_licitaciones(limit=None, skip_existing=True)`
  - Pipeline completo: extracción + carga de detalles de licitaciones
  - Se ejecuta automáticamente después de la carga diaria (si está habilitado)

- ✅ Agregada función `run_etl_detalles_ordenes_compra(limit=None, skip_existing=True)`
  - Pipeline completo: extracción + carga de detalles de órdenes
  - Se ejecuta automáticamente después de la carga diaria (si está habilitado)

- ✅ Actualizada función `run_etl_pipeline()`
  - Nuevo parámetro: `extract_detalles` (default: True)
  - Nuevo parámetro: `detalles_limit` (default: None)
  - Ejecuta extracción de detalles después de carga diaria

- ✅ Actualizada función `main()` con nuevos argumentos:
  - `--skip-detalles`: Omitir extracción de detalles
  - `--detalles-limit N`: Limitar número de registros a procesar
  - `--only-detalles`: Solo extraer detalles (sin extracción diaria)

### Documentación

- ✅ Creado `README_DETALLES.md` - Documentación completa de la funcionalidad
- ✅ Actualizado `README.md` - Agregadas referencias a nuevas funcionalidades
- ✅ Creado `scripts/test_detalles_extraction.py` - Script de prueba
- ✅ Creado `CHANGELOG_DETALLES.md` - Este archivo

### Características Técnicas

#### Rate Limiting
- Delay de 0.5 segundos entre peticiones individuales de detalles
- Previene sobrecarga de la API

#### Manejo de Errores
- Reintentos automáticos según configuración (`MAX_RETRIES`)
- Errores 404 registrados como warnings
- Errores de conexión manejados con reintentos
- Errores de BD con rollback individual

#### Optimizaciones
- Filtrado automático de registros que ya tienen detalles
- Procesamiento por lotes configurable
- Opción de límite para procesamiento incremental
- Reutilización de conexiones de base de datos

#### Almacenamiento
- Información detallada se guarda en campo JSON `informacion_adicional`
- No sobreescribe datos existentes si se usa `skip_existing_details=True`
- Permite re-ejecución sin duplicados

### Ejemplos de Uso

#### Ejecución Completa (Diaria + Detalles)
```bash
python -m etl.main
```

#### Solo Extracción de Detalles
```bash
# Todos los registros sin detalles
python -m etl.main --only-detalles

# Primeros 100 registros
python -m etl.main --only-detalles --detalles-limit 100

# Solo licitaciones
python -m etl.main --only-detalles --skip-ordenes
```

#### Extracción Diaria sin Detalles
```bash
python -m etl.main --skip-detalles
```

#### Pruebas
```bash
# Probar extracción de detalles (5 registros)
python -m etl.scripts.test_detalles_extraction --limit 5

# Solo órdenes de compra
python -m etl.scripts.test_detalles_extraction --test batch-ordenes --limit 10

# Solo licitaciones
python -m etl.scripts.test_detalles_extraction --test batch-licitaciones --limit 10
```

### Archivos Modificados

1. `etl/extractors/mercado_publico_ordenes.py` - +120 líneas
2. `etl/extractors/mercado_publico_licitaciones.py` - +120 líneas
3. `etl/loaders/database_loader.py` - +143 líneas
4. `etl/main.py` - +149 líneas
5. `etl/README.md` - Actualizado
6. `etl/README_DETALLES.md` - Nuevo
7. `etl/CHANGELOG_DETALLES.md` - Nuevo
8. `etl/scripts/test_detalles_extraction.py` - Nuevo

### Próximos Pasos Sugeridos

1. **Pruebas**
   - Ejecutar script de prueba con límite pequeño
   - Verificar datos en campo `informacion_adicional`
   - Validar estructura de JSON guardado

2. **Optimizaciones Futuras**
   - Implementar procesamiento paralelo (ThreadPool/ProcessPool)
   - Agregar sistema de colas (Celery) para procesamiento asíncrono
   - Implementar caché de resultados

3. **Monitoreo**
   - Configurar alertas para errores de extracción
   - Dashboard de progreso de extracción de detalles
   - Métricas de cobertura (% con detalles)

4. **Integración**
   - Exponer detalles en API REST del backend
   - Mostrar información detallada en frontend
   - Agregar búsqueda en campos del JSON

### Notas de Compatibilidad

- ✅ Compatible con versión anterior del ETL
- ✅ No requiere cambios en base de datos (usa campos JSON existentes)
- ✅ Funcionalidad es opcional (puede deshabilitarse con `--skip-detalles`)
- ✅ No afecta el flujo de extracción diaria existente

### Testing Realizado

- ✅ Validación de sintaxis Python
- ✅ Verificación de imports
- ✅ Validación de estructura de código
- ⚠️ Pendiente: Testing con API real
- ⚠️ Pendiente: Validación de datos guardados en BD

### Configuración Requerida

No se requiere configuración adicional. El sistema usa las mismas variables de entorno:
- `MERCADO_PUBLICO_URL`
- `MERCADO_PUBLICO_TICKET`
- `DATABASE_URL`
- `MAX_RETRIES`
- `RETRY_DELAY`

### Estructura de Datos

Los detalles se guardan en el campo `informacion_adicional` como JSON con toda la respuesta de la API, que puede incluir:

**Para Órdenes de Compra:**
- Información completa del comprador
- Detalles del proveedor
- Items con cantidades y precios
- Fechas detalladas
- Estados y etapas
- Documentos adjuntos

**Para Licitaciones:**
- Documentos de la licitación
- Adjuntos
- Items solicitados
- Participantes
- Etapas del proceso
- Preguntas y respuestas
- Ofertas recibidas

