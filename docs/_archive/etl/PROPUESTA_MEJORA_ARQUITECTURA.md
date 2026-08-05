# Propuesta de Mejora de Arquitectura

## Problemas Identificados

### 1. ❌ Información Detallada en la Misma Tabla
**Problema**: Guardar todo en campo JSON `informacion_adicional` no es óptimo
- Datos duplicados
- Difícil hacer queries
- No hay normalización
- Difícil extraer métricas

### 2. ❌ ETLs Concatenados Sin Lógica de Actualización
**Problema**: Solo se descargan detalles una vez, no hay re-procesamiento
- Las órdenes cambian de estado (Activa → Cerrada)
- Las licitaciones pasan por etapas
- Se agregan documentos, ofertas, etc.
- **NO HAY FORMA DE DETECTAR CAMBIOS**

### 3. ❌ No Hay Historial de Cambios
**Problema**: Si una orden cambia de estado, se pierde el historial
- No sabemos cuándo cambió
- No sabemos qué valor tenía antes
- No podemos hacer análisis temporal

## Solución Propuesta

### Arquitectura de 3 Capas

```
┌─────────────────────────────────────────────────────────────┐
│ CAPA 1: Datos Básicos (Snapshot diario)                    │
│ - licitaciones (info básica del listado diario)            │
│ - ordenes_compra (info básica del listado diario)          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ CAPA 2: Datos Detallados (Info completa, actualizable)     │
│ - licitaciones_detalle (info detallada de cada licitación) │
│ - ordenes_compra_detalle (info detallada de cada orden)    │
│ + fecha_ultima_actualizacion                                │
│ + hash_contenido (para detectar cambios)                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ CAPA 3: Historial de Cambios (Log de todo cambio)          │
│ - licitaciones_historial                                    │
│ - ordenes_compra_historial                                  │
│ + campo_modificado                                          │
│ + valor_anterior                                            │
│ + valor_nuevo                                               │
│ + fecha_cambio                                              │
└─────────────────────────────────────────────────────────────┘
```

### Estructura de Tablas Propuesta

#### 1. Tabla: `licitaciones` (Mantener como está)
```sql
-- Info básica del listado diario
- id
- codigo_externo (PK business)
- nombre
- fecha_publicacion
- monto_estimado
- estado
- ... (campos básicos existentes)
```

#### 2. Tabla: `licitaciones_detalle` (NUEVA)
```sql
-- Info detallada que se actualiza periódicamente
CREATE TABLE licitaciones_detalle (
    id SERIAL PRIMARY KEY,
    licitacion_id INTEGER REFERENCES licitaciones(id),
    codigo_externo VARCHAR(100) UNIQUE NOT NULL,
    
    -- Metadata de actualización
    fecha_primera_extraccion TIMESTAMP,
    fecha_ultima_actualizacion TIMESTAMP,
    numero_actualizaciones INTEGER DEFAULT 1,
    hash_contenido VARCHAR(64),  -- Para detectar cambios
    
    -- Información detallada (JSON)
    datos_completos JSONB,  -- Respuesta completa de la API
    
    -- Campos específicos extraídos del JSON (para queries rápidas)
    items JSONB,
    documentos JSONB,
    participantes JSONB,
    etapas JSONB,
    
    -- Estados y fechas específicas
    estado_actual VARCHAR(50),
    fecha_cierre_real TIMESTAMP,
    fecha_adjudicacion TIMESTAMP,
    
    CONSTRAINT unique_licitacion UNIQUE(licitacion_id)
);

-- Índices para búsquedas
CREATE INDEX idx_licitaciones_detalle_codigo ON licitaciones_detalle(codigo_externo);
CREATE INDEX idx_licitaciones_detalle_actualizacion ON licitaciones_detalle(fecha_ultima_actualizacion);
CREATE INDEX idx_licitaciones_detalle_hash ON licitaciones_detalle(hash_contenido);
```

#### 3. Tabla: `ordenes_compra_detalle` (NUEVA)
```sql
CREATE TABLE ordenes_compra_detalle (
    id SERIAL PRIMARY KEY,
    orden_compra_id INTEGER REFERENCES ordenes_compra(id),
    codigo_oc VARCHAR(100) UNIQUE NOT NULL,
    
    -- Metadata de actualización
    fecha_primera_extraccion TIMESTAMP,
    fecha_ultima_actualizacion TIMESTAMP,
    numero_actualizaciones INTEGER DEFAULT 1,
    hash_contenido VARCHAR(64),
    
    -- Información detallada
    datos_completos JSONB,
    
    -- Campos específicos
    items JSONB,
    documentos JSONB,
    comprador_detalle JSONB,
    proveedor_detalle JSONB,
    
    -- Estados
    estado_actual VARCHAR(50),
    estado_proveedor VARCHAR(50),
    fecha_aceptacion_real TIMESTAMP,
    fecha_entrega_real TIMESTAMP,
    
    CONSTRAINT unique_orden_compra UNIQUE(orden_compra_id)
);
```

