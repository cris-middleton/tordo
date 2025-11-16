# ETL V2 - Arquitectura con Detección de Cambios e Historial

## 🎯 ¿Qué es V2?

La versión 2 del ETL resuelve los problemas fundamentales de la versión 1:

### ❌ Problemas V1
- Info detallada en mismo JSON que datos básicos
- Una sola descarga, nunca se actualiza
- No detecta cambios de estado
- Sin historial

### ✅ Solución V2
- Tablas separadas: básica + detalle + historial
- Actualización periódica con detección de cambios
- Historial completo de modificaciones
- Queries eficientes

## 📊 Nueva Arquitectura

```
┌──────────────────────┐
│ licitaciones         │ ← Datos básicos (snapshot diario)
│ ordenes_compra       │
└──────────────────────┘
          ↓
┌──────────────────────┐
│ licitaciones_detalle │ ← Info completa (actualizable)
│ ordenes_compra_det.  │   + hash para detectar cambios
└──────────────────────┘
          ↓
┌──────────────────────┐
│ licitaciones_histor. │ ← Log de todos los cambios
│ ordenes_compra_hist. │   + qué, cuándo, valor ant/nuevo
└──────────────────────┘
```

## 🚀 Inicio Rápido

### 1. Ejecutar Migration

```bash
cd backend
alembic upgrade head
```

Esto crea 4 nuevas tablas:
- `licitaciones_detalle`
- `licitaciones_historial`
- `ordenes_compra_detalle`
- `ordenes_compra_historial`

### 2. Migrar Datos Existentes (si tienes datos V1)

```bash
cd etl

# Dry run (ver qué haría)
python scripts/migrate_to_v2.py --dry-run

# Ejecutar migración
python scripts/migrate_to_v2.py

# Verificar
python scripts/migrate_to_v2.py --verify-only
```

### 3. Usar ETL V2

```bash
# Pipeline completo (recomendado)
python main_v2.py

# Solo datos básicos (diarios)
python main_v2.py --skip-detalles-nuevos

# Incluir actualización de detalles existentes
python main_v2.py --actualizar-detalles

# Solo extraer detalles para registros nuevos
python main_v2.py --only-extraer-nuevos

# Solo actualizar detalles existentes
python main_v2.py --only-actualizar --dias-sin-actualizar 7
```

## 📋 Flujos de Trabajo

### Flujo 1: Ejecución Diaria Completa

**Objetivo**: Descargar nuevos datos + detalles + actualizar existentes

```bash
python main_v2.py \
  --fecha-desde 2024-11-15 \
  --fecha-hasta 2024-11-15 \
  --actualizar-detalles \
  --dias-sin-actualizar 7
```

**Lo que hace:**
1. ✅ Descarga licitaciones/órdenes publicadas hoy → tabla básica
2. ✅ Extrae detalles de las nuevas → tabla `_detalle`
3. ✅ Re-extrae y compara registros antiguos (>7 días sin actualizar)
4. ✅ Detecta cambios → registra en tabla `_historial`

### Flujo 2: Completar Detalles de Datos Históricos

**Objetivo**: Tienes datos básicos pero sin detalles

```bash
# Procesar todos los registros sin detalles
python main_v2.py --only-extraer-nuevos

# Procesar solo 500 por vez
python main_v2.py --only-extraer-nuevos --detalles-limit 500
```

### Flujo 3: Actualización Semanal de Cambios

**Objetivo**: Detectar qué ha cambiado en registros activos

```bash
python main_v2.py --only-actualizar \
  --dias-sin-actualizar 7 \
  --solo-activos \
  --detalles-limit 1000
```

**Ejecutar en cron:**
```bash
# Todos los días a las 10 PM
0 22 * * * cd /path/to/etl && python main_v2.py --only-actualizar --solo-activos
```

## 🎛️ Comandos Disponibles

### Pipeline Completo
```bash
python main_v2.py [opciones]
```

**Opciones:**
- `--fecha-desde YYYY-MM-DD` - Fecha inicio para descarga diaria
- `--fecha-hasta YYYY-MM-DD` - Fecha fin para descarga diaria
- `--skip-licitaciones` - Omitir licitaciones
- `--skip-ordenes` - Omitir órdenes de compra
- `--skip-detalles-nuevos` - No extraer detalles de registros nuevos
- `--actualizar-detalles` - Actualizar registros existentes
- `--detalles-limit N` - Limitar cantidad a procesar
- `--dias-sin-actualizar N` - Umbral de días (default: 7)
- `--solo-activos` - Solo estados no finales

