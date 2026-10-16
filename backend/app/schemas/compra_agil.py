"""Respuesta de «lo mejor de hoy en Compra Ágil» (`GET /compra-agil/destacadas`).

Plana, sin sobre (ADR 0009). **Ningún campo de proveedor**: de los que ganan
sólo salen conteos (`proveedores_distintos`, `cuota_lider_pct`).

La historia de cada ítem es la de la UNIDAD de compra (`UnidadCompraAgil`);
`CompradorCompraAgil` es la del organismo y la usa la ficha pública.
"""

from datetime import date, datetime

from pydantic import BaseModel, Field


class CompradorCompraAgil(BaseModel):
    """La historia del comprador en la ventana de `ventana_desde`–`ventana_hasta`."""

    ordenes: int = Field(description="Órdenes de Compra Ágil vigentes (≈ adjudicadas).")
    publicadas: int | None = Field(
        None, description="Compras Ágiles publicadas en la ventana. Nula = sin dato, no cero."
    )
    proveedores_distintos: int = Field(description="Cuántos proveedores distintos ganaron.")
    cuota_lider_pct: float | None = Field(
        None, description="% de las órdenes del proveedor que más ganó (0–100)."
    )
    monto_mediana: float | None = Field(None, description="Mediana del monto por orden, CLP.")
    monto_p25: float | None = Field(None, description="Percentil 25 del monto por orden, CLP.")
    monto_p75: float | None = Field(None, description="Percentil 75 del monto por orden, CLP.")


class UnidadCompraAgil(BaseModel):
    """La historia de la UNIDAD de compra (su RUT) en `ventana_desde`–`ventana_hasta`.

    Es la unidad que publica la Compra Ágil, no su organismo: la FACh, por
    ejemplo, son 14 unidades con RUT propio bajo un solo código.
    """

    ordenes: int = Field(
        description="Órdenes de Compra Ágil vigentes de la unidad (≈ adjudicadas)."
    )
    publicadas: int | None = Field(
        None,
        description=(
            "Siempre nulo desde 2026-10: las publicadas se cuentan por organismo, en "
            "/publico/compradores/{codigo}. Se conserva para no romper a los integradores."
        ),
    )
    proveedores_distintos: int = Field(description="Cuántos proveedores distintos ganaron.")
    cuota_lider_pct: float | None = Field(
        None, description="% de las órdenes del proveedor que más ganó (0–100)."
    )
    monto_mediana: float | None = Field(None, description="Mediana del monto por orden, CLP.")
    monto_p25: float | None = Field(None, description="Percentil 25 del monto por orden, CLP.")
    monto_p75: float | None = Field(None, description="Percentil 75 del monto por orden, CLP.")
    percentil_ordenes: float | None = Field(
        None,
        description=(
            "Qué parte de las unidades con Compra Ágil emitió MENOS órdenes en la ventana "
            "(0–1). Mide cuánto compra, no si adjudica lo que publica."
        ),
    )


class FactoresPuntaje(BaseModel):
    """Los factores, cada uno en [0, 1]. Sin dato, el centro de su escala.

    Todos viajan; el puntaje sólo multiplica los de `EN_EL_PUNTAJE` (sin la competencia).
    """

    competencia: float = Field(
        description=(
            "1 / (1 + cotizaciones recibidas). Sin dato: 0,5. Informativo: no entra en el puntaje."
        ),
    )
    comprador: float = Field(
        description=(
            "Percentil de órdenes de Compra Ágil de la unidad en la ventana. Unidad sin "
            "órdenes en la ventana (ausente de una historia ya disponible): 0. Historia aún "
            "no disponible (`historia_disponible = false`): 0,5, el neutro."
        )
    )
    tiempo: float = Field(description="min(1, horas hasta el cierre / 72).")
    monto: float = Field(
        description=(
            "0,5 + 0,5 · monto / (monto + 708.050), en [0,5; 1). Pesa en el puntaje "
            "(hasta ~1,7× entre el monto más chico y el más grande de la instantánea "
            "medida el 2026-10-14); es una decisión de producto. Sin monto, o con el "
            "tope de Compra Ágil (`monto_es_tope`): 0,75."
        )
    )


class CompraAgilDestacada(BaseModel):
    codigo_externo: str
    nombre: str
    nombre_organismo: str | None = None
    region: str | None = None
    monto_estimado: float | None = None
    monto_es_tope: bool = Field(
        False,
        description=(
            "¿`monto_estimado` es el tope de Compra Ágil (100 UTM), o está a menos de un 2 % "
            "de él? El tope es el mayor monto declarado en las Compras Ágiles guardadas, "
            "porque la UTM cambia cada mes. Muchos compradores declaran el tope en vez de lo "
            "que piensan gastar: ese monto no dice cuánto se va a comprar, y el factor "
            "`monto` vale el neutro (0,75)."
        ),
    )
    fecha_publicacion: datetime
    fecha_cierre: datetime
    horas_restantes: float
    ofertas_recibidas: int | None = Field(
        None, description="Cotizaciones recibidas a `ofertas_al`. Nulo si no se sabe."
    )
    ofertas_al: datetime | None = Field(
        None,
        description=(
            "Cuándo se escribió por última vez la fila de esta Compra Ágil, hora de Chile: "
            "la mejor cota de cuándo se vio `ofertas_recibidas`. No es una lectura garantizada "
            "del conteo, y uno viejo puede haber subido."
        ),
    )
    comprador: UnidadCompraAgil | None = Field(
        None,
        description=(
            "Historia de la unidad que compra. Nula si la unidad no tiene órdenes en la "
            "ventana, o si la historia aún no está disponible (`historia_disponible = false`): "
            "en ese caso no se sabe nada de ninguna unidad, y no hay que decir «sin historial»."
        ),
    )
    puntaje: float = Field(
        description="Producto de los factores que pesan (sin la competencia), en [0, 1]. Heurística."
    )
    factores: FactoresPuntaje


class CompraAgilDestacadasResponse(BaseModel):
    actualizado_en: datetime | None = Field(
        None,
        description=(
            "Última ingesta de Compra Ágil, hora de Chile. Nulo si no hay ninguna. "
            "Si es vieja, la lista puede estar desactualizada."
        ),
    )
    historia_disponible: bool = Field(
        description=(
            "¿Ya hay historia de compras por unidad? Falso entre el despliegue y la primera "
            "corrida semanal que la calcula (la tabla no existe o está vacía): ahí el factor "
            "`comprador` vale 0,5 para todas, el orden es sólo tiempo × monto, y `comprador` "
            "viene nulo en cada ítem sin que eso signifique «esta unidad no compra». Con "
            "historia, un `comprador` nulo SÍ significa que la unidad no tuvo órdenes."
        ),
    )
    ventana_desde: date | None = Field(None, description="Inicio de la historia del comprador.")
    ventana_hasta: date | None = Field(None, description="Fin de la historia del comprador.")
    items: list[CompraAgilDestacada]
