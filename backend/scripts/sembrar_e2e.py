"""Datos mínimos y deterministas para los tests de extremo a extremo.

Es idempotente: se puede correr sobre una base ya sembrada sin duplicar nada.
Hace falta porque Playwright arranca contra una base recién migrada y vacía, y un
test que primero tiene que registrarse, crear empresa y esperar al ETL no prueba
el flujo — prueba la preparación.

**Sólo escribe si la base parece de pruebas.** Sembrar un usuario con contraseña
conocida en producción sería crear una puerta abierta, y la diferencia entre una
URL y otra es un carácter en un `.env`.

    uv run --project .. python scripts/sembrar_e2e.py
"""

from __future__ import annotations

import os
import sys
from datetime import UTC, datetime, timedelta

# Igual que `seed_plantillas.py`: permite correrlo desde backend/ o desde
# backend/scripts/ sin exportar PYTHONPATH.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.security import get_password_hash  # noqa: E402
from app.models.empresa import Empresa, EmpresaUsuario  # noqa: E402
from app.models.licitacion import Licitacion  # noqa: E402
from app.models.user import User  # noqa: E402

# Las credenciales viven aquí y en `e2e/datos.ts`. Están duplicadas a propósito:
# el frontend no debe importar nada del backend para correr sus tests.
# Dominio `.cl` inventado y NO `.test`: `.test` es un TLD reservado y
# `email-validator` —el que hay detrás de `EmailStr`— lo rechaza. Con un correo
# así el usuario se crea sin problema (aquí no pasa por Pydantic) y luego
# `/api/auth/me` revienta con un 500 al serializar la respuesta.
EMAIL = "e2e@tordo-pruebas.cl"
USUARIO = "e2e"
CONTRASENA = "contrasena-de-prueba-e2e"
RUT_EMPRESA = "76543210-5"

# El término que buscan los tests. Es inventado para que no colisione con datos
# reales si alguien siembra sobre una base con licitaciones de verdad.
TERMINO = "Zafiro"

_NOMBRES_PERMITIDOS = ("test", "e2e", "ci", "tordo_test")


def _comprobar_base_de_pruebas(url: str) -> None:
    nombre = url.rsplit("/", 1)[-1].split("?")[0].lower()
    if not any(p in nombre for p in _NOMBRES_PERMITIDOS):
        raise SystemExit(
            f"Me niego a sembrar en la base «{nombre}»: no parece de pruebas.\n"
            f"El nombre tiene que contener uno de {_NOMBRES_PERMITIDOS}.\n"
            "Esto siembra un usuario con contraseña conocida."
        )


def _licitaciones(ahora: datetime) -> list[dict]:
    """Tres casos que cubren lo que las pantallas necesitan distinguir."""
    return [
        {
            "codigo_externo": "E2E-1001-LR24",
            "nombre": f"Suministro de válvulas {TERMINO} para planta norte",
            # Con tilde a propósito: la búsqueda tiene que encontrarla escribiendo
            # "valvulas" sin ella, que es como se escribe en Chile la mayoría de
            # las veces.
            "descripcion": "Adquisición de válvulas industriales y repuestos asociados.",
            "estado": "Publicada",
            "monto_estimado": 12_500_000,
            "region": "Región de Antofagasta",
            "nombre_organismo": "Servicio de Salud de Prueba",
            "fecha_cierre": ahora + timedelta(days=10),
        },
        {
            "codigo_externo": "E2E-1002-LP24",
            "nombre": f"Servicio de mantención {TERMINO} de equipos médicos",
            "descripcion": "Mantención preventiva y correctiva.",
            "estado": "Publicada",
            "monto_estimado": 4_800_000,
            "region": "Región Metropolitana de Santiago",
            "nombre_organismo": "Hospital de Prueba",
            "fecha_cierre": ahora + timedelta(days=3),
        },
        {
            # Cerrada: distingue "hay resultados" de "hay resultados vigentes".
            "codigo_externo": "E2E-1003-LE23",
            "nombre": "Obras menores de conservación vial",
            "descripcion": "Trabajo ya adjudicado.",
            "estado": "Adjudicada",
            "monto_estimado": 30_000_000,
            "region": "Región de Valparaíso",
            "nombre_organismo": "Municipalidad de Prueba",
            "fecha_cierre": ahora - timedelta(days=20),
        },
    ]


def sembrar(db: Session) -> None:
    ahora = datetime.now(UTC)

    usuario = db.execute(select(User).where(User.email == EMAIL)).scalar_one_or_none()
    if usuario is None:
        usuario = User(
            email=EMAIL,
            username=USUARIO,
            hashed_password=get_password_hash(CONTRASENA),
            full_name="Usuaria E2E",
            is_active=True,
            is_verified=True,
            # Sin esto, `dashboard/layout.tsx` manda a /onboarding y ningún test
            # llega a ver una pantalla del producto.
            onboarding_completed=True,
            onboarding_step=99,
        )
        db.add(usuario)
        db.flush()

    empresa = db.execute(
        select(Empresa).where(Empresa.rut_empresa == RUT_EMPRESA)
    ).scalar_one_or_none()
    if empresa is None:
        empresa = Empresa(
            rut_empresa=RUT_EMPRESA,
            nombre_empresa="Comercial Zafiro Ltda.",
            estado_habil="habil",
            # `pyme` y no `basico`: con un solo asiento el test de invitación
            # sólo podría comprobar el 402, no el camino que funciona.
            plan_tier="pyme",
            subscription_status="active",
        )
        db.add(empresa)
        db.flush()

    vinculo = db.execute(
        select(EmpresaUsuario).where(
            EmpresaUsuario.empresa_id == empresa.id,
            EmpresaUsuario.user_id == usuario.id,
        )
    ).scalar_one_or_none()
    if vinculo is None:
        db.add(EmpresaUsuario(empresa_id=empresa.id, user_id=usuario.id, rol="owner"))

    # Alguien a quien invitar. Sin cuenta previa, el backend responde 404 y el
    # test no llegaría a ejercitar el camino bueno.
    invitable = db.execute(
        select(User).where(User.email == "colega@tordo-pruebas.cl")
    ).scalar_one_or_none()
    if invitable is None:
        db.add(
            User(
                email="colega@tordo-pruebas.cl",
                username="colega-e2e",
                hashed_password=get_password_hash(CONTRASENA),
                full_name="Colega E2E",
                is_active=True,
                onboarding_completed=True,
            )
        )

    for datos in _licitaciones(ahora):
        existente = db.execute(
            select(Licitacion).where(Licitacion.codigo_externo == datos["codigo_externo"])
        ).scalar_one_or_none()
        if existente is not None:
            continue
        db.add(
            Licitacion(
                fecha_publicacion=ahora - timedelta(days=1),
                moneda="CLP",
                activo=True,
                **datos,
            )
        )

    db.commit()


def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("Falta DATABASE_URL")
    _comprobar_base_de_pruebas(url)

    motor = create_engine(url.replace("postgresql+asyncpg://", "postgresql://"))
    with Session(motor) as db:
        sembrar(db)
    print(f"Sembrado: {EMAIL} / empresa {RUT_EMPRESA} / 3 licitaciones", file=sys.stderr)


if __name__ == "__main__":
    main()