### Modos Standalone
```bash
# Solo extraer detalles nuevos
python main_v2.py --only-extraer-nuevos [--detalles-limit N]

# Solo actualizar existentes
python main_v2.py --only-actualizar [--dias-sin-actualizar N] [--solo-activos]
```

## 📚 Ejemplos de Uso

### Ejemplo 1: Primera Vez (Con Datos Históricos)

```bash
# Paso 1: Ejecutar migration
cd backend && alembic upgrade head

# Paso 2: Migrar datos V1 → V2
cd ../etl
python scripts/migrate_to_v2.py

# Paso 3: Pipeline normal
python main_v2.py
```

### Ejemplo 2: Uso Diario (Producción)

**Setup cron jobs:**
```bash
# 1. Descarga diaria (6 AM)
0 6 * * * cd /path/to/etl && python main_v2.py --skip-actualizar

# 2. Extraer detalles nuevos (cada 4 horas)
0 */4 * * * cd /path/to/etl && python main_v2.py --only-extraer-nuevos --detalles-limit 500

# 3. Actualizar existentes (10 PM)
0 22 * * * cd /path/to/etl && python main_v2.py --only-actualizar --solo-activos --detalles-limit 1000
```

### Ejemplo 3: Migración Gradual

Si tienes muchos datos:

```bash
# Día 1: Migrar primeros 1000
python scripts/migrate_to_v2.py --limit 1000

# Día 2: Siguientes 1000
python scripts/migrate_to_v2.py --limit 1000

# Verificar progreso
python scripts/migrate_to_v2.py --verify-only
```

## 🔍 Consultas de Base de Datos

### Ver Licitaciones con Detalles
```sql
SELECT 
    l.codigo_externo,
    l.nombre,
    l.estado as estado_basico,
    ld.estado_actual,
    ld.numero_actualizaciones,
    ld.fecha_ultima_actualizacion
FROM licitaciones l
JOIN licitaciones_detalle ld ON l.id = ld.licitacion_id
WHERE ld.estado_actual = 'En Evaluación';
```

### Ver Historial de Cambios
```sql
SELECT 
    h.codigo_externo,
    h.tipo_cambio,
    h.descripcion,
    h.valor_anterior,
    h.valor_nuevo,
    h.fecha_cambio
FROM licitaciones_historial h
WHERE h.codigo_externo = '1234-56-LE20'
ORDER BY h.fecha_cambio DESC;
```

### Licitaciones que Cambiaron de Estado Esta Semana
```sql
SELECT DISTINCT
    h.codigo_externo,
    h.valor_anterior as estado_anterior,
    h.valor_nuevo as estado_nuevo,
    h.fecha_cambio
FROM licitaciones_historial h
WHERE h.tipo_cambio = 'estado'
  AND h.fecha_cambio >= NOW() - INTERVAL '7 days'
ORDER BY h.fecha_cambio DESC;
```

### Órdenes que se Entregaron Hoy
```sql
SELECT 
    o.codigo_oc,
    o.nombre,
    h.fecha_cambio as fecha_entrega
FROM ordenes_compra o
JOIN ordenes_compra_historial h ON o.codigo_oc = h.codigo_oc
WHERE h.tipo_cambio = 'entrega'
  AND h.fecha_cambio::date = CURRENT_DATE;
```

### Estadísticas de Actualizaciones
```sql
-- Licitaciones más actualizadas
SELECT 
    codigo_externo,
    numero_actualizaciones,
    fecha_primera_extraccion,
    fecha_ultima_actualizacion
FROM licitaciones_detalle
ORDER BY numero_actualizaciones DESC
LIMIT 10;

-- Registros sin actualizar en >30 días
SELECT COUNT(*)
FROM licitaciones_detalle
WHERE fecha_ultima_actualizacion < NOW() - INTERVAL '30 days'
  AND estado_actual NOT IN ('Cerrada', 'Desierta', 'Adjudicada');
```

## 🛠️ Uso Programático

### Python API

```python
from etl.loaders import DatabaseLoaderV2
from etl.extractors import MercadoPublicoLicitacionesExtractor
from etl.utils import detectar_cambios_licitacion

# Crear loader
loader = DatabaseLoaderV2()
loader.connect()

# 1. Cargar datos básicos
loader.load_licitaciones(datos_transformados)

# 2. Extraer y cargar detalles inicial
extractor = MercadoPublicoLicitacionesExtractor()
detalle = extractor.extract_detalle_licitacion("1234-LE20")
loader.load_licitacion_detalle_inicial(
    licitacion_id=1,
    codigo_externo="1234-LE20",
    datos_api=detalle
)

# 3. Actualizar y detectar cambios
datos_nuevos = extractor.extract_detalle_licitacion("1234-LE20")
has_changes = loader.actualizar_licitacion_detalle(
    licitacion_id=1,
    codigo_externo="1234-LE20",
    datos_nuevos=datos_nuevos
)

if has_changes:
    print("✓ Cambios detectados y registrados en historial")

# 4. Consultar registros que necesitan actualización
registros = loader.query_licitaciones_para_actualizar(
    dias_sin_actualizar=7,
    limit=100
)

loader.disconnect()
```

