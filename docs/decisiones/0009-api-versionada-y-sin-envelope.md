# 0009 · La API va versionada en la URL y sin envelope

- **Fecha**: 2026-08-08
- **Estado**: aceptada
- **Reemplaza a**: nada
- **Relacionada**: [0004 · LLM sólo por MCP](0004-llm-solo-mcp.md)

## Contexto

La revisión de arquitectura dejó dos cosas sin decidir, y lo anotó así: *«cualquiera de
las dos está bien — lo que no está bien es no haber decidido»*. Son:

1. **El envelope de respuesta.** `api-ref` usa `{success, data, message?}`; TORDO devuelve
   el objeto plano.
2. **El versionado.** Todos los endpoints colgaban de `/api/...`, sin versión.

Mientras tanto pasaron dos cosas que cambian el cálculo:

- **Las claves de API ya existen.** `tordo_<prefijo>_<secreto>` está construido y probado: un
  ERP, un script o un servidor MCP pueden integrarse hoy mismo.
- **El webhook de MercadoPago todavía no está registrado.** La URL de notificación se
  configura en el panel del proveedor, y aún no se ha hecho.

## Decisión

### 1 · Respuestas planas, sin envelope

El endpoint devuelve el objeto. Nada de `{success, data}`.

- **HTTP ya lleva el éxito en el código de estado.** Un envelope invita a la deriva que se ve
  en todas las APIs que lo adoptan: responder 200 con `{success: false}`, y a partir de ahí
  cada cliente tiene que mirar dos sitios para saber si algo falló.
- **Es lo idiomático en FastAPI**, y por tanto lo que genera un OpenAPI legible: el schema
  describe la carga útil directamente. Con envelope, todo cliente generado empieza por
  desenvolver.
- **Ya está así en los 92 endpoints.** Adoptar el envelope sería trabajo por coherencia con
  otro repositorio con el que este proyecto no comparte nada.

Los errores siguen como están: `HTTPException` con `detail`, en español, y en los 402 de
cuota un objeto con plan, límite y consumo.

### 2 · Versión en la URL: `/api/v1`

Todos los endpoints del producto cuelgan de `/api/v1`. **`/health` no**, porque lo consulta
el healthcheck de la plataforma y no un cliente de la API; versionarlo obligaría a tocar la
configuración de Railway en cada subida de versión.

El prefijo se aplica **en `main.py`**, no dentro de cada router: los routers declaran su ruta
relativa (`/tenders`, `/empresas`…) y no saben nada de la versión. Publicar una v2 es montar
los mismos routers bajo otro prefijo, no editar catorce ficheros.

## Por qué ahora y no cuando haga falta

Porque «cuando haga falta» ya es tarde. En el momento en que un integrador use
`/api/tenders`, esa forma hay que sostenerla — y sin versión en la URL no hay ningún sitio
donde poner el cambio.

Hay además una ventana que se cierra sola: **el webhook de MercadoPago aún no está
registrado**. Cambiar `/api/webhooks/...` hoy cuesta cero; hacerlo después es un cambio
coordinado con el proveedor, con una ventana en la que los pagos no se confirman.

## Qué se descartó

**Mantener `/api/...` como alias oculto durante una transición.** Es lo habitual, y aquí
habría evitado unos minutos de 404 durante el despliegue: backend y frontend son dos
servicios de Railway y no se actualizan en el mismo segundo.

Se descarta porque duplicaría **todas** las rutas de forma permanente en la práctica — un
alias «temporal» que nadie quita es la definición de deuda. Con cero usuarios pagando, unos
minutos de 404 en un despliegue son un precio menor que arrastrar dos superficies.

**Consecuencia operativa, dicha claro:** este cambio toca backend y frontend a la vez. Van en
el mismo commit y el mismo CI; entre que Railway termina un servicio y el otro hay una
ventana corta en la que el frontend viejo pide `/api/...` y recibe 404. Es un evento único.

## Consecuencias

- `backend/app/core/versionado.py` y `frontend/lib/versionApi.ts` tienen la versión. Están
  **duplicadas a propósito**: el frontend no importa nada de Python, y si se desincronizan
  todas las llamadas fallan a la vez — ruidoso, no silencioso.
- La tabla de contrato de BI y los tests estructurales pasan a trabajar con rutas **relativas
  a la versión**: sacar una v2 no debería obligar a reescribir 22 líneas que no cambiaron de
  significado.
- `tests/rutas.py` compone el prefijo al recorrer, y **compara el resultado contra el propio
  OpenAPI**. El prefijo se lee de `include_context`, que es interno de FastAPI; si un día
  desaparece, la guarda lo dice en vez de dejar los tests comparando `/tenders/` contra
  `/api/v1/tenders/` y encontrando cero coincidencias.
- `backend/tests/test_versionado_api.py` fija las dos decisiones.

## Cuándo tocará una v2

Cuando haya que romper el contrato de una respuesta que un integrador ya consume. Añadir un
campo opcional **no** es romper; quitarlo, renombrarlo o cambiar su tipo, sí.
