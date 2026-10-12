"""Respuesta de «lo mejor de hoy en Compra Ágil» (`GET /compra-agil/destacadas`).

Plana, sin sobre (ADR 0009). **Ningún campo de proveedor**: de los que ganan
sólo salen conteos (`proveedores_distintos`, `cuota_lider_pct`).
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


class FactoresPuntaje(BaseModel):
    """Los tres factores del puntaje, cada uno en [0, 1]. Sin dato, 0,5."""

    competencia: float = Field(description="1 / (1 + cotizaciones recibidas). Sin dato: 0,5.")
    comprador: float = Field(
        description="min(1, órdenes / publicadas) en la ventana. Con < 5 publicadas o sin dato: 0,5."
    )
    tiempo: float = Field(description="min(1, horas hasta el cierre / 24).")


class CompraAgilDestacada(BaseModel):
    codigo_externo: str
    nombre: str
    nombre_organismo: str | None = None
    region: str | None = None
    monto_estimado: float | None = None
    fecha_publicacion: datetime
    fecha_cierre: datetime
    horas_restantes: float
    ofertas_recibidas: int | None = Field(
        None, description="Cotizaciones recibidas hasta ahora. Nulo si no se sabe."
    )
    comprador: CompradorCompraAgil | None = Field(
        None, description="Nulo si el comprador no tiene historia en la ventana."
    )
    puntaje: float = Field(description="Producto de los tres factores, en [0, 1]. Heurística.")
    factores: FactoresPuntaje


class CompraAgilDestacadasResponse(BaseModel):
    actualizado_en: datetime | None = Field(
        None,
        description=(
            "Última ingesta de Compra Ágil, hora de Chile. Nulo si no hay ninguna. "
            "Si es vieja, la lista puede estar desactualizada."
        ),
    )
    ventana_desde: date | None = Field(None, description="Inicio de la historia del comprador.")
    ventana_hasta: date | None = Field(None, description="Fin de la historia del comprador.")
    items: list[CompraAgilDestacada]
