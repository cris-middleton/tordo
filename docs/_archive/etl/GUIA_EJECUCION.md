# 📘 Guía de Ejecución del ETL - Licitaciones Públicas Chile

## 🚀 Instrucciones de Uso

### Requisitos Previos

1. **Base de datos PostgreSQL corriendo**
2. **Variables de entorno configuradas** (`.env` en la raíz del proyecto):
   ```bash
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/licitaciones
   MERCADO_PUBLICO_TICKET=tu_ticket_aqui
   ```
3. **Migraciones aplicadas**:
   ```bash
   cd backend
   alembic upgrade head
   ```

---

## 📋 Comandos Principales

### 1. Pipeline Completo (Recomendado para uso diario)

Extrae datos del día + detalles de registros nuevos:

```bash
python etl/main.py --full-pipeline
```

**Qué hace**:
- ✅ Extrae licitaciones y órdenes del día actual
- ✅ Extrae detalles de registros nuevos (sin detalles previos)
- ⏱️ Duración: ~10-30 minutos (depende de cuántos registros nuevos haya)

---

### 2. Solo Extracción Diaria (Sin Detalles)

Para cuando solo quieres datos básicos del día:

```bash
# Ambos tipos
python etl/main.py --skip-detalles

# Solo licitaciones
python etl/main.py --tipo licitaciones --skip-detalles

# Solo órdenes de compra
python etl/main.py --tipo ordenes --skip-detalles
```

---

### 3. Solo Extraer Detalles de Registros Nuevos

Para registros que aún no tienen información detallada:

```bash
# Sin límite (todos los pendientes)
python etl/main.py --solo-extraer-detalles-nuevos

# Con límite (ej: primeros 50)
python etl/main.py --solo-extraer-detalles-nuevos --limit 50

# Solo licitaciones
python etl/main.py --solo-extraer-detalles-nuevos --tipo licitaciones --limit 100
```

**Cuándo usar**: Cuando tienes muchos registros históricos sin detalles.

---

### 4. Actualizar Detalles Existentes (Con Detección de Cambios)

Para revisar cambios en licitaciones/órdenes ya procesadas:

```bash
# Actualizar primeros 100 registros más antiguos
python etl/main.py --solo-actualizar-detalles --limit 100

# Actualizar todo (puede tardar horas)
python etl/main.py --solo-actualizar-detalles

# Solo licitaciones activas
python etl/main.py --solo-actualizar-detalles --tipo licitaciones --limit 200
```

**Qué hace**:
- 🔍 Extrae detalles actualizados de la API
- 🔐 Calcula hash SHA256 del contenido
- 📊 Si cambió → actualiza tabla `_detalle` y registra en `_historial`
- ⏭️ Si no cambió → skip

---

### 5. Extraer Detalles por Código Específico

Para debugging o consultas específicas:

```bash
# Licitación específica
python etl/main.py --codigo-licitacion 1234-56-LQ24

# Orden de compra específica
python etl/main.py --codigo-orden 5678-12-SE24
```

---

### 6. Rango de Fechas Personalizado

```bash
# Fecha específica
python etl/main.py --fecha-desde 2024-11-01 --fecha-hasta 2024-11-01

# Rango de fechas
python etl/main.py --fecha-desde 2024-11-01 --fecha-hasta 2024-11-15

# Con detalles
python etl/main.py --fecha-desde 2024-11-01 --fecha-hasta 2024-11-01 --full-pipeline
```

---

## ⚠️ Preguntas Frecuentes

### ¿Qué pasa si ejecuto el ETL dos veces el mismo día?

✅ **Es seguro. No habrá duplicados.**

- Las tablas base usan **UPSERT** (actualiza si existe, inserta si no existe)
- La clave única es `codigo_externo` (licitaciones) o `codigo_oc` (órdenes)
- Si el registro existe, simplemente actualiza los campos

### ¿Cómo sé si hay cambios en una licitación/orden?

Los cambios se registran automáticamente en las tablas `_historial`:

```sql
-- Ver cambios de una licitación específica
SELECT * FROM licitaciones_historial 
WHERE codigo_externo = '1234-56-LQ24' 
ORDER BY fecha_cambio DESC;

-- Ver todos los cambios recientes
SELECT * FROM licitaciones_historial 
WHERE fecha_cambio > NOW() - INTERVAL '7 days'
ORDER BY fecha_cambio DESC;
```

### ¿Cuándo debo actualizar detalles?

**Estrategia recomendada**:

