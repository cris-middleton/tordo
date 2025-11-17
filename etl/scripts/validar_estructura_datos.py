#!/usr/bin/env python3
"""
Script para validar que todos los datos en la base de datos
utilicen correctamente Listado[0] en lugar del nivel raíz.
"""
import sys
import os
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from etl.shared_imports import OrdenCompraDetalle, LicitacionDetalle, Base
from etl.config import config
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import json


def validate_detalle_structure(detalle, tipo: str):
    """Valida que los datos_completos tengan la estructura correcta"""
    datos = detalle.datos_completos
    
    if not datos:
        return {"valid": True, "issue": "datos_completos vacío", "tipo": "info", "sample_keys": []}
    
    # Verificar si tiene estructura Listado[0]
    if isinstance(datos, dict):
        if "Listado" in datos:
            listado = datos.get("Listado")
            if isinstance(listado, list) and len(listado) > 0:
                # Estructura correcta: {"Listado": [{...}]}
                return {"valid": True, "issue": None, "tipo": "correct", "sample_keys": list(datos.keys())[:5]}
            else:
                # Listado vacío o no es lista
                return {
                    "valid": False,
                    "issue": f"Listado existe pero está vacío o no es lista (tipo: {type(listado)})",
                    "tipo": "error",
                    "sample_keys": list(datos.keys())[:10]
                }
        else:
            # No tiene Listado, pero puede ser formato antiguo (ya extraído)
            # Verificar si tiene campos esperados directamente
            campos_orden = ["Estado", "CodigoOC", "CodigoOC"]
            campos_licitacion = ["Estado", "CodigoExterno", "CodigoInterno"]
            campos_esperados = campos_orden if tipo == "orden_compra" else campos_licitacion
            
            tiene_campos = any(campo in datos for campo in campos_esperados)
            
            if tiene_campos:
                return {
                    "valid": True,
                    "issue": "Formato antiguo (sin Listado, pero con campos directos)",
                    "tipo": "warning",
                    "sample_keys": list(datos.keys())[:10]
                }
            else:
                # Mostrar qué claves tiene realmente
                sample_keys = list(datos.keys())[:10]
                return {
                    "valid": False,
                    "issue": f"No tiene Listado ni campos esperados. Claves encontradas: {sample_keys}",
                    "tipo": "error",
                    "sample_keys": sample_keys,
                    "full_sample": {k: str(datos[k])[:50] if datos[k] else None for k in sample_keys[:3]}
                }
    
    return {"valid": False, "issue": f"datos_completos no es un diccionario (tipo: {type(datos)})", "tipo": "error", "sample_keys": []}


