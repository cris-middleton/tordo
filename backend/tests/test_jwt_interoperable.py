"""El JWT es un formato, no una librería.

Se migró de `python-jose` a `PyJWT` porque el primero arrastra `ecdsa`, con una
vulnerabilidad de temporización que **no tiene versión que la arregle**.

El riesgo de un cambio así no es que falle: es que **funcione con los tokens
nuevos y rechace los que ya están en el navegador de los usuarios**, echando a
todo el mundo en el despliegue sin que ningún test lo note.

Por eso aquí el token no se construye con la librería: se arma **a mano** según
el RFC 7519, que es lo que hace comparable una implementación con otra.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from app.config import settings
from app.core.security import create_access_token, decode_access_token


def _token_hs256_a_mano(payload: dict, secreto: str) -> str:
    """Un JWT HS256 sin usar la librería del proyecto."""

    def b64(d: bytes) -> bytes:
        return base64.urlsafe_b64encode(d).rstrip(b"=")

    cabecera = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    cuerpo = b64(json.dumps(payload, separators=(",", ":")).encode())
    firma = b64(hmac.new(secreto.encode(), cabecera + b"." + cuerpo, hashlib.sha256).digest())
    return (cabecera + b"." + cuerpo + b"." + firma).decode()


def test_acepta_un_token_emitido_por_otra_implementacion():
    """El caso del despliegue: tokens ya emitidos, en el navegador del usuario."""
    token = _token_hs256_a_mano({"sub": "42", "exp": int(time.time()) + 600}, settings.secret_key)
    assert decode_access_token(token) == {"sub": "42", "exp": token and _exp(token)}


def _exp(token: str) -> int:
    cuerpo = token.split(".")[1]
    cuerpo += "=" * (-len(cuerpo) % 4)
    return json.loads(base64.urlsafe_b64decode(cuerpo))["exp"]


def test_lo_que_emitimos_lo_entiende_una_implementacion_ajena():
    """La otra dirección: que no estemos generando algo no estándar."""
    token = create_access_token({"sub": "7"})
    cabecera, cuerpo, firma = token.split(".")

    esperada = base64.urlsafe_b64encode(
        hmac.new(
            settings.secret_key.encode(), f"{cabecera}.{cuerpo}".encode(), hashlib.sha256
        ).digest()
    ).rstrip(b"=")
    assert firma.encode() == esperada, "la firma no es HS256 estándar"


def test_una_firma_alterada_se_rechaza():
    token = create_access_token({"sub": "7"})
    assert decode_access_token(token[:-4] + "AAAA") is None


def test_un_token_caducado_se_rechaza():
    token = _token_hs256_a_mano({"sub": "42", "exp": int(time.time()) - 1}, settings.secret_key)
    assert decode_access_token(token) is None


def test_un_token_firmado_con_otro_secreto_se_rechaza():
    token = _token_hs256_a_mano({"sub": "42", "exp": int(time.time()) + 600}, "otro-secreto")
    assert decode_access_token(token) is None
