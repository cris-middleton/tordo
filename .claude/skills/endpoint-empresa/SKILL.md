---
name: endpoint-empresa
description: Usar SIEMPRE antes de crear o modificar un endpoint que reciba un empresa_id o que devuelva datos de una empresa (documentos, postulaciones, estado hábil, perfiles TF-IDF, alertas, BI con empresa_id). Garantiza el aislamiento entre inquilinos, que hoy depende de una llamada manual fácil de olvidar.
---

# Endpoint con datos de empresa

## Por qué existe este skill

TORDO es multi-inquilino: un usuario pertenece a N empresas vía `EmpresaUsuario` (con rol
`owner` / `admin` / `viewer`). **El aislamiento entre empresas no está garantizado por
construcción**: depende de que cada endpoint llame a mano al verificador de membresía.

Hoy esa llamada aparece repetida en 12+ sitios, y en `api/bi.py` está inlineada cuatro veces
con variantes distintas. **Un endpoint nuevo sin esa verificación es una fuga de datos entre
empresas** — el usuario de la empresa A ve documentos, postulaciones o perfiles de la B.

Arreglar esto de raíz (una dependencia de FastAPI) es F3. Hasta entonces, este skill es la
red de seguridad.

## Regla

> Si el endpoint recibe un `empresa_id`, o devuelve algo que pertenece a una empresa,
> **verifica la membresía antes de tocar la base**. Sin excepciones.

## Cómo se hace

Por dependencia. No escribas la comprobación a mano.

```python
from app.api.deps import EmpresaContext, empresa_ctx, require_rol

# Lectura: basta con ser miembro
@router.get("/api/algo/{empresa_id}")
async def leer(ctx: EmpresaContext = Depends(empresa_ctx), db=Depends(get_db)):
    ...  # ctx.empresa_id ya está autorizado

# Escritura: exige rol
@router.post("/api/algo/{empresa_id}")
async def escribir(ctx: EmpresaContext = Depends(require_rol("owner", "admin"))):
    ...
```

Si el `empresa_id` **no viene por path** —llega en el cuerpo, o sale de una entidad que
acabas de cargar— no puede resolverse como dependencia. Usa la misma función que usan las
dependencias por dentro:

```python
from app.api.deps import verificar_acceso_empresa

ctx = await verificar_acceso_empresa(payload.empresa_id, current_user, db)
```

`EmpresaContext` expone `empresa_id`, `rol`, `puede_escribir` y `es_owner`. Que exista una
instancia significa que la membresía ya se verificó: los servicios pueden confiar en ella.

### Qué rol pedir

| Operación | Rol mínimo |
|---|---|
| Leer (listar, ver detalle, BI) | cualquiera — basta la membresía |
| Crear / editar (documentos, postulaciones, perfil TF-IDF) | `owner` o `admin` |
| Eliminar la empresa, gestionar miembros | `owner` |

`viewer` **nunca** escribe.

## Errores concretos que ya se cometieron aquí

1. **Verificar existencia pero no membresía.** `_get_empresa_or_404` no autoriza nada: sólo
   dice que la empresa existe. Sin `_get_membership_or_403`, cualquier usuario autenticado
   lee cualquier empresa con sólo adivinar el UUID.
2. **Inlinear la consulta en vez de usar el helper.** Pasó cuatro veces en `bi.py` y una en
   `tenders.py`, cada una ligeramente distinta. Usa el helper.
3. **Autenticación opcional.** `data_inspection.py` tenía un esquema con `auto_error=False`
   que dejaba pasar peticiones sin token. Se cerró en F0 con una dependencia a nivel de
   router. **No añadas rutas a ese router que la salten.**
4. **Filtrar por `empresa_id` en el `WHERE` y dar eso por autorización.** No lo es: el
   `empresa_id` viene del cliente. Hay que validar que el usuario pertenezca a esa empresa.

## Checklist antes de cerrar el PR

- [ ] El endpoint declara `current_user: User = Depends(get_current_active_user)`
- [ ] Llama a `_get_membership_or_403` antes de cualquier consulta con `empresa_id`
- [ ] Si escribe, valida el rol
- [ ] Hay un test que un usuario **no miembro** recibe 403
- [ ] Si escribe, hay un test que un `viewer` recibe 403
- [ ] El schema de respuesta no filtra campos de otras empresas (revisa los `join`)

## Test que hay que escribir

```python
async def test_endpoint_rechaza_usuario_no_miembro(async_db, sample_empresa):
    otro = User(username="ajeno", email="ajeno@x.cl", hashed_password="x", is_active=True)
    async_db.add(otro)
    await async_db.commit()

    resp = client.get(f"/api/algo/{sample_empresa.id}", headers=auth_header(otro))
    assert resp.status_code == 403
```

`backend/tests/test_dashboard_home_endpoint.py::test_home_endpoint_rejects_empresa_user_is_not_member_of`
es el ejemplo vigente a copiar.
