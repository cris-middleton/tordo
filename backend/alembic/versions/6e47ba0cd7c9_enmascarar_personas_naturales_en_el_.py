"""enmascarar personas naturales en el catálogo

Migración de DATOS (paso 6, parte A2 del pivote público; spec §8). Reescribe lo
ya guardado del catálogo con la regla que desde ahora aplica el ETL al entrar:
un proveedor con RUT bajo 50.000.000 —o sin RUT legible— es una persona natural
y no se guarda con nombre, RUT ni código.

- `licitaciones_detalle`: `datos_completos`, `items`, `participantes` y
  `proveedor_adjudicado`.
- `licitaciones`: `items` e `informacion_adicional`.
- `licitaciones_historial`: `snapshot_completo`; y en los cambios de `Items` y
  `Participantes`, `valor_anterior`/`valor_nuevo` se vacían y la descripción
  genérica se reescribe. Esos valores son el `str()` de un dict de Python, no
  JSON: no se pueden recorrer con garantías.

**La regla va COPIADA y congelada aquí**, no importada de
`etl/analytics/personas.py`: una migración tiene que poder correr igual dentro
de años, y si importara código vivo, renombrar ese módulo rompería `upgrade`
desde una base vacía. `etl/tests/test_migracion_personas_catalogo.py` fija que
esta copia y la viva dan lo mismo.

**Downgrade no hace nada**: lo que se tapó no se puede destapar.

Revision ID: 6e47ba0cd7c9
Revises: a31934181077
Create Date: 2026-10-11 21:11:58.662737

"""

import json
import re
import unicodedata
from collections.abc import Callable, Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6e47ba0cd7c9"
down_revision: str | None = "a31934181077"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ── Copia congelada de etl/analytics/personas.py (2026-10-11) ────────────────

UMBRAL_RUT_PERSONA_JURIDICA = 50_000_000
NOMBRE_ENMASCARADO = "Persona natural"

_CONTEXTOS_PROVEEDOR = ("participante", "oferente", "proveedor", "adjudicacion", "cotizacion")
_CALIFICADORES = ("proveedor", "oferente", "participante", "sucursal")
_DEL_COMPRADOR = ("comprador", "organismo", "unidad", "usuario", "responsable")
_CLAVES_PARTE = frozenset(
    {"proveedor", "oferente", "participante", "proveedorseleccionado", "proveedoradjudicado"}
)


def rut_numero(texto: Any) -> int | None:
    if texto is None:
        return None
    cuerpo = re.sub(r"[.\s]", "", str(texto)).split("-")[0]
    return int(cuerpo) if cuerpo.isdigit() else None


def es_persona_natural(rut: int | None) -> bool:
    return rut is None or rut < UMBRAL_RUT_PERSONA_JURIDICA


def _sin_tildes(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )


def _clave_norm(clave: Any) -> str:
    return _sin_tildes(str(clave)).lower().replace("_", "")


def _tipo_de_clave(clave: Any, en_contexto: bool, valor: Any = None) -> str | None:
    n = _clave_norm(clave)
    if any(c in n for c in _DEL_COMPRADOR):
        return None
    if n in _CLAVES_PARTE and isinstance(valor, str):
        return "nombre"
    calificada = any(c in n for c in _CALIFICADORES)
    if n.startswith("rut") and (calificada or en_contexto):
        return "rut"
    if ("nombre" in n or "razonsocial" in n) and (calificada or en_contexto):
        return "nombre"
    if n.startswith("codigo") and calificada:
        return "codigo"
    return None


def enmascarar_payload(dato: Any, *, en_contexto: bool = False) -> Any:
    if isinstance(dato, list):
        return [enmascarar_payload(v, en_contexto=en_contexto) for v in dato]
    if not isinstance(dato, dict):
        return dato

    tipos = {k: _tipo_de_clave(k, en_contexto, v) for k, v in dato.items()}
    ruts = [dato[k] for k, t in tipos.items() if t == "rut"]
    tiene_identidad = any(t is not None and dato[k] not in (None, "") for k, t in tipos.items())
    persona = tiene_identidad and es_persona_natural(
        next((n for n in map(rut_numero, ruts) if n is not None), None)
    )

    salida = {}
    for clave, valor in dato.items():
        tipo = tipos[clave]
        if persona and tipo == "nombre" and valor not in (None, ""):
            salida[clave] = NOMBRE_ENMASCARADO
        elif persona and tipo in ("rut", "codigo"):
            salida[clave] = None
        else:
            contexto = en_contexto or any(c in _clave_norm(clave) for c in _CONTEXTOS_PROVEEDOR)
            salida[clave] = enmascarar_payload(valor, en_contexto=contexto)
    return salida