#### 4. Tabla: `licitaciones_historial` (NUEVA)
```sql
CREATE TABLE licitaciones_historial (
    id SERIAL PRIMARY KEY,
    licitacion_id INTEGER REFERENCES licitaciones(id),
    codigo_externo VARCHAR(100),
    
    -- Tipo de cambio
    tipo_cambio VARCHAR(50),  -- 'estado', 'monto', 'fecha', 'documento_nuevo', etc.
    campo_modificado VARCHAR(100),
    
    -- Valores
    valor_anterior TEXT,
    valor_nuevo TEXT,
    
    -- Metadata
    fecha_cambio TIMESTAMP DEFAULT NOW(),
    fecha_deteccion TIMESTAMP DEFAULT NOW(),
    
    -- JSON completo en ese momento (opcional, para auditoría)
    snapshot_completo JSONB
);

CREATE INDEX idx_licitaciones_historial_licitacion ON licitaciones_historial(licitacion_id);
CREATE INDEX idx_licitaciones_historial_fecha ON licitaciones_historial(fecha_cambio);
CREATE INDEX idx_licitaciones_historial_tipo ON licitaciones_historial(tipo_cambio);
```

#### 5. Tabla: `ordenes_compra_historial` (NUEVA)
```sql
CREATE TABLE ordenes_compra_historial (
    id SERIAL PRIMARY KEY,
    orden_compra_id INTEGER REFERENCES ordenes_compra(id),
    codigo_oc VARCHAR(100),
    
    tipo_cambio VARCHAR(50),
    campo_modificado VARCHAR(100),
    valor_anterior TEXT,
    valor_nuevo TEXT,
    
    fecha_cambio TIMESTAMP DEFAULT NOW(),
    fecha_deteccion TIMESTAMP DEFAULT NOW(),
    snapshot_completo JSONB
);
```

### Lógica de ETL Mejorada

#### ETL 1: Descarga Diaria (Mantener)
```python
# Funciona como ahora
# Descarga licitaciones/órdenes publicadas en el día
# Guarda en tablas básicas: licitaciones, ordenes_compra
```

#### ETL 2: Primera Descarga de Detalles (Modificar)
```python
def extract_detalles_nuevos():
    """
    Para registros SIN entrada en tabla_detalle
    """
    # 1. Buscar registros sin detalle
    registros_sin_detalle = query_registros_sin_detalle()
    
    # 2. Extraer detalles
    for registro in registros_sin_detalle:
        detalle = extract_detalle_api(registro.codigo)
        hash_contenido = calcular_hash(detalle)
        
        # 3. Guardar en tabla_detalle
        guardar_detalle_inicial(
            registro_id=registro.id,
            datos=detalle,
            hash=hash_contenido
        )
```

#### ETL 3: Actualización de Detalles (NUEVO)
```python
def actualizar_detalles_existentes():
    """
    Para registros que YA TIENEN detalles
    Detecta cambios y registra en historial
    """
    # 1. Buscar registros que necesitan actualización
    # Criterios:
    # - No actualizados en X días
    # - Estado no final (ej: "Cerrada", "Adjudicada")
    # - Priorizar recientes
    
    registros_a_actualizar = query_registros_para_actualizar(
        dias_sin_actualizar=7,
        excluir_estados_finales=['Cerrada', 'Desierta', 'Adjudicada']
    )
    
    # 2. Para cada registro
    for detalle_actual in registros_a_actualizar:
        # Extraer nueva información de la API
        detalle_nuevo = extract_detalle_api(detalle_actual.codigo)
        hash_nuevo = calcular_hash(detalle_nuevo)
        
        # 3. ¿Hay cambios?
        if hash_nuevo != detalle_actual.hash_contenido:
            # 4. Detectar QUÉ cambió
            cambios = detectar_cambios(detalle_actual.datos_completos, detalle_nuevo)
            
            # 5. Registrar cada cambio en historial
            for cambio in cambios:
                registrar_historial(
                    registro_id=detalle_actual.licitacion_id,
                    tipo_cambio=cambio.tipo,
                    campo=cambio.campo,
                    valor_anterior=cambio.valor_old,
                    valor_nuevo=cambio.valor_new
                )
            
            # 6. Actualizar tabla_detalle
            actualizar_detalle(
                detalle_id=detalle_actual.id,
                datos_nuevos=detalle_nuevo,
                hash_nuevo=hash_nuevo,
                numero_actualizaciones=detalle_actual.numero_actualizaciones + 1
            )
```

