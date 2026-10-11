"""Routers HTTP.

**Vacío a propósito.** Importar aquí los routers convertía cualquier
`from app.api.x import ...` en «importa la aplicación entera», y de ahí salió una
importación circular que dependía del orden de importación.

`from app.api import bi` sigue funcionando sin este fichero — Python importa el
submódulo igual. Lo que ya no ocurre es arrastrar los demás.
"""
