"""Páginas públicas indexables: comprador, rubro y producto (paso 10 del pivote).

Las lee el frontend como server components con ISR (una semana, revalidadas por
el cron semanal tras materializar), y el sitemap sale de `/publico/sitemap`.
Qué existe y qué se indexa lo decide `services/publico/indexables.py`; aquí
sólo se valida la entrada y se traduce «no existe» a 404.

`/publico/portada` es la excepción: no lee analytics sino el catálogo, así que
es `async`, pide la sesión y no exige `FEATURE_ANALYTICS`. `/publico/mercado`
también lo pide la portada, pero lee analytics como las fichas: el gasto mensual
por sector y la concentración de los mercados, agregados en SQL.

Un producto **no indexable** responde 200 con `indexable: false`: la página
existe, con `noindex`, y se llega a ella por la búsqueda.
"""

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import limites
from app.api.dependencias import requiere_analytics
from app.db import get_db
from app.repositories import compra_agil as repo_compra_agil
from app.repositories import licitaciones as repo_licitaciones
from app.schemas.publico import (
    CompraAgilPorCierre,
    CompradorPublico,
    MercadoPortada,
    ProductoEncontrado,
    ProductoPublico,
    ResumenPortada,
    RubroPublico,
    SitemapPublico,
)
from app.services.publico import mercado, paginas

router = APIRouter(prefix="/publico", tags=["publico"])


@router.get(
    "/sitemap",
    response_model=SitemapPublico,
    summary="Las páginas públicas indexables",
)
def get_sitemap():
    requiere_analytics()
    return paginas.sitemap()


@router.get(
    "/portada",
    response_model=ResumenPortada,
    summary="Las cifras de la portada: cuántas se pueden postular ahora",
)
async def get_portada(db: AsyncSession = Depends(get_db)):
    """Conteos del catálogo con su hora. Sin `requiere_analytics()`: no leen
    analytics, y una portada sin cifras por un flag de BI sería un fallo ajeno."""
    abiertas = await repo_licitaciones.contar_abiertas(db)
    hoy = await repo_licitaciones.publicadas_del_dia(db)
    por_cierre = abiertas.compra_agil_por_cierre
    return ResumenPortada(
        licitaciones_abiertas=abiertas.licitaciones,
        compra_agil_abiertas=abiertas.compra_agil,
        actualizado_en=await repo_compra_agil.actualizado_en(db),
        compra_agil_por_cierre=CompraAgilPorCierre(
            hoy=por_cierre.hoy,
            manana=por_cierre.manana,
            dos_tres_dias=por_cierre.dos_tres_dias,
            despues=por_cierre.despues,
        ),
        publicadas_hoy=hoy.total,
        mas_publica_hoy=hoy.organismo,
    )


@router.get(
    "/mercado",
    response_model=MercadoPortada,
    summary="El mercado entero: gasto mensual por sector y concentración de los mercados",
)
def get_mercado():
    requiere_analytics()
    return mercado.mercado()


@router.get(
    "/compradores/{codigo}",
    response_model=CompradorPublico,
    summary="Página pública de un comprador",
)
def get_comprador(codigo: str = Path(max_length=limites.CODIGO)):
    requiere_analytics()
    pagina = paginas.comprador(codigo)
    if pagina is None:
        raise HTTPException(status_code=404, detail="Comprador no encontrado")
    return pagina


@router.get(
    "/rubros/{slug}",
    response_model=RubroPublico,
    summary="Página pública de un rubro",
)
def get_rubro(slug: str = Path(max_length=limites.NOMBRE)):
    requiere_analytics()
    pagina = paginas.rubro(slug)
    if pagina is None:
        raise HTTPException(status_code=404, detail="Rubro no encontrado")
    return pagina


@router.get(
    "/productos",
    response_model=list[ProductoEncontrado],
    summary="Buscar productos por palabras (también los no indexados)",
)
def buscar_productos(
    q: str = Query(
        ..., min_length=2, max_length=limites.TEXTO, description="Palabras del producto."
    ),
    limite: int = Query(20, ge=1, le=paginas.MAX_RESULTADOS_BUSQUEDA),
):
    requiere_analytics()
    return paginas.buscar_productos(q, limite)


@router.get(
    "/productos/{slug}",
    response_model=ProductoPublico,
    summary="Página pública de un producto: su banda de precio por unidad",
)
def get_producto(slug: str = Path(max_length=limites.NOMBRE)):
    requiere_analytics()
    pagina = paginas.producto(slug)
    if pagina is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return pagina
