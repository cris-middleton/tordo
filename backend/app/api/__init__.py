"""Routers HTTP.

**Vacío a propósito.** Importaba aquí los catorce routers, y eso convertía
cualquier `from app.api.deps import ...` en «importa la aplicación entera»: de
ahí salía una importación circular con `core.plan_limits`, que a su vez importa
`api.deps` para declarar sus dependencias de cuota.

`from app.api import alerts` sigue funcionando sin este fichero — Python importa
el submódulo igual. Lo que ya no ocurre es arrastrar los otros trece.
"""