## 📈 Monitoreo

### Métricas Importantes

1. **Cobertura de Detalles**
```sql
SELECT 
    (SELECT COUNT(*) FROM licitaciones_detalle) * 100.0 / 
    (SELECT COUNT(*) FROM licitaciones) as porcentaje_con_detalle;
```

2. **Actualizaciones Pendientes**
```sql
SELECT COUNT(*)
FROM licitaciones_detalle
WHERE fecha_ultima_actualizacion < NOW() - INTERVAL '7 days'
  AND estado_actual NOT IN ('Cerrada', 'Desierta');
```

3. **Cambios Detectados Hoy**
```sql
SELECT tipo_cambio, COUNT(*)
FROM licitaciones_historial
WHERE fecha_deteccion::date = CURRENT_DATE
GROUP BY tipo_cambio;
```

## 🔧 Troubleshooting

### Problema: Migration Falla

**Síntoma:** Error al correr `alembic upgrade head`

**Solución:**
```bash
# Ver estado actual
alembic current

# Si está en 001, correr upgrade
alembic upgrade head

# Si hay conflicto, revisar
alembic history
```

### Problema: Registros No se Actualizan

**Síntoma:** `actualizar_licitacion_detalle()` siempre retorna False

**Causa:** Hash idéntico (no hay cambios reales)

**Verificar:**
```python
from etl.utils import calcular_hash

datos1 = {...}  # Datos anteriores
datos2 = {...}  # Datos nuevos

hash1 = calcular_hash(datos1)
hash2 = calcular_hash(datos2)

print(f"Hash anterior: {hash1}")
print(f"Hash nuevo: {hash2}")
print(f"Son iguales: {hash1 == hash2}")
```

### Problema: Demasiados Registros para Actualizar

**Síntoma:** Proceso muy lento, miles de registros

**Solución:** Usar límites y priorización
```bash
# Procesar en lotes de 500
python main_v2.py --only-actualizar --detalles-limit 500

# Solo registros activos
python main_v2.py --only-actualizar --solo-activos

# Ajustar umbral de días
python main_v2.py --only-actualizar --dias-sin-actualizar 14
```

## 🎓 Mejores Prácticas

### 1. Estrategia de Actualización

**Recomendado:**
- Diario: Descarga básica + detalles nuevos
- Cada 4-6 horas: Extraer detalles de registros nuevos
- Diario (noche): Actualizar registros activos

### 2. Límites y Rate Limiting

**Configuración recomendada:**
```python
# config.py
MAX_RETRIES = 3
RETRY_DELAY = 5
REQUESTS_PER_SECOND = 1.0
```

**En producción con muchos datos:**
```bash
# No procesar todo de una vez
python main_v2.py --only-actualizar --detalles-limit 1000

# Espaciar en el tiempo (cron)
0 */4 * * * python main_v2.py --only-extraer-nuevos --detalles-limit 500
```

### 3. Monitoreo y Alertas

**Setup básico:**
1. Log de errores → sistema de alertas
2. Métrica de cobertura → dashboard
3. Cambios críticos → notificaciones

```python
# Ejemplo: Alertar cuando licitación se adjudica
SELECT l.codigo_externo, l.nombre, h.fecha_cambio
FROM licitaciones l
JOIN licitaciones_historial h ON l.id = h.licitacion_id
WHERE h.tipo_cambio = 'adjudicacion'
  AND h.fecha_cambio >= NOW() - INTERVAL '1 hour';
```

## 📖 Documentación Adicional

- **Modelos**: Ver `backend/app/models/`
- **Utilidades**: Ver `etl/utils/change_detection.py`
- **Arquitectura**: Ver `PROPUESTA_MEJORA_ARQUITECTURA.md`
- **Comparación**: Ver `COMPARACION_ARQUITECTURAS.md`

## ✨ Resumen

V2 te da:
- ✅ Detección automática de cambios
- ✅ Historial completo de modificaciones
- ✅ Datos siempre actualizados
- ✅ Queries eficientes
- ✅ Escalabilidad

¡Listo para producción! 🚀

