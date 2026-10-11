"""El calendario de Celery, comprobado contra las tareas que existen de verdad.

`beat_schedule` nombra las tareas por **cadena**. Si esa cadena no corresponde a
ninguna tarea registrada, beat la encola igual y el worker la rechaza con
`Received unregistered task`: el trabajo no se hace y nada falla donde se mira.
Es un fallo que sólo aparece en producción, un lunes a las 4:30.
"""

from __future__ import annotations

import pytest

from app.celery_app import celery_app

PROGRAMADAS = sorted(
    (nombre, entrada["task"]) for nombre, entrada in celery_app.conf.beat_schedule.items()
)


@pytest.mark.parametrize("nombre,tarea", PROGRAMADAS, ids=[n for n, _ in PROGRAMADAS])
def test_la_tarea_programada_esta_registrada(nombre: str, tarea: str):
    assert tarea in celery_app.tasks, (
        f"«{nombre}» programa «{tarea}», que no está registrada. Falta importar "
        f"su módulo al final de app/celery_app.py."
    )


def test_hay_calendario():
    """Si `beat_schedule` quedara vacío, el test parametrizado pasaría con cero
    casos y diría que todo está bien sin haber comprobado nada.

    Antes ≥10; el pivote público retiró las cuentas y quedan las cuatro del ETL
    (horaria, diaria, bulk semanal y watchdog)."""
    assert len(PROGRAMADAS) >= 4