# ── proveedor_adjudicado: «NOMBRE (RUT); NOMBRE (RUT); …» ─────────────────────
#
# Lo escribía `etl/utils/adjudicacion._formatear_proveedores`: cada ganador como
# «NOMBRE (RUT)», o sólo el nombre, o sólo el RUT; unidos por «; » y truncado a
# 500. Una parte que no se entiende —un nombre sin RUT, un paréntesis cortado
# por el truncado— no tiene RUT legible: persona natural, como manda la regla.

_PARTE_CON_RUT = re.compile(r"^(?P<nombre>.*) \((?P<rut>[^()]*)\)$")
_SOLO_RUT = re.compile(r"^[\d.\s]+-[\dkK]$")


def reescribir_proveedor_adjudicado(texto: str | None) -> str | None:
    if not texto:
        return texto
    empresas: list[str] = []
    hay_personas = False
    for parte in texto.split("; "):
        parte = parte.strip()
        if parte == NOMBRE_ENMASCARADO:
            hay_personas = True
            continue
        coincide = _PARTE_CON_RUT.match(parte)
        rut = coincide.group("rut") if coincide else (parte if _SOLO_RUT.match(parte) else None)
        if es_persona_natural(rut_numero(rut)):
            hay_personas = True
        else:
            empresas.append(parte)
    todas = empresas + ([NOMBRE_ENMASCARADO] if hay_personas else [])
    return "; ".join(todas)[:500] if todas else None


# ── Recorrido por lotes ──────────────────────────────────────────────────────

LOTE = 500


def _reescribir(
    tabla: str,
    columnas: dict[str, Callable[[Any], Any]],
    jsonb: set[str],
) -> int:
    """Recorre `tabla` por id y reescribe sólo las filas que cambian."""
    conn = op.get_bind()
    lista = ", ".join(columnas)
    sets = ", ".join(
        f"{c} = CAST(:{c} AS jsonb)" if c in jsonb else f"{c} = :{c}" for c in columnas
    )
    ultimo, cambiadas = 0, 0
    while True:
        filas = (
            conn.execute(
                sa.text(f"SELECT id, {lista} FROM {tabla} WHERE id > :u ORDER BY id LIMIT :n"),
                {"u": ultimo, "n": LOTE},
            )
            .mappings()
            .all()
        )
        if not filas:
            return cambiadas
        for fila in filas:
            nuevos = {c: f(fila[c]) for c, f in columnas.items()}
            if all(nuevos[c] == fila[c] for c in columnas):
                continue
            parametros = {
                c: (json.dumps(v, ensure_ascii=False) if c in jsonb and v is not None else v)
                for c, v in nuevos.items()
            }
            conn.execute(
                sa.text(f"UPDATE {tabla} SET {sets} WHERE id = :id"),
                {**parametros, "id": fila["id"]},
            )
            cambiadas += 1
        ultimo = filas[-1]["id"]


def upgrade() -> None:
    _reescribir(
        "licitaciones_detalle",
        {
            "datos_completos": enmascarar_payload,
            "items": enmascarar_payload,
            # La columna es la lista de oferentes A SECAS: no hay una clave
            # «Participantes» por encima que diga que `Rut`/`Nombre` son suyos.
            "participantes": lambda v: enmascarar_payload(v, en_contexto=True),
            "proveedor_adjudicado": reescribir_proveedor_adjudicado,
        },
        jsonb={"datos_completos", "items", "participantes"},
    )
    _reescribir(
        "licitaciones",
        {"items": enmascarar_payload, "informacion_adicional": enmascarar_payload},
        jsonb={"items", "informacion_adicional"},
    )
    _reescribir(
        "licitaciones_historial",
        {"snapshot_completo": enmascarar_payload},
        jsonb={"snapshot_completo"},
    )
    op.execute(
        """
        UPDATE licitaciones_historial
           SET valor_anterior = NULL,
               valor_nuevo = NULL,
               descripcion = CASE
                   WHEN descripcion LIKE 'Campo ''%'
                   THEN 'Campo ''' || campo_modificado || ''' cambió (valores retirados: '
                        || 'podían nombrar a personas naturales)'
                   ELSE descripcion
               END
         WHERE campo_modificado IN ('Items', 'Participantes')
           AND (valor_anterior IS NOT NULL OR valor_nuevo IS NOT NULL)
        """
    )


def downgrade() -> None:
    # Lo que se tapó no se puede destapar: los nombres y RUT no están en ninguna
    # parte. Revertir el esquema no tiene nada que revertir.
    pass
