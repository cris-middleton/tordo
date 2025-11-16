# ETL Pipeline V2 for Mercado Público

> 🚀 **ETL de última generación** con arquitectura mejorada, detección de cambios y sistema de historial.

ETL pipeline para extraer, transformar y cargar datos de las APIs de Mercado Público (Licitaciones y Órdenes de Compra) hacia PostgreSQL con soporte completo para información detallada y seguimiento de cambios.

## 📋 Inicio Rápido

**¿Primera vez? Lee esto:**

```bash
# 1. Valida tu entorno
python validar_etl.py

# 2. Ejecuta el pipeline completo (recomendado)
python -m etl.main

# 3. Ve a COMANDOS_ETL.md para más opciones
```

👉 **[VER GUÍA COMPLETA DE EJECUCIÓN](GUIA_EJECUCION.md)** ← Instrucciones detalladas aquí

---

## ✨ Características V2

- ✅ **Extracción diaria** de licitaciones y órdenes de compra
- ✅ **Información detallada** en tablas dedicadas (`_detalle`)
- ✅ **Detección automática de cambios** con hashing SHA256
- ✅ **Registro de historial** completo en tablas `_historial`
- ✅ **UPSERT inteligente** - no genera duplicados
- ✅ **Context managers** para gestión segura de conexiones
- ✅ **Priorización de actualizaciones** según estado y antigüedad

---

## 🏗️ Arquitectura

### Tablas Base (Snapshot Diario)
- `licitaciones` - Datos básicos de licitaciones publicadas
- `ordenes_compra` - Datos básicos de órdenes de compra

### Tablas Detalle (Información Completa)
- `licitaciones_detalle` - Detalles completos de cada licitación
- `ordenes_compra_detalle` - Detalles completos de cada orden

### Tablas Historial (Auditoría de Cambios)
- `licitaciones_historial` - Log de todos los cambios detectados
- `ordenes_compra_historial` - Log de cambios en órdenes

---

## 🚀 Comandos Esenciales

### Uso Diario (Recomendado)
```bash
# Pipeline completo: datos del día + detalles de registros nuevos
python -m etl.main

# O con el wrapper
./run_etl.sh
```

### Solo Datos Básicos del Día
```bash
# Ambos tipos (rápido: ~2-5 min)
python -m etl.main --skip-detalles-nuevos

# Solo licitaciones
python -m etl.main --skip-ordenes

# Solo órdenes
python -m etl.main --skip-licitaciones
```

### Extraer Detalles
```bash
# Detalles de registros nuevos (sin detalles previos)
python -m etl.main --only-extraer-nuevos --detalles-limit 50

# Actualizar detalles existentes (detecta cambios)
python -m etl.main --only-actualizar --detalles-limit 100
```

### Fechas Específicas
```bash
# Rango de fechas
python -m etl.main --fecha-desde 2024-11-01 --fecha-hasta 2024-11-15

# Un solo día
python -m etl.main --fecha-desde 2024-11-15 --fecha-hasta 2024-11-15
```

---

## ⚙️ Configuración

Crea un archivo `.env` en la raíz del proyecto:

```bash
# Base de datos
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/licitaciones

# API Mercado Público
MERCADO_PUBLICO_TICKET=tu_ticket_aqui
MERCADO_PUBLICO_URL=https://api.mercadopublico.cl

# ETL Config
ETL_BATCH_SIZE=100
ETL_MAX_RETRIES=3
ETL_RETRY_DELAY=5
LOG_LEVEL=INFO
```

**¿Dónde conseguir el ticket?** https://www.mercadopublico.cl/

---

## ❓ FAQ Rápido

### ¿Puedo ejecutar el ETL varias veces al día?
**Sí, es completamente seguro.** El sistema usa UPSERT, no creará duplicados. Si un registro ya existe, simplemente lo actualiza.

### ¿Cómo sé si algo cambió en una licitación?
Revisa la tabla `licitaciones_historial`:
```sql
SELECT * FROM licitaciones_historial 
WHERE codigo_externo = '1234-56-LQ24' 
ORDER BY fecha_cambio DESC;
```

