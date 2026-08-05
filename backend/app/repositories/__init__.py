"""Capa de acceso a datos.

Es el único lugar donde vive SQL. Los routers no consultan la base directamente
y los servicios piden los datos por aquí.

Hoy sólo está `analytics` (F2). El resto de los agregados se van moviendo desde
los routers en F3 — ver docs/ARQUITECTURA_REVISION_2026-08.md.
"""
