import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine
from app.config import settings
from app.db import Base
# Make sure all models are imported so Base.metadata knows about them
from app.models import (
    Licitacion,
    LicitacionDetalle,
    LicitacionHistorial,
    OrdenCompra,
    OrdenCompraDetalle,
    OrdenCompraHistorial,
    User,
    BuyerOrganization,
    Supplier,
    Category,
    Alert,
    AlertPreference,
    Empresa,
    EmpresaUsuario,
    DocumentoEmpresa,
    EstadoHabilLog,
    TFIDFPerfil,
    Postulacion,
    PlantillaChecklist,
    ChecklistPostulacion,
    TaskFailure,
)

async def init_db():
    print("🚀 Iniciando creación forzada de base de datos de producción...")
    # Usa asyncpg tal cual lo hace la app normal
    engine = create_async_engine(settings.database_url, echo=False)
    
    async with engine.begin() as conn:
        print("Creando tablas si no existen según Base.metadata...")
        await conn.run_sync(Base.metadata.create_all)
        
    print("✅ Tablas creadas/verificadas en PostgreSQL.")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(init_db())