### ¿Cuánto tarda el ETL?
- **Solo datos diarios**: 2-5 minutos
- **Datos + detalles nuevos**: 10-30 minutos
- **Actualizar detalles (100 registros)**: 15-20 minutos

### ¿Qué diferencia hay entre extraer y actualizar detalles?
- **Extraer detalles nuevos**: Solo registros SIN información detallada previa
- **Actualizar detalles**: Registros CON detalles, para detectar cambios

---

## 📚 Documentación Completa

- 📖 **[Guía de Ejecución Completa](GUIA_EJECUCION.md)** - Todos los comandos y casos de uso
- 🏗️ **[Arquitectura V2](README_V2.md)** - Detalles técnicos de implementación
- 🔄 **[Migración V1→V2](scripts/migrate_to_v2.py)** - Script de migración con `--help`
- 🔍 **[Revisión de Código](REVISION_CODIGO.md)** - Decisiones de diseño

---

## 🛠️ Instalación y Setup

### Requisitos
- Python 3.8+
- PostgreSQL 12+
- Ticket válido de Mercado Público

### Instalación
```bash
# 1. Instalar dependencias
pip install -r requirements.txt

# 2. Aplicar migraciones de BD
cd ../backend
alembic upgrade head

# 3. Validar entorno
cd ..
python validar_etl.py

# 4. Ejecutar ETL
python etl/main.py --full-pipeline
```

---

## 🚨 Migración desde V1

Si tienes datos del ETL v1 (con `informacion_adicional` en JSON):

```bash
# 1. Dry-run para ver qué se migrará
python etl/scripts/migrate_to_v2.py --dry-run

# 2. Ejecutar migración real
python etl/scripts/migrate_to_v2.py

# 3. Verificar resultados
python etl/scripts/migrate_to_v2.py --verify
```

---

## 📊 Monitoreo

### Ver logs
```bash
tail -f etl/etl.log

# Ver solo errores
grep ERROR etl/etl.log | tail -20
```

### SQL útiles
```sql
-- Registros sin detalles
SELECT COUNT(*) FROM licitaciones l 
LEFT JOIN licitaciones_detalle ld ON l.id = ld.licitacion_id 
WHERE ld.id IS NULL;

-- Cambios últimas 24h
SELECT COUNT(*) FROM licitaciones_historial 
WHERE fecha_cambio > NOW() - INTERVAL '24 hours';
```

---

## 🔧 Solución de Problemas

| Error | Solución |
|-------|----------|
| `No module named 'etl'` | Usa `python -m etl.main` o `./run_etl.sh` |
| `Connection refused` | Verifica PostgreSQL: `brew services list \| grep postgres` |
| `Invalid ticket` | Verifica tu ticket en `.env` |
| Duplicados | No deberían existir, reporta el bug con logs |

👉 **[Ver todos los comandos](../COMANDOS_ETL.md)**

---

## 🤝 Contribuir

### Estructura del código
```
etl/
├── main.py                 # Entry point principal (V2)
├── config.py              # Configuración
├── extractors/            # Extracción de APIs
├── transformers/          # Transformación de datos
├── loaders/               # Carga a BD
│   ├── database_loader_v2.py  # Loader V2 (usar este)
├── utils/                 # Utilidades (change detection, etc)
└── scripts/               # Scripts auxiliares
```

### Agregar nueva funcionalidad
1. Crea una rama: `git checkout -b feature/mi-feature`
2. Implementa los cambios
3. Prueba: `python etl/main.py --dry-run`
4. Commit y push

---

## 📝 Comandos Más Usados (Cheatsheet)

```bash
# Diario
python -m etl.main

# Solo hoy (rápido)
python -m etl.main --skip-detalles-nuevos

# Actualizar cambios (semanal)
python -m etl.main --only-actualizar --detalles-limit 500

# Fecha específica
python -m etl.main --fecha-desde 2024-11-15 --fecha-hasta 2024-11-15

# Ver ayuda completa
python -m etl.main --help
```

---

## 🎉 ¡Listo para Usar!

Tu ETL V2 está completamente configurado y listo. 

**Siguiente paso**: 
```bash
python -m etl.main
```

¿Problemas? Consulta **[Todos los Comandos](../COMANDOS_ETL.md)** o revisa los logs en `etl/etl.log`.
