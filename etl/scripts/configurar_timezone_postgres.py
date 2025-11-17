#!/usr/bin/env python3
"""
Script para configurar el timezone de PostgreSQL a America/Santiago
"""
import sys
import os
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from etl.config import config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError


def configurar_timezone():
    """Configura el timezone de PostgreSQL"""
    print("=" * 80)
    print("CONFIGURACIÓN DE TIMEZONE EN POSTGRESQL")
    print("=" * 80)
    print()
    
    # Conectar a PostgreSQL
    try:
        engine = create_engine(config.DATABASE_URL, pool_pre_ping=True)
        connection = engine.connect()
        
        print("✅ Conectado a PostgreSQL")
        print(f"   URL: {config.DATABASE_URL.split('@')[1] if '@' in config.DATABASE_URL else config.DATABASE_URL}")
        print()
        
        # Obtener nombre de la base de datos
        result = connection.execute(text("SELECT current_database()"))
        db_name = result.scalar()
        print(f"📦 Base de datos: {db_name}")
        
        # Verificar timezone actual
        result = connection.execute(text("SHOW timezone"))
        current_tz = result.scalar()
        print(f"⏰ Timezone actual: {current_tz}")
        print()
        
        # Configurar timezone para la base de datos
        print("🔧 Configurando timezone a 'America/Santiago'...")
        print("-" * 80)
        
        # Opción 1: Configurar por base de datos (persistente)
        try:
            connection.execute(text(f"ALTER DATABASE {db_name} SET timezone = 'America/Santiago'"))
            connection.commit()
            print(f"✅ Timezone configurado para la base de datos '{db_name}'")
        except SQLAlchemyError as e:
            print(f"⚠️  Error al configurar por base de datos: {e}")
            print("   Intentando configuración por sesión...")
            try:
                connection.execute(text("SET timezone = 'America/Santiago'"))
                connection.commit()
                print("✅ Timezone configurado para la sesión actual")
            except SQLAlchemyError as e2:
                print(f"❌ Error: {e2}")
                return False
        
        # Cerrar conexión actual y abrir nueva para verificar
        connection.close()
        
        # Abrir nueva conexión para verificar (usará el nuevo timezone)
        new_connection = engine.connect()
        
        # Verificar que se configuró correctamente
        result = new_connection.execute(text("SHOW timezone"))
        new_tz = result.scalar()
        print()
        print(f"⏰ Timezone en nueva conexión: {new_tz}")
        
        # Verificar que funcione correctamente
        result = new_connection.execute(text("SELECT NOW()"))
        now = result.scalar()
        print(f"📅 Hora actual del servidor: {now}")
        
        new_connection.close()
        
        connection.close()
        engine.dispose()
        
        print()
        print("=" * 80)
        print("✅ CONFIGURACIÓN COMPLETADA")
        print("=" * 80)
        print()
        print("ℹ️  NOTAS:")
        print("   - El timezone está configurado para la base de datos")
        print("   - Las nuevas conexiones usarán automáticamente 'America/Santiago'")
        print("   - Los valores por defecto (server_default=func.now()) usarán esta zona horaria")
        print()
        print("⚠️  Si necesitas que TODAS las conexiones usen este timezone:")
        print("   1. Edita postgresql.conf y agrega: timezone = 'America/Santiago'")
        print("   2. Reinicia PostgreSQL")
        print()
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        print()
        print("💡 Verifica que:")
        print("   - PostgreSQL esté corriendo")
        print("   - DATABASE_URL en .env sea correcta")
        print("   - Tengas permisos para ALTER DATABASE")
        return False


if __name__ == "__main__":
    success = configurar_timezone()
    sys.exit(0 if success else 1)

