#!/usr/bin/env python3
"""
Script de validación del entorno ETL
Verifica que todo esté correctamente configurado antes de ejecutar
"""
import sys
import os
from pathlib import Path

# Add project root to path (parent of etl directory)
# If we're in etl/scripts/, we need to go up 2 levels to reach project root
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
print(f"DEBUG: Agregado al path: {PROJECT_ROOT}")
print(f"DEBUG: sys.path[0]: {sys.path[0]}")

def validar_imports():
    """Validar que todos los imports funcionan"""
    print("✓ Validando imports...")
    try:
        from etl.config import config
        from etl.shared_imports import Licitacion, OrdenCompra, Base
        from etl.loaders import DatabaseLoaderV2
        from etl.utils import calcular_hash, now_utc, detectar_cambios_licitacion
        from etl.extractors import MercadoPublicoLicitacionesExtractor
        print("  ✅ Todos los imports funcionan correctamente")
        return True
    except Exception as e:
        print(f"  ❌ Error en imports: {str(e)}")
        return False


def validar_configuracion():
    """Validar configuración"""
    print("\n✓ Validando configuración...")
    try:
        from etl.config import config
        
        # Check DATABASE_URL
        if not config.DATABASE_URL:
            print("  ⚠️  DATABASE_URL no está configurada")
            return False
        print(f"  ✅ DATABASE_URL: {config.DATABASE_URL[:30]}...")
        
        # Check MERCADO_PUBLICO_TICKET
        if not config.MERCADO_PUBLICO_TICKET:
            print("  ⚠️  MERCADO_PUBLICO_TICKET no está configurada")
            return False
        print(f"  ✅ MERCADO_PUBLICO_TICKET: {config.MERCADO_PUBLICO_TICKET[:10]}...")
        
        # Check other settings
        print(f"  ✅ MAX_RETRIES: {config.MAX_RETRIES}")
        print(f"  ✅ RETRY_DELAY: {config.RETRY_DELAY}s")
        print(f"  ✅ LOG_LEVEL: {config.LOG_LEVEL}")
        
        return True
    except Exception as e:
        print(f"  ❌ Error en configuración: {str(e)}")
        return False


def validar_conexion_bd():
    """Validar conexión a base de datos"""
    print("\n✓ Validando conexión a base de datos...")
    try:
        from etl.loaders import DatabaseLoaderV2
        
        # Try to connect
        with DatabaseLoaderV2() as loader:
            # Test query
            from etl.shared_imports import Licitacion
            count = loader.session.query(Licitacion).count()
            print(f"  ✅ Conexión exitosa - {count} licitaciones en BD")
            return True
    except Exception as e:
        print(f"  ❌ Error de conexión: {str(e)}")
        print("     Verifica que PostgreSQL esté corriendo y DATABASE_URL sea correcta")
        return False


def validar_utilidades():
    """Validar utilidades funcionan"""
    print("\n✓ Validando utilidades...")
    try:
        from etl.utils import calcular_hash, now_utc, detectar_cambios
        
        # Test hash
        hash1 = calcular_hash({"test": "data"})
        assert len(hash1) == 64  # SHA256
        print(f"  ✅ calcular_hash funciona: {hash1[:10]}...")
        
        # Test now_utc
        now = now_utc()
        assert now.tzinfo is not None
        print(f"  ✅ now_utc funciona: {now.isoformat()}")
        
        # Test detectar_cambios
        cambios = detectar_cambios(
            {"estado": "A"},
            {"estado": "B"}
        )
        assert len(cambios) == 1
        print(f"  ✅ detectar_cambios funciona: {len(cambios)} cambio detectado")
        
        return True
    except Exception as e:
        print(f"  ❌ Error en utilidades: {str(e)}")
        return False


def validar_context_manager():
    """Validar context manager funciona"""
    print("\n✓ Validando context manager...")
    try:
        from etl.loaders import DatabaseLoaderV2
        
        # Test with statement
        connection_count = 0
        with DatabaseLoaderV2() as loader:
            connection_count += 1
            assert loader.session is not None
        
        print(f"  ✅ Context manager funciona correctamente")
        return True
    except Exception as e:
        print(f"  ❌ Error en context manager: {str(e)}")
        return False


def main():
    """Main validation"""
    print("=" * 60)
    print("VALIDACIÓN DEL ENTORNO ETL")
    print("=" * 60)
    
    resultados = {
        "Imports": validar_imports(),
        "Configuración": validar_configuracion(),
        "Conexión BD": validar_conexion_bd(),
        "Utilidades": validar_utilidades(),
        "Context Manager": validar_context_manager()
    }
    
    print("\n" + "=" * 60)
    print("RESUMEN")
    print("=" * 60)
    
    total = len(resultados)
    exitosos = sum(1 for v in resultados.values() if v)
    
    for nombre, resultado in resultados.items():
        status = "✅" if resultado else "❌"
        print(f"{status} {nombre}")
    
    print("-" * 60)
    print(f"Resultado: {exitosos}/{total} validaciones exitosas")
    
    if exitosos == total:
        print("\n🎉 ¡Todo está correcto! Listo para ejecutar ETL")
        print("\nPróximos pasos:")
        print("  1. Ejecutar migración: python scripts/migrate_to_v2.py --dry-run")
        print("  2. Si todo OK: python scripts/migrate_to_v2.py")
        print("  3. Ejecutar ETL: python main_v2.py")
        return 0
    else:
        print("\n⚠️  Hay problemas que resolver antes de continuar")
        print("\nRevisa los errores arriba y:")
        print("  1. Verifica tu archivo .env")
        print("  2. Asegura que PostgreSQL esté corriendo")
        print("  3. Ejecuta las migrations: cd backend && alembic upgrade head")
        return 1


if __name__ == "__main__":
    sys.exit(main())

