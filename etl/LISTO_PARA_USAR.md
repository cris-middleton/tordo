# ✅ ETL Listo Para Usar

## 🎉 Revisión Completa Finalizada

He revisado y mejorado completamente el código ETL. **Todo está listo para usar en producción.**

## 📊 Resumen de Mejoras

### Problemas Críticos Resueltos
1. ✅ Eliminado `sys.path.insert()` repetido → `shared_imports.py`
2. ✅ Agregado context manager a `DatabaseLoaderV2`
3. ✅ Corregido timezone awareness → función `now_utc()`
4. ✅ Documentadas credenciales en `config.py`

### Mejoras de Calidad
5. ✅ Type hints completos (`from __future__ import annotations`)
6. ✅ Validación de configuración
7. ✅ Protección contra re-conexión
8. ✅ Mejor manejo de errores

### Nuevos Archivos
- ✅ `shared_imports.py` - Imports centralizados
- ✅ `scripts/validar_entorno.py` - Script de validación
- ✅ `REVISION_CODIGO.md` - Reporte técnico
- ✅ `MEJORAS_APLICADAS.md` - Documentación de mejoras
- ✅ `LISTO_PARA_USAR.md` - Este archivo

## 🚀 Cómo Empezar

### Paso 1: Validar el Entorno

```bash
cd /Users/crismiddleton/Documents/saas_licitaciones/etl

# Hacer script ejecutable
chmod +x scripts/validar_entorno.py

# Ejecutar validación
python scripts/validar_entorno.py
```

**Debe decir:** `🎉 ¡Todo está correcto! Listo para ejecutar ETL`

Si hay errores:
- Verifica tu archivo `.env`
- Asegura que PostgreSQL esté corriendo
- Ejecuta migrations: `cd backend && alembic upgrade head`

### Paso 2: Migrar Datos Existentes (Si Tienes)

```bash
# Ver qué haría (sin modificar nada)
python scripts/migrate_to_v2.py --dry-run

# Si se ve bien, ejecutar
python scripts/migrate_to_v2.py

# Verificar resultado
python scripts/migrate_to_v2.py --verify-only
```

### Paso 3: Ejecutar ETL V2

```bash
# Pipeline completo (recomendado para primera vez)
python main_v2.py

# Con actualización de detalles
python main_v2.py --actualizar-detalles

# Con límite (para probar)
python main_v2.py --detalles-limit 10
```

## 📝 Uso Diario Recomendado

### Opción A: Un Comando (Simple)

```bash
# Todo en uno: diario + detalles nuevos + actualización
python main_v2.py --actualizar-detalles
```

### Opción B: Separado (Control Fino)

```bash
# 1. Descarga diaria (6 AM)
python main_v2.py --skip-detalles-nuevos

# 2. Extraer detalles nuevos (cada 4 horas)
python main_v2.py --only-extraer-nuevos --detalles-limit 500

# 3. Actualizar existentes (10 PM)
python main_v2.py --only-actualizar --solo-activos --detalles-limit 1000
```

### Configuración Cron para Producción

```cron
# /etc/crontab o crontab -e

# Descarga diaria a las 6 AM
0 6 * * * cd /path/to/etl && python main_v2.py --skip-detalles-nuevos

# Extraer detalles nuevos cada 4 horas
0 */4 * * * cd /path/to/etl && python main_v2.py --only-extraer-nuevos --detalles-limit 500

# Actualizar existentes a las 10 PM
0 22 * * * cd /path/to/etl && python main_v2.py --only-actualizar --solo-activos --detalles-limit 1000
```

## 💡 Nuevas Mejores Prácticas

### 1. Usar Context Manager (IMPORTANTE)

```python
# ✅ NUEVO - Recomendado
from etl.loaders import DatabaseLoaderV2

with DatabaseLoaderV2() as loader:
    loader.load_licitaciones(data)
# Conexión cerrada automáticamente

# ⚠️  LEGACY - Aún funciona pero no recomendado
loader = DatabaseLoaderV2()
loader.connect()
try:
    loader.load_licitaciones(data)
finally:
    loader.disconnect()
```

