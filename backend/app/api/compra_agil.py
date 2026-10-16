"""«Lo mejor de hoy en Compra Ágil». Anónimo, como todo desde el pivote público.

El cómo se elige y se puntúa vive en `repositories/compra_agil.py`; aquí sólo
se valida la entrada y se da forma a la respuesta.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import limites
from app.core.tiempo import ZONA_CHILE
from app.db import get_db
from app.repositories import compra_agil as repo_compra_agil
from app.schemas.compra_agil import (
    CompraAgilDestacada,
    CompraAgilDestacadasResponse,
    FactoresPuntaje,
    UnidadCompraAgil,
)

router = APIRouter(prefix="/compra-agil", tags=["compra-agil"])


def _item(fila: dict[str, Any]) -> CompraAgilDestacada:
    comprador = None
    if fila["tiene_historia"]:
        comprador = UnidadCompraAgil(**{c: fila[c] for c in repo_compra_agil.CAMPOS_UNIDAD})
    return CompraAgilDestacada(
        codigo_externo=fila["codigo_externo"],
        nombre=fila["nombre"],
        nombre_organismo=fila["nombre_organismo"],
        region=(fila["region"] or "").strip() or None,
        monto_estimado=fila["monto_estimado"],
        monto_es_tope=fila["monto_es_tope"],
        fecha_publicacion=fila["fecha_publicacion"],
        fecha_cierre=fila["fecha_cierre"],
        horas_restantes=round(float(fila["horas_restantes"]), 1),
        ofertas_recibidas=fila["ofertas_recibidas"],
        ofertas_al=fila["ofertas_al"].astimezone(ZONA_CHILE) if fila["ofertas_al"] else None,
        comprador=comprador,
        puntaje=round(fila["puntaje"], 4),
        factores=FactoresPuntaje(
            **{n: round(fila[f"f_{n}"], 4) for n in repo_compra_agil.FACTORES}
        ),
    )


@router.get("/destacadas", response_model=CompraAgilDestacadasResponse)
async def destacadas(
    limite: int = Query(20, ge=1, le=50, description="Cuántas devolver (1–50)."),
    region: str | None = Query(
        None, max_length=limites.NOMBRE, description="Región, como la escribe Mercado Público."
    ),
    search: str | None = Query(
        None, max_length=limites.TEXTO, description="Palabras que tienen que aparecer (todas)."
    ),
    codigo_organismo: str | None = Query(
        None,
        max_length=20,
        description=(
            "Sólo las de este comprador (código de Mercado Público). Sin analytics "
            "no se puede saber de quién es cada una y la lista sale vacía."
        ),
    ),
    db: AsyncSession = Depends(get_db),
):
    """Compras Ágiles abiertas que cierran en más de 2 h, de mejor a peor puntaje.

    El puntaje es una **heurística**, no un modelo: el producto de sus
    factores en [0, 1] —ver `FactoresPuntaje`—, con el centro de su escala para el
    que no tiene dato. Ver `docs/API_PUBLICA.md`.
    """
    terminos = [t.strip() for t in (search or "").split() if t.strip()]
    if len(terminos) > limites.MAX_TERMINOS:
        # Cada término es un filtro más sobre el texto: sin tope, una búsqueda de
        # 50 palabras de una letra es una consulta cara y gratis de pedir. Se
        # rechaza en vez de recortar, que devolvería resultados de otra búsqueda.
        raise HTTPException(
            status_code=422,
            detail=f"Como mucho {limites.MAX_TERMINOS} palabras en la búsqueda.",
        )
    con_historia = await repo_compra_agil.hay_historia_de_unidades(db)
    filas = await repo_compra_agil.destacadas(
        db,
        limite=limite,
        con_historia=con_historia,
        region=region,
        terminos=terminos,
        codigo_organismo=codigo_organismo,
    )
    desde, hasta = await repo_compra_agil.ventana(db)
    return CompraAgilDestacadasResponse(
        actualizado_en=await repo_compra_agil.actualizado_en(db),
        historia_disponible=con_historia,
        ventana_desde=desde,
        ventana_hasta=hasta,
        items=[_item(f) for f in filas],
    )
