"""El hash de contraseña es un formato, no una librería.

Se quitó `passlib`, que no publica una versión desde 2020 y era lo que obligaba a
mantener `bcrypt` clavado en 4.0.1. Ahora se usa bcrypt directamente.

El riesgo de un cambio así no es que falle: es que **funcione con las contraseñas
nuevas y rechace las de todos los usuarios ya registrados**. Por eso el hash de
referencia de este archivo lo generó passlib, no el código actual.
"""

from __future__ import annotations

import pytest

from app.core.security import LIMITE_BCRYPT, get_password_hash, verify_password

# Emitido por `passlib.CryptContext(schemes=["bcrypt"]).hash("Contrasena.Larga.1")`
# antes de quitar passlib. No lo regeneres: su valor es venir de la otra librería.
HASH_DE_PASSLIB = "$2b$12$fJD8Q8/xlOvVDp7WGOTEHuWK89.M28RoxvtYwgW/UDrro/eNVJgBq"
CLAVE_DE_ESE_HASH = "Contrasena.Larga.1"


def test_verifica_un_hash_emitido_por_passlib():
    """El caso del despliegue: usuarios ya registrados."""
    assert verify_password(CLAVE_DE_ESE_HASH, HASH_DE_PASSLIB) is True


def test_rechaza_la_clave_equivocada_contra_ese_mismo_hash():
    assert verify_password("otra-cosa", HASH_DE_PASSLIB) is False


def test_ida_y_vuelta():
    h = get_password_hash("Nueva.Clave.1")
    assert h.startswith("$2b$"), "el formato tiene que seguir siendo bcrypt estándar"
    assert verify_password("Nueva.Clave.1", h) is True
    assert verify_password("Nueva.Clave.2", h) is False


def test_dos_hashes_de_la_misma_clave_son_distintos():
    """Salt aleatorio: sin él, dos usuarios con la misma clave se delatan."""
    assert get_password_hash("misma") != get_password_hash("misma")


def test_una_clave_de_mas_de_72_bytes_no_revienta():
    """bcrypt ignora lo que pase de 72 bytes.

    passlib truncaba en silencio; bcrypt 5 **lanza**. Se trunca a mano para
    conservar el comportamiento anterior: si no, quien tuviera una contraseña más
    larga se quedaría fuera, porque su hash se calculó sobre los primeros 72
    bytes.
    """
    larga = "a" * 100
    h = get_password_hash(larga)
    assert verify_password(larga, h) is True
    # Y sigue siendo cierto lo que ya era cierto con passlib: los primeros 72
    # bytes bastan. No es un fallo nuevo, es cómo funciona bcrypt.
    assert verify_password("a" * LIMITE_BCRYPT, h) is True


def test_un_hash_corrupto_devuelve_false_y_no_revienta():
    """passlib devolvía False; bcrypt lanza. Un registro corrupto no debe tumbar
    el login de nadie."""
    assert verify_password("lo-que-sea", "esto-no-es-un-hash") is False
    assert verify_password("lo-que-sea", "") is False


@pytest.mark.parametrize("clave", ["ñandú", "señal-Ç-2", "🔐-emoji", "  espacios  "])
def test_caracteres_no_ascii(clave):
    """Se recorta por BYTES, no por caracteres — una tilde ocupa dos."""
    assert verify_password(clave, get_password_hash(clave)) is True