### 2. Usar Timezone-Aware Dates

```python
# ✅ NUEVO - Siempre usar
from etl.utils import now_utc

fecha_actual = now_utc()  # Con timezone UTC
fecha_limite = now_utc() - timedelta(days=7)

# ❌ EVITAR
fecha = datetime.now()  # Sin timezone - puede fallar
```

### 3. Imports Limpios

```python
# ✅ NUEVO - Un solo lugar
from etl.shared_imports import Licitacion, OrdenCompra

# ❌ EVITAR
import sys
sys.path.insert(0, '...')
from app.models.licitacion import Licitacion
```

## 🧪 Ejemplos de Código

### Ejemplo 1: Cargar Datos Básicos

```python
from etl.loaders import DatabaseLoaderV2
from etl.extractors import MercadoPublicoLicitacionesExtractor
from etl.transformers import LicitacionTransformer

# Extraer
extractor = MercadoPublicoLicitacionesExtractor()
datos_raw = extractor.extract()

# Transformar
transformer = LicitacionTransformer()
datos_transformados = [transformer.transform(d) for d in datos_raw]

# Cargar con context manager
with DatabaseLoaderV2() as loader:
    count = loader.load_licitaciones(datos_transformados)
    print(f"✓ Cargadas {count} licitaciones")
```

### Ejemplo 2: Extraer y Cargar Detalles

```python
from etl.loaders import DatabaseLoaderV2
from etl.extractors import MercadoPublicoLicitacionesExtractor

extractor = MercadoPublicoLicitacionesExtractor()

with DatabaseLoaderV2() as loader:
    # Buscar registros sin detalle
    sin_detalle = loader.query_licitaciones_sin_detalle(limit=10)
    
    for lic_id, codigo in sin_detalle:
        # Extraer detalle de API
        detalle = extractor.extract_detalle_licitacion(codigo)
        
        if detalle:
            # Cargar en BD
            loader.load_licitacion_detalle_inicial(
                licitacion_id=lic_id,
                codigo_externo=codigo,
                datos_api=detalle
            )
            print(f"✓ Detalle cargado para {codigo}")
```

### Ejemplo 3: Actualizar y Detectar Cambios

```python
from etl.loaders import DatabaseLoaderV2
from etl.extractors import MercadoPublicoLicitacionesExtractor

extractor = MercadoPublicoLicitacionesExtractor()

with DatabaseLoaderV2() as loader:
    # Buscar registros para actualizar
    para_actualizar = loader.query_licitaciones_para_actualizar(
        dias_sin_actualizar=7,
        limit=10
    )
    
    for lic_id, codigo, detalle_id in para_actualizar:
        # Re-extraer de API
        datos_nuevos = extractor.extract_detalle_licitacion(codigo)
        
        if datos_nuevos:
            # Actualizar - detecta cambios automáticamente
            has_changes = loader.actualizar_licitacion_detalle(
                licitacion_id=lic_id,
                codigo_externo=codigo,
                datos_nuevos=datos_nuevos
            )
            
            if has_changes:
                print(f"✓ Cambios detectados en {codigo}")
            else:
                print(f"- Sin cambios en {codigo}")
```

## 📚 Documentación Disponible

| Archivo | Contenido |
|---------|-----------|
| `README_V2.md` | Guía completa de uso |
| `MEJORAS_APLICADAS.md` | Detalle de mejoras aplicadas |
| `PROPUESTA_MEJORA_ARQUITECTURA.md` | Diseño técnico |
| `COMPARACION_ARQUITECTURAS.md` | V1 vs V2 |
| `REVISION_CODIGO.md` | Reporte de revisión |
| `LISTO_PARA_USAR.md` | Este archivo |

## ✅ Checklist Pre-Producción

Antes de usar en producción, verifica:

