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


class MesDeCompra(BaseModel):
    mes: int = Field(ge=1, le=12)
    compras: int = Field(
        description="Órdenes de compra emitidas en ese mes del calendario, en la ventana."
    )


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
    meses_de_compra: list[MesDeCompra] | None = Field(
        None,
        description=(
            "Sus órdenes por mes del calendario (enero a diciembre), sumando sus rubros. "
            "Nula sin dato."
        ),
    )


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


class MedianaDeComprador(BaseModel):
    """Lo que pagó un comprador de la banda: un punto del gráfico de precio."""

    n: int = Field(description="Compras del organismo en la banda (desde 1).")
    p50: float | None = Field(None, description="Mediana del precio unitario que pagó, en CLP.")


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
    compradores: int | None = Field(
        None,
        description="Organismos distintos detrás de la banda. Nulo si la tabla no lo trae.",
    )
    cuota_mayor: float | None = Field(
        None,
        description="Fracción de las compras (0–1) del organismo que más compró.",
    )
    de_mercado: bool = Field(
        False,
        description=(
            "Precio de mercado: al menos 3 compradores y ninguno con más de la mitad de "
            "las compras. Sólo una banda así hace indexable el producto."
        ),
    )
    medianas_compradores: list[MedianaDeComprador] | None = Field(
        None,
        description=(
            "La mediana de cada organismo detrás de la banda, sobre las mismas compras: "
            "tantas como `compradores`, salvo que corte el tope de 200 (las de más compras "
            "primero). Nulo si todavía no se calculan; nunca una lista vacía en su lugar."
        ),
    )


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
        description=(
            "Los 10 compradores que más lo compran: una fila por comprador y unidad, sin "
            "mínimo de compras."
        )
    )
    periodo: PeriodoPublico | None = Field(
        None,
        description=(
            "Los meses de los que salen las bandas: 12, anclados en el último mes con datos. "
            "Nulo si la tabla no publica su ventana."
        ),
    )


class CompradorEncontrado(BaseModel):
    codigo: str
    nombre: str
    n: int | None = Field(None, description="Órdenes de compra en la ventana de análisis.")
    indexable: bool


class ProductoEncontrado(BaseModel):
    slug: str
    firma: str
    descripcion: str | None = Field(
        None, description="Cómo lo escribe el comprador: la de su unidad con más compras."
    )
    n: int
    indexable: bool


class SugerenciaBusqueda(BaseModel):
    """La búsqueda con sus palabras desconocidas corregidas (`services/publico/sugerencias.py`)."""

    sugerencia: str | None = Field(
        None,
        description=(
            "La misma búsqueda con cada palabra mal escrita cambiada por la más parecida "
            "que usan los compradores. Null si no hay nada que corregir."
        ),
    )


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


class GastoMensualSector(BaseModel):
    """Lo que compró un sector en un mes, sumado sobre sus compradores y rubros."""

    anio: int
    mes: int = Field(description="Mes del año, de 1 a 12.")
    sector: str = Field(description="Sector del comprador. El vacío se suma a «Otros».")
    monto: float = Field(description="Monto de las órdenes de compra del mes, CLP.")


class TramoConcentracion(BaseModel):
    """Los mercados en que el proveedor líder tiene entre `desde` y `hasta` % del monto."""

    desde: int = Field(description="Cuota del líder desde la que cuenta el tramo, en %.")
    hasta: int = Field(
        description="Cuota del líder hasta la que cuenta, sin incluirla; el último incluye 100."
    )
    mercados: int
    monto: float = Field(description="Monto de esos mercados en la ventana, CLP.")


class ConcentracionMercados(BaseModel):
    """Cuánto se lleva el proveedor líder de cada mercado: un comprador en un rubro."""

    mercados: int = Field(description="Mercados (comprador y rubro) con cuota del líder.")
    sobre_la_mitad: int = Field(description="Mercados en que el líder se lleva el 50 % o más.")
    un_proveedor: int = Field(description="Mercados con un solo proveedor.")
    monto_total: float = Field(description="Monto de todos esos mercados en la ventana, CLP.")
    monto_sobre_la_mitad: float = Field(
        description="Monto de los mercados en que el líder se lleva el 50 % o más, CLP."
    )
    tramos: list[TramoConcentracion] = Field(
        description="Diez tramos de 10 puntos de la cuota del líder, de 0 a 100. Suman `mercados`."
    )
    ventana_desde: date | None = Field(
        None, description="Primer día de los datos. Nulo si la tabla no publica su ventana."
    )
    ventana_hasta: date | None = Field(None, description="Último día de los datos.")


class CompradorRed(BaseModel):
    """Uno de los compradores de más monto: un nodo de la red."""

    codigo: str = Field(description="Código del organismo en Mercado Público.")
    nombre: str | None = Field(
        None, description="Nombre del organismo, como lo escribe ChileCompra."
    )
    sector: str = Field(description="Sector del comprador. Sin sector, «Otros».")
    monto: float = Field(description="Todo lo que compró en la ventana, CLP.")


class ProveedorRed(BaseModel):
    """Un proveedor elegido de la red. Nunca una persona natural."""

    codigo: str = Field(description="Código del proveedor en Mercado Público (no es su RUT).")
    nombre: str | None = Field(None, description="Nombre del proveedor.")
    monto: float = Field(description="Lo que les vendió a los compradores de la red, CLP.")
    compradores: int = Field(description="A cuántos de los compradores de la red les vende.")


class EnlaceRed(BaseModel):
    """Lo que un comprador de la red le compró a un proveedor elegido, sumado sobre los rubros."""

    comprador: str = Field(description="`codigo` de un comprador de `compradores`.")
    proveedor: str = Field(description="`codigo` de un proveedor de `proveedores`.")
    monto: float = Field(description="CLP, mayor que cero.")


class RedCompradores(BaseModel):
    """Los compradores de más monto y los proveedores que les venden."""

    compradores: list[CompradorRed] = Field(
        description="Los compradores de más monto (hoy 30), de mayor a menor (empate: código)."
    )
    proveedores: list[ProveedorRed] = Field(
        description=(
            "Los proveedores de más monto de cada comprador (hoy 4) y los que venden a más "
            "compradores de la red (hoy 12; empate: monto, código), sin personas "
            "naturales; de mayor a menor monto."
        )
    )
    enlaces: list[EnlaceRed] = Field(
        description="Cada par comprador y proveedor de la red con monto, de mayor a menor."
    )
    monto_total: float = Field(description="Lo que compraron todos los compradores, CLP.")
    monto_compradores: float = Field(description="Lo que compraron los de la red, CLP.")
    proveedores_total: int = Field(
        description="Proveedores distintos que les venden a los de la red, personas naturales incluidas."
    )
    a_la_mitad_o_mas: int = Field(
        description=(
            "Proveedores (sin personas naturales) que les venden a la mitad o más de los "
            "compradores de la red."
        )
    )
    ventana_desde: date | None = Field(
        None, description="Primer día de los datos. Nulo si la tabla no publica su ventana."
    )
    ventana_hasta: date | None = Field(None, description="Último día de los datos.")


class MercadoPortada(BaseModel):
    """El mercado entero en tres bloques, para la portada. Un bloque sin su tabla
    de analytics (antes de la primera corrida semanal) es nulo."""

    gasto_mensual: list[GastoMensualSector] | None = Field(
        None, description="Monto y órdenes por mes y sector, en orden de mes y de sector."
    )
    concentracion: ConcentracionMercados | None = None
    red: RedCompradores | None = Field(
        None, description="Los compradores de más monto y sus proveedores, para dibujar una red."
    )
