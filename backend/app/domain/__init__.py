"""Reglas de negocio puras, sin entrada/salida.

Lo que hay aquí no sabe de FastAPI, ni de SQLAlchemy, ni de proveedores
externos: define QUÉ necesita el producto, y `app/infra/` provee el CÓMO.

Se puede testear sin base de datos ni red.
"""