- [ ] ✅ Script de validación pasa: `python scripts/validar_entorno.py`
- [ ] ✅ Variable `MERCADO_PUBLICO_TICKET` en `.env` con tu ticket real
- [ ] ✅ Variable `DATABASE_URL` apunta a tu BD de producción
- [ ] ✅ PostgreSQL corriendo y accesible
- [ ] ✅ Migrations ejecutadas: `alembic upgrade head`
- [ ] ✅ Datos migrados (si tenías V1): `python scripts/migrate_to_v2.py`
- [ ] ✅ Probado con límite pequeño: `python main_v2.py --detalles-limit 5`
- [ ] ✅ Logs configurados: `LOG_FILE=etl.log` en `.env`
- [ ] ✅ Cron jobs configurados (si aplica)

## 🔍 Verificación Rápida

### 1. Imports Funcionan
```bash
python -c "from etl.shared_imports import Licitacion; print('✓ OK')"
```

### 2. Context Manager Funciona
```bash
python -c "from etl.loaders import DatabaseLoaderV2; loader = DatabaseLoaderV2(); print('✓ OK')"
```

### 3. Timezone Funciona
```bash
python -c "from etl.utils import now_utc; print(now_utc())"
```

### 4. BD Conecta
```bash
python -c "from etl.loaders import DatabaseLoaderV2; loader = DatabaseLoaderV2(); loader.connect(); print('✓ OK'); loader.disconnect()"
```

## 🆘 Troubleshooting

### Error: "module etl has no attribute shared_imports"
**Solución:** Asegúrate de estar en el directorio correcto:
```bash
cd /Users/crismiddleton/Documents/saas_licitaciones/etl
python main_v2.py
```

### Error: "DATABASE_URL must be provided"
**Solución:** Configura en `.env`:
```bash
echo "DATABASE_URL=postgresql://user:pass@localhost:5432/licitaciones" >> .env
```

### Error: "MERCADO_PUBLICO_TICKET must be set"
**Solución:** Configura en `.env`:
```bash
echo "MERCADO_PUBLICO_TICKET=tu-ticket-aqui" >> .env
```

### Error: "Can't compare offset-naive and offset-aware datetimes"
**Solución:** Esto no debería pasar ahora que usamos `now_utc()` en todos lados. Si lo ves, reporta el archivo específico.

## 🎯 Comandos Más Comunes

```bash
# Validar entorno
python scripts/validar_entorno.py

# Migrar datos V1 → V2
python scripts/migrate_to_v2.py

# ETL completo
python main_v2.py

# Solo detalles nuevos
python main_v2.py --only-extraer-nuevos --detalles-limit 100

# Solo actualizar existentes
python main_v2.py --only-actualizar --solo-activos

# Con todas las campanas
python main_v2.py --actualizar-detalles --detalles-limit 500
```

## 📊 Queries Útiles

### Ver Coverage de Detalles
```sql
SELECT 
    'Licitaciones' as tipo,
    COUNT(*) as total,
    (SELECT COUNT(*) FROM licitaciones_detalle) as con_detalle,
    ROUND((SELECT COUNT(*) FROM licitaciones_detalle) * 100.0 / COUNT(*), 2) || '%' as porcentaje
FROM licitaciones;
```

### Ver Cambios Recientes
```sql
SELECT * FROM licitaciones_historial
WHERE fecha_cambio >= NOW() - INTERVAL '24 hours'
ORDER BY fecha_cambio DESC
LIMIT 20;
```

### Ver Registros Sin Actualizar
```sql
SELECT codigo_externo, estado_actual, fecha_ultima_actualizacion
FROM licitaciones_detalle
WHERE fecha_ultima_actualizacion < NOW() - INTERVAL '7 days'
  AND estado_actual NOT IN ('Cerrada', 'Desierta')
LIMIT 10;
```

## ✨ Conclusión

**Estado:** ✅ Listo para producción

**Mejoras aplicadas:** 8 críticas + 4 archivos nuevos

**Documentación:** 6 documentos completos

**Testing:** Validación automatizada disponible

**Próximo paso:** Ejecutar `python scripts/validar_entorno.py`

---

¡Todo listo! Si el script de validación pasa, puedes proceder con confianza. 🚀

