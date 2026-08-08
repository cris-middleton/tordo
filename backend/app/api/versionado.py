"""La versión de la API, en un solo sitio.

Por qué existe
--------------
Las claves de API (`tordo_<prefijo>_<secreto>`) son una capacidad del producto:
un ERP o un script pueden integrarse hoy mismo. En cuanto alguien lo haga, dejar
de poder cambiar una respuesta sin romperle la integración es cuestión de
tiempo — y sin versión en la URL no hay ningún sitio donde poner el cambio.

Ponerlo ANTES del primer integrador cuesta un renombrado mecánico. Ponerlo
después obliga a sostener las dos formas para siempre.

Cómo se publica una v2
----------------------
Los routers declaran su ruta **relativa** (`/tenders`, `/empresas`…) y no saben
nada de la versión: `main.py` los monta bajo este prefijo. Sacar una v2 es
montar los mismos routers —o los que cambien— bajo `/api/v2`, no editar catorce
ficheros.

Qué NO se versiona
------------------
`/health`, porque lo consulta el healthcheck de la plataforma y no un cliente de
la API. Versionarlo obligaría a tocar la configuración de Railway en cada subida
de versión, que es justo lo que el versionado intenta evitar.
"""

VERSION_API = "v1"

PREFIJO_API = f"/api/{VERSION_API}"
