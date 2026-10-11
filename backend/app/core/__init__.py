"""Vacío a propósito, por el mismo motivo que `app/api/__init__.py`.

Aquí se re-exportaban nombres de un módulo de seguridad, y eso convertía
cualquier `from app.core.tiempo import ...` en «importa ese módulo entero», que
cerraba un ciclo de importación. Los consumidores importan el submódulo directo.

`tests/test_modulos_importables.py` importa cada módulo en un proceso limpio
para que un ciclo no vuelva sin que nadie lo note.
"""
