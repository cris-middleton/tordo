"""Cotas de los parámetros de la superficie pública.

Toda la API es anónima desde el pivote: cualquier parámetro sin cota es una forma
barata de hacer trabajar al servidor (un `search` de 1 MB, un `offset` de mil
millones, un id que desborda la columna y vuelve 500). Los valores son holgados
para un uso real y van en un solo sitio; `tests/test_parametros_acotados.py`
recorre el OpenAPI y falla si aparece un parámetro de texto o entero sin cota.
"""

#: Códigos de Mercado Público: organismo, producto (UNSPSC), licitación,
#: proveedor. El más largo real anda por los 20 caracteres.
CODIGO = 64
#: Nombres que vienen de una lista: rubro, sector, región, unidad, estado, slug.
NOMBRE = 200
#: Texto libre de búsqueda.
TEXTO = 100
#: Paginación por `offset`: más allá, quien recorre todo debería usar la descarga
#: masiva de ChileCompra, no paginar el catálogo.
OFFSET_MAX = 100_000
#: Los id de `licitaciones` son `integer` de Postgres: uno mayor no existe, y sin
#: cota llegaba a la base y volvía 500 en vez de 404.
ID_MAX = 2_147_483_647
#: Términos de búsqueda que se combinan con AND en Compra Ágil.
MAX_TERMINOS = 8