1. **Diario**: `python etl/main.py --full-pipeline`
   - Extrae nuevos registros del día + sus detalles

2. **Semanal**: `python etl/main.py --solo-actualizar-detalles --limit 500`
   - Actualiza los 500 registros más antiguos para detectar cambios

3. **Mensual**: `python etl/main.py --solo-actualizar-detalles`
   - Actualiza TODO (puede tardar horas/días dependiendo del volumen)

### ¿Cómo programo el ETL para que corra automáticamente?

#### Opción 1: Cron (Linux/Mac)

```bash
# Editar crontab
crontab -e

# Agregar línea para ejecutar diariamente a las 6 AM
0 6 * * * cd /ruta/al/proyecto && python etl/main.py --full-pipeline >> /var/log/etl.log 2>&1
```

#### Opción 2: Docker + Celery Beat (Ya implementado)

El proyecto ya tiene configurado Celery Beat para tareas programadas:

```bash
# Ver backend/app/tasks/alert_tasks.py
# Agregar tarea programada para ETL
```

---

## 🔧 Solución de Problemas

### Error: "No module named 'etl'"

**Solución**: Ejecuta desde la raíz del proyecto:

```bash
cd /ruta/al/proyecto/saas_licitaciones
python etl/main.py --help
```

### Error: "Connection refused" o "db not found"

**Solución**: Verifica que PostgreSQL esté corriendo:

```bash
# Mac
brew services list | grep postgres

# Linux
systemctl status postgresql

# Conectar manualmente
psql -h localhost -U postgres -d licitaciones
```

### Error: "Invalid ticket"

**Solución**: Verifica tu ticket en `.env`:

```bash
# .env
MERCADO_PUBLICO_TICKET=tu_ticket_valido_aqui
```

Puedes obtener un ticket en: https://www.mercadopublico.cl/

---

## 📊 Monitoreo

### Ver estadísticas de la base de datos

```sql
-- Total de registros
SELECT 
    (SELECT COUNT(*) FROM licitaciones) as total_licitaciones,
    (SELECT COUNT(*) FROM ordenes_compra) as total_ordenes,
    (SELECT COUNT(*) FROM licitaciones_detalle) as licitaciones_con_detalle,
    (SELECT COUNT(*) FROM ordenes_compra_detalle) as ordenes_con_detalle;

-- Registros sin detalles
SELECT 
    (SELECT COUNT(*) FROM licitaciones l 
     LEFT JOIN licitaciones_detalle ld ON l.id = ld.licitacion_id 
     WHERE ld.id IS NULL) as licitaciones_sin_detalle,
    (SELECT COUNT(*) FROM ordenes_compra oc 
     LEFT JOIN ordenes_compra_detalle ocd ON oc.id = ocd.orden_compra_id 
     WHERE ocd.id IS NULL) as ordenes_sin_detalle;

-- Cambios recientes
SELECT COUNT(*) as cambios_ultimas_24h
FROM licitaciones_historial
WHERE fecha_cambio > NOW() - INTERVAL '24 hours';
```

### Ver logs

```bash
# Ver log del ETL
tail -f etl/etl.log

# Buscar errores
grep ERROR etl/etl.log | tail -20
```

---

## 🎯 Uso Recomendado

### Primer Setup (Migración inicial)

```bash
# 1. Aplicar migraciones
cd backend && alembic upgrade head

# 2. Migrar datos existentes (si tienes datos previos)
python etl/scripts/migrate_to_v2.py

# 3. Extraer detalles de registros históricos (poco a poco)
python etl/main.py --solo-extraer-detalles-nuevos --limit 100
```

### Uso Diario

```bash
# Cron diario a las 6 AM
python etl/main.py --full-pipeline
```

### Mantenimiento Semanal

```bash
# Actualizar registros antiguos (detectar cambios)
python etl/main.py --solo-actualizar-detalles --limit 500
```

---

## 📚 Documentación Adicional

- **Arquitectura V2**: `etl/README_V2.md`
- **Detección de cambios**: `etl/REVISION_CODIGO.md`
- **Migración V1→V2**: `etl/scripts/migrate_to_v2.py --help`
- **API Reference**: `docs/api-reference.md`

---

## 🆘 Soporte

Si encuentras problemas:

1. Revisa los logs: `tail -f etl/etl.log`
2. Valida el entorno: `python validar_etl.py`
3. Verifica la conexión a BD: `psql -h localhost -U postgres -d licitaciones`
4. Revisa las tablas: `SELECT COUNT(*) FROM licitaciones;`

