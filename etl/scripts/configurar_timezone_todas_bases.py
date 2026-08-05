#!/usr/bin/env python3
"""
Script para configurar el timezone a America/Santiago en TODAS las bases de datos del proyecto
"""

import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from etl.config import config


def obtener_todas_las_bases_datos():
    """Obtiene lista de todas las bases de datos"""
    # Extraer la URL base (sin el nombre de la base de datos)
    db_url = config.DATABASE_URL

    # Intentar diferentes formatos
    if "@" in db_url:
        # Formato: postgresql://user:pass@host:port/dbname
        parts = db_url.rsplit("/", 1)
        if len(parts) == 2:
            base_url = parts[0]
            # Conectar a 'postgres' (base de datos por defecto)
            admin_url = f"{base_url}/postgres"
        else:
            admin_url = db_url.replace("/licitaciones", "/postgres")
    else:
        admin_url = db_url.replace("/licitaciones", "/postgres")

    try:
        # Conectar a postgres (base de sistema)
        engine = create_engine(admin_url, pool_pre_ping=True)
        connection = engine.connect()

        # Obtener lista de bases de datos (excluir las del sistema)
        query = text("""
            SELECT datname
            FROM pg_database
            WHERE datistemplate = false
            AND datname NOT IN ('postgres', 'template0', 'template1')
            ORDER BY datname
        """)

        result = connection.execute(query)
        databases = [row[0] for row in result]

        connection.close()
        engine.dispose()

        return databases, base_url

    except Exception as e:
        print(f"⚠️  No se pudo obtener lista de bases de datos: {e}")
        print("   Intentando solo con la base de datos 'licitaciones'...")
        # Fallback: usar solo la base de datos conocida
        return ["licitaciones"], None


def configurar_timezone_base(base_url, db_name):
    """Configura el timezone para una base de datos específica"""
    try:
        db_url = f"{base_url}/{db_name}"
        engine = create_engine(db_url, pool_pre_ping=True)
        connection = engine.connect()

        # Configurar timezone
        connection.execute(text(f"ALTER DATABASE {db_name} SET timezone = 'America/Santiago'"))
        connection.commit()

        # Verificar en nueva conexión
        connection.close()
        new_connection = engine.connect()
        result = new_connection.execute(text("SHOW timezone"))
        tz = result.scalar()

        new_connection.close()
        engine.dispose()

        return True, tz

    except SQLAlchemyError as e:
        return False, str(e)


def main():
    print("=" * 80)
    print("CONFIGURACIÓN DE TIMEZONE PARA TODAS LAS BASES DE DATOS")
    print("=" * 80)
    print()

    # Obtener todas las bases de datos
    databases, base_url = obtener_todas_las_bases_datos()

    if not base_url:
        # Fallback: usar solo licitaciones
        db_url = config.DATABASE_URL
        parts = db_url.rsplit("/", 1)
        if len(parts) == 2:
            base_url = parts[0]
        else:
            print("❌ No se pudo determinar la URL base de la base de datos")
            return False

    print(f"📦 Bases de datos encontradas: {len(databases)}")
    for db in databases:
        print(f"   - {db}")
    print()

    print("🔧 Configurando timezone a 'America/Santiago'...")
    print("-" * 80)

    resultados = {}

    for db_name in databases:
        print(f"\n📦 Procesando: {db_name}...")
        success, info = configurar_timezone_base(base_url, db_name)

        if success:
            print(f"   ✅ Timezone configurado: {info}")
            resultados[db_name] = ("ok", info)
        else:
            print(f"   ❌ Error: {info}")
            resultados[db_name] = ("error", info)

    print()
    print("=" * 80)
    print("RESUMEN")
    print("=" * 80)
    print()

    exitos = sum(1 for status, _ in resultados.values() if status == "ok")
    errores = len(resultados) - exitos

    for db_name, (status, info) in resultados.items():
        icon = "✅" if status == "ok" else "❌"
        print(f"{icon} {db_name}: {info}")

    print()
    print(f"Total: {exitos} exitosas, {errores} errores")
    print()

    if errores == 0:
        print("✅ Todas las bases de datos configuradas correctamente")
        print()
        print("ℹ️  NOTAS:")
        print("   - Todas las bases de datos usarán 'America/Santiago'")
        print("   - Los valores por defecto (server_default=func.now()) usarán esta zona")
        print("   - Las nuevas conexiones aplicarán automáticamente este timezone")
        return True
    else:
        print("⚠️  Algunas bases de datos tuvieron errores")
        print("   Verifica los mensajes arriba")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
