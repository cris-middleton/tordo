"""Acceso a alertas y a sus preferencias.

Por qué existe
--------------
El router repetía `Alert.user_id == current_user.id` en **seis** endpoints. No
era sólo SQL disperso: ese filtro es la garantía de que nadie lee ni borra la
alerta de otro, y una garantía repetida seis veces es una garantía que un día se
escribe cinco.

Aquí no hay ninguna función que devuelva una alerta sin acotarla al usuario. Es
el mismo argumento que sostiene `api/deps.py` para las empresas, aplicado al
otro sujeto del sistema.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertPreference, AlertStatus, AlertType


async def obtener_alerta(db: AsyncSession, alerta_id: int, usuario_id: int) -> Alert | None:
    """La alerta, **sólo si es de este usuario**. `None` si no lo es o no existe.

    No se distingue "no existe" de "no es tuya" a propósito: responder cosas
    distintas permitiría enumerar los ids ajenos.
    """
    return (
        await db.execute(select(Alert).where(Alert.id == alerta_id, Alert.user_id == usuario_id))
    ).scalar_one_or_none()


async def buscar_por_clave_idempotencia(db: AsyncSession, clave: str) -> Alert | None:
    """La clave ya lleva el usuario dentro, así que no hace falta filtrarlo."""
    return (
        await db.execute(select(Alert).where(Alert.idempotency_key == clave))
    ).scalar_one_or_none()


async def listar_alertas(
    db: AsyncSession,
    usuario_id: int,
    *,
    estado: AlertStatus | None = None,
    tipo: AlertType | None = None,
    solo_no_leidas: bool = False,
    salto: int = 0,
    limite: int = 20,
) -> tuple[list[Alert], int, int]:
    """`(página, total que cumple los filtros, no leídas en total)`.

    Las no leídas se cuentan **sin aplicar los filtros**: es el número del
    badge de la campana, y tiene que decir lo mismo esté el usuario mirando la
    lista que quiera.
    """
    consulta = select(Alert).where(Alert.user_id == usuario_id)
    if estado:
        consulta = consulta.where(Alert.status == estado)
    if tipo:
        consulta = consulta.where(Alert.alert_type == tipo)
    if solo_no_leidas:
        consulta = consulta.where(Alert.status != AlertStatus.READ)

    total = (await db.execute(select(func.count()).select_from(consulta.subquery()))).scalar() or 0

    no_leidas = (
        await db.execute(
            select(func.count(Alert.id)).where(
                Alert.user_id == usuario_id, Alert.status != AlertStatus.READ
            )
        )
    ).scalar() or 0

    filas = (
        (await db.execute(consulta.order_by(Alert.created_at.desc()).offset(salto).limit(limite)))
        .scalars()
        .all()
    )
    return list(filas), int(total), int(no_leidas)


async def obtener_preferencia(
    db: AsyncSession, preferencia_id: int, usuario_id: int
) -> AlertPreference | None:
    """La preferencia, **sólo si es de este usuario**."""
    return (
        await db.execute(
            select(AlertPreference).where(
                AlertPreference.id == preferencia_id,
                AlertPreference.user_id == usuario_id,
            )
        )
    ).scalar_one_or_none()


async def listar_preferencias(
    db: AsyncSession, usuario_id: int, *, solo_activas: bool = True
) -> list[AlertPreference]:
    consulta = select(AlertPreference).where(AlertPreference.user_id == usuario_id)
    if solo_activas:
        consulta = consulta.where(AlertPreference.is_active.is_(True))
    return list((await db.execute(consulta)).scalars().all())
