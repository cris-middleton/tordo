"""Los 422 de validación, en español.

FastAPI responde a un parámetro inválido con la lista de errores de Pydantic, y
el `msg` de cada uno viene en inglés («Input should be less than or equal to
50»). Esa lista llega a una persona: `frontend/lib/errores.ts` enseña el `msg`
tal cual, y el integrador que llama a la API lo lee en su consola. El resto de
los errores del producto están en español.

**Sólo cambia `msg`.** La forma de la lista —`type`, `loc`, `input`, `ctx`—
queda como la deja FastAPI: es la que documenta `docs/API_PUBLICA.md` («`detail`
nombra el campo») y la que lee el frontend. Un tipo de error que no está aquí
conserva el mensaje de Pydantic: es mejor un mensaje en inglés que ninguno.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _numero(valor: Any) -> str:
    """Una cota como se escribe en Chile: `100.000`, `0,5`."""
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    if isinstance(valor, int):
        return f"{valor:,}".replace(",", ".")
    return str(valor).replace(".", ",")


def _campo(error: dict) -> str:
    """El nombre del parámetro: el último tramo de `loc` (`["query", "limit"]`)."""
    tramos = [str(t) for t in error.get("loc") or () if t not in ("query", "path", "body")]
    return f"«{tramos[-1]}»" if tramos else "El valor"


def mensaje(error: dict) -> str:
    """El `msg` en español de un error de validación de Pydantic."""
    tipo = error.get("type")
    ctx = error.get("ctx") or {}
    campo = _campo(error)
    if tipo == "missing":
        return f"Falta {campo}, que es obligatorio."
    if tipo == "string_too_short":
        n = ctx.get("min_length")
        return f"{campo} tiene que tener al menos {n} {'carácter' if n == 1 else 'caracteres'}."
    if tipo == "string_too_long":
        return f"{campo} admite como mucho {_numero(ctx.get('max_length'))} caracteres."
    if tipo == "greater_than_equal":
        return f"{campo} tiene que ser {_numero(ctx.get('ge'))} o más."
    if tipo == "greater_than":
        return f"{campo} tiene que ser mayor que {_numero(ctx.get('gt'))}."
    if tipo == "less_than_equal":
        return f"{campo} tiene que ser {_numero(ctx.get('le'))} o menos."
    if tipo == "less_than":
        return f"{campo} tiene que ser menor que {_numero(ctx.get('lt'))}."
    if tipo in ("int_parsing", "int_type", "int_from_float"):
        return f"{campo} tiene que ser un número entero."
    if tipo in ("float_parsing", "float_type", "finite_number"):
        return f"{campo} tiene que ser un número."
    if tipo in ("bool_parsing", "bool_type"):
        return f"{campo} tiene que ser true o false."
    if tipo == "literal_error":
        esperados = str(ctx.get("expected", "")).replace(" or ", " o ")
        return f"{campo} tiene que ser uno de estos valores: {esperados}."
    if tipo == "string_pattern_mismatch":
        return f"{campo} no tiene un valor válido."
    return str(error.get("msg", ""))


async def validacion_en_espanol(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """El manejador de `RequestValidationError`: el mismo 422 de FastAPI, con
    cada `msg` traducido."""
    errores = [{**error, "msg": mensaje(error)} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errores)})
