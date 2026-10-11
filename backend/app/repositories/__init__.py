"""Capa de acceso a datos.

Es el único lugar donde vive SQL. Los routers no consultan la base directamente
y los servicios piden los datos por aquí.

Hoy: `licitaciones` (catálogo) y `analytics` (tablas materializadas del BI).
"""
