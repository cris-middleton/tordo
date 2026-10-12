"""Páginas públicas indexables: comprador, rubro y producto (paso 10 del pivote).

Las lee el frontend como server components con ISR (una semana, revalidadas por
el cron semanal tras materializar), y el sitemap sale de `/publico/sitemap`.
Qué existe y qué se indexa lo decide `services/publico/indexables.py`; aquí
sólo se valida la entrada y se traduce «no existe» a 404.

Un producto **no indexable** responde 200 con `indexable: false`: la página
existe, con `noindex`, y se llega a ella por la búsqueda.
"""

from fastapi import APIRouter, HTTPException, Query

from app.api.dependencias import requiere_analytics
from app.schemas.publico import (
    CompradorPublico,
    ProductoEncontrado,
    ProductoPublico,
    RubroPublico,
    SitemapPublico,
)
from app.services.publico import paginas

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
    "/compradores/{codigo}",
    response_model=CompradorPublico,
    summary="Página pública de un comprador",
)
def get_comprador(codigo: str):
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
def get_rubro(slug: str):
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
    q: str = Query(..., min_length=2, max_length=100, description="Palabras del producto."),
    limite: int = Query(20, ge=1, le=paginas.MAX_RESULTADOS_BUSQUEDA),
):
    requiere_analytics()
    return paginas.buscar_productos(q, limite)


@router.get(
    "/productos/{slug}",
    response_model=ProductoPublico,
    summary="Página pública de un producto: su banda de precio por unidad",
)
def get_producto(slug: str):
    requiere_analytics()
    pagina = paginas.producto(slug)
    if pagina is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return pagina
