# Comparación: Arquitectura Actual vs. Propuesta

## 🔴 Arquitectura Actual (PROBLEMAS)

### Flujo Actual
```
┌──────────────────────────────────────────────────────────┐
│ DÍA 1: Descarga Diaria                                   │
│                                                           │
│ API Listado → ETL → tabla "licitaciones"                │
│                     - codigo_externo: "1234-LE20"        │
│                     - nombre: "Compra de..."             │
│                     - estado: "Publicada"                │
│                     - informacion_adicional: NULL        │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ DÍA 1: Descarga de Detalles (concatenado)               │
│                                                           │
│ API Detalle → ETL → ACTUALIZA "licitaciones"            │
│                     - codigo_externo: "1234-LE20"        │
│                     - nombre: "Compra de..."             │
│                     - estado: "Publicada"                │
│                     - informacion_adicional: {...}  ✅   │
└──────────────────────────────────────────────────────────┘

❌ PROBLEMA: ¿Qué pasa después?

┌──────────────────────────────────────────────────────────┐
│ DÍA 7: Estado cambia en Mercado Público                 │
│                                                           │
│ La licitación ahora está "En Evaluación"                │
│ Se agregaron 3 nuevas ofertas                            │
│ Se subió un nuevo documento                              │
│                                                           │
│ Pero en nuestra BD:                                      │
│ ❌ Sigue mostrando "Publicada"                           │
│ ❌ No tiene las nuevas ofertas                           │
│ ❌ No tiene el nuevo documento                           │
│ ❌ NO HAY FORMA DE SABERLO                               │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ DÍA 30: Estado cambia a "Adjudicada"                    │
│                                                           │
│ ❌ Nunca nos enteramos                                   │
│ ❌ No sabemos CUÁNDO se adjudicó                         │
│ ❌ No sabemos a QUIÉN se adjudicó                        │
│ ❌ Perdimos toda esa información                         │
└──────────────────────────────────────────────────────────┘
```

### Tabla Actual: `licitaciones`
```
id | codigo_externo | nombre       | estado      | informacion_adicional
---+----------------+--------------+-------------+----------------------
1  | 1234-LE20      | Compra de... | Publicada   | {...todo el JSON...}
                                    ↑
                              NUNCA SE ACTUALIZA
                              Queda congelado en el tiempo
```

## ✅ Arquitectura Propuesta (SOLUCIÓN)

### Flujo Propuesto

```
┌──────────────────────────────────────────────────────────┐
│ DÍA 1: Descarga Diaria (igual que ahora)                │
│                                                           │
│ API Listado → ETL → tabla "licitaciones"                │
│                     - codigo_externo: "1234-LE20"        │
│                     - nombre: "Compra de..."             │
│                     - estado: "Publicada"                │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ DÍA 1: Descarga de Detalles (nuevo flujo)               │
│                                                           │
│ API Detalle → ETL → tabla "licitaciones_detalle" ✨     │
│                     - licitacion_id: 1                   │
│                     - datos_completos: {...}             │
│                     - estado_actual: "Publicada"         │
│                     - hash_contenido: "abc123"           │
│                     - fecha_actualizacion: 2024-11-01    │
│                     - numero_actualizaciones: 1          │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ DÍA 7: ETL de Actualización (NUEVO) 🔄                  │
│                                                           │
│ 1. Buscar registros no actualizados en 7 días           │
│ 2. Extraer nueva información de la API                   │
│ 3. Calcular hash: "xyz789" ≠ "abc123" → ¡HAY CAMBIOS!  │
│ 4. Detectar qué cambió:                                  │
│    - estado: "Publicada" → "En Evaluación"              │
│    - ofertas: 0 → 3                                      │
│    - documentos: 5 → 6                                   │
│                                                           │
│ 5. Registrar en "licitaciones_historial":               │
│    ┌─────────────────────────────────────────────────┐  │
│    │ fecha_cambio: 2024-11-07                       │  │
│    │ tipo_cambio: "estado"                          │  │
│    │ campo: "estado"                                │  │
│    │ valor_anterior: "Publicada"                    │  │
│    │ valor_nuevo: "En Evaluación"                   │  │
│    └─────────────────────────────────────────────────┘  │
│    ┌─────────────────────────────────────────────────┐  │
│    │ fecha_cambio: 2024-11-07                       │  │
│    │ tipo_cambio: "oferta_nueva"                    │  │
│    │ valor_nuevo: "3 nuevas ofertas"                │  │
│    └─────────────────────────────────────────────────┘  │
│                                                           │
│ 6. Actualizar "licitaciones_detalle":                   │
│    - datos_completos: {...nuevo...}                     │
│    - estado_actual: "En Evaluación"                     │
│    - hash_contenido: "xyz789"                           │
│    - fecha_actualizacion: 2024-11-07                    │
│    - numero_actualizaciones: 2                          │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ DÍA 30: ETL de Actualización (NUEVO) 🔄                 │
│                                                           │
│ 1. Detecta nuevo hash → ¡HAY CAMBIOS!                   │
│ 2. Cambios detectados:                                   │
│    - estado: "En Evaluación" → "Adjudicada"             │
│    - proveedor_adjudicado: NULL → "RUT 12345678-9"      │
│    - fecha_adjudicacion: NULL → "2024-11-30"            │
│                                                           │
│ 3. Registrar en historial (3 entradas)                  │
│ 4. Actualizar tabla detalle                             │
│ 5. ✅ AHORA SABEMOS TODO LO QUE PASÓ                    │
└──────────────────────────────────────────────────────────┘
```

