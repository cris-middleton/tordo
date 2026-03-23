"""Chilean RUT validation utilities."""
import re


def calcular_dv(rut_numero: str) -> str:
    """Calculate verification digit (dígito verificador) for Chilean RUT."""
    factor = 2
    suma = 0
    for digit in reversed(rut_numero):
        suma += int(digit) * factor
        factor = factor + 1 if factor < 7 else 2
    mod = suma % 11
    dv = 11 - mod
    if dv == 11:
        return "0"
    if dv == 10:
        return "K"
    return str(dv)


def validar_rut(rut: str) -> bool:
    """
    Validate Chilean RUT including verification digit.

    Accepts formats: 12345678-9, 12.345.678-9, 12345678K, etc.
    Returns True if the RUT is structurally valid.
    """
    clean = rut.upper().replace(".", "").replace("-", "").replace(" ", "")
    if len(clean) < 2:
        return False
    numero = clean[:-1]
    dv_given = clean[-1]
    if not numero.isdigit():
        return False
    try:
        n = int(numero)
    except ValueError:
        return False
    if n < 1_000_000:
        return False
    return calcular_dv(numero) == dv_given


def formatear_rut(rut: str) -> str:
    """
    Format RUT as XX.XXX.XXX-D.

    Input can be in any common format (with or without dots/hyphen).
    """
    clean = rut.upper().replace(".", "").replace("-", "").replace(" ", "")
    numero = clean[:-1]
    dv = clean[-1]
    formatted_num = f"{int(numero):,}".replace(",", ".")
    return f"{formatted_num}-{dv}"
