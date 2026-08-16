"""Vacío a propósito, por el mismo motivo que `app/api/__init__.py`.

Aquí se re-exportaba media docena de nombres de `app.core.security`, y eso
convertía cualquier `from app.core.tiempo import ...` en «importa `security`
entero» — que importa `app.models.empresa`, que a su vez importa de `app.core`.
Un ciclo real.

**Nadie usaba las re-exportaciones**: todos los consumidores importan el
submódulo directo (`from app.core import plan_limits`, `from app.core import
limites_api`). Sólo servían para hacer caro y frágil el import de cualquier otra
cosa de este paquete.

`tests/test_modulos_importables.py` importa cada módulo en un proceso limpio
para que el ciclo no vuelva sin que nadie lo note.
"""
