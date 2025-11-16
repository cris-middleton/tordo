"""
Utilities for detecting changes between data versions
"""
import hashlib
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone


def now_utc() -> datetime:
    """Get current UTC datetime with timezone awareness"""
    return datetime.now(timezone.utc)


def calcular_hash(data: Dict[str, Any]) -> str:
    """
    Calculate SHA256 hash of data dictionary
    
    Args:
        data: Dictionary to hash
        
    Returns:
        SHA256 hash string
    """
    # Sort keys to ensure consistent hashing
    json_str = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(json_str.encode('utf-8')).hexdigest()


def detectar_cambios(
    datos_anteriores: Dict[str, Any],
    datos_nuevos: Dict[str, Any],
    campos_monitorear: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Detect changes between two versions of data
    
    Args:
        datos_anteriores: Previous data version
        datos_nuevos: New data version
        campos_monitorear: Specific fields to monitor (None = all fields)
        
    Returns:
        List of change dictionaries with format:
        {
            'tipo_cambio': str,
            'campo': str,
            'valor_anterior': Any,
            'valor_nuevo': Any,
            'descripcion': str
        }
    """
    cambios = []
    
    # If no specific fields provided, check all keys in new data
    if campos_monitorear is None:
        campos_monitorear = set(datos_anteriores.keys()) | set(datos_nuevos.keys())
    
    for campo in campos_monitorear:
        valor_anterior = datos_anteriores.get(campo)
        valor_nuevo = datos_nuevos.get(campo)
        
        # Skip if no change
        if valor_anterior == valor_nuevo:
            continue
        
        # Determine change type
        if valor_anterior is None and valor_nuevo is not None:
            tipo_cambio = f"{campo}_agregado"
            descripcion = f"Campo '{campo}' agregado con valor: {valor_nuevo}"
        elif valor_anterior is not None and valor_nuevo is None:
            tipo_cambio = f"{campo}_eliminado"
            descripcion = f"Campo '{campo}' eliminado (valor anterior: {valor_anterior})"
        else:
            tipo_cambio = f"{campo}_modificado"
            descripcion = f"Campo '{campo}' cambió de '{valor_anterior}' a '{valor_nuevo}'"
        
        cambio = {
            'tipo_cambio': tipo_cambio,
            'campo': campo,
            'valor_anterior': str(valor_anterior) if valor_anterior is not None else None,
            'valor_nuevo': str(valor_nuevo) if valor_nuevo is not None else None,
            'descripcion': descripcion
        }
        
        cambios.append(cambio)
    
    return cambios


def detectar_cambios_licitacion(
    datos_anteriores: Dict[str, Any],
    datos_nuevos: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Detect changes specific to licitaciones
    
    Args:
        datos_anteriores: Previous licitacion data
        datos_nuevos: New licitacion data
        
    Returns:
        List of changes with licitacion-specific types
    """
    # Priority fields to monitor for licitaciones
    campos_importantes = [
        'Estado',
        'FechaCierre',
        'FechaAdjudicacion',
        'MontoEstimado',
        'Items',
        'Adjuntos',
        'Participantes',
        'Etapas'
    ]
    
    cambios = detectar_cambios(datos_anteriores, datos_nuevos, campos_importantes)
    
    # Add specific licitacion change types
    for cambio in cambios:
        campo = cambio['campo']
        
        if campo == 'Estado':
            cambio['tipo_cambio'] = 'estado'
            # Add human-readable description for common state transitions
            estado_ant = cambio['valor_anterior']
            estado_nuevo = cambio['valor_nuevo']
            cambio['descripcion'] = f"Estado cambió de '{estado_ant}' a '{estado_nuevo}'"
            
        elif campo == 'FechaAdjudicacion' and cambio['valor_anterior'] is None:
            cambio['tipo_cambio'] = 'adjudicacion'
            cambio['descripcion'] = f"Licitación adjudicada el {cambio['valor_nuevo']}"
            
        elif campo == 'Adjuntos':
            # Check if new documents were added
            adj_ant = datos_anteriores.get('Adjuntos', [])
            adj_nuevo = datos_nuevos.get('Adjuntos', [])
            if isinstance(adj_ant, list) and isinstance(adj_nuevo, list):
                if len(adj_nuevo) > len(adj_ant):
                    cambio['tipo_cambio'] = 'documento_nuevo'
                    cambio['descripcion'] = f"{len(adj_nuevo) - len(adj_ant)} nuevo(s) documento(s) agregado(s)"
                    
        elif campo == 'Participantes':
            # Check if new participants
            part_ant = datos_anteriores.get('Participantes', [])
            part_nuevo = datos_nuevos.get('Participantes', [])
            if isinstance(part_ant, list) and isinstance(part_nuevo, list):
                if len(part_nuevo) > len(part_ant):
                    cambio['tipo_cambio'] = 'participante_nuevo'
                    cambio['descripcion'] = f"{len(part_nuevo) - len(part_ant)} nuevo(s) participante(s)"
    
    return cambios


def detectar_cambios_orden_compra(
    datos_anteriores: Dict[str, Any],
    datos_nuevos: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Detect changes specific to órdenes de compra
    
    Args:
        datos_anteriores: Previous orden de compra data
        datos_nuevos: New orden de compra data
        
    Returns:
        List of changes with orden-specific types
    """
    # Priority fields to monitor for órdenes de compra
    campos_importantes = [
        'Estado',
        'Proveedor',
        'FechaAceptacion',
        'FechaEntrega',
        'Items',
        'MontoTotal',
        'Documentos'
    ]
    
    cambios = detectar_cambios(datos_anteriores, datos_nuevos, campos_importantes)
    
    # Add specific orden de compra change types
    for cambio in cambios:
        campo = cambio['campo']
        
        if campo == 'Estado':
            cambio['tipo_cambio'] = 'estado'
            estado_ant = cambio['valor_anterior']
            estado_nuevo = cambio['valor_nuevo']
            cambio['descripcion'] = f"Estado cambió de '{estado_ant}' a '{estado_nuevo}'"
            
        elif campo == 'FechaAceptacion' and cambio['valor_anterior'] is None:
            cambio['tipo_cambio'] = 'aceptacion'
            cambio['descripcion'] = f"Orden aceptada el {cambio['valor_nuevo']}"
            
        elif campo == 'FechaEntrega':
            if cambio['valor_anterior'] is None:
                cambio['tipo_cambio'] = 'entrega'
                cambio['descripcion'] = f"Orden entregada el {cambio['valor_nuevo']}"
            else:
                cambio['tipo_cambio'] = 'entrega_modificada'
                cambio['descripcion'] = f"Fecha de entrega cambió de {cambio['valor_anterior']} a {cambio['valor_nuevo']}"
                
        elif campo == 'Documentos':
            # Check if new documents
            docs_ant = datos_anteriores.get('Documentos', [])
            docs_nuevo = datos_nuevos.get('Documentos', [])
            if isinstance(docs_ant, list) and isinstance(docs_nuevo, list):
                if len(docs_nuevo) > len(docs_ant):
                    cambio['tipo_cambio'] = 'documento_nuevo'
                    cambio['descripcion'] = f"{len(docs_nuevo) - len(docs_ant)} nuevo(s) documento(s)"
    
    return cambios


def necesita_actualizacion(
    detalle: Dict[str, Any],
    dias_sin_actualizar: int = 7,
    estados_finales: List[str] = None
) -> bool:
    """
    Determine if a record needs to be updated
    
    Args:
        detalle: Detalle record with metadata
        dias_sin_actualizar: Days since last update to trigger refresh
        estados_finales: List of final states that don't need updates
        
    Returns:
        True if record should be updated
    """
    if estados_finales is None:
        estados_finales = ['Cerrada', 'Desierta', 'Adjudicada', 'Finalizada', 'Cancelada']
    
    # If in final state, no need to update
    estado_actual = detalle.get('estado_actual')
    if estado_actual in estados_finales:
        return False
    
    # Check last update date
    fecha_ultima_actualizacion = detalle.get('fecha_ultima_actualizacion')
    if fecha_ultima_actualizacion:
        if isinstance(fecha_ultima_actualizacion, str):
            try:
                fecha_ultima_actualizacion = datetime.fromisoformat(fecha_ultima_actualizacion)
            except:
                return True  # If can't parse date, update to be safe
        
        dias_desde_actualizacion = (now_utc() - fecha_ultima_actualizacion).days
        if dias_desde_actualizacion >= dias_sin_actualizar:
            return True
    
    return False


def priorizar_actualizaciones(
    registros: List[Dict[str, Any]],
    max_prioridad: int = None
) -> List[Dict[str, Any]]:
    """
    Prioritize which records to update first
    
    Priority order:
    1. Records with upcoming deadlines (< 7 days)
    2. Records in active states
    3. Records not updated in > 30 days
    4. Rest by last update date (oldest first)
    
    Args:
        registros: List of records to prioritize
        max_prioridad: Maximum number to return (None = all)
        
    Returns:
        Prioritized list of records
    """
    ahora = now_utc()
    
    def calcular_prioridad(registro):
        """Calculate priority score (lower = higher priority)"""
        score = 1000  # Base score
        
        # Check for upcoming deadline
        fecha_cierre = registro.get('fecha_cierre_real')
        if fecha_cierre:
            if isinstance(fecha_cierre, str):
                try:
                    fecha_cierre = datetime.fromisoformat(fecha_cierre)
                except:
                    fecha_cierre = None
            
            if fecha_cierre:
                dias_hasta_cierre = (fecha_cierre - ahora).days
                if 0 < dias_hasta_cierre < 7:
                    score -= 500  # High priority for closing soon
                elif dias_hasta_cierre < 0:
                    score += 200  # Lower priority for already closed
        
        # Check state
        estado = registro.get('estado_actual', '').lower()
        if estado in ['publicada', 'en evaluacion', 'aceptada', 'en transito']:
            score -= 100  # Higher priority for active states
        
        # Check last update date
        fecha_ultima_act = registro.get('fecha_ultima_actualizacion')
        if fecha_ultima_act:
            if isinstance(fecha_ultima_act, str):
                try:
                    fecha_ultima_act = datetime.fromisoformat(fecha_ultima_act)
                except:
                    fecha_ultima_act = None
            
            if fecha_ultima_act:
                dias_sin_actualizar = (ahora - fecha_ultima_act).days
                if dias_sin_actualizar > 30:
                    score -= 50  # Priority for old records
                score += dias_sin_actualizar  # Older = lower score (higher priority)
        
        return score
    
    # Sort by priority
    registros_priorizados = sorted(registros, key=calcular_prioridad)
    
    # Limit if requested
    if max_prioridad:
        return registros_priorizados[:max_prioridad]
    
    return registros_priorizados

