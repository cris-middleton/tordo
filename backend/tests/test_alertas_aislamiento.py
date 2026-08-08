"""Una alerta es de su usuario, y de nadie más.

El router repetía `Alert.user_id == current_user.id` en seis endpoints y no
había **ningún** test que lo comprobara: quitar ese filtro de uno de los seis
—en un refactor, al mover código, al añadir un endpoint séptimo— no habría roto
nada visible, y habría dejado a cualquiera leer y borrar alertas ajenas
adivinando ids consecutivos.

Ahora el filtro vive en `repositories/alertas.py`, en un solo sitio, y esto lo
fija por los dos lados: el repositorio y los endpoints.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi import HTTPException

from app.api.alerts import delete_alert, get_alert, list_alerts, mark_alert_as_read
from app.models.alert import Alert, AlertStatus, AlertType
from app.models.user import User
from app.repositories import alertas as repo


@pytest_asyncio.fixture
async def otro_usuario(async_db) -> User:
    user = User(
        username="ajeno",
        email="ajeno@tordo-pruebas.cl",
        hashed_password="x",
        full_name="Usuario Ajeno",
        is_active=True,
    )
    async_db.add(user)
    await async_db.flush()
    return user


async def _alerta(db, usuario_id: int, titulo: str, *, estado=AlertStatus.SENT) -> Alert:
    alerta = Alert(
        user_id=usuario_id,
        alert_type=AlertType.MATCHED_PREFERENCE,
        status=estado,
        entity_type="test",
        entity_id=0,
        title=titulo,
        message="…",
        idempotency_key=f"k-{usuario_id}-{titulo}",
        notification_channels=["in_app"],
    )
    db.add(alerta)
    await db.flush()
    return alerta


# ── El repositorio ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_no_devuelve_la_alerta_de_otro(async_db, sample_user, otro_usuario):
    ajena = await _alerta(async_db, otro_usuario.id, "ajena")

    assert await repo.obtener_alerta(async_db, ajena.id, sample_user.id) is None
    # …y sí la suya, para que el test anterior no pase por no encontrar nada.
    mia = await _alerta(async_db, sample_user.id, "mia")
    assert await repo.obtener_alerta(async_db, mia.id, sample_user.id) is not None


@pytest.mark.asyncio
async def test_el_listado_no_mezcla_usuarios(async_db, sample_user, otro_usuario):
    await _alerta(async_db, sample_user.id, "mia-1")
    await _alerta(async_db, sample_user.id, "mia-2")
    await _alerta(async_db, otro_usuario.id, "ajena")

    items, total, _no_leidas = await repo.listar_alertas(async_db, sample_user.id, limite=100)

    assert total == 2
    assert {a.title for a in items} == {"mia-1", "mia-2"}


@pytest.mark.asyncio
async def test_las_no_leidas_no_dependen_de_los_filtros(async_db, sample_user):
    """Es el número del badge de la campana.

    Si se contaran con los filtros aplicados, filtrar por "leídas" dejaría el
    badge en cero mientras siguen llegando alertas sin leer.
    """
    await _alerta(async_db, sample_user.id, "sin-leer-1")
    await _alerta(async_db, sample_user.id, "sin-leer-2")
    await _alerta(async_db, sample_user.id, "leida", estado=AlertStatus.READ)

    _items, total, no_leidas = await repo.listar_alertas(
        async_db, sample_user.id, estado=AlertStatus.READ, limite=100
    )

    assert total == 1, "el filtro sí acota la lista"
    assert no_leidas == 2, "pero el contador de la campana cuenta todas"


# ── A través de los endpoints ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_leer_una_alerta_ajena_da_404(async_db, sample_user, otro_usuario):
    ajena = await _alerta(async_db, otro_usuario.id, "ajena")

    with pytest.raises(HTTPException) as exc:
        await get_alert(alert_id=ajena.id, db=async_db, current_user=sample_user)
    # 404 y no 403: distinguir "no existe" de "no es tuya" permitiría enumerar
    # los ids de otros.
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_marcar_como_leida_una_alerta_ajena_da_404(async_db, sample_user, otro_usuario):
    ajena = await _alerta(async_db, otro_usuario.id, "ajena")

    with pytest.raises(HTTPException) as exc:
        await mark_alert_as_read(alert_id=ajena.id, db=async_db, current_user=sample_user)
    assert exc.value.status_code == 404
    assert ajena.status != AlertStatus.READ


@pytest.mark.asyncio
async def test_borrar_una_alerta_ajena_da_404_y_no_la_borra(async_db, sample_user, otro_usuario):
    ajena = await _alerta(async_db, otro_usuario.id, "ajena")

    with pytest.raises(HTTPException) as exc:
        await delete_alert(alert_id=ajena.id, db=async_db, current_user=sample_user)
    assert exc.value.status_code == 404

    assert await repo.obtener_alerta(async_db, ajena.id, otro_usuario.id) is not None


@pytest.mark.asyncio
async def test_el_endpoint_del_listado_pagina_bien(async_db, sample_user):
    for i in range(5):
        await _alerta(async_db, sample_user.id, f"a{i}")

    respuesta = await list_alerts(
        skip=2,
        limit=2,
        status_filter=None,
        alert_type=None,
        unread_only=False,
        db=async_db,
        current_user=sample_user,
    )

    assert respuesta.total == 5
    assert len(respuesta.items) == 2
    assert respuesta.page == 2
    assert respuesta.pages == 3