def main():
    print("=" * 80)
    print("VALIDACIÓN DE ESTRUCTURA DE DATOS EN BASE DE DATOS")
    print("=" * 80)
    print()
    
    # Conectar a la base de datos
    engine = create_engine(config.DATABASE_URL, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    # Validar órdenes de compra detalle
    print("📦 Validando órdenes_compra_detalle...")
    print("-" * 80)
    
    ordenes_detalle = session.query(OrdenCompraDetalle).limit(100).all()
    total_ordenes = session.query(OrdenCompraDetalle).count()
    
    print(f"Total de registros: {total_ordenes}")
    print(f"Validando muestra de: {len(ordenes_detalle)} registros")
    print()
    
    stats_ordenes = {"correct": 0, "warning": 0, "error": 0, "info": 0}
    errores_ordenes = []
    
    for detalle in ordenes_detalle:
        resultado = validate_detalle_structure(detalle, "orden_compra")
        stats_ordenes[resultado["tipo"]] = stats_ordenes.get(resultado["tipo"], 0) + 1
        
        if resultado["tipo"] in ["error", "warning"]:
            error_info = {
                "codigo_oc": detalle.codigo_oc,
                "id": detalle.id,
                "issue": resultado["issue"],
                "tipo": resultado["tipo"],
                "sample_keys": resultado.get("sample_keys", [])
            }
            if "full_sample" in resultado:
                error_info["full_sample"] = resultado["full_sample"]
            errores_ordenes.append(error_info)
    
    print(f"  ✅ Correctos (con Listado[0]): {stats_ordenes.get('correct', 0)}")
    print(f"  ⚠️  Advertencias (formato antiguo): {stats_ordenes.get('warning', 0)}")
    print(f"  ❌ Errores: {stats_ordenes.get('error', 0)}")
    print(f"  ℹ️  Información: {stats_ordenes.get('info', 0)}")
    
    if errores_ordenes:
        print()
        print("  Problemas encontrados (primeros 5 con detalles):")
        for i, error in enumerate(errores_ordenes[:5]):
            print(f"    {i+1}. {error['codigo_oc']} (ID: {error['id']}):")
            print(f"       {error['issue']}")
            if error.get('sample_keys'):
                print(f"       Claves encontradas: {error['sample_keys'][:10]}")
            if error.get('full_sample'):
                print(f"       Muestra de datos: {error['full_sample']}")
        if len(errores_ordenes) > 5:
            print(f"    ... y {len(errores_ordenes) - 5} más con el mismo patrón")
    
    print()
    print("=" * 80)
    
    # Validar licitaciones detalle
    print("📋 Validando licitaciones_detalle...")
    print("-" * 80)
    
    licitaciones_detalle = session.query(LicitacionDetalle).limit(100).all()
    total_licitaciones = session.query(LicitacionDetalle).count()
    
    print(f"Total de registros: {total_licitaciones}")
    print(f"Validando muestra de: {len(licitaciones_detalle)} registros")
    print()
    
    stats_licitaciones = {"correct": 0, "warning": 0, "error": 0, "info": 0}
    errores_licitaciones = []
    
    for detalle in licitaciones_detalle:
        resultado = validate_detalle_structure(detalle, "licitacion")
        stats_licitaciones[resultado["tipo"]] = stats_licitaciones.get(resultado["tipo"], 0) + 1
        
        if resultado["tipo"] in ["error", "warning"]:
            error_info = {
                "codigo_externo": detalle.codigo_externo,
                "id": detalle.id,
                "issue": resultado["issue"],
                "tipo": resultado["tipo"],
                "sample_keys": resultado.get("sample_keys", [])
            }
            if "full_sample" in resultado:
                error_info["full_sample"] = resultado["full_sample"]
            errores_licitaciones.append(error_info)
    
    print(f"  ✅ Correctos (con Listado[0]): {stats_licitaciones.get('correct', 0)}")
    print(f"  ⚠️  Advertencias (formato antiguo): {stats_licitaciones.get('warning', 0)}")
    print(f"  ❌ Errores: {stats_licitaciones.get('error', 0)}")
    print(f"  ℹ️  Información: {stats_licitaciones.get('info', 0)}")
    
    if errores_licitaciones:
        print()
        print("  Problemas encontrados (primeros 5 con detalles):")
        for i, error in enumerate(errores_licitaciones[:5]):
            print(f"    {i+1}. {error['codigo_externo']} (ID: {error['id']}):")
            print(f"       {error['issue']}")
            if error.get('sample_keys'):
                print(f"       Claves encontradas: {error['sample_keys'][:10]}")
            if error.get('full_sample'):
                print(f"       Muestra de datos: {error['full_sample']}")
        if len(errores_licitaciones) > 5:
            print(f"    ... y {len(errores_licitaciones) - 5} más con el mismo patrón")
    
    print()
    print("=" * 80)
    print("RESUMEN")
    print("=" * 80)
    
    total_correctos = stats_ordenes.get('correct', 0) + stats_licitaciones.get('correct', 0)
    total_warnings = stats_ordenes.get('warning', 0) + stats_licitaciones.get('warning', 0)
    total_errores = stats_ordenes.get('error', 0) + stats_licitaciones.get('error', 0)
    
    print(f"Total correctos: {total_correctos}")
    print(f"Total advertencias (formato antiguo): {total_warnings}")
    print(f"Total errores: {total_errores}")
    print()
    
    if total_errores > 0:
        print("⚠️  Se encontraron errores. Revisa los registros arriba.")
        return 1
    elif total_warnings > 0:
        print("⚠️  Se encontraron registros en formato antiguo.")
        print("   Esto puede ser de datos migrados de informacion_adicional.")
        print("   Estos registros seguirán funcionando, pero considera actualizarlos.")
        return 0
    else:
        print("✅ Todos los registros tienen la estructura correcta (Listado[0])")
        return 0


if __name__ == "__main__":
    sys.exit(main())

