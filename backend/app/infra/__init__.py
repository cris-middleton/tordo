"""Adaptadores a sistemas externos.

Implementan los puertos definidos en `app/domain/`. Es el único sitio que sabe
de Stripe, Twilio, S3 o Mercado Público: el dominio y los servicios hablan con
las interfaces, no con los proveedores.
"""
