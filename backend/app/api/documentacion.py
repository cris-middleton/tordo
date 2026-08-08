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
    "alerts": "publica",
    "empresas": "publica",
    "postulaciones": "publica",
    "documentos": "publica",
    "estado_habil": "publica",
    "dashboard": "interna",
    "authentication": "interna",
    "users": "interna",
    "billing": "interna",
    "webhooks": "interna",
    "health": "interna",
    "data-inspection": "interna",
    "files": "interna",
    "raiz": "interna",
}

ETIQUETAS: list[dict[str, str]] = [
    {
        "name": "tenders",
        "description": (
            "Licitaciones, Compras Ágiles y Convenios Marco. El mecanismo de "
            "compra se filtra con `tipo_convocatoria`; un valor desconocido "
            "devuelve 422 y no el catálogo entero."
        ),
    },
    {
        "name": "bi",
        "description": (
            "Inteligencia de mercado: bandas de precio, competencia, compradores "
            "y oportunidad. **Los endpoints de BI consumen cuota diaria del plan** "
            "además del límite por minuto."
        ),
    },
    {"name": "alerts", "description": "Alertas y sus preferencias de envío."},
    {
        "name": "empresas",
        "description": (
            "Empresas, miembros, claves de API y vigilancia de precios. La "
            "suscripción y los límites son de la empresa, no del usuario."
        ),
    },
    {"name": "postulaciones", "description": "Seguimiento de postulaciones y su checklist."},
    {"name": "documentos", "description": "Documentos de la empresa y su vencimiento."},
    {"name": "estado_habil", "description": "Estado hábil en el Registro de Proveedores."},
    {"name": "dashboard", "description": "Agregados de la pantalla de inicio. **Interna.**"},
    {"name": "authentication", "description": "Sesión de navegador. **Interna.**"},
    {"name": "users", "description": "Perfil del usuario. **Interna.**"},
    {"name": "billing", "description": "Suscripción y pagos. **Interna.**"},
    {"name": "webhooks", "description": "Notificaciones de la pasarela. **Interna.**"},
    {"name": "health", "description": "Sonda de la plataforma. Fuera de la versión."},
    {"name": "data-inspection", "description": "Explorador de datos. **Interna.**"},
    {"name": "files", "description": "Descarga de adjuntos. **Interna.**"},
    {
        "name": "raiz",
        "description": "Punto de entrada: versión y enlaces a la documentación.",
    },
]

DESCRIPCION = f"""
API de {settings.app_name} sobre datos de Mercado Público (ChileCompra).

## Autenticación

Todo pasa por `Authorization: Bearer <credencial>`, y hay dos tipos de
credencial:

| credencial | para qué | caduca |
|---|---|---|
| **Clave de API** — `tordo_<prefijo>_<secreto>` | integraciones sin navegador: ERP, scripts, MCP | no, hasta que se revoca |
| JWT de sesión | la aplicación web | 30 minutos |

**Para integrar, usa una clave de API.** Se emite en
`POST {PREFIJO_API}/empresas/{{empresa_id}}/api-keys` con rol `owner` o `admin`, y
**el secreto sólo se devuelve en esa respuesta**: no hay forma de recuperarlo
después, porque en la base sólo queda su hash.

Una clave **pertenece a una empresa y la fija**. Pedir datos de otra devuelve
403 aunque quien la creó pertenezca a las dos: es la barrera que hace que
filtrar una clave no exponga el resto de la cuenta.

## Versionado

Todo cuelga de `{PREFIJO_API}`. Dentro de `{VERSION_API}` no se quitan campos ni se
cambia el significado de los que hay; **añadir campos sí se considera
compatible**, así que un cliente no debe romperse ante uno que no conoce. Un
cambio incompatible estrena prefijo.

`/health` queda fuera de la versión a propósito: lo consulta la plataforma, no
un cliente.

## Formato de las respuestas

Planas, sin sobre. El éxito lo lleva el código HTTP; no hay `{{"success": ...}}`
que mirar aparte. Los errores traen `{{"detail": ...}}` — texto en los normales,
y un objeto con `bloqueada_por_plan`, `limite`, `usado` y `upgrade_sugerido`
cuando el bloqueo es de plan (402).

## Límites de uso

Las peticiones autenticadas **con clave de API** se cuentan por clave y por
minuto, según el plan de la empresa. Cada respuesta lo anuncia:

    X-RateLimit-Limit: 120
    X-RateLimit-Remaining: 118

Al pasarse, la respuesta es **429** con `Retry-After: 60`. Se cuenta por clave y
no por IP porque una integración sale por una sola IP de oficina: limitar ahí
mezclaría a toda la empresa en el mismo cubo.

Los endpoints de **BI** consumen además **cuota diaria** del plan, y al agotarla
devuelven **402** con el detalle de cuánto se usó y qué plan lo levanta.

## Servidor MCP

Los mismos datos, para un cliente de modelo de lenguaje, en `/mcp/` — **fuera de
`/api/v1`**, porque MCP versiona su propio protocolo.

Se autentica con la misma clave de API, expone **cuatro** herramientas de grano
grueso y **cada llamada descuenta de la cuota diaria de BI**. Son cuatro y no
veintidós a propósito: un modelo encadena unas quince llamadas donde una persona
hace tres. Ver `docs/API_PUBLICA.md`.

## Errores

| código | qué significa |
|---|---|
| 401 | credencial ausente, inválida, revocada o caducada |
| 403 | la credencial es válida pero no alcanza a esa empresa o ese rol |
| 402 | tope del plan — mira `detail.upgrade_sugerido` |
| 404 | no existe, o no es de tu empresa (no se distingue a propósito) |
| 422 | parámetros inválidos |
| 429 | límite por minuto — espera lo que diga `Retry-After` |

Toda respuesta lleva `X-Request-ID`. **Cítalo al reportar un problema**: es lo
que permite encontrar la traza del servidor.
"""
