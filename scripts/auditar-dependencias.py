#!/usr/bin/env python3
"""Audita las dependencias: vulnerabilidades conocidas y antigüedad.

Por qué existe
--------------
Al revisarlo por primera vez, **todo el conjunto de Python llevaba unos 33 meses
congelado** y nueve paquetes tenían vulnerabilidades conocidas — entre ellas una
confusión de algoritmos en la librería que valida nuestros JWT.

Nada de eso era visible: `uv.lock` no caduca y nadie mira un pin. Una barrida
puntual arregla el momento; esto es para que no vuelva a pasar.

Qué hace
--------
- Consulta **OSV** (osv.dev) para cada paquete resuelto en `uv.lock`.
- Corre `npm audit` sobre el frontend, sólo dependencias de producción.
- Marca lo que lleva mucho tiempo sin actualizarse, aunque no tenga CVE: una
  librería sin releases suele ser una librería sin mantenimiento.

Uso:  make audit

Sale con error si hay vulnerabilidades, para poder colgarlo de CI algún día.
Hoy no está en CI a propósito: depende de red externa y una caída de OSV no
debería bloquear un PR.
"""

from __future__ import annotations

import concurrent.futures
import json
import re
import subprocess
import sys
import urllib.request
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MESES_PARA_AVISAR = 24

ROJO, VERDE, AMARILLO, GRIS, FIN = "\033[31m", "\033[32m", "\033[33m", "\033[90m", "\033[0m"


def _paquetes_del_lock() -> list[tuple[str, str]]:
    lock = (RAIZ / "uv.lock").read_text()
    return re.findall(r'name = "([^"]+)"\nversion = "([^"]+)"', lock)


def _consultar_osv(par: tuple[str, str]) -> tuple[str, str, list[str]]:
    nombre, version = par
    cuerpo = json.dumps(
        {"package": {"name": nombre, "ecosystem": "PyPI"}, "version": version}
    ).encode()
    peticion = urllib.request.Request(
        "https://api.osv.dev/v1/query", data=cuerpo, headers={"Content-Type": "application/json"}
    )
    try:
        datos = json.load(urllib.request.urlopen(peticion, timeout=30))
        return nombre, version, [v.get("id", "?") for v in datos.get("vulns", [])]
    except Exception as exc:  # noqa: BLE001
        # Un fallo de red no es una vulnerabilidad, pero tampoco es "todo bien":
        # se distingue con un marcador para no dar un falso verde.
        return nombre, version, [f"__ERROR__{type(exc).__name__}"]


def _antiguedad(nombre: str, version: str) -> int | None:
    """Meses desde que se publicó la versión que usamos."""
    try:
        datos = json.load(
            urllib.request.urlopen(f"https://pypi.org/pypi/{nombre}/json", timeout=20)
        )
        archivos = datos["releases"].get(version) or []
        if not archivos:
            return None
        publicada = date.fromisoformat(archivos[0]["upload_time"][:10])
        return (date.today() - publicada).days // 30
    except Exception:  # noqa: BLE001
        return None


def auditar_python() -> int:
    paquetes = _paquetes_del_lock()
    print(f"{GRIS}Consultando OSV para {len(paquetes)} paquetes de Python…{FIN}")

    vulnerables: list[tuple[str, str, list[str]]] = []
    errores: list[str] = []
    with concurrent.futures.ThreadPoolExecutor(16) as ex:
        for nombre, version, ids in ex.map(_consultar_osv, paquetes):
            if not ids:
                continue
            if ids[0].startswith("__ERROR__"):
                errores.append(f"{nombre}: {ids[0][9:]}")
            else:
                vulnerables.append((nombre, version, ids))

    if errores:
        print(f"{AMARILLO}No se pudo consultar {len(errores)} paquete(s):{FIN}")
        for e in errores[:5]:
            print(f"   {e}")

    if not vulnerables:
        print(f"{VERDE}✓ Python: ninguna vulnerabilidad conocida{FIN}")
        return 0

    print(f"{ROJO}✗ Python: {len(vulnerables)} paquete(s) con vulnerabilidades{FIN}")
    for nombre, version, ids in sorted(vulnerables):
        print(f"   {nombre}=={version}  {', '.join(ids[:3])}")
    return 1


def avisar_por_antiguedad() -> None:
    """Informativo. Una librería sin releases suele ser una sin mantenimiento."""
    paquetes = _paquetes_del_lock()
    with concurrent.futures.ThreadPoolExecutor(16) as ex:
        edades = list(ex.map(lambda p: (p[0], p[1], _antiguedad(*p)), paquetes))

    viejas = [(n, v, m) for n, v, m in edades if m is not None and m >= MESES_PARA_AVISAR]
    if not viejas:
        return
    print(f"\n{GRIS}{len(viejas)} paquete(s) con más de {MESES_PARA_AVISAR} meses:{FIN}")
    for nombre, version, meses in sorted(viejas, key=lambda x: -x[2])[:12]:
        print(f"{GRIS}   {nombre}=={version}  ({meses} meses){FIN}")


def auditar_frontend() -> int:
    print(f"\n{GRIS}npm audit (sólo dependencias de producción)…{FIN}")
    proceso = subprocess.run(
        ["npm", "audit", "--omit=dev", "--json"],
        cwd=RAIZ / "frontend",
        capture_output=True,
        text=True,
    )
    try:
        datos = json.loads(proceso.stdout)
    except json.JSONDecodeError:
        print(f"{AMARILLO}No se pudo leer la salida de npm audit{FIN}")
        return 0

    graves = {
        n: v
        for n, v in datos.get("vulnerabilities", {}).items()
        if v.get("severity") in ("high", "critical")
    }
    if not graves:
        print(f"{VERDE}✓ Frontend: nada grave{FIN}")
        return 0

    print(f"{ROJO}✗ Frontend: {len(graves)} vulnerabilidad(es) grave(s){FIN}")
    for nombre, v in sorted(graves.items()):
        arreglo = v.get("fixAvailable")
        nota = ""
        if isinstance(arreglo, dict) and arreglo.get("isSemVerMajor"):
            nota = f" — exige {arreglo['name']}@{arreglo['version']} (salto mayor)"
        print(f"   {v['severity']:8} {nombre}{nota}")
    return 1


def main() -> int:
    fallos = auditar_python()
    avisar_por_antiguedad()
    fallos += auditar_frontend()
    if fallos:
        print(f"\n{ROJO}Hay vulnerabilidades conocidas.{FIN}")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