### Estructura de Tablas Propuesta

#### Tabla 1: `licitaciones` (básica)
```
id | codigo_externo | nombre       | estado_inicial | fecha_publicacion
---+----------------+--------------+----------------+-------------------
1  | 1234-LE20      | Compra de... | Publicada      | 2024-11-01
   └── Info básica del listado diario (NO cambia)
```

#### Tabla 2: `licitaciones_detalle` (actualizable)
```
id | licitacion_id | estado_actual   | hash      | fecha_actualizacion | num_actualizaciones
---+---------------+-----------------+-----------+---------------------+--------------------
1  | 1            | Publicada       | abc123    | 2024-11-01 10:00    | 1
   └── Primera descarga de detalles

Luego de 7 días:
1  | 1            | En Evaluación   | xyz789    | 2024-11-07 22:00    | 2
   └── Actualizado: detectó cambio de estado + nuevas ofertas

Luego de 30 días:
1  | 1            | Adjudicada      | def456    | 2024-11-30 22:00    | 3
   └── Actualizado: detectó adjudicación
```

#### Tabla 3: `licitaciones_historial` (log completo)
```
id | licitacion_id | tipo_cambio | campo    | valor_anterior  | valor_nuevo      | fecha_cambio
---+---------------+-------------+----------+-----------------+------------------+-------------
1  | 1            | estado      | estado   | Publicada       | En Evaluación    | 2024-11-07
2  | 1            | oferta      | ofertas  | []              | [oferta1,...]    | 2024-11-07
3  | 1            | documento   | docs     | [5 docs]        | [6 docs]         | 2024-11-07
4  | 1            | estado      | estado   | En Evaluación   | Adjudicada       | 2024-11-30
5  | 1            | adjudicacion| ganador  | NULL            | RUT 12345678-9   | 2024-11-30
   └── REGISTRO COMPLETO DE TODO LO QUE PASÓ
```

## Comparación Lado a Lado

### Pregunta 1: ¿Dónde guardar info detallada?

| Aspecto | Actual (❌) | Propuesta (✅) |
|---------|-------------|----------------|
| **Ubicación** | Misma tabla básica | Tabla separada `_detalle` |
| **Problema** | Mezcla info básica + detallada | Clara separación |
| **Duplicación** | Alta | Ninguna |
| **Queries** | Parsear JSON | Campos indexados |
| **Normalización** | ❌ No | ✅ Sí |

### Pregunta 2: ¿ETLs concatenados?

| Aspecto | Actual (❌) | Propuesta (✅) |
|---------|-------------|----------------|
| **ETL Diario** | Listado + Detalles juntos | Solo listado |
| **ETL Detalles** | Una vez, nunca más | Múltiples veces |
| **Separación** | ❌ Acoplados | ✅ Independientes |
| **Flexibilidad** | Baja | Alta |
| **Mantenimiento** | Difícil | Fácil |

**Flujo Actual:**
```
ETL Diario → Descarga Detalles → FIN
                                  └── Nunca más se toca
```

**Flujo Propuesto:**
```
ETL 1: Diario → Nuevos registros básicos
ETL 2: Detalles Nuevos → Primera descarga (varias veces al día)
ETL 3: Actualización → Re-descarga y detecta cambios (diario)
```

### Pregunta 3: ¿Cómo detectar cambios de estado?

| Aspecto | Actual (❌) | Propuesta (✅) |
|---------|-------------|----------------|
| **Detección** | ❌ No hay | ✅ Hash comparison |
| **Re-descarga** | ❌ No | ✅ Periódica |
| **Historial** | ❌ Se pierde | ✅ Tabla completa |
| **Timeline** | ❌ No existe | ✅ Reconstruible |
| **Análisis** | ❌ Imposible | ✅ Completo |

