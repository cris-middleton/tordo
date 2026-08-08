> 🟡 **Histórico (2026-04).** Los comandos vigentes están en `CLAUDE.md` y en
> `make help`; algunos de aquí ya no existen. Ver [`README.md`](README.md).

# 📝 Comandos ETL - Referencia Rápida

## ⚡ Comando Más Común (Pipeline Completo)

```bash
# Sin flags = pipeline completo por defecto
python -m etl.main

# O con el script wrapper
./run_etl.sh
```

**Qué hace**:
1. ✅ Extrae licitaciones del día actual
2. ✅ Extrae órdenes de compra del día actual
3. ✅ Extrae detalles de registros nuevos (sin detalles previos)
4. ⏱️ Duración: 10-30 minutos

---

## 📋 Todos los Comandos Disponibles

### 1. Pipeline Completo (Default)

```bash
# Todo: datos del día + detalles de registros nuevos
python -m etl.main

# Con fechas específicas
python -m etl.main --fecha-desde 2024-11-01 --fecha-hasta 2024-11-15

# Solo licitaciones (skip órdenes)
python -m etl.main --skip-ordenes

# Solo órdenes (skip licitaciones)
python -m etl.main --skip-licitaciones
```

### 2. Pipeline Sin Detalles (Solo Datos Básicos)

```bash
# Extrae solo datos básicos del día, sin detalles
python -m etl.main --skip-detalles-nuevos

# Rápido: 2-5 minutos
```

### 3. Solo Extraer Detalles de Registros Nuevos

```bash
# Modo standalone: solo detalles de registros sin detalles previos
python -m etl.main --only-extraer-nuevos

# Con límite (primeros 50)
python -m etl.main --only-extraer-nuevos --detalles-limit 50

# Solo licitaciones nuevas
python -m etl.main --only-extraer-nuevos --skip-ordenes
```

### 4. Solo Actualizar Detalles Existentes (Detectar Cambios)

```bash
# Modo standalone: solo actualiza detalles existentes
python -m etl.main --only-actualizar

# Con límite (primeros 100)
python -m etl.main --only-actualizar --detalles-limit 100

# Solo registros activos (excluye cerrados/finalizados)
python -m etl.main --only-actualizar --solo-activos

# Cambiar umbral de días (default: 7 días)
python -m etl.main --only-actualizar --dias-sin-actualizar 30
```

### 5. Pipeline Completo + Actualizar Detalles

```bash
# Hace TODO: extrae del día + detalles nuevos + actualiza existentes
python -m etl.main --actualizar-detalles

# Con límite para las actualizaciones
python -m etl.main --actualizar-detalles --detalles-limit 100
```

---

## 🎯 Casos de Uso Recomendados

### Uso Diario (Cron: 6 AM)

```bash
# Pipeline completo: datos del día + detalles nuevos
python -m etl.main
```

**Qué hace**: Extrae todo lo publicado ayer/hoy y obtiene detalles de registros nuevos.

---

### Uso Semanal (Cron: Domingo 8 AM)

```bash
# Actualizar los 500 registros más antiguos
python -m etl.main --only-actualizar --detalles-limit 500
```

**Qué hace**: Revisa los 500 registros con detalles más antiguos, detecta cambios y los registra en `_historial`.

---

### Recuperación de Históricos

```bash
# Si tienes muchos registros viejos sin detalles
python -m etl.main --only-extraer-nuevos --detalles-limit 100
```

**Qué hace**: Extrae detalles de los primeros 100 registros que no tienen información detallada.

**Repetir**: Ejecuta varias veces hasta que todos tengan detalles.

---

### Fecha Específica (Backfill)

```bash
# Extraer datos de una fecha pasada
python -m etl.main --fecha-desde 2024-10-01 --fecha-hasta 2024-10-31

# Luego extraer sus detalles
python -m etl.main --only-extraer-nuevos --detalles-limit 1000
```

---

## 🔧 Combinaciones Útiles

```bash
# Solo licitaciones del mes de octubre
python -m etl.main --fecha-desde 2024-10-01 --fecha-hasta 2024-10-31 --skip-ordenes

# Solo órdenes de hoy, sin detalles (rápido)
python -m etl.main --skip-licitaciones --skip-detalles-nuevos

# Actualizar solo licitaciones activas
python -m etl.main --only-actualizar --skip-ordenes --solo-activos --detalles-limit 200

# Pipeline completo pero skip órdenes
python -m etl.main --skip-ordenes
```

---

## 📊 Ver Opciones Disponibles

```bash
python -m etl.main --help
```

---

## 🆘 Solución de Problemas

### Error: `ModuleNotFoundError: No module named 'etl'`

**Solución**: Ejecuta como módulo de Python:

```bash
# INCORRECTO ❌
python etl/main.py

# CORRECTO ✅
python -m etl.main

# O usa el wrapper ✅
./run_etl.sh
```

### Ver Logs en Tiempo Real

```bash
# En otra terminal, mientras corre el ETL
tail -f etl/etl.log
```

### Ver Solo Errores

```bash
grep ERROR etl/etl.log | tail -20
```

---

## 🎮 Cheatsheet

| Acción | Comando |
|--------|---------|
| **Diario** | `python -m etl.main` |
| **Rápido (sin detalles)** | `python -m etl.main --skip-detalles-nuevos` |
| **Solo detalles nuevos** | `python -m etl.main --only-extraer-nuevos --detalles-limit 50` |
| **Actualizar existentes** | `python -m etl.main --only-actualizar --detalles-limit 100` |
| **Fecha específica** | `python -m etl.main --fecha-desde 2024-11-15 --fecha-hasta 2024-11-15` |
| **Solo licitaciones** | `python -m etl.main --skip-ordenes` |
| **Solo órdenes** | `python -m etl.main --skip-licitaciones` |
| **Ver ayuda** | `python -m etl.main --help` |

---

## 📌 Importante

1. **Siempre ejecuta desde la raíz del proyecto**:
   ```bash
   cd /Users/crismiddleton/Documents/saas_licitaciones
   python -m etl.main
   ```

2. **O usa el script wrapper** (funciona desde cualquier lugar):
   ```bash
   ./run_etl.sh
   ```

3. **No uses** `python etl/main.py` ❌ (da error de módulo)

4. **Usa** `python -m etl.main` ✅ (correcto)
