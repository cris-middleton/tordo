# 🚀 Inicio Rápido - ETL Mercado Público

## ⚡ Ejecutar el ETL Ahora

```bash
# Opción 1: Script wrapper (más fácil)
./run_etl.sh --full-pipeline

# Opción 2: Como módulo de Python
cd /Users/crismiddleton/Documents/saas_licitaciones
python -m etl.main --full-pipeline
```

Esto extraerá:
- ✅ Licitaciones y órdenes publicadas hoy
- ✅ Detalles completos de registros nuevos
- ⏱️ Tiempo estimado: 10-30 minutos

---

## 📋 Comandos Más Comunes

```bash
# Solo datos del día (rápido: 2-5 min)
python -m etl.main --skip-detalles

# Actualizar detalles existentes (detectar cambios)
python -m etl.main --solo-actualizar-detalles --limit 100

# Fecha específica
python -m etl.main --fecha-desde 2024-11-15 --fecha-hasta 2024-11-15

# Ver todas las opciones
python -m etl.main --help
```

**Nota**: Siempre ejecuta desde la raíz del proyecto o usa `./run_etl.sh`

---

## ⚙️ Primera Vez? Sigue Estos Pasos

### 1. Verifica tu configuración

```bash
python validar_etl.py
```

Debe mostrar ✅ en todas las validaciones.

### 2. Verifica tu `.env`

El archivo `.env` debe estar en la raíz del proyecto con:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/licitaciones
MERCADO_PUBLICO_TICKET=tu_ticket_aqui
```

### 3. Asegúrate que PostgreSQL esté corriendo

```bash
# Mac
brew services list | grep postgres

# O prueba conectarte
psql -h localhost -U postgres -d licitaciones
```

### 4. Ejecuta el ETL

```bash
# Opción A: Script wrapper
./run_etl.sh --full-pipeline

# Opción B: Como módulo
python -m etl.main --full-pipeline
```

---

## 📚 Documentación Completa

- **[Guía de Ejecución Completa](etl/GUIA_EJECUCION.md)** - Todos los comandos y casos de uso
- **[README del ETL](etl/README.md)** - Descripción general del sistema
- **[Arquitectura V2](etl/README_V2.md)** - Detalles técnicos

---

## ❓ Preguntas Frecuentes

### ¿Es seguro ejecutar el ETL varias veces al día?
**Sí.** El sistema usa UPSERT, no creará duplicados.

### ¿Cuánto tarda?
- Solo datos diarios: 2-5 minutos
- Datos + detalles nuevos: 10-30 minutos
- Actualizar 100 detalles: 15-20 minutos

### ¿Qué hace `--full-pipeline`?
1. Extrae licitaciones y órdenes del día
2. Extrae detalles de registros nuevos (sin detalles previos)

### ¿Qué hace `--skip-detalles`?
Solo extrae datos básicos del día, sin información detallada. Es más rápido.

### ¿Cómo actualizo registros existentes?
```bash
python etl/main.py --solo-actualizar-detalles --limit 100
```
Esto compara con la API y registra cambios en `_historial`.

---

## 🆘 Problemas Comunes

| Error | Solución |
|-------|----------|
| `No module named 'etl'` | Usa: `python -m etl.main` o `./run_etl.sh` |
| `Connection refused` | PostgreSQL no está corriendo: `brew services start postgresql` |
| `Invalid ticket` | Verifica `MERCADO_PUBLICO_TICKET` en `.env` |

---

## 📊 Ver Resultados

```sql
-- Conectarse a la BD
psql -h localhost -U postgres -d licitaciones

-- Ver totales
SELECT 
    (SELECT COUNT(*) FROM licitaciones) as total_licitaciones,
    (SELECT COUNT(*) FROM ordenes_compra) as total_ordenes,
    (SELECT COUNT(*) FROM licitaciones_detalle) as licitaciones_con_detalle,
    (SELECT COUNT(*) FROM ordenes_compra_detalle) as ordenes_con_detalle;

-- Ver registros de hoy
SELECT codigo_externo, nombre, fecha_publicacion 
FROM licitaciones 
WHERE fecha_publicacion::date = CURRENT_DATE
ORDER BY fecha_publicacion DESC
LIMIT 10;

-- Ver cambios recientes
SELECT * FROM licitaciones_historial 
WHERE fecha_cambio > NOW() - INTERVAL '24 hours'
ORDER BY fecha_cambio DESC
LIMIT 10;
```

---

## 🔄 Programar Ejecución Automática

### Cron (recomendado)

```bash
# Editar crontab
crontab -e

# Agregar para ejecutar diariamente a las 6 AM
0 6 * * * cd /ruta/completa/al/proyecto && python etl/main.py --full-pipeline >> /var/log/etl_licitaciones.log 2>&1
```

### Script manual

```bash
#!/bin/bash
# Guardar como run_etl_daily.sh

cd /Users/crismiddleton/Documents/saas_licitaciones
source .env  # Si usas virtual environment
python etl/main.py --full-pipeline
```

---

## 🎯 Uso Recomendado

### Diario (6 AM)
```bash
python -m etl.main --full-pipeline
```
Extrae datos del día + detalles de registros nuevos.

### Semanal (Domingo 8 AM)
```bash
python -m etl.main --solo-actualizar-detalles --limit 500
```
Actualiza los 500 registros más antiguos para detectar cambios.

### Mensual (Primer día del mes)
```bash
python -m etl.main --solo-actualizar-detalles
```
Actualiza TODOS los registros (puede tardar horas/días).

---

**¿Necesitas más ayuda?** Consulta la [Guía Completa](etl/GUIA_EJECUCION.md)