**Escenario Real:**

```
Orden de Compra #12345

┌─────────────────────────────────────────────────────────┐
│ ACTUAL (❌): Solo vemos el snapshot inicial             │
│                                                          │
│ Estado: "Aceptada" (del día 1)                         │
│ ¿Cuándo se aceptó? No sabemos                          │
│ ¿Ya se entregó? No sabemos                             │
│ ¿Cambió algo? No sabemos                               │
│                                                          │
│ = INFORMACIÓN DESACTUALIZADA Y SIN CONTEXTO            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ PROPUESTA (✅): Vemos toda la historia                  │
│                                                          │
│ Nov 1:  "Emitida"                                       │
│ Nov 2:  "Aceptada" ← Proveedor aceptó                  │
│ Nov 10: "En Tránsito" ← Producto despachado            │
│ Nov 15: "Entregada" ← Producto recibido                │
│ Nov 20: "Cerrada" ← Proceso completado                 │
│                                                          │
│ = INFORMACIÓN COMPLETA Y ACTUALIZADA                   │
└─────────────────────────────────────────────────────────┘
```

## Casos de Uso Reales

### Caso 1: Licitación que se Adjudica

**Con arquitectura actual:**
```
Usuario pregunta: "¿Qué licitaciones se adjudicaron esta semana?"
Respuesta: ❌ No lo sabemos, están congeladas en el estado inicial
```

**Con arquitectura propuesta:**
```
SELECT l.codigo_externo, h.valor_nuevo as ganador, h.fecha_cambio
FROM licitaciones l
JOIN licitaciones_historial h ON l.id = h.licitacion_id
WHERE h.tipo_cambio = 'adjudicacion'
  AND h.fecha_cambio >= NOW() - INTERVAL '7 days';

✅ Respuesta completa con fecha exacta y ganador
```

### Caso 2: Órdenes que Cambian de Estado

**Con arquitectura actual:**
```
Usuario: "Muéstrame órdenes que están en tránsito"
Respuesta: ❌ Solo vemos el estado inicial, probablemente desactualizado
```

**Con arquitectura propuesta:**
```
SELECT o.codigo_oc, od.estado_actual, od.fecha_ultima_actualizacion
FROM ordenes_compra o
JOIN ordenes_compra_detalle od ON o.id = od.orden_compra_id
WHERE od.estado_actual = 'En Tránsito';

✅ Estados actualizados y fecha de última verificación
```

### Caso 3: Análisis de Tiempos

**Con arquitectura actual:**
```
Usuario: "¿Cuánto tiempo promedio entre publicación y adjudicación?"
Respuesta: ❌ Imposible, no tenemos fecha de adjudicación
```

**Con arquitectura propuesta:**
```
SELECT 
    AVG(h_adj.fecha_cambio - l.fecha_publicacion) as tiempo_promedio
FROM licitaciones l
JOIN licitaciones_historial h_adj ON l.id = h_adj.licitacion_id
WHERE h_adj.tipo_cambio = 'adjudicacion';

✅ Análisis completo de tiempos del proceso
```

## Respuesta a las 3 Preguntas

### 1. ¿Hace sentido guardar en la misma tabla?

**❌ NO.** Problemas:
- Mezcla datos estáticos (publicación) con dinámicos (estado actual)
- JSON crece y se vuelve difícil de consultar
- No hay separación de responsabilidades

**✅ Solución:** Tablas separadas
- `licitaciones`: Info básica inmutable
- `licitaciones_detalle`: Info detallada actualizable
- `licitaciones_historial`: Log de cambios

### 2. ¿Hace sentido ETLs concatenados?

**❌ NO.** Problemas:
- Si falla uno, afecta al otro
- No hay flexibilidad de horarios
- No hay lógica de actualización

**✅ Solución:** ETLs independientes
- ETL 1: Diario (nuevos registros)
- ETL 2: Detalles nuevos (varias veces/día)
- ETL 3: Actualización (diario, busca cambios)

### 3. ¿Cómo detectar cambios de estado?

**❌ Actual:** No se detectan, datos quedan obsoletos

**✅ Solución:**
- Hash del contenido para detectar cambios
- Re-extracción periódica
- Tabla de historial con todos los cambios
- Logs de: qué cambió, cuándo, valor anterior/nuevo

## Próximos Pasos

¿Quieres que implemente esta arquitectura mejorada?

Incluiría:
1. ✅ Migrations para nuevas tablas
2. ✅ Lógica de detección de cambios
3. ✅ ETL de actualización periódica
4. ✅ Comandos CLI para cada tipo de proceso
5. ✅ Sistema de priorización de actualizaciones

