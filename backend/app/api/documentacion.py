"""Lo que un integrador lee antes de escribir la primera línea.

Vive aquí y no en un README porque **es la propia API la que lo publica**: va al
documento OpenAPI, y de ahí a `/docs`, a los generadores de cliente y a
cualquiera que se descargue el esquema. Un README se queda viejo sin que nada
falle; esto viaja con la aplicación que describe.

Las etiquetas cumplen además una función que no es cosmética: `SUPERFICIE`
declara **qué es público y qué no**, y `tests/test_superficie_publica.py` falla
si aparece un router sin clasificar. Sin esa declaración explícita, «la API
pública» sería «todo lo que resultó estar montado», que es una promesa de
estabilidad que nadie decidió dar.
"""

from __future__ import annotations

from app.config import settings
from app.core.versionado import PREFIJO_API, VERSION_API

#: Qué se promete de cada grupo de endpoints.
#:
#: - `publica`  — pensada para integrarse. Cambios incompatibles sólo con una
#:                versión nueva del prefijo.
#: - `interna`  — la usa la aplicación web. Puede cambiar sin aviso: documentarla
#:                como estable ataría el producto a su propia pantalla de hoy.
SUPERFICIE: dict[str, str] = {
    "tenders": "publica",
    "bi": "publica",
    "compra-agil": "publica",
    "publico": "publica",
    "health": "interna",
    "raiz": "interna",
}

ETIQUETAS: list[dict[str, str]] = [
    {
        "name": "tenders",
        "description": (
            "Licitaciones, Compras Ágiles y Convenios Marco. El mecanismo de "
            "compra se filtra con `tipo_convocatoria`; un valor desconocido "
            "devuelve 422 y no el catálogo entero. `abiertas=true` deja sólo lo "
            "que se puede postular ahora (publicado, sin cierre o con cierre futuro)."
        ),
    },
    {
        "name": "bi",
        "description": (
            "Inteligencia de mercado: bandas de precio, competencia, compradores "
            "y oportunidad. Limitados por IP y por minuto."
        ),
    },
    {
        "name": "compra-agil",
        "description": (
            "«Lo mejor de hoy»: Compras Ágiles abiertas que cierran en más de 2 h, "
            "ordenadas por un puntaje HEURÍSTICO (producto de historia del "
            "comprador, tiempo para cotizar y monto; el centro de su escala el factor sin "
            "dato, y 0 el comprador que no compró nada en la ventana; la "
            "competencia se informa pero no pesa). Ningún "
            "dato de proveedor: sólo conteos."
        ),
    },
    {
        "name": "publico",
        "description": (
            "Páginas públicas de comprador, rubro y producto, su sitemap y las "
            "cifras de la portada (`/publico/portada`: cuántas licitaciones y "
            "Compras Ágiles se pueden postular ahora, con su hora) y del mercado "
            "entero (`/publico/mercado`: gasto mensual por sector y en cuántos "
            "mercados un proveedor se lleva la mitad o más). Las "
            "URL van por código de comprador o por `slug` (sin tildes, minúsculas, "
            "guiones): el slug lo da la API, no se calcula del lado del cliente. "
            "`indexable` dice si la página tiene datos suficientes para ofrecerse "
            "a un buscador; una no indexable responde igual, con 200."
        ),
    },
    {"name": "health", "description": "Sonda de la plataforma. Fuera de la versión."},
    {
        "name": "raiz",
        "description": "Punto de entrada: versión y enlaces a la documentación.",
    },
]

DESCRIPCION = f"""
API de {settings.app_name} sobre datos de Mercado Público (ChileCompra).

## Acceso

**Anónimo.** No hay cuentas, claves ni sesiones: desde el pivote a sitio público
(octubre de 2026) todo lo que expone esta API se lee sin credencial.

## Versionado

Todo cuelga de `{PREFIJO_API}`. Dentro de `{VERSION_API}` no se quitan campos ni se
cambia el significado de los que hay; **añadir campos sí se considera
compatible**, así que un cliente no debe romperse ante uno que no conoce. Un
cambio incompatible estrena prefijo.

`/health` queda fuera de la versión a propósito: lo consulta la plataforma, no
un cliente.

## Formato de las respuestas

Planas, sin sobre. El éxito lo lleva el código HTTP; no hay `{{"success": ...}}`
que mirar aparte. Los errores traen `{{"detail": "..."}}`.

## Límites de uso

Todo `/api/v1/*` y el MCP se limitan **por IP y por minuto** (60). Cada
respuesta lleva `X-RateLimit-Limit`, `X-RateLimit-Remaining` y
`X-RateLimit-Reset` (segundos) también cuando se deja pasar; al pasarse, la
respuesta es **429** con `Retry-After` en segundos.

## Servidor MCP

Los mismos datos, para un cliente de modelo de lenguaje, en `/mcp/` — **fuera de
`/api/v1`**, porque MCP versiona su propio protocolo.

Es anónimo y expone **cuatro** herramientas de grano grueso. Son cuatro y no
veinte a propósito: un modelo encadena unas quince llamadas donde una persona
hace tres. Ver `docs/API_PUBLICA.md`.

## Errores

| código | qué significa |
|---|---|
| 404 | no existe |
| 422 | parámetros inválidos |
| 429 | límite por minuto — espera lo que diga `Retry-After` |
| 503 | el módulo está desactivado en este despliegue (feature flag) |

Toda respuesta lleva `X-Request-ID`. **Cítalo al reportar un problema**: es lo
que permite encontrar la traza del servidor.
"""
