"""Respuestas de las páginas públicas indexables (`/publico/*`, paso 10 del pivote).

Planas, sin sobre (ADR 0009). Las consume el frontend como server components con
ISR, así que **el contrato con él es éste**: `docs/superpowers/plans/2026-10-12-pivote-paso-10.md`.

El backend manda los `slug` y `codigo` hechos para enlazar entre páginas: el
frontend nunca des-slugifica.
"""

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.bi import CompradorResponse, PanoramaResponse
from app.schemas.compra_agil import CompradorCompraAgil


class SitemapPublico(BaseModel):
    """Sólo las páginas indexables. Las demás existen, pero con `noindex`."""

    actualizado: date | None = Field(
        None, description="Último día de la ventana de analytics. Nulo sin analytics."
    )
    compradores: list[str] = Field(description="Códigos de comprador indexables.")
    rubros: list[str] = Field(description="Slugs de rubro indexables.")
    productos: list[str] = Field(description="Slugs de producto indexables.")


class PeriodoPublico(BaseModel):
    """Los meses de los que salen las cifras. Nulos si analytics no los publica."""

    ventana_desde: date | None = None
    ventana_hasta: date | None = None


class RubroDeComprador(BaseModel):
    nombre: str
    slug: str | None = Field(
        None, description="Slug de la página del rubro. Nulo si el rubro no tiene página."
    )
    monto: float = Field(description="Monto comprado en el rubro en la ventana, CLP.")
    ordenes: int = Field(description="Órdenes de compra en el rubro en la ventana.")


class CompradorPublico(BaseModel):
    codigo: str
    nombre: str | None = None
    indexable: bool
    periodo: PeriodoPublico
    perfil: CompradorResponse = Field(description="Lo mismo que `GET /bi/comprador/{codigo}`.")
    compra_agil: CompradorCompraAgil | None = Field(
        None, description="Su historia en Compra Ágil (6 meses). Nula sin dato."
    )
    rubros: list[RubroDeComprador] = Field(description="Sus 10 rubros de más monto.")


class CompradorDeRubro(BaseModel):
    codigo: str
    nombre: str | None = None
    monto: float = Field(description="Monto comprado en el rubro en la ventana, CLP.")
    ordenes: int


class RubroPublico(BaseModel):
    slug: str
    nombre: str
    indexable: bool
    panorama: PanoramaResponse = Field(description="Lo mismo que `GET /bi/panorama?rubro=`.")
    compradores: list[CompradorDeRubro] = Field(description="Los 10 de más monto en el rubro.")


class BandaPorUnidad(BaseModel):
    """La banda nacional (L0N) del producto en una unidad de medida."""

    unidad: str | None = None
    n: int = Field(description="Compras observadas.")
    p10: float | None = None
    p25: float | None = None
    p50: float | None = None
    p75: float | None = None
    p90: float | None = None
    predictibilidad: str | None = Field(None, description="alta | media | baja")
    confianza: float | None = None


class CompradorDeProducto(BaseModel):
    codigo: str
    nombre: str | None = None
    unidad: str | None = None
    n: int
    p50: float | None = None


class ProductoPublico(BaseModel):
    slug: str
    firma: str = Field(description="Palabras del producto, ordenadas y sin cifras.")
    nombre_generico: str | None = Field(None, description="Categoría ONU (UNSPSC).")
    codigo_onu: str | None = None
    descripcion: str | None = Field(None, description="Una descripción real de compra.")
    indexable: bool
    unidades: list[BandaPorUnidad] = Field(description="Una banda por unidad, de más a menos n.")
    compradores: list[CompradorDeProducto] = Field(
        description="Los 10 compradores que más lo compran (banda propia, L0)."
    )


class ProductoEncontrado(BaseModel):
    slug: str
    firma: str
    n: int
    indexable: bool


class CompraAgilPorCierre(BaseModel):
    """Las Compras Ágiles abiertas según el día de Chile en que cierran. Suman
    `compra_agil_abiertas`."""

    hoy: int
    manana: int
    dos_tres_dias: int = Field(description="Cierran pasado mañana o al día siguiente.")
    despues: int = Field(description="Cierran desde el cuarto día, o no tienen cierre.")


class ResumenPortada(BaseModel):
    """La tira de cifras de la portada (spec del rediseño §6.6).

    Cada cifra es el total de un enlace al catálogo: `/licitaciones?abiertas=1`
    con su mecanismo. Toda cifra viva lleva su hora (principio 4): sin
    `actualizado_en`, la portada no muestra la tira.
    """

    licitaciones_abiertas: int = Field(
        description=(
            "Licitaciones que no son Compra Ágil y se pueden postular ahora: publicadas, "
            "sin cierre o con cierre futuro. Las mismas que "
            "`GET /tenders/?abiertas=true&tipo_convocatoria=licitacion,convenio_marco,trato_directo`."
        )
    )
    compra_agil_abiertas: int = Field(
        description="Compras Ágiles que se pueden cotizar ahora, con la misma definición."
    )
    actualizado_en: datetime | None = Field(
        None,
        description=(
            "Última ingesta de Compra Ágil, hora de Chile; la misma que "
            "`GET /compra-agil/destacadas`. Nula si no hubo ninguna."
        ),
    )
    compra_agil_por_cierre: CompraAgilPorCierre | None = Field(
        None,
        description="`compra_agil_abiertas` repartidas por el día de Chile en que cierran.",
    )
    publicadas_hoy: int | None = Field(
        None,
        description=(
            "Licitaciones y Compras Ágiles vigentes publicadas hoy (día de Chile), abiertas o no."
        ),
    )
    mas_publica_hoy: str | None = Field(
        None,
        description=(
            "El organismo que más publicó hoy, agrupado por su nombre (la Compra Ágil "
            "no trae código), tal como lo escribe ChileCompra. Nulo sin publicaciones "
            "con nombre."
        ),
    )