### Estrategia de Actualización

#### Frecuencias Sugeridas

**ETL 1 - Diario**: Descarga nuevos registros
```bash
# Cron: Todos los días a las 6 AM
0 6 * * * python -m etl.main --fecha-desde today
```

**ETL 2 - Varias veces al día**: Primera descarga de detalles
```bash
# Cron: Cada 4 horas, procesar máximo 500 nuevos
0 */4 * * * python -m etl.main --only-detalles --nuevos-solamente --limit 500
```

**ETL 3 - Diario**: Actualizar detalles existentes
```bash
# Cron: Todos los días a las 10 PM
0 22 * * * python -m etl.main --actualizar-detalles --limit 1000
```

#### Priorización de Actualizaciones

```python
def priorizar_actualizaciones():
    """
    Orden de prioridad para actualizar:
    1. Licitaciones en proceso de cierre (próximas 7 días)
    2. Órdenes en estado "Aceptada" (esperando entrega)
    3. Registros no actualizados en > 30 días
    4. Registros con alta actividad (muchos participantes)
    5. Resto
    """
    pass
```

### Beneficios de Esta Arquitectura

#### ✅ Separación de Responsabilidades
- Tabla básica: snapshot diario
- Tabla detalle: información completa actualizable
- Tabla historial: log de todos los cambios

#### ✅ Historial Completo
- Sabemos cuándo cambió cada campo
- Podemos reconstruir el estado en cualquier momento
- Análisis temporal y tendencias

#### ✅ Optimización de Queries
- Campos específicos extraídos del JSON
- Índices apropiados
- No necesitas parsear JSON para queries comunes

#### ✅ Detección de Cambios
- Hash del contenido
- Comparación automática
- Solo guardamos si hay cambios reales

#### ✅ Escalabilidad
- Actualización incremental
- Priorización inteligente
- No re-procesas todo cada vez

### Comandos CLI Propuestos

```bash
# Descarga diaria (como ahora)
python -m etl.main --fecha-desde 2024-11-01

# Extraer detalles de registros NUEVOS (sin entrada en tabla_detalle)
python -m etl.main --extraer-detalles-nuevos --limit 500

# Actualizar detalles EXISTENTES (buscar cambios)
python -m etl.main --actualizar-detalles --limit 1000

# Actualizar solo registros activos (no finalizados)
python -m etl.main --actualizar-detalles --solo-activos

# Forzar actualización de un código específico
python -m etl.main --actualizar-codigo 1234-56-LE20

# Ver historial de cambios de un registro
python -m etl.main --ver-historial --codigo 1234-56-LE20
```

### Migración Desde Implementación Actual

#### Paso 1: Crear Nuevas Tablas
```bash
# Crear migration en Alembic
alembic revision -m "add_detalle_and_historial_tables"
```

#### Paso 2: Migrar Datos Existentes
```python
# Script de migración
def migrar_datos_existentes():
    # Para cada registro con informacion_adicional
    for registro in query_con_info_adicional():
        # Crear entrada en tabla_detalle
        crear_detalle_desde_json(
            registro_id=registro.id,
            datos=registro.informacion_adicional
        )
```

#### Paso 3: Actualizar Código ETL
- Modificar extractores para usar nuevas tablas
- Agregar lógica de detección de cambios
- Implementar registro de historial

#### Paso 4: Deprecar Campo Antiguo
```sql
-- Después de verificar que todo funciona
ALTER TABLE licitaciones DROP COLUMN informacion_adicional;
ALTER TABLE ordenes_compra DROP COLUMN informacion_adicional;
```

## Resumen de Cambios Necesarios

### 🔴 Crítico
1. ✅ Crear tablas separadas para detalles
2. ✅ Crear tablas de historial
3. ✅ Implementar detección de cambios
4. ✅ Agregar campo hash_contenido

### 🟡 Importante
5. ✅ Lógica de actualización periódica
6. ✅ Estrategia de priorización
7. ✅ Comandos CLI para actualización

### 🟢 Mejoras Adicionales
8. ⚪ Dashboard de cambios detectados
9. ⚪ Alertas cuando cambia estado crítico
10. ⚪ API para consultar historial

## ¿Implementamos estas mejoras?

Esta arquitectura resuelve los 3 problemas identificados:
1. ✅ Info detallada en tablas separadas
2. ✅ ETL independiente para actualizaciones
3. ✅ Historial completo de cambios

¿Quieres que implemente estas mejoras ahora?

